import type { CourseRequestInput, GeneratedCourse } from "@/app/lib/courseSchema";
import { getPrisma } from "@/app/lib/prisma";

export function buildCourseResponse(
  input: CourseRequestInput,
  generated: GeneratedCourse,
  fallbackId = `generated-${crypto.randomUUID()}`,
) {
  return {
    id: fallbackId,
    topic: input.topic,
    level: input.level ?? "BEGINNER",
    weeks: generated.weeks.map((week) => ({
      id: `${fallbackId}-week-${week.weekIndex}`,
      index: week.weekIndex,
      title: week.title,
      summary: week.summary,
      targetMinutes: week.targetMinutes,
      sessions: week.sessions.map((session) => ({
        id: `${fallbackId}-week-${week.weekIndex}-session-${session.sessionIndex}`,
        indexWithinWeek: session.sessionIndex,
        title: session.title,
        objective: session.objective,
        estimatedMinutes: session.estimatedMinutes,
        activityType: session.activityType,
        content: session.contentBlocks,
      })),
    })),
    hoursPerWeek: input.hoursPerWeek,
    sessionsPerWeek: input.sessionsPerWeek,
    preferredSessionLengthMinutes: input.preferredSessionLengthMinutes,
    stylePreferences: input.stylePreferences,
    createdAt: new Date().toISOString(),
  };
}

export async function saveCourseIfPossible(
  input: CourseRequestInput,
  generated: GeneratedCourse,
) {
  const prisma = getPrisma();
  if (!prisma) {
    return buildCourseResponse(input, generated);
  }

  const createdCourse = await prisma.course.create({
    data: {
      topic: input.topic,
      level: input.level ?? "BEGINNER",
      weeks: input.weeks,
      hoursPerWeek: input.hoursPerWeek,
      sessionsPerWeek: input.sessionsPerWeek,
      preferredSessionLengthMinutes: input.preferredSessionLengthMinutes,
      stylePreferences: input.stylePreferences,
      courseWeeks: {
        create: generated.weeks.map((week) => ({
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
          request: input,
          response: generated,
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
  return {
    ...rest,
    weeks: courseWeeks,
  };
}
