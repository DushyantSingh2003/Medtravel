import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createPrismaClient, type PrismaClient } from '@medtravel/db';
import type { Role } from '@medtravel/contracts';
import { AppModule } from '../../src/app.module.js';

const SERVER_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://medtravel:medtravel@localhost:5432/medtravel';

export interface TestApp {
  app: NestFastifyApplication;
  /** Direct access to the throwaway database, for arranging data and checking what the API wrote. */
  db: PrismaClient;
  /** Sends a request as `role` (or without signing in when `role` is null) and parses the JSON answer. */
  call(
    role: Role | null,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    body?: unknown,
  ): Promise<{ status: number; body: unknown }>;
  close(): Promise<void>;
}

function urlFor(name: string): string {
  const url = new URL(SERVER_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

/**
 * Boots the whole API against a freshly migrated, empty database that exists only for this test file (the same
 * migrations the deploy runs), so tests exercise real SQL, constraints and triggers and cannot disturb each other.
 */
export async function createTestApp(): Promise<TestApp> {
  const name = `api_${randomBytes(4).toString('hex')}`;
  const admin = createPrismaClient({ connectionString: SERVER_URL });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--config', 'prisma7.config.ts'], {
    cwd: new URL('../../../../packages/db', import.meta.url),
    env: { ...process.env, DATABASE_URL: urlFor(name) },
    stdio: 'pipe',
  });

  process.env['DATABASE_URL'] = urlFor(name);
  process.env['REDIS_URL'] ??= 'redis://localhost:6379';
  process.env['NODE_ENV'] = 'test';
  process.env['ENABLE_STUB_AUTH'] = 'true';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const db = createPrismaClient({ connectionString: urlFor(name) });

  return {
    app,
    db,
    async call(role, method, url, body) {
      const response = await app.inject({
        method,
        url,
        headers: role ? { 'x-stub-role': role } : {},
        ...(body === undefined ? {} : { payload: body as object }),
      });
      const text = response.body;
      return { status: response.statusCode, body: text ? JSON.parse(text) : undefined };
    },
    async close() {
      await app.close();
      await db.$disconnect();
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.$disconnect();
    },
  };
}
