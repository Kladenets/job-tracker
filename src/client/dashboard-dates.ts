export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function getDashboardDateRangeError(
  range: string,
  startDate?: string,
  endDate?: string
): string | null {
  if (range !== "custom") return null;
  if (startDate && !isValidDateOnly(startDate)) return "Enter a valid start date.";
  if (endDate && !isValidDateOnly(endDate)) return "Enter a valid end date.";
  if (startDate && endDate && startDate > endDate) return "Start date must be on or before end date.";
  return null;
}

export function getUtcInclusiveEndOfDay(value: string): string {
  if (!isValidDateOnly(value)) throw new RangeError("Invalid date-only value");
  return new Date(`${value}T23:59:59.999Z`).toISOString();
}

export function getCustomDateRangeParams(
  startDate?: string,
  endDate?: string
): { startDate?: string; endDate?: string } | null {
  if (getDashboardDateRangeError("custom", startDate, endDate)) return null;
  return {
    startDate: startDate ? new Date(`${startDate}T00:00:00.000Z`).toISOString() : undefined,
    endDate: endDate ? getUtcInclusiveEndOfDay(endDate) : undefined,
  };
}