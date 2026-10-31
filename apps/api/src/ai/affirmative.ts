/**
 * Deterministic check that a customer message is a clear yes to a presented quote.
 * Anything that adds a change, a question, or hedging is refused (BUILD_PLAN D7 / §6.4).
 */
export function isExplicitAffirmative(text: string): boolean {
  const raw = text.trim();
  if (!raw || raw.length > 80) return false;
  const normalised = raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalised) return false;
  if (/[?]/.test(raw)) return false;
  if (
    /\b(but|however|except|change|instead|make it|add|remove|cancel|wait|hold|maybe|perhaps|if|or|and also)\b/.test(
      normalised,
    )
  ) {
    return false;
  }
  return /^(yes|y+|yeah|yep|yup|sure|ok|okay|alright|all right|please|go ahead|proceed|confirm|confirmed|do it|thats fine|that is fine|sounds good|perfect|correct|ee|eya|eyaa|ndalama|yes please|yes proceed|yes confirm)$/.test(
    normalised,
  );
}

/** Customer claims they already paid — never treat as payment confirmation. */
export function looksLikePaymentClaim(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(i('ve| have)?\s+paid|payment\s+(is|was)\s+(done|sent|made)|sent\s+(the\s+)?(money|payment)|paid\s+(already|now)|proof\s+of\s+payment|here\s+is\s+(my\s+)?(receipt|screenshot))\b/.test(
      t,
    ) || /\b(ndalipila|nalipila|nalipaye)\b/.test(t)
  );
}
