import { hash, verify } from '@node-rs/argon2';

// argon2id (the library default) with OWASP's recommended minimum parameters.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string) {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;

/** Spend the same time on unknown emails as on wrong passwords, so timing reveals nothing. */
export async function burnPasswordCheck(password: string) {
  dummyHash ??= hashPassword('snapsell-timing-equaliser');
  await verifyPassword(await dummyHash, password);
}
