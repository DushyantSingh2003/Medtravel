import { z } from 'zod';

const urlString = (message: string) =>
  z.string().refine((value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, message);

/** Environment the worker reads, validated once at boot. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: urlString('DATABASE_URL must be a PostgreSQL connection string'),
  REDIS_URL: urlString('REDIS_URL must be a Redis connection string'),
  /** Object storage, the same private bucket the API signs uploads for. */
  S3_ENDPOINT: urlString('S3_ENDPOINT must be a URL').optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1).default('medtravel'),
  S3_SECRET_KEY: z.string().min(1).default('medtravel-secret'),
  S3_PRIVATE_BUCKET: z.string().min(3).default('medtravel-private'),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  /** ClamAV (`clamd`) that scans every uploaded file. */
  CLAMAV_HOST: z.string().default('localhost'),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65_535).default(3310),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
