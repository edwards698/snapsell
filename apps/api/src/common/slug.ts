import { randomBytes } from 'node:crypto';

export function slugify(text: string) {
  return (
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '') || 'item'
  );
}

/** `base`, then `base-2`, `base-3`… until `taken` says it is free. */
export function uniqueSlug(base: string, taken: (slug: string) => boolean) {
  const root = slugify(base);
  if (!taken(root)) return root;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${root}-${n}`;
    if (!taken(candidate)) return candidate;
  }
  return `${root}-${randomBytes(3).toString('hex')}`;
}

const SKU_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** e.g. "Wireless Headphones" → "WIRHEA-7K2Q". */
export function generateSku(name: string) {
  const prefix =
    slugify(name)
      .split('-')
      .slice(0, 2)
      .map((w) => w.slice(0, 3))
      .join('')
      .toUpperCase() || 'SKU';
  const bytes = randomBytes(4);
  let suffix = '';
  for (const b of bytes) suffix += SKU_ALPHABET[b % SKU_ALPHABET.length];
  return `${prefix}-${suffix}`;
}
