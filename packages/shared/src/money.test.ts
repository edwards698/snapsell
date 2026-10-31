import { describe, expect, it } from 'vitest';
import { formatMoney, toMinor } from './money.js';
import { normalizePhone, whatsappIdToE164 } from './phone.js';

describe('money', () => {
  it('parses decimals without float error', () => {
    expect(toMinor('350', 'ZMW')).toBe(35000);
    expect(toMinor('0.1', 'ZMW')).toBe(10);
    expect(toMinor('19.99', 'USD')).toBe(1999);
    expect(toMinor(0.3, 'USD')).toBe(30);
  });
  it('rejects bad input', () => {
    expect(() => toMinor('1.234', 'ZMW')).toThrow();
    expect(() => toMinor('abc', 'ZMW')).toThrow();
  });
  it('formats', () => {
    expect(formatMoney(75000, 'ZMW')).toBe('K750.00');
    expect(formatMoney(75000, 'ZMW', { trimZeros: true })).toBe('K750');
    expect(formatMoney(123456789, 'USDC')).toBe('1,234,567.89 USDC');
    expect(formatMoney(-50, 'USD')).toBe('-$0.50');
  });
});

describe('phone', () => {
  it('normalises Zambian numbers to E.164', () => {
    expect(normalizePhone('097 123 4567')).toBe('+260971234567');
    expect(normalizePhone('+260 97 1234567')).toBe('+260971234567');
    expect(normalizePhone('12')).toBeNull();
  });
  it('maps WhatsApp IDs', () => {
    expect(whatsappIdToE164('260971234567@c.us')).toBe('+260971234567');
  });
});
