import { NextResponse } from "next/server";
import { z } from "zod";
import { CourseRequestSchema, GeneratedCourseSchema } from "@/app/lib/courseSchema";
import { buildTimeAllocation } from "@/app/lib/timeAllocation";
import { generateCourseOutlineWithLLM } from "@/app/lib/llmPrompt";
import { prisma } from "@/app/lib/prisma";

const ErrorResponseSchema = z.object({
  error: z.string(),
});

export type CreateCourseError = z.infer<typeof ErrorResponseSchema>;

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const parsed = CourseRequestSchema.parse(raw);

    const { weeks, hoursPerWeek, sessionsPerWeek, preferredSessionLengthMinutes } =
      parsed;

    const allocation = buildTimeAllocation({
      weeks,
      hoursPerWeek,
      sessionsPerWeek,
      preferredSessionLengthMinutes,
    });

    if (allocation.sessions.length === 0) {
      return NextResponse.json(
        { error: "Invalid time configuration produced no sessions." },
        { status: 400 },
      );
    }

    const styleSummaryParts: string[] = [];
    if (parsed.stylePreferences.morePractice) styleSummaryParts.push("more practice");
    if (parsed.stylePreferences.moreTheory) styleSummaryParts.push("more theory");
    if (parsed.stylePreferences.preferReading) styleSummaryParts.push("prefer reading");
    if (parsed.stylePreferences.preferVideos) styleSummaryParts.push("prefer videos");
    const styleSummary = styleSummaryParts.join(", ");

    const generated = await generateCourseOutlineWithLLM({
      topic: parsed.topic,
      level: parsed.level,
      priorKnowledge: parsed.priorKnowledge,
      styleSummary,
      sessions: allocation.sessions,
      minutesPerWeek: allocation.minutesPerWeek,
    });

    const validated = GeneratedCourseSchema.parse(generated);

    const minutesByKey = new Map<string, number>();
    for (const session of allocation.sessions) {
      const key = `${session.weekIndex}-${session.sessionIndex}`;
      minutesByKey.set(key, session.targetMinutes);
    }

    for (const week of validated.weeks) {
      let weekMinutes = 0;
      for (const session of week.sessions) {
        const key = `${session.weekIndex}-${session.sessionIndex}`;
        const expected = minutesByKey.get(key);
        if (!expected) {
          throw new Error("LLM produced a session not present in the allocation skeleton");
        }
        session.estimatedMinutes = expected;
        session.targetMinutes = expected;
        weekMinutes += expected;
      }
      week.targetMinutes = weekMinutes;
    }

    const totalAllocated = allocation.totalCourseMinutes;
    const totalGenerated = validated.weeks.reduce(
      (sum, week) => sum + week.targetMinutes,
      0,
    );
    if (totalAllocated !== totalGenerated) {
      throw new Error("Time totals do not match allocation skeleton");
    }

    const createdCourse = await prisma.course.create({
      data: {
        topic: parsed.topic,
        level: parsed.level ?? "BEGINNER",
        weeks,
        hoursPerWeek,
        sessionsPerWeek,
        preferredSessionLengthMinutes,
        stylePreferences: parsed.stylePreferences,
        courseWeeks: {
          create: validated.weeks.map((week) => ({
            index: week.weekIndex,
            title: week.title,
            summary: week.summary,
            targetMinutes: week.targetMinutes,
            sessions: {
              create: week.sessions.map((session) => ({
                indexWithinWeek: session.sessionIndex,
                title: session.title,
                objective: session.objective,
                estimatedMinutes: session.estimatedMinutes,
                activityType: session.activityType,
                content: session.contentBlocks,
              })),
            },
          })),
        },
        logs: {
          create: {
            request: parsed,
            response: validated,
          },
        },
      },
      include: {
        courseWeeks: {
          include: {
            sessions: true,
          },
        },
      },
    });

    const { courseWeeks, ...rest } = createdCourse;
    return NextResponse.json(
      {
        course: { ...rest, weeks: courseWeeks },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.flatten() },
        { status: 400 },
      );
    }

    console.error("Error creating course", error);

    return NextResponse.json(
      { error: "Failed to generate course. Please try again." },
      { status: 500 },
    );
  }
}
