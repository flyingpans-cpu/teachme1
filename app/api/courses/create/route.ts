import { NextResponse } from "next/server";
import { z } from "zod";
import { CourseRequestSchema, GeneratedCourseSchema } from "@/app/lib/courseSchema";
import { saveCourseIfPossible } from "@/app/lib/coursePersistence";
import { buildTimeAllocation } from "@/app/lib/timeAllocation";
import { generateCourseOutlineWithLLM } from "@/app/lib/llmPrompt";

export type CreateCourseError = {
  error: string;
};

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
      weeks: parsed.weeks,
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

    return NextResponse.json(
      {
        course: await saveCourseIfPossible(parsed, validated),
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
