import { getPrisma } from "@/app/lib/prisma";

export type LessonPhase = "initial" | "afterCheckpoint1" | "afterCheckpoint2";

export type CourseProgressSnapshot = {
  courseId?: string;
  currentDayIndex: number;
  currentPhase: LessonPhase;
  completedDayIndices: number[];
  totalDays: number;
  lastViewedAt: string;
};

function mapPhaseToDb(phase: LessonPhase) {
  switch (phase) {
    case "initial":
      return "INITIAL";
    case "afterCheckpoint1":
      return "AFTER_CHECKPOINT_1";
    case "afterCheckpoint2":
      return "AFTER_CHECKPOINT_2";
  }
}

export function buildProgressSnapshot(input: {
  courseId?: string;
  currentDayIndex: number;
  currentPhase: LessonPhase;
  completedDayIndices: number[];
  totalDays: number;
}) {
  return {
    courseId: input.courseId,
    currentDayIndex: input.currentDayIndex,
    currentPhase: input.currentPhase,
    completedDayIndices: input.completedDayIndices,
    totalDays: input.totalDays,
    lastViewedAt: new Date().toISOString(),
  } satisfies CourseProgressSnapshot;
}

export async function saveCourseProgressIfPossible(progress: CourseProgressSnapshot) {
  const prisma = getPrisma();
  if (!prisma || !progress.courseId) {
    return progress;
  }

  const saved = await prisma.courseProgress.upsert({
    where: {
      courseId: progress.courseId,
    },
    create: {
      courseId: progress.courseId,
      currentDayIndex: progress.currentDayIndex,
      currentPhase: mapPhaseToDb(progress.currentPhase),
      completedDayIndices: progress.completedDayIndices,
      totalDays: progress.totalDays,
      lastViewedAt: new Date(progress.lastViewedAt),
    },
    update: {
      currentDayIndex: progress.currentDayIndex,
      currentPhase: mapPhaseToDb(progress.currentPhase),
      completedDayIndices: progress.completedDayIndices,
      totalDays: progress.totalDays,
      lastViewedAt: new Date(progress.lastViewedAt),
    },
  });

  return {
    ...progress,
    courseId: saved.courseId,
    lastViewedAt: saved.lastViewedAt.toISOString(),
  } satisfies CourseProgressSnapshot;
}
