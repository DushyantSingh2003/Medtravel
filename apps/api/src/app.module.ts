import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { ConfigModule, ENV } from './config/config.module.js';
import type { Env } from './config/env.schema.js';
import { loggerOptions } from './logging/logger.options.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { MastersModule } from './masters/masters.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ENV],
      useFactory: (env: Env) => loggerOptions(env),
    }),
    DatabaseModule,
    AuditModule,
    AuthModule,
    HealthModule,
    MastersModule,
  ],
  providers: [
    // Every request body, query and param is validated against the Zod schema on its DTO.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
