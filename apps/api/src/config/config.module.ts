import { Global, Module } from '@nestjs/common';
import { loadEnv, type Env } from './env.schema.js';

/** Injection token for the validated environment. */
export const ENV = Symbol('ENV');

/**
 * Validates the environment once at boot and makes it injectable everywhere.
 * Global, because nearly every module needs at least one setting.
 */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => loadEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
