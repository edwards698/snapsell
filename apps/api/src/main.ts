import { ConfigError, loadConfig } from './config/config.js';
import { createApp } from './app.js';

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(
        `\n${err.message}\n\nCopy .env.example to .env (or run \`pnpm setup\`) and try again.\n`,
      );
      process.exit(1);
    }
    throw err;
  }
  const app = await createApp(config);
  await app.listen(config.port, config.host);
  console.info(`SnapSell API listening on http://${config.host}:${config.port}`);
}

void main();
