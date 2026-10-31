const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });
const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const longDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const DAY = 86_400_000;

export function clock(iso: string) {
  return time.format(new Date(iso));
}

/** Compact time for the conversation list: 14:05 · Mon · 3 Oct. */
export function listTime(iso: string) {
  const d = new Date(iso);
  const days = (startOfDay(new Date()) - startOfDay(d)) / DAY;
  if (days < 1) return time.format(d);
  if (days < 7) return weekday.format(d);
  return shortDate.format(d);
}

/** Separator label between days in a thread. */
export function dayLabel(iso: string) {
  const d = new Date(iso);
  const days = (startOfDay(new Date()) - startOfDay(d)) / DAY;
  if (days < 1) return 'Today';
  if (days < 2) return 'Yesterday';
  return longDate.format(d);
}

export function sameDay(a: string, b: string) {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

export function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}`;
}
