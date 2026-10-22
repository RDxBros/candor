export const CONTENT_DAY_PATTERN = /^day\d+$/i;

export function selectContentDay(requestedDay: string | null | undefined, currentDay: string, allowOverride: boolean) {
  return allowOverride && requestedDay && CONTENT_DAY_PATTERN.test(requestedDay) ? requestedDay : currentDay;
}
