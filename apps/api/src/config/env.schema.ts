import { z } from 'zod';

/** A string that parses as a URL. Written without `z.url()` so it behaves the same on Zod 3 and 4. */
const urlString = (message: string) =>
  z.string().refine((value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, message);

/**
 * Every environment variable the API reads, validated once at boot. A missing or malformed
 * variable fails the process immediately with a readable message instead of surfacing as an
 * undefined deep inside a request.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    DATABASE_URL: urlString('DATABASE_URL must be a PostgreSQL connection string'),
    REDIS_URL: urlString('REDIS_URL must be a Redis connection string'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    /**
     * Development sign-in until F-03: the role is read from the `x-stub-role` header or the portal's stub cookie.
     * Anyone can claim any role, so it is off unless exactly "true", and the API refuses to boot with it on in production.
     */
    ENABLE_STUB_AUTH: z
      .string()
      .optional()
      .transform((value) => value === 'true'),
  })
  .refine(
    (env) => !env.ENABLE_STUB_AUTH || env.NODE_ENV === 'development' || env.NODE_ENV === 'test',
    {
      path: ['ENABLE_STUB_AUTH'],
      message:
        'The stub sign-in must never be enabled in production (only NODE_ENV=development or test)',
    },
  );

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate `process.env`.
 *
 * @throws when any variable is missing or malformed, listing every problem at once.
 */
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
