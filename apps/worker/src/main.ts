import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { initSentry } from '@medtravel/observability';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/env.schema.js';

/**
 * The worker has no HTTP surface: it is a standalone Nest context whose only job is to run
 * BullMQ processors. Shutdown hooks let in-flight jobs finish before the process exits.
 */
async function bootstrap(): Promise<void> {
  const env = loadEnv();
  initSentry({
    dsn: env.SENTRY_DSN,
    service: 'worker',
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.SENTRY_RELEASE,
  });
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}

await bootstrap();
