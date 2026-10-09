import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';

/**
 * The worker has no HTTP surface: it is a standalone Nest context whose only job is to run
 * BullMQ processors. Shutdown hooks let in-flight jobs finish before the process exits.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}

await bootstrap();
