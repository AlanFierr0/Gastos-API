export function toUtcNoon(dateIso: string): Date {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateIso}`);
  }
  date.setUTCHours(12, 0, 0, 0);
  return date;
}

