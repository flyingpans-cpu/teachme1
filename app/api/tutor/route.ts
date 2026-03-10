import { NextResponse } from "next/server";
import { z } from "zod";
import { CourseRequestSchema, GeneratedCourseSchema } from "@/app/lib/courseSchema";
import {
  buildProgressSnapshot,
  saveCourseProgressIfPossible,
} from "@/app/lib/courseProgress";
import { saveCourseIfPossible } from "@/app/lib/coursePersistence";
import { buildTimeAllocation } from "@/app/lib/timeAllocation";
import {
  answerCheckpointSideQuestionWithLLM,
  classifyCheckpointMessageWithLLM,
  generateCourseOutlineWithLLM,
  generateLessonChunkWithLLM,
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
  stage: z.enum(["confirm", "generated"]).optional(),
  courseId: z.string().optional(),
  captured: z
    .object({
      topic: z.string().optional(),
      level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
      hoursPerWeek: z.number().optional(),
      sessionsPerWeek: z.number().int().optional(),
      preferredSessionLengthMinutes: z.number().int().optional(),
    })
    .optional(),
  progress: z
    .object({
      courseId: z.string().optional(),
      currentDayIndex: z.number().int().min(1),
      currentPhase: z.enum(["initial", "afterCheckpoint1", "afterCheckpoint2"]),
      completedDayIndices: z.array(z.number().int().min(1)),
      totalDays: z.number().int().min(1),
      lastViewedAt: z.string(),
    })
    .optional(),
  lessonState: TutorLessonStateSchema.optional(),
});

const TutorRequestSchema = z.object({
  messages: z.array(TutorMessageSchema).default([]),
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

function getLastAssistantMessage(messages: Array<z.infer<typeof TutorMessageSchema>>) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "assistant") {
      return messages[i].content;
    }
  }
  return "";
}

function buildStyleSummary() {
  return "";
}

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const parsed = TutorRequestSchema.parse(raw);

    const lastUserMessage = getLastUserMessage(parsed.messages);
    const lastAssistantMessage = getLastAssistantMessage(parsed.messages);
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
        let intent: "exercise_response" | "related_question" | "unclear" = "related_question";

        try {
          const classification = await classifyCheckpointMessageWithLLM({
            topic: captured.topic ?? "",
            level: captured.level,
            dayIndex,
            totalDays,
            phase: lessonState.phase,
            latestAssistantMessage: lastAssistantMessage,
            learnerMessage: lastUserMessage,
          });
          intent = classification.intent;
        } catch (cause) {
          console.error("Checkpoint classification failed", cause);
        }

        if (intent !== "exercise_response") {
          const answer = await answerCheckpointSideQuestionWithLLM({
            topic: captured.topic ?? "",
            level: captured.level,
            dayIndex,
            totalDays,
            phase: lessonState.phase,
            latestAssistantMessage: lastAssistantMessage,
            learnerMessage: lastUserMessage,
          });

          return NextResponse.json({
            assistantMessage: answer,
            sessionState: existingState,
          });
        }

        if (lessonState.phase === "initial") {
          const chunk = await generateLessonChunkWithLLM({
            topic: captured.topic ?? "",
            level: captured.level,
            dayIndex,
            totalDays,
            minutesPerDay: currentSession.targetMinutes,
            phase: "afterCheckpoint1",
            exerciseResponse: lastUserMessage,
          });

          const progress = await saveCourseProgressIfPossible(
            buildProgressSnapshot({
              courseId: existingState.courseId,
              currentDayIndex: dayIndex,
              currentPhase: "afterCheckpoint1",
              completedDayIndices: existingState.progress?.completedDayIndices ?? [],
              totalDays,
            }),
          );

          return NextResponse.json({
            assistantMessage: chunk,
            sessionState: {
              ...existingState,
              progress,
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
            dayIndex,
            totalDays,
            minutesPerDay: currentSession.targetMinutes,
            phase: "afterCheckpoint2",
            exerciseResponse: lastUserMessage,
          });

          const completedDays = Array.from(
            new Set([...(existingState.progress?.completedDayIndices ?? []), dayIndex]),
          ).sort((a, b) => a - b);
          const progress = await saveCourseProgressIfPossible(
            buildProgressSnapshot({
              courseId: existingState.courseId,
              currentDayIndex: dayIndex,
              currentPhase: "afterCheckpoint2",
              completedDayIndices: completedDays,
              totalDays,
            }),
          );

          return NextResponse.json({
            assistantMessage: chunk,
            sessionState: {
              ...existingState,
              progress,
              lessonState: {
                ...lessonState,
                phase: "afterCheckpoint2",
                awaitingResponse: false,
              },
            },
          });
        }
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
        dayIndex: nextDayIndex,
        totalDays,
        minutesPerDay: nextSession.targetMinutes,
        phase: "initial",
      });

      const progress = await saveCourseProgressIfPossible(
        buildProgressSnapshot({
          courseId: existingState.courseId,
          currentDayIndex: nextDayIndex,
          currentPhase: "initial",
          completedDayIndices: existingState.progress?.completedDayIndices ?? [],
          totalDays,
        }),
      );

      return NextResponse.json({
        assistantMessage: chunk,
        sessionState: {
          ...existingState,
          progress,
          lessonState: {
            dayIndex: nextDayIndex,
            phase: "initial",
            awaitingResponse: true,
          },
        },
      });
    }

    if (existingState.stage === "confirm") {
      const requestInput = CourseRequestSchema.parse({
        topic: captured.topic,
        level: captured.level,
        weeks: 5,
        hoursPerWeek: captured.hoursPerWeek,
        sessionsPerWeek: captured.sessionsPerWeek,
        preferredSessionLengthMinutes: captured.preferredSessionLengthMinutes,
        stylePreferences: {
          morePractice: false,
          moreTheory: false,
          preferReading: false,
          preferVideos: false,
        },
      });

      const allocation = buildTimeAllocation({
        weeks: requestInput.weeks,
        hoursPerWeek: requestInput.hoursPerWeek,
        sessionsPerWeek: requestInput.sessionsPerWeek,
        preferredSessionLengthMinutes: requestInput.preferredSessionLengthMinutes,
      });
      const totalDays = allocation.sessions.length;
      const firstSession = allocation.sessions[0];

      const [outline, firstLesson] = await Promise.all([
        generateCourseOutlineWithLLM({
          topic: requestInput.topic,
          level: requestInput.level,
          styleSummary: buildStyleSummary(),
          sessions: allocation.sessions,
          minutesPerWeek: allocation.minutesPerWeek,
        }),
        generateLessonChunkWithLLM({
          topic: requestInput.topic,
          level: requestInput.level,
          dayIndex: 1,
          totalDays,
          minutesPerDay: firstSession?.targetMinutes ?? allocation.minutesPerWeek,
          phase: "initial",
        }),
      ]);

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

      const course = await saveCourseIfPossible(requestInput, validated);
      const progress = await saveCourseProgressIfPossible(
        buildProgressSnapshot({
          courseId: course.id,
          currentDayIndex: 1,
          currentPhase: "initial",
          completedDayIndices: [],
          totalDays,
        }),
      );

      return NextResponse.json({
        assistantMessage: firstLesson,
        course,
        sessionState: {
          stage: "generated",
          courseId: course.id,
          captured: {
            topic: requestInput.topic,
            level: requestInput.level,
            hoursPerWeek: requestInput.hoursPerWeek,
            sessionsPerWeek: requestInput.sessionsPerWeek,
            preferredSessionLengthMinutes: requestInput.preferredSessionLengthMinutes,
          },
          progress,
          lessonState: {
            dayIndex: 1,
            phase: "initial",
            awaitingResponse: true,
          },
        },
      });
    }

    return NextResponse.json(
      {
        error: "Missing setup state. Start a new chat and complete the setup screen.",
      },
      { status: 400 },
    );
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
