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
import { RbacModule } from './rbac/rbac.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { StorageModule } from './storage/storage.module.js';
import { CasesModule } from './modules/cases/cases.module.js';
import { FxModule } from './modules/fx/fx.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { LeadsModule } from './modules/leads/leads.module.js';
import { PartnersModule } from './modules/partners/partners.module.js';
import { PricingModule } from './modules/pricing/pricing.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { MastersModule } from './modules/masters/masters.module.js';

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
    RbacModule,
    StorageModule,
    HealthModule,
    ObservabilityModule,
    MastersModule,
    FxModule,
    CasesModule,
    UsersModule,
    PricingModule,
    PartnersModule,
    LeadsModule,
    DocumentsModule,
    NotificationsModule,
    RealtimeModule,
  ],
  providers: [
    // Every request body, query and param is validated against the Zod schema on its DTO.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
