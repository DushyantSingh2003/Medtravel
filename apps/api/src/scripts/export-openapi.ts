import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../app.module.js';
import { buildOpenApiDocument } from '../openapi.js';

/**
 * Writes apps/api/openapi.json without starting a server, so `pnpm api:generate` can build
 * the typed client in CI where no API is running.
 */
async function main(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();

  const target = resolve(import.meta.dirname, '../../openapi.json');
  await writeFile(target, `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`);
  await app.close();

  console.warn(`Wrote ${target}`);
}

await main();
