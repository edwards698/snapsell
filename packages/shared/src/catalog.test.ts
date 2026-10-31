import { describe, expect, it } from 'vitest';
import { productInputSchema, stockAdjustmentSchema, stockState, variantLabel } from './catalog.js';

const base = { name: 'Chitenge', variants: [{ priceMinor: 6000 }] };

function issues(input: unknown) {
  const r = productInputSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('productInputSchema', () => {
  it('accepts a simple product and fills defaults', () => {
    const r = productInputSchema.parse(base);
    expect(r).toMatchObject({ status: 'ACTIVE', optionNames: [], description: '' });
    expect(r.variants[0]).toMatchObject({ sku: '', compareAtMinor: null, initialStock: 0 });
  });

  it('requires compare-at to be above the price', () => {
    expect(issues({ ...base, variants: [{ priceMinor: 6000, compareAtMinor: 6000 }] })).toEqual([
      'variants.0.compareAtMinor: Must be higher than the price',
    ]);
    expect(issues({ ...base, variants: [{ priceMinor: 6000, compareAtMinor: 8000 }] })).toEqual([]);
  });

  it('rejects negative and fractional prices', () => {
    expect(issues({ ...base, variants: [{ priceMinor: -1 }] })).toHaveLength(1);
    expect(issues({ ...base, variants: [{ priceMinor: 1.5 }] })).toHaveLength(1);
  });

  it('needs an option to have several variants', () => {
    expect(issues({ ...base, variants: [{ priceMinor: 1 }, { priceMinor: 2 }] })).toContain(
      'optionNames: Add an option (like Size) to sell more than one variant',
    );
  });

  it('checks option values, duplicates and SKUs', () => {
    const result = issues({
      name: 'Shirt',
      optionNames: ['Size', 'size'],
      variants: [
        { priceMinor: 1, sku: 'A', optionValues: { Size: 'M' } },
        { priceMinor: 1, sku: 'a', optionValues: { Size: 'm', Colour: 'Red' } },
      ],
    });
    expect(result).toEqual(
      expect.arrayContaining([
        'optionNames.1: Option names must be different',
        'variants.1.optionValues.Colour: Unknown option',
        'variants.1.sku: SKU is already used above',
      ]),
    );
  });
});

describe('stock helpers', () => {
  it('labels variants', () => {
    expect(variantLabel([], {})).toBe('Default');
    expect(variantLabel(['Size', 'Colour'], { Size: 'M', Colour: 'Red' })).toBe('M / Red');
  });
  it('derives stock state', () => {
    expect(stockState(0, 3)).toBe('out');
    expect(stockState(3, 3)).toBe('low');
    expect(stockState(4, 3)).toBe('ok');
  });
  it('validates adjustments', () => {
    expect(
      stockAdjustmentSchema.safeParse({ mode: 'add', quantity: 0, reason: 'RECEIVED' }).success,
    ).toBe(false);
    expect(
      stockAdjustmentSchema.safeParse({ mode: 'set', quantity: 0, reason: 'COUNT' }).success,
    ).toBe(true);
    expect(
      stockAdjustmentSchema.safeParse({ mode: 'add', quantity: 2, reason: 'OTHER' }).success,
    ).toBe(false);
  });
});
