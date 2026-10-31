// Creates .env from .env.example with freshly generated secrets. Safe to re-run: an existing
// .env is never overwritten.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const target = new URL('../.env', import.meta.url);
if (existsSync(target)) {
  console.log('.env already exists – leaving it unchanged.');
  process.exit(0);
}

const secret = () => randomBytes(32).toString('base64url');
let env = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
  .replace(/^SESSION_SECRET=$/m, `SESSION_SECRET=${secret()}`)
  .replace(/^FILE_SIGNING_SECRET=$/m, `FILE_SIGNING_SECRET=${secret()}`)
  .replace(/^INTERNAL_HMAC_SECRET=$/m, `INTERNAL_HMAC_SECRET=${secret()}`);

if (process.stdin.isTTY) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = (await rl.question('Owner email (for the admin login): ')).trim();
  rl.close();
  if (email) {
    const password = randomBytes(12).toString('base64url');
    env = env
      .replace(/^OWNER_EMAIL=$/m, `OWNER_EMAIL=${email}`)
      .replace(/^OWNER_INITIAL_PASSWORD=$/m, `OWNER_INITIAL_PASSWORD=${password}`);
    console.log(
      `\nInitial admin password: ${password}\nChange it in Settings after you sign in.\n`,
    );
  }
}

writeFileSync(target, env, { mode: 0o600 });
console.log('Created .env with generated secrets.');
