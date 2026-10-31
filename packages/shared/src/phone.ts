import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export const DEFAULT_PHONE_REGION: CountryCode = 'ZM';

/** Normalise a customer-entered phone number to E.164, or return null if it isn't valid. */
export function normalizePhone(input: string, region: CountryCode = DEFAULT_PHONE_REGION) {
  const parsed = parsePhoneNumberFromString(input.trim(), region);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

export function formatPhone(e164: string) {
  const parsed = parsePhoneNumberFromString(e164);
  return parsed ? parsed.formatInternational() : e164;
}

/** WhatsApp Web IDs look like `260971234567@c.us`. */
export function whatsappIdToE164(waId: string) {
  const digits = waId.split('@')[0]?.replace(/\D/g, '') ?? '';
  return digits ? normalizePhone(`+${digits}`) : null;
}
