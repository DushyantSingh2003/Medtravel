import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.schema.js';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
} as NodeJS.ProcessEnv;

describe('worker env', () => {
  it('defaults concurrency to 5', () => {
    expect(loadEnv(valid).WORKER_CONCURRENCY).toBe(5);
  });

  it('rejects a missing Redis URL', () => {
    expect(() => loadEnv({ DATABASE_URL: valid.DATABASE_URL } as NodeJS.ProcessEnv)).toThrow(
      /REDIS_URL/,
    );
  });
});
