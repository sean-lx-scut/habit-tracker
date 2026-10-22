const DAY_IN_MS = 24 * 60 * 60 * 1000;

const chineseWeekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const shortWeekdays = ["日", "一", "二", "三", "四", "五", "六"];

export function padNumber(value) {
  return String(value).padStart(2, "0");
}

export function toDateKey(date = new Date()) {
  return [
    date.getFullYear(),
    padNumber(date.getMonth() + 1),
    padNumber(date.getDate()),
  ].join("-");
}

export function todayKey() {
  return toDateKey(new Date());
}

export function fromDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function addDays(dateKey, amount) {
  const date = fromDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

export function dateKeyToSerial(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_IN_MS);
}

export function daysBetween(startDateKey, endDateKey) {
  return dateKeyToSerial(endDateKey) - dateKeyToSerial(startDateKey);
}

export function enumerateDateKeys(endDateKey, count) {
  const dates = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    dates.push(addDays(endDateKey, -offset));
  }

  return dates;
}

export function formatFullDate(dateKey) {
  const date = fromDateKey(dateKey);
  const today = todayKey();
  const sameYear = date.getFullYear() === fromDateKey(today).getFullYear();
  const prefix = sameYear ? "" : `${date.getFullYear()}年`;

  return `${prefix}${date.getMonth() + 1}月${date.getDate()}日 · ${
    chineseWeekdays[date.getDay()]
  }`;
}

export function formatShortDate(dateKey) {
  const date = fromDateKey(dateKey);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatDateForInput(dateKey) {
  return dateKey;
}

export function getWeekdayInitial(dateKey) {
  return shortWeekdays[fromDateKey(dateKey).getDay()];
}

export function getWeekdayName(dateKey) {
  return chineseWeekdays[fromDateKey(dateKey).getDay()];
}

export function friendlySelectedDate(dateKey) {
  const today = todayKey();

  if (dateKey === today) {
    return "今天";
  }

  if (dateKey === addDays(today, -1)) {
    return "昨天";
  }

  return formatShortDate(dateKey);
}

export function isFutureDate(dateKey) {
  return dateKey > todayKey();
}

export function millisecondsUntilNextMidnight() {
  const now = new Date();
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    1,
  );

  return Math.max(1_000, nextMidnight.getTime() - now.getTime());
}
