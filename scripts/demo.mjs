// Publishes the DevDraft webhook through ngrok, straight to the API on port 4000.
// Next.js is not in that path, so the raw body DevDraft signs is the body the API verifies.
// .env is left unchanged. PUBLIC_WEB_URL stays the local shop.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const envFile = new URL('../.env', import.meta.url);
if (!existsSync(envFile)) {
  console.error('No .env file. Run `pnpm setup` first.');
  process.exit(1);
}

const API = 'http://127.0.0.1:4000';
const children = [];

function stop(code = 0) {
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    if (process.platform === 'win32') {
      spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore', windowsHide: true });
    } else {
      child.kill();
    }
  }
  setTimeout(() => process.exit(code), 500).unref();
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

function start(command, args, { env = process.env, stdio = 'inherit' } = {}) {
  // On Windows, pnpm is a .cmd shim. Pass one shell string so Node does not concatenate
  // an argument list (that path is deprecated and warns).
  const child =
    process.platform === 'win32'
      ? spawn([command, ...args].join(' '), { env, stdio, shell: true, windowsHide: true })
      : spawn(command, args, { env, stdio, windowsHide: true });
  children.push(child);
  return child;
}

async function publicUrl() {
  const response = await fetch('http://127.0.0.1:4040/api/tunnels');
  if (!response.ok) throw new Error(`ngrok API returned ${response.status}`);
  const body = await response.json();
  const https = (body.tunnels ?? []).find(
    (tunnel) =>
      typeof tunnel.public_url === 'string' &&
      tunnel.public_url.startsWith('https://') &&
      String(tunnel.config?.addr ?? '').includes('4000'),
  );
  if (!https) throw new Error('ngrok has no HTTPS tunnel to the API yet');
  return https.public_url.replace(/\/$/, '');
}

async function apiHealthy() {
  try {
    return (await fetch(`${API}/api/health`)).ok;
  } catch {
    return false;
  }
}

/** The dev API restarts once when the TypeScript watcher finishes its first compile. */
async function waitForApi(child) {
  const exited = new Promise((resolve) => child.once('exit', resolve));
  let stableSince = 0;
  for (let attempt = 0; attempt < 160; attempt++) {
    if (child.exitCode !== null) return false;
    const ok = await apiHealthy();
    if (!ok) stableSince = 0;
    else if (!stableSince) stableSince = Date.now();
    else if (Date.now() - stableSince >= 20_000) return true;
    await Promise.race([delay(500), exited]);
  }
  return false;
}

console.log('Starting SnapSell. The webhook tunnel opens once the API is accepting requests.');
const dev = start('pnpm', ['dev']);
if (!(await waitForApi(dev))) {
  console.error('The API did not start on port 4000.');
  stop(1);
  await delay(300);
  process.exit(1);
}

console.log('Opening an ngrok tunnel to the API …');
// 127.0.0.1, not localhost: the API listens on IPv4, and Windows resolves localhost to ::1.
const ngrok = start('ngrok', ['http', '127.0.0.1:4000', '--log=stdout'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let captureLog = true;
let ngrokLog = '';
const keepLog = (chunk) => {
  if (captureLog) ngrokLog += chunk;
};
ngrok.stdout.on('data', keepLog);
ngrok.stderr.on('data', keepLog);

let url;
const ngrokExit = new Promise((resolve) => ngrok.once('exit', resolve));
for (let attempt = 0; attempt < 40 && !url; attempt++) {
  if (ngrok.exitCode !== null) break;
  try {
    url = await publicUrl();
  } catch {
    await Promise.race([delay(250), ngrokExit]);
  }
}

captureLog = false;
if (!url) {
  console.error(ngrokLog.trim() || 'ngrok did not publish a URL.');
  stop(1);
  await delay(300);
  process.exit(1);
}
ngrokLog = '';

const webhookUrl = `${url}/api/webhooks/devdraft`;
console.log(`\nDevDraft webhook URL:\n  ${webhookUrl}\n`);
console.log('Register that HTTPS address in DevDraft. POSTs go straight to the API,');
console.log('so the signed body is verified exactly as DevDraft sent it.\n');

dev.on('exit', (code) => stop(code ?? 0));
ngrok.on('exit', (code) => {
  if (dev.exitCode === null) {
    console.error(`ngrok stopped (${code ?? 0}).`);
    stop(code ?? 1);
  }
});
