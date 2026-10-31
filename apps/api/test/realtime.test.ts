import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MessagingService } from '../src/messaging/messaging.service.js';
import { ORIGIN, OWNER, startTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let url: string;
beforeAll(async () => {
  t = await startTestApp();
  await t.app.listen(0, '127.0.0.1');
  const { port } = t.app.getHttpServer().address() as AddressInfo;
  url = `http://127.0.0.1:${port}`;
});
afterAll(async () => {
  await t.close();
});

function connect(cookie?: string, origin = ORIGIN) {
  return io(url, {
    path: '/socket.io',
    addTrailingSlash: false,
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { origin, ...(cookie ? { cookie } : {}) },
  });
}

async function sessionCookie() {
  const res = await t.http().post('/api/admin/auth/login').send(OWNER).expect(200);
  return (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
}

function waitFor<T>(socket: Socket, event: string, ms = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event} within ${ms} ms`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('realtime', () => {
  it('refuses a handshake without a session', async () => {
    const socket = connect();
    const err = await waitFor<Error>(socket, 'connect_error');
    expect(err.message).toBe('UNAUTHORIZED');
    socket.close();
  });

  it('refuses another origin even with a session', async () => {
    const socket = connect(await sessionCookie(), 'https://evil.example');
    const err = await waitFor<Error>(socket, 'connect_error');
    expect(err.message).toBe('FORBIDDEN');
    socket.close();
  });

  it('delivers message.new to a signed-in owner within 2 s', async () => {
    const socket = connect(await sessionCookie());
    await waitFor(socket, 'connect');

    const started = Date.now();
    const received = waitFor<{ message: { body: string } }>(socket, 'message.new');
    t.app.get(MessagingService).receive({
      providerMessageId: 'rt-1',
      chatId: '260971234567@c.us',
      phone: '260971234567',
      pushName: 'Mwila',
      type: 'TEXT',
      body: 'Hello there',
      timestamp: Date.now(),
    });
    const payload = await received;
    expect(payload.message.body).toBe('Hello there');
    expect(Date.now() - started).toBeLessThan(2000);
    socket.close();
  });
});
