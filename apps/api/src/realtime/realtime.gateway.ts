import type { Server as HttpServer } from 'node:http';
import {
  Inject,
  Injectable,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { type Logger } from 'pino';
import { Server, type Socket } from 'socket.io';
import { AuthModule } from '../auth/auth.module.js';
import { SESSION_COOKIE } from '../auth/auth.types.js';
import { SessionService } from '../auth/session.service.js';
import { DOMAIN_EVENTS, EventBus } from '../common/events.js';
import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.js';
import { LOGGER } from '../logging/logging.module.js';

const OWNER_ROOM = 'owner';
/** Sessions can expire or be revoked while a socket is open; sockets are re-checked this often. */
const REVALIDATE_MS = 60_000;

function cookieValue(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i !== -1 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Socket.IO for the admin (BUILD_PLAN §12): forwards domain events to signed-in owners.
 * The handshake must carry a valid session cookie and come from the admin's own origin.
 */
@Injectable()
export class RealtimeGateway implements OnApplicationBootstrap, OnApplicationShutdown {
  private io: Server | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly unsubscribe: Array<() => void> = [];

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly sessions: SessionService,
    private readonly events: EventBus,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  onApplicationBootstrap() {
    // CLI tools (`pnpm seed`) use an application context with no HTTP server.
    if (!this.adapterHost.httpAdapter) return;
    const server = this.adapterHost.httpAdapter.getHttpServer() as HttpServer;
    const origin = new URL(this.config.publicWebUrl).origin;
    this.io = new Server(server, {
      // No trailing slash: Next.js redirects `/socket.io/` and would break the dev proxy.
      path: '/socket.io',
      addTrailingSlash: false,
      serveClient: false,
      cors: { origin, credentials: true },
      // Only the owner connects; keep frames small.
      maxHttpBufferSize: 64 * 1024,
    });

    this.io.use((socket, next) => {
      const reqOrigin = socket.handshake.headers.origin;
      if (reqOrigin && reqOrigin !== origin) return next(new Error('FORBIDDEN'));
      const token = cookieValue(socket.handshake.headers.cookie, SESSION_COOKIE);
      const session = token ? this.sessions.validate(token) : null;
      if (!session) return next(new Error('UNAUTHORIZED'));
      socket.data.token = token;
      next();
    });
    this.io.on('connection', (socket: Socket) => {
      void socket.join(OWNER_ROOM);
    });

    for (const name of DOMAIN_EVENTS) {
      this.unsubscribe.push(
        this.events.on(name, (payload) => this.io?.to(OWNER_ROOM).emit(name, payload)),
      );
    }

    this.timer = setInterval(() => this.revalidate(), REVALIDATE_MS);
    this.timer.unref();
    this.logger.debug('Realtime gateway ready');
  }

  private revalidate() {
    if (!this.io) return;
    for (const socket of this.io.sockets.sockets.values()) {
      const token = socket.data.token as string | undefined;
      if (!token || !this.sessions.validate(token)) socket.disconnect(true);
    }
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    for (const off of this.unsubscribe) off();
    const io = this.io;
    this.io = null;
    if (!io) return;
    // Close the sockets only; Nest closes the HTTP server itself.
    io.disconnectSockets(true);
    io.engine.close();
  }
}

@Module({ imports: [AuthModule], providers: [RealtimeGateway] })
export class RealtimeModule {}
