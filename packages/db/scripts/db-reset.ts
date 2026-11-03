import 'dotenv/config';
import { execFileSync } from 'node:child_process';

/**
 * Drops the development database, applies every migration and seeds it with master data, one user per role and the demo
 * hospitals, agencies and 40 cases. Development only: it refuses any environment that is not development or test, and any
 * database that is not on this machine or a local container.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'db']);

if (!['development', 'test'].includes(process.env['NODE_ENV'] ?? 'development')) {
  throw new Error('db:reset only runs in development or test');
}
const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is not set. Copy packages/db/.env.example to .env first.');
const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
if (!LOCAL_HOSTS.has(host)) {
  throw new Error(`db:reset refuses to reset a database on ${host}: it only resets a local one`);
}

const run = (args: string[], extra: Record<string, string> = {}) =>
  execFileSync('pnpm', ['exec', ...args], { stdio: 'inherit', env: { ...process.env, ...extra } });

run(['prisma', 'migrate', 'reset', '--force', '--config', 'prisma7.config.ts']);
run(['tsx', 'prisma/seed.ts'], { SEED_DEV_USERS: 'true', SEED_DEMO_DATA: 'true' });
