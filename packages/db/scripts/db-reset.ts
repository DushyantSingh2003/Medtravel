import { execFileSync } from 'node:child_process';

/**
 * Drops the development database, applies every migration and seeds it with master data, one user per role and the demo
 * hospitals, agencies and 40 cases. Development only: it refuses to run against production.
 */
if (!['development', 'test', undefined].includes(process.env['NODE_ENV'])) {
  throw new Error('db:reset only runs in development or test');
}
const run = (args: string[], extra: Record<string, string> = {}) =>
  execFileSync('pnpm', ['exec', ...args], { stdio: 'inherit', env: { ...process.env, ...extra } });

run(['prisma', 'migrate', 'reset', '--force', '--config', 'prisma7.config.ts']);
run(['tsx', 'prisma/seed.ts'], { SEED_DEV_USERS: 'true', SEED_DEMO_DATA: 'true' });
