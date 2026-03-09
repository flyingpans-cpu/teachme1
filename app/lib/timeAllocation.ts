export type TimeAllocationInput = {
  weeks: number;
  hoursPerWeek: number;
  sessionsPerWeek: number;
  preferredSessionLengthMinutes: number;
};

export type AllocatedSession = {
  weekIndex: number;
  sessionIndex: number;
  targetMinutes: number;
};

export type TimeAllocationResult = {
  sessions: AllocatedSession[];
  totalCourseMinutes: number;
  minutesPerWeek: number;
};

export function buildTimeAllocation(
  input: TimeAllocationInput,
): TimeAllocationResult {
  const weeks = Math.max(1, Math.floor(input.weeks));
  const hoursPerWeek = Math.max(0.5, input.hoursPerWeek);
  const sessionsPerWeek = Math.max(1, Math.floor(input.sessionsPerWeek));

  const minutesPerWeek = Math.round(hoursPerWeek * 60);
  const totalCourseMinutes = minutesPerWeek * weeks;
  const sessionCount = weeks * sessionsPerWeek;

  if (sessionCount <= 0 || totalCourseMinutes <= 0) {
    return {
      sessions: [],
      totalCourseMinutes: 0,
      minutesPerWeek: 0,
    };
  }

  const baseSessionMinutes = Math.floor(totalCourseMinutes / sessionCount);
  let remainder = totalCourseMinutes - baseSessionMinutes * sessionCount;

  const sessions: AllocatedSession[] = [];

  for (let weekIndex = 1; weekIndex <= weeks; weekIndex += 1) {
    for (let sessionIndex = 1; sessionIndex <= sessionsPerWeek; sessionIndex += 1) {
      let minutes = baseSessionMinutes;
      if (remainder > 0) {
        minutes += 1;
        remainder -= 1;
      }

      sessions.push({
        weekIndex,
        sessionIndex,
        targetMinutes: minutes,
      });
    }
  }

  return {
    sessions,
    totalCourseMinutes,
    minutesPerWeek,
  };
}

