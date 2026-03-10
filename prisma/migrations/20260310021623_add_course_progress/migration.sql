-- CreateTable
CREATE TABLE "CourseProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "currentDayIndex" INTEGER NOT NULL,
    "currentPhase" TEXT NOT NULL,
    "completedDayIndices" JSONB NOT NULL,
    "totalDays" INTEGER NOT NULL,
    "lastViewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseProgress_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseProgress_courseId_key" ON "CourseProgress"("courseId");
