import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type LoggerService } from '@nestjs/common';
import { pino, type Logger } from 'pino';
import { type AppConfig } from '../config/config.js';

/** Fields that must never reach the logs (BUILD_PLAN Phase 1, logging). */
export const REDACT_PATHS = [
  'password',
  'newPassword',
  'currentPassword',
  'token',
  'csrfToken',
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.apiKey',
  '*.secret',
];

export function createLogger(config: AppConfig): Logger {
  const base = { level: config.logLevel, redact: { paths: REDACT_PATHS, censor: '[redacted]' } };
  if (config.isProduction) {
    mkdirSync(config.paths.logs, { recursive: true });
    return pino(base, pino.destination({ dest: join(config.paths.logs, 'api.log'), mkdir: true }));
  }
  if (config.env === 'test') return pino({ ...base, level: 'silent' });
  return pino({
    ...base,
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  });
}

const QUIET_CONTEXTS = new Set([
  'InstanceLoader',
  'RoutesResolver',
  'RouterExplorer',
  'NestFactory',
]);

/** Routes Nest's own log calls through pino. */
export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, context?: string) {
    // Nest's startup chatter (every module and route) is only useful when debugging.
    const level = context && QUIET_CONTEXTS.has(context) ? 'debug' : 'info';
    this.logger[level]({ context }, String(message));
  }
  error(message: unknown, trace?: string, context?: string) {
    this.logger.error({ context, trace }, String(message));
  }
  warn(message: unknown, context?: string) {
    this.logger.warn({ context }, String(message));
  }
  debug(message: unknown, context?: string) {
    this.logger.debug({ context }, String(message));
  }
  verbose(message: unknown, context?: string) {
    this.logger.trace({ context }, String(message));
  }
}
