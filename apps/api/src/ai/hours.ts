import type { OpeningHours } from '@snapsell/db';

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** No hours configured means the shop is treated as open. Times are "HH:MM" in `timeZone`. */
export function isWithinHours(
  hours: OpeningHours | null | undefined,
  now: Date,
  timeZone: string,
): boolean {
  if (!hours || hours.days.length === 0) return true;
  let weekday = '';
  let hour = '';
  let minute = '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  for (const p of parts) {
    if (p.type === 'weekday') weekday = p.value;
    if (p.type === 'hour') hour = p.value;
    if (p.type === 'minute') minute = p.value;
  }
  const day = WEEKDAY[weekday.slice(0, 3)];
  if (day === undefined) return true;
  const slot = hours.days.find((d) => d.day === day);
  if (!slot) return true;
  if ('closed' in slot && slot.closed) return false;
  if (!('open' in slot)) return true;
  const nowMin = (hour === '24' ? 0 : Number(hour)) * 60 + Number(minute);
  const [oh, om] = slot.open.split(':').map(Number);
  const [ch, cm] = slot.close.split(':').map(Number);
  if ([oh, om, ch, cm, nowMin].some((n) => Number.isNaN(n))) return true;
  const start = oh! * 60 + om!;
  const end = ch! * 60 + cm!;
  return nowMin >= start && nowMin < end;
}
