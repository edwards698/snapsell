// Money is always an integer number of minor units (e.g. ngwee, cents) plus an ISO currency code.

const MINOR_DIGITS: Record<string, number> = { ZMW: 2, USD: 2, EUR: 2, USDC: 2, EURC: 2 };

const SYMBOLS: Record<string, string> = { ZMW: 'K', USD: '$', EUR: '€' };

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency.toUpperCase()] ?? 2;
}

/** Parse a decimal string such as "350" or "12.5" into minor units without float arithmetic. */
export function toMinor(amount: string | number, currency: string): number {
  const digits = minorDigits(currency);
  const text = typeof amount === 'number' ? amount.toFixed(digits) : amount.trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error(`Invalid amount: ${amount}`);
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > digits)
    throw new Error(`Too many decimal places for ${currency}: ${amount}`);
  const minor = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0') || '0');
  if (!Number.isSafeInteger(minor)) throw new Error(`Amount out of range: ${amount}`);
  return sign ? -minor : minor;
}

export function formatMoney(minor: number, currency: string, opts: { trimZeros?: boolean } = {}) {
  const digits = minorDigits(currency);
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 10 ** digits);
  const fraction = String(abs % 10 ** digits).padStart(digits, '0');
  const wholeText = whole.toLocaleString('en-US');
  const showFraction = digits > 0 && !(opts.trimZeros && /^0+$/.test(fraction));
  const symbol = SYMBOLS[currency.toUpperCase()];
  const body = `${wholeText}${showFraction ? `.${fraction}` : ''}`;
  const text = symbol ? `${symbol}${body}` : `${body} ${currency.toUpperCase()}`;
  return negative ? `-${text}` : text;
}
