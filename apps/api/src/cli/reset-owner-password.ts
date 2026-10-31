// Break-glass owner password reset (BUILD_PLAN D11). Runs directly against the database on the
// server, so it works even when email is not configured. Creates the owner if none exists.
//
//   pnpm reset-owner-password                 # prompts for email (if needed) and password
//   NEW_PASSWORD=... pnpm reset-owner-password --email owner@example.com
import { createInterface } from 'node:readline';
import { openDatabase, runMigrations } from '@snapsell/db';
import { passwordSchema } from '@snapsell/shared';
import { z } from 'zod';
import { createOwner, findOwner, setOwnerPassword } from '../auth/owner.js';
import { loadConfig } from '../config/config.js';

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) =>
        write.call(rl, s.startsWith(question) ? s : '');
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function main() {
  const config = loadConfig();
  const handle = openDatabase(config.paths.database);
  runMigrations(handle);

  const emailArg = process.argv.indexOf('--email');
  const owner = findOwner(handle.db);
  let email = owner?.email ?? (emailArg > -1 ? process.argv[emailArg + 1] : undefined);
  email ??= config.owner.email ?? (await ask('Owner email: '));
  if (!z.email().safeParse(email).success) throw new Error(`Not a valid email: ${email}`);

  let password = process.env.NEW_PASSWORD ?? '';
  if (!password) {
    password = await ask('New password: ', true);
    if ((await ask('Repeat password: ', true)) !== password)
      throw new Error('Passwords do not match.');
  }
  const check = passwordSchema.safeParse(password);
  if (!check.success) throw new Error(check.error.issues[0]?.message ?? 'Invalid password');

  if (owner) {
    await setOwnerPassword(handle.db, owner.id, password);
    console.log(`Password updated for ${owner.email}. All sessions were signed out.`);
  } else {
    await createOwner(handle.db, { email, name: config.owner.name, password });
    console.log(`Owner account created for ${email}.`);
  }
  handle.close();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
