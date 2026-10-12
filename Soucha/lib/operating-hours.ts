export type OperatingHours = {
  day_of_week: number;
  is_open: boolean;
  open_time: string | null;
  close_time: string | null;
};

export const DEFAULT_HOURS: OperatingHours[] = [
  { day_of_week: 1, is_open: true, open_time: "10:00:00", close_time: "18:00:00" },
  { day_of_week: 2, is_open: true, open_time: "10:00:00", close_time: "18:00:00" },
  { day_of_week: 3, is_open: true, open_time: "10:00:00", close_time: "18:00:00" },
  { day_of_week: 4, is_open: true, open_time: "10:00:00", close_time: "18:00:00" },
  { day_of_week: 5, is_open: true, open_time: "10:00:00", close_time: "18:00:00" },
  { day_of_week: 6, is_open: true, open_time: "10:00:00", close_time: "18:00:00" },
  { day_of_week: 0, is_open: false, open_time: null, close_time: null },
];

export function getVNDate(date = new Date()) {
  const options = { timeZone: "Asia/Ho_Chi_Minh" };
  const vnString = date.toLocaleString("en-US", options);
  return new Date(vnString);
}

function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function isShopOpen(schedule: OperatingHours[], date = new Date()): boolean {
  const d = getVNDate(date);
  const day = d.getDay();
  const todaySchedule = schedule.find((s) => s.day_of_week === day);

  if (!todaySchedule || !todaySchedule.is_open || !todaySchedule.open_time || !todaySchedule.close_time) {
    return false;
  }

  const currentMinutes = d.getHours() * 60 + d.getMinutes();
  const openMinutes = parseTime(todaySchedule.open_time);
  const closeMinutes = parseTime(todaySchedule.close_time);

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

export function formatDayName(day: number): string {
  if (day === 0) return "Chủ nhật";
  return `Thứ ${day + 1}`;
}

export function getNextOperatingDayName(schedule: OperatingHours[], date = new Date()): string {
  const d = getVNDate(date);
  let currentDay = d.getDay();
  const todaySchedule = schedule.find((s) => s.day_of_week === currentDay);

  if (todaySchedule?.is_open && todaySchedule.open_time && todaySchedule.close_time) {
    const currentMinutes = d.getHours() * 60 + d.getMinutes();
    const openMinutes = parseTime(todaySchedule.open_time);
    if (currentMinutes < openMinutes) {
      return "hôm nay";
    }
  }

  for (let i = 1; i <= 7; i++) {
    const nextDay = (currentDay + i) % 7;
    const nextSchedule = schedule.find((s) => s.day_of_week === nextDay);
    if (nextSchedule?.is_open) {
      if (i === 1) return "ngày mai";
      return formatDayName(nextDay);
    }
  }
  return "thời gian tới";
}

export function formatScheduleText(schedule: OperatingHours[]): string {
  const sorted = [...schedule].sort((a, b) => {
    const aDay = a.day_of_week === 0 ? 7 : a.day_of_week;
    const bDay = b.day_of_week === 0 ? 7 : b.day_of_week;
    return aDay - bDay;
  });

  const timeMap = new Map<string, number[]>();

  for (const s of sorted) {
    if (!s.is_open) continue;
    const timeStr = `${s.open_time?.slice(0, 5)} - ${s.close_time?.slice(0, 5)}`;
    const dayMapped = s.day_of_week === 0 ? 7 : s.day_of_week;

    if (!timeMap.has(timeStr)) {
      timeMap.set(timeStr, []);
    }
    timeMap.get(timeStr)!.push(dayMapped);
  }

  if (timeMap.size === 0) return "Tạm nghỉ";

  const parts: string[] = [];
  for (const [timeStr, days] of Array.from(timeMap.entries())) {
    parts.push(`${formatDays(days)}: ${timeStr}`);
  }

  return parts.join(" | ");
}

function formatDays(days: number[]): string {
  const ranges: { start: number; end: number }[] = [];
  let currentRange: { start: number; end: number } | null = null;
  
  for (const day of days) {
    if (!currentRange) {
      currentRange = { start: day, end: day };
    } else if (day === currentRange.end + 1) {
      currentRange.end = day;
    } else {
      ranges.push(currentRange);
      currentRange = { start: day, end: day };
    }
  }
  if (currentRange) ranges.push(currentRange);

  return ranges.map(r => {
    if (r.start === r.end) {
      return r.start === 7 ? "CN" : `T${r.start + 1}`;
    }
    if (r.end === r.start + 1) {
      const s = r.start === 7 ? "CN" : `T${r.start + 1}`;
      const e = r.end === 7 ? "CN" : `T${r.end + 1}`;
      return `${s}, ${e}`;
    }
    const s = r.start === 7 ? "CN" : `T${r.start + 1}`;
    const e = r.end === 7 ? "CN" : `T${r.end + 1}`;
    return `${s} - ${e}`;
  }).join(", ");
}

