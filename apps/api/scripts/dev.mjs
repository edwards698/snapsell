/**
 * Starts the API for local development.
 * Reuses dist/ when present so Next can talk to the API while tsc watches for changes.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainJs = path.join(root, 'dist', 'main.js');
const children = [];

function run(command, args, label) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    if (signal) return;
    for (const other of children) {
      if (other !== child && !other.killed) other.kill('SIGTERM');
    }
    process.exit(code ?? 1);
  });
  children.push(child);
  return child;
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

run(
  'tsc',
  ['-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput', '--incremental'],
  'tsc',
);

if (!existsSync(mainJs)) {
  process.stdout.write('[api] Waiting for initial TypeScript build…\n');
  while (!existsSync(mainJs)) await delay(250);
}

run(
  'node',
  [
    '--env-file-if-exists=../../.env',
    '--watch',
    '--enable-source-maps',
    'dist/main.js',
  ],
  'api',
);
