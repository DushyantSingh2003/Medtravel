import { PROVIDER_ENV_SHAPE, refineProviderEnv } from '@medtravel/notifications';
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
/** Development-only defaults so a fresh checkout runs; production refuses them. */
const DEV_TOKEN_SECRET = 'dev-only-token-secret-change-me-0123456789abcdef';
const DEV_S3_ACCESS_KEY = 'medtravel';
const DEV_S3_SECRET_KEY = 'medtravel-secret';
const DEV_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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
    /** Signs access tokens, sign-in challenges and hashes backup and sign-in codes. Long and random in production. */
    AUTH_TOKEN_SECRET: z
      .string()
      .min(32, 'AUTH_TOKEN_SECRET needs at least 32 characters')
      .default(DEV_TOKEN_SECRET),
    /** 32 bytes as 64 hex characters: encrypts TOTP secrets in the database. */
    AUTH_ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-f]{64}$/i, 'AUTH_ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
      .default(DEV_ENCRYPTION_KEY),
    /** Where the portal lives: the links in emails point here. */
    PORTAL_URL: urlString('PORTAL_URL must be a URL').default('http://localhost:3002'),
    /** Cookie domain, e.g. `.medtravel.example` when the portal and the API are on sibling subdomains. Unset locally. */
    COOKIE_DOMAIN: z.string().optional(),
    /** How many reverse proxies (load balancers) sit in front of the API; 0 locally. The client address is read from the right. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    /** Multiplies every rate limit (sign-in, codes, resets). Only above 1 for browser test runs; refused in production. */
    AUTH_RATE_LIMIT_MULTIPLIER: z.coerce.number().int().min(1).max(1000).default(1),
    /** `capture` keeps mail in memory (development, tests); `smtp` sends it. */
    EMAIL_TRANSPORT: z.enum(['capture', 'smtp']).default('capture'),
    ...PROVIDER_ENV_SHAPE,
    /** Object storage: MinIO locally, S3 in production. Files are only ever in the private bucket. */
    S3_ENDPOINT: urlString('S3_ENDPOINT must be a URL').optional(),
    /** The address browsers use to reach the bucket when it differs from `S3_ENDPOINT` (a container name versus localhost). */
    S3_PUBLIC_ENDPOINT: urlString('S3_PUBLIC_ENDPOINT must be a URL').optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_ACCESS_KEY: z.string().min(1).default(DEV_S3_ACCESS_KEY),
    S3_SECRET_KEY: z.string().min(1).default(DEV_S3_SECRET_KEY),
    S3_PRIVATE_BUCKET: z.string().min(3).default('medtravel-private'),
    S3_FORCE_PATH_STYLE: z
      .string()
      .optional()
      .transform((value) => value === 'true'),
    /** Skip the mandatory second factor for users who have not enrolled. Development only; refused elsewhere. */
    AUTH_DEV_SKIP_2FA: z
      .string()
      .optional()
      .transform((value) => value === 'true'),
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    refineProviderEnv(env, issue);
    if (env.AUTH_RATE_LIMIT_MULTIPLIER > 1 && env.NODE_ENV === 'production') {
      issue('AUTH_RATE_LIMIT_MULTIPLIER', 'Relaxing the rate limits is not allowed in production');
    }
    if (env.AUTH_DEV_SKIP_2FA && env.NODE_ENV !== 'development') {
      issue('AUTH_DEV_SKIP_2FA', 'Skipping 2FA is only allowed when NODE_ENV=development');
    }
    if (env.NODE_ENV === 'production') {
      if (env.AUTH_TOKEN_SECRET === DEV_TOKEN_SECRET)
        issue('AUTH_TOKEN_SECRET', 'Set a real AUTH_TOKEN_SECRET in production');
      if (env.AUTH_ENCRYPTION_KEY === DEV_ENCRYPTION_KEY)
        issue('AUTH_ENCRYPTION_KEY', 'Set a real AUTH_ENCRYPTION_KEY in production');
      if (env.TRUST_PROXY_HOPS < 1)
        issue(
          'TRUST_PROXY_HOPS',
          'Set TRUST_PROXY_HOPS to the number of proxies in front of the API, or every visitor shares one address',
        );
      if (env.S3_ACCESS_KEY === DEV_S3_ACCESS_KEY || env.S3_SECRET_KEY === DEV_S3_SECRET_KEY)
        issue('S3_SECRET_KEY', 'Set real S3_ACCESS_KEY and S3_SECRET_KEY in production');
      if (env.EMAIL_TRANSPORT === 'capture')
        issue('EMAIL_TRANSPORT', 'Mail must be sent (EMAIL_TRANSPORT=smtp) in production');
    }
  });

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
