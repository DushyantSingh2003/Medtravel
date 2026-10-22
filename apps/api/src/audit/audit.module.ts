import { Global, Module } from '@nestjs/common';
import { OutboxService } from '../outbox/outbox.service.js';
import { AuditService } from './audit.service.js';

/** Audit trail and outbox, global because every module that changes data writes both in its transaction. */
@Global()
@Module({ providers: [AuditService, OutboxService], exports: [AuditService, OutboxService] })
export class AuditModule {}
