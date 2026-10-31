import { pino } from 'pino';
import { HttpApiClient } from './api-client.js';
import { ConfigError, loadConfig } from './config.js';
import { Journal } from './journal.js';
import { createHttpServer } from './server.js';
import { WhatsAppService } from './service.js';
import { WhatsAppWebClient } from './whatsapp-web.client.js';

const REDACT = ['phone', '*.phone', 'chatId', '*.chatId', 'body', '*.body', 'qr', '*.qr'];

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`WhatsApp service: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const logger = pino({
    level: config.logLevel,
    base: { service: 'whatsapp' },
    redact: { paths: REDACT, censor: '[redacted]' },
    ...(config.env === 'production'
      ? {}
      : {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        }),
  });

  const service = new WhatsAppService(config, {
    api: new HttpApiClient(config.apiUrl, config.secret),
    journal: new Journal(config.paths.journal),
    logger,
    createClient: () =>
      new WhatsAppWebClient({ authPath: config.paths.auth, chromePath: config.chromePath, logger }),
  });
  await service.init();

  const server = createHttpServer(service, config.secret, logger);
  server.listen(config.port, config.host, () => {
    logger.info(
      { host: config.host, port: config.port, chrome: config.chromePath ?? 'bundled' },
      'WhatsApp service listening',
    );
  });

  const shutdown = async () => {
    logger.info('Shutting down');
    server.close();
    await service.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

void main();
