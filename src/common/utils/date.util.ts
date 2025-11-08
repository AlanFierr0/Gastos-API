export function toUtcNoon(dateIso: string): Date {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateIso}`);
  }
  // Normalize to day 1, month, year, and set time to 12:00:00 UTC
  // This ensures we only store month and year, not the specific day or time
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12, 0, 0, 0));
}

