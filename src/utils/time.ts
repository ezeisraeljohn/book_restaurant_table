import { addMinutes, isAfter, isBefore, isEqual, parseISO, set } from "date-fns";

export function parseTimeOnDate(dateIso: string, time: string): Date {
  const base = parseISO(dateIso);
  const [hours, minutes] = time.split(":").map(Number);
  return set(base, { hours, minutes, seconds: 0, milliseconds: 0 });
}

export function computeEnd(startIso: string, durationMinutes: number): string {
  const end = addMinutes(parseISO(startIso), durationMinutes);
  return end.toISOString();
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const aS = parseISO(aStart);
  const aE = parseISO(aEnd);
  const bS = parseISO(bStart);
  const bE = parseISO(bEnd);
  return isBefore(aS, bE) && isAfter(aE, bS);
}

export function withinOperatingHours(
  startIso: string,
  endIso: string,
  openTime: string,
  closeTime: string
): boolean {
  const start = parseISO(startIso);
  const end = parseISO(endIso);
  const startDay = start.toISOString().slice(0, 10);
  const open = parseTimeOnDate(`${startDay}T00:00:00.000Z`, openTime);
  const close = parseTimeOnDate(`${startDay}T00:00:00.000Z`, closeTime);
  return (isAfter(start, open) || isEqual(start, open)) && (isBefore(end, close) || isEqual(end, close));
}
