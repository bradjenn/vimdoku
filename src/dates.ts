const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function formatHumanDate(value: string, fallback = value) {
  const date = dateFromValue(value);
  if (!date) return fallback;
  const day = date.getUTCDate();
  return `${day}${ordinalSuffix(day)} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function dateFromValue(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = match
    ? new Date(
        Date.UTC(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3]),
        ),
      )
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ordinalSuffix(day: number) {
  if (day % 100 >= 11 && day % 100 <= 13) return 'th';
  if (day % 10 === 1) return 'st';
  if (day % 10 === 2) return 'nd';
  if (day % 10 === 3) return 'rd';
  return 'th';
}
