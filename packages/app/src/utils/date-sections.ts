export type DateSectionKey = "today" | "yesterday" | "thisWeek" | "thisMonth" | "older";

export const DATE_SECTION_ORDER = [
  "today",
  "yesterday",
  "thisWeek",
  "thisMonth",
  "older",
] as const satisfies readonly DateSectionKey[];

export function deriveDateSectionKey(lastActivityAt: Date): DateSectionKey {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const activityStart = new Date(
    lastActivityAt.getFullYear(),
    lastActivityAt.getMonth(),
    lastActivityAt.getDate(),
  );

  if (activityStart.getTime() >= todayStart.getTime()) {
    return "today";
  }
  if (activityStart.getTime() >= yesterdayStart.getTime()) {
    return "yesterday";
  }

  const diffTime = todayStart.getTime() - activityStart.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) {
    return "thisWeek";
  }
  if (diffDays <= 30) {
    return "thisMonth";
  }
  return "older";
}
