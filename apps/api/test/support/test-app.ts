import { execFileSync } from 'node:child_process';
import { randomBytes, randomInt } from 'node:crypto';
import type { ModuleMetadata } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createFastifyAdapter } from '../../src/observability/fastify-options.js';
import { createPrismaClient, type PrismaClient } from '@medtravel/db';
import type { Role } from '@medtravel/contracts';
import { FakeS3Server } from '@medtravel/storage/testing';
import { AppModule } from '../../src/app.module.js';
import { RealtimeAdapter } from '../../src/realtime/realtime.adapter.js';
import { SessionService } from '../../src/auth/session.service.js';
import { Mailer, type Mail } from '../../src/modules/auth/mail/mailer.js';
import { PasswordService } from '../../src/modules/auth/password.service.js';

const SERVER_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://medtravel:medtravel@localhost:5432/medtravel';

export interface RawResponse {
  status: number;
  body: unknown;
  /** Every `Set-Cookie` of the response, as `name -> value` (an empty value means the cookie was cleared). */
  cookies: Record<string, string>;
  setCookieHeaders: string[];
  headers: Record<string, string | string[] | number | undefined>;
}

export interface RawRequest {
  headers?: Record<string, string>;
  /** Cookies to send, as `name -> value`. */
  cookies?: Record<string, string>;
  body?: unknown;
  ip?: string;
}

export interface TestApp {
  app: NestFastifyApplication;
  /** Direct access to the throwaway database, for arranging data and checking what the API wrote. */
  db: PrismaClient;
  /** Mail the API "sent" (the capture transport keeps it). */
  mails: Mail[];
  /** Sends a request as a signed-in user of `role` (or not signed in when `role` is null) and parses the JSON answer. */
  call(
    role: Role | null,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    body?: unknown,
  ): Promise<{ status: number; body: unknown }>;
  /** A request with exactly the headers and cookies given: for the sign-in, CSRF and cookie tests. */
  raw(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    request?: RawRequest,
  ): Promise<RawResponse>;
  /** Creates a user with a password (default `Dev@12345`) and returns it. */
  makeUser(data: {
    email: string;
    role: Role;
    name?: string;
    password?: string;
    status?: 'active' | 'invited';
  }): Promise<{ id: string; email: string; password: string }>;
  /** An access token for a new session of `userId`, with the second factor counted as done unless `twoFactorVerified` is false. */
  tokenFor(
    userId: string,
    options?: { twoFactorVerified?: boolean },
  ): Promise<{ accessToken: string; sessionId: string }>;
  /** Where the app listens (only when started with `listen`). */
  url: string;
  /** The in-memory S3 server the API stores files in. */
  s3: FakeS3Server;
  /** The private bucket's name. */
  bucket: string;
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
export async function createTestApp(
  options: {
    env?: Record<string, string>;
    imports?: ModuleMetadata['imports'];
    /** Listen on a real port with the realtime adapter, for tests that open WebSocket connections. */
    listen?: boolean;
  } = {},
): Promise<TestApp> {
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
  process.env['CORS_ORIGINS'] = 'http://localhost:3002';
  // Files go to an in-memory S3 server, so tests exercise the real SDK, presigned URLs and multipart uploads without MinIO.
  const s3 = new FakeS3Server();
  const bucket = 'test-private';
  process.env['S3_ENDPOINT'] = (await s3.start()).url;
  process.env['S3_PRIVATE_BUCKET'] = bucket;
  process.env['S3_FORCE_PATH_STYLE'] = 'true';
  process.env['S3_ACCESS_KEY'] = 'test-key';
  process.env['S3_SECRET_KEY'] = 'test-secret';
  Object.assign(process.env, options.env);

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ...(options.imports ?? [])],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), {
    rawBody: true,
  });
  if (options.listen)
    app.useWebSocketAdapter(
      new RealtimeAdapter(app, {
        CORS_ORIGINS: ['http://localhost:3002'],
        REDIS_URL: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
      }),
    );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  if (options.listen) await app.listen(0, '127.0.0.1');
  const db = createPrismaClient({ connectionString: urlFor(name) });
  const sessions = app.get(SessionService);
  const passwords = app.get(PasswordService);
  const mailer = app.get(Mailer);
  const tokens = new Map<string, string>();

  const parse = (text: string): unknown => {
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      // Not JSON (a CSV export): hand back the text.
      return text;
    }
  };

  const makeUser: TestApp['makeUser'] = async ({
    email,
    role,
    name,
    password = 'Dev@12345',
    status = 'active',
  }) => {
    const user = await db.user.create({
      data: {
        email,
        role,
        name: name ?? role,
        status,
        passwordHash: await passwords.hash(password),
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    return { id: user.id, email, password };
  };

  const tokenFor: TestApp['tokenFor'] = async (userId, opts = {}) => {
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, role: true },
    });
    const { sessionId, tokens: issued } = await sessions.create(db, {
      user,
      twoFactorVerified: opts.twoFactorVerified ?? true,
      context: { actor: null, ip: '127.0.0.1', userAgent: 'vitest', requestId: null },
    });
    return { accessToken: issued.accessToken, sessionId };
  };

  const raw: TestApp['raw'] = async (method, url, request = {}) => {
    const cookieHeader = Object.entries(request.cookies ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    const response = await app.inject({
      method,
      url,
      headers: { ...(cookieHeader ? { cookie: cookieHeader } : {}), ...request.headers },
      ...(request.body === undefined ? {} : { payload: request.body as object }),
      // Each call comes from its own address unless the test says otherwise, so the per-address rate limit of one
      // test never spills into another.
      remoteAddress: request.ip ?? `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
    });
    const setCookieHeaders = [response.headers['set-cookie'] ?? []].flat().map(String);
    const cookies = Object.fromEntries(
      setCookieHeaders.map((header) => {
        const [pair] = header.split(';');
        const index = (pair ?? '').indexOf('=');
        return [(pair ?? '').slice(0, index), (pair ?? '').slice(index + 1)];
      }),
    );
    return {
      status: response.statusCode,
      body: parse(response.body),
      cookies,
      setCookieHeaders,
      headers: response.headers,
    };
  };

  return {
    app,
    url: options.listen
      ? `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`
      : '',
    db,
    mails: mailer.captured,
    makeUser,
    tokenFor,
    raw,
    async call(role, method, url, body) {
      let authorization: Record<string, string> = {};
      if (role) {
        if (!tokens.has(role)) {
          const user = await makeUser({
            email: `${role}-${randomBytes(3).toString('hex')}@test.example`,
            role,
          });
          tokens.set(role, (await tokenFor(user.id)).accessToken);
        }
        authorization = { authorization: `Bearer ${tokens.get(role)}` };
      }
      const response = await raw(method, url, {
        headers: authorization,
        ...(body === undefined ? {} : { body }),
      });
      return { status: response.status, body: response.body };
    },
    s3,
    bucket,
    async close() {
      await app.close();
      await s3.close();
      await db.$disconnect();
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.$disconnect();
    },
  };
}
