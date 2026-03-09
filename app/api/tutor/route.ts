import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CourseRequestSchema,
  GeneratedCourseSchema,
  StylePreferencesSchema,
} from "@/app/lib/courseSchema";
import { saveCourseIfPossible } from "@/app/lib/coursePersistence";
import { buildTimeAllocation } from "@/app/lib/timeAllocation";
import {
  generateCourseOutlineWithLLM,
  generateLessonChunkWithLLM,
  runTutorIntakeWithLLM,
} from "@/app/lib/llmPrompt";

const TutorMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

const TutorLessonStateSchema = z.object({
  dayIndex: z.number().int().min(1),
  phase: z.enum(["initial", "afterCheckpoint1", "afterCheckpoint2"]),
  awaitingResponse: z.boolean(),
});

const TutorSessionStateSchema = z.object({
  stage: z.enum(["intake", "confirm", "generated"]).optional(),
  captured: z
    .object({
      topic: z.string().optional(),
      level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
      priorKnowledge: z.string().optional(),
      hoursPerWeek: z.number().optional(),
      sessionsPerWeek: z.number().int().optional(),
      preferredSessionLengthMinutes: z.number().int().optional(),
      stylePreferences: StylePreferencesSchema.partial().optional(),
    })
    .optional(),
  lessonState: TutorLessonStateSchema.optional(),
});

const TutorRequestSchema = z.object({
  messages: z.array(TutorMessageSchema).min(1),
  sessionState: TutorSessionStateSchema.optional(),
});

function getLastUserMessage(messages: Array<z.infer<typeof TutorMessageSchema>>) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      return messages[i].content;
    }
  }
  return "";
}

function buildStyleSummary(style?: z.infer<typeof StylePreferencesSchema>) {
  if (!style) return "";
  const parts: string[] = [];
  if (style.morePractice) parts.push("more practice");
  if (style.moreTheory) parts.push("more theory");
  if (style.preferReading) parts.push("prefer reading");
  if (style.preferVideos) parts.push("prefer videos");
  return parts.join(", ");
}

function buildPlanSummary(course: z.infer<typeof GeneratedCourseSchema>) {
  const weeks = course.weeks.slice().sort((a, b) => a.weekIndex - b.weekIndex);
  const lines = [
    `Here is your 5-week plan: ${course.courseTitle}`,
    course.overview,
    "",
    ...weeks.map((week) => {
      const minutes = week.targetMinutes;
      return `Week ${week.weekIndex}: ${week.title} — ${week.summary} (${minutes} minutes)`;
    }),
  ];
  return lines.join("\n");
}

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const parsed = TutorRequestSchema.parse(raw);

    const lastUserMessage = getLastUserMessage(parsed.messages);
    const existingState = parsed.sessionState ?? {};
    const captured = existingState.captured ?? {};

    if (existingState.stage === "generated" && existingState.lessonState) {
      const allocation = buildTimeAllocation({
        weeks: 5,
        hoursPerWeek: captured.hoursPerWeek ?? 0,
        sessionsPerWeek: captured.sessionsPerWeek ?? 0,
        preferredSessionLengthMinutes: captured.preferredSessionLengthMinutes ?? 0,
      });
      const totalDays = allocation.sessions.length;
      const lessonState = existingState.lessonState;
      const dayIndex = lessonState.dayIndex;
      const currentSession = allocation.sessions[dayIndex - 1];

      if (!currentSession) {
        return NextResponse.json({
          assistantMessage:
            "You have completed all days in this plan. If you want a new topic, tell me what you want to learn next.",
          sessionState: existingState,
        });
      }

      if (lessonState.awaitingResponse) {
        if (lessonState.phase === "initial") {
          const chunk = await generateLessonChunkWithLLM({
            topic: captured.topic ?? "",
            level: captured.level,
            priorKnowledge: captured.priorKnowledge,
            dayIndex,
            totalDays,
            minutesPerDay: currentSession.targetMinutes,
            phase: "afterCheckpoint1",
            exerciseResponse: lastUserMessage,
          });

          return NextResponse.json({
            assistantMessage: chunk,
            sessionState: {
              ...existingState,
              lessonState: {
                ...lessonState,
                phase: "afterCheckpoint1",
                awaitingResponse: true,
              },
            },
          });
        }

        if (lessonState.phase === "afterCheckpoint1") {
          const chunk = await generateLessonChunkWithLLM({
            topic: captured.topic ?? "",
            level: captured.level,
            priorKnowledge: captured.priorKnowledge,
            dayIndex,
            totalDays,
            minutesPerDay: currentSession.targetMinutes,
            phase: "afterCheckpoint2",
            exerciseResponse: lastUserMessage,
          });

          return NextResponse.json({
            assistantMessage: chunk,
            sessionState: {
              ...existingState,
              lessonState: {
                ...lessonState,
                phase: "afterCheckpoint2",
                awaitingResponse: false,
              },
            },
          });
        }
      }

      const wantsNextDay =
        /next|continue|day\s+\d+/i.test(lastUserMessage) || lastUserMessage.length > 0;

      if (!wantsNextDay) {
        return NextResponse.json({
          assistantMessage: "Say “next day” when you’re ready to continue.",
          sessionState: existingState,
        });
      }

      const nextDayIndex = lessonState.phase === "afterCheckpoint2" ? dayIndex + 1 : dayIndex;
      const nextSession = allocation.sessions[nextDayIndex - 1];
      if (!nextSession) {
        return NextResponse.json({
          assistantMessage:
            "You have completed all days in this plan. If you want a new topic, tell me what you want to learn next.",
          sessionState: existingState,
        });
      }

      const chunk = await generateLessonChunkWithLLM({
        topic: captured.topic ?? "",
        level: captured.level,
        priorKnowledge: captured.priorKnowledge,
        dayIndex: nextDayIndex,
        totalDays,
        minutesPerDay: nextSession.targetMinutes,
        phase: "initial",
      });

      return NextResponse.json({
        assistantMessage: chunk,
        sessionState: {
          ...existingState,
          lessonState: {
            dayIndex: nextDayIndex,
            phase: "initial",
            awaitingResponse: true,
          },
        },
      });
    }

    const capturedForIntake: Partial<
      z.infer<typeof CourseRequestSchema>
    > = {
      ...captured,
      stylePreferences: captured.stylePreferences
        ? {
            morePractice: captured.stylePreferences.morePractice ?? false,
            moreTheory: captured.stylePreferences.moreTheory ?? false,
            preferReading: captured.stylePreferences.preferReading ?? false,
            preferVideos: captured.stylePreferences.preferVideos ?? false,
          }
        : undefined,
    };
    const intakeResult = await runTutorIntakeWithLLM({
      userMessage: lastUserMessage,
      captured: capturedForIntake,
    });

    const mergedCaptured = {
      ...captured,
      ...intakeResult.captured,
      stylePreferences: {
        morePractice: false,
        moreTheory: false,
        preferReading: false,
        preferVideos: false,
        ...(captured.stylePreferences ?? {}),
        ...(intakeResult.captured.stylePreferences ?? {}),
      },
    };

    if (!intakeResult.readyToGenerate) {
      return NextResponse.json({
        assistantMessage: intakeResult.assistantMessage,
        sessionState: {
          stage: intakeResult.stage,
          captured: mergedCaptured,
        },
      });
    }

    const requestInput = CourseRequestSchema.parse({
      ...mergedCaptured,
      weeks: 5,
      stylePreferences: mergedCaptured.stylePreferences,
    });

    const allocation = buildTimeAllocation({
      weeks: requestInput.weeks,
      hoursPerWeek: requestInput.hoursPerWeek,
      sessionsPerWeek: requestInput.sessionsPerWeek,
      preferredSessionLengthMinutes: requestInput.preferredSessionLengthMinutes,
    });

    const outline = await generateCourseOutlineWithLLM({
      topic: requestInput.topic,
      level: requestInput.level,
      priorKnowledge: requestInput.priorKnowledge,
      styleSummary: buildStyleSummary(requestInput.stylePreferences),
      sessions: allocation.sessions,
      minutesPerWeek: allocation.minutesPerWeek,
    });

    const validated = GeneratedCourseSchema.parse(outline);

    const minutesByKey = new Map<string, number>();
    for (const session of allocation.sessions) {
      minutesByKey.set(`${session.weekIndex}-${session.sessionIndex}`, session.targetMinutes);
    }

    for (const week of validated.weeks) {
      let weekMinutes = 0;
      for (const session of week.sessions) {
        const expected = minutesByKey.get(`${session.weekIndex}-${session.sessionIndex}`);
        if (!expected) {
          throw new Error("LLM produced a session not present in the allocation skeleton");
        }
        session.estimatedMinutes = expected;
        session.targetMinutes = expected;
        weekMinutes += expected;
      }
      week.targetMinutes = weekMinutes;
    }

    const planMessage = buildPlanSummary(validated);
    const firstSession = allocation.sessions[0];
    const totalDays = allocation.sessions.length;

    const firstLesson = await generateLessonChunkWithLLM({
      topic: requestInput.topic,
      level: requestInput.level,
      priorKnowledge: requestInput.priorKnowledge,
      dayIndex: 1,
      totalDays,
      minutesPerDay: firstSession?.targetMinutes ?? allocation.minutesPerWeek,
      phase: "initial",
    });

    return NextResponse.json({
      assistantMessage: `${planMessage}\n\n${firstLesson}`,
      course: await saveCourseIfPossible(requestInput, validated),
      sessionState: {
        stage: "generated",
        captured: requestInput,
        lessonState: {
          dayIndex: 1,
          phase: "initial",
          awaitingResponse: true,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.flatten() },
        { status: 400 },
      );
    }

    console.error("Error in tutor route", error);

    return NextResponse.json(
      { error: "Failed to respond. Please try again." },
      { status: 500 },
    );
  }
}
