import {
  addDays,
  dateKeyToSerial,
  daysBetween,
  enumerateDateKeys,
  toDateKey,
} from "./date-utils.js";

export function buildCheckInIndex(checkIns) {
  const index = new Map();

  for (const checkIn of checkIns) {
    if (!index.has(checkIn.habit_id)) {
      index.set(checkIn.habit_id, new Set());
    }

    index.get(checkIn.habit_id).add(checkIn.checked_date);
  }

  return index;
}

export function getHabitDates(index, habitId) {
  return index.get(habitId) ?? new Set();
}

export function isChecked(index, habitId, dateKey) {
  return getHabitDates(index, habitId).has(dateKey);
}

export function getCurrentStreak(dateSet, today) {
  let cursor = dateSet.has(today) ? today : addDays(today, -1);
  let streak = 0;

  while (dateSet.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

export function getLongestStreak(dateSet) {
  const serials = [...dateSet]
    .map(dateKeyToSerial)
    .sort((left, right) => left - right);

  if (!serials.length) {
    return 0;
  }

  let longest = 1;
  let current = 1;

  for (let index = 1; index < serials.length; index += 1) {
    if (serials[index] - serials[index - 1] === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else if (serials[index] !== serials[index - 1]) {
      current = 1;
    }
  }

  return longest;
}

export function getHabitCreatedDate(habit) {
  return toDateKey(new Date(habit.created_at));
}

export function countEligibleHabits(habits, dateKey) {
  return habits.reduce(
    (count, habit) => count + (getHabitCreatedDate(habit) <= dateKey ? 1 : 0),
    0,
  );
}

export function getCompletionForDate(habits, index, dateKey) {
  let eligible = 0;
  let completed = 0;

  for (const habit of habits) {
    if (getHabitCreatedDate(habit) > dateKey) {
      continue;
    }

    eligible += 1;
    completed += isChecked(index, habit.id, dateKey) ? 1 : 0;
  }

  return {
    eligible,
    completed,
    percentage: eligible ? Math.round((completed / eligible) * 100) : 0,
  };
}

export function getRangeCompletion(habits, index, endDateKey, days) {
  const dates = enumerateDateKeys(endDateKey, days);
  let eligible = 0;
  let completed = 0;

  for (const dateKey of dates) {
    const totals = getCompletionForDate(habits, index, dateKey);
    eligible += totals.eligible;
    completed += totals.completed;
  }

  return {
    dates,
    eligible,
    completed,
    percentage: eligible ? Math.round((completed / eligible) * 100) : 0,
  };
}

export function getHabitRangeCompletion(habit, index, endDateKey, days) {
  const dateSet = getHabitDates(index, habit.id);
  const createdDate = getHabitCreatedDate(habit);
  const dates = enumerateDateKeys(endDateKey, days);
  const eligibleDates = dates.filter((dateKey) => dateKey >= createdDate);
  const completed = eligibleDates.filter((dateKey) => dateSet.has(dateKey)).length;

  return {
    eligible: eligibleDates.length,
    completed,
    percentage: eligibleDates.length
      ? Math.round((completed / eligibleDates.length) * 100)
      : 0,
  };
}

export function getDailyTrend(habits, index, endDateKey, days = 7) {
  return enumerateDateKeys(endDateKey, days).map((dateKey) => ({
    dateKey,
    ...getCompletionForDate(habits, index, dateKey),
  }));
}

export function getBestCurrentStreak(habits, index, today) {
  return habits.reduce((best, habit) => {
    const streak = getCurrentStreak(getHabitDates(index, habit.id), today);
    return Math.max(best, streak);
  }, 0);
}

export function getHabitStats(habit, index, today) {
  const dateSet = getHabitDates(index, habit.id);

  return {
    currentStreak: getCurrentStreak(dateSet, today),
    longestStreak: getLongestStreak(dateSet),
    last7: getHabitRangeCompletion(habit, index, today, 7),
    last30: getHabitRangeCompletion(habit, index, today, 30),
  };
}

export function getGlobalLongestStreak(habits, index) {
  return habits.reduce(
    (best, habit) => Math.max(best, getLongestStreak(getHabitDates(index, habit.id))),
    0,
  );
}

export function getHeatmapIntensity(percentage) {
  if (percentage <= 0) {
    return 0;
  }

  if (percentage < 34) {
    return 1;
  }

  if (percentage < 67) {
    return 2;
  }

  if (percentage < 100) {
    return 3;
  }

  return 4;
}

export { daysBetween };
