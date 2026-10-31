/** Pulls Kwacha-style amounts out of text so "K60" and "K60.00" compare equal. */
export function moneyTokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/K\s?[\d,]+(?:\.\d{1,2})?/gi)) {
    const n = m[0]
      .replace(/[Kk\s,]/g, '')
      .replace(/\.00$/, '')
      .replace(/(\.\d)0$/, '$1');
    if (n) out.push(n);
  }
  return out;
}

/** True when the reply states a Kwacha amount that no tool result or preset contains. */
export function hasUngroundedPrice(reply: string, trusted: string): boolean {
  const claimed = moneyTokens(reply);
  if (claimed.length === 0) return false;
  const ok = new Set(moneyTokens(trusted));
  return claimed.some((t) => !ok.has(t));
}
