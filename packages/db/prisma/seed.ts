import 'dotenv/config';
import { createPrismaClient } from '../src/client.ts';

/**
 * Seed data for local development.
 *
 * Every task that adds a module extends this script so the feature can be tried
 * immediately after `pnpm db:seed`. There are no models yet, so this only proves the
 * connection works.
 */
async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy packages/db/.env.example to .env first.');
  }

  const prisma = createPrismaClient({ connectionString });
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.warn('Seed: database reachable, no models to seed yet.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
