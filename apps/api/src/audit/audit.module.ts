import { Global, Module } from '@nestjs/common';
import { OutboxService } from '../outbox/outbox.service.js';
import { AuditController } from './audit.controller.js';
import { AuditQueryService } from './audit-query.service.js';
import { AuditService } from './audit.service.js';
import { DownloadAlertService } from './download-alert.service.js';

/** Audit trail and outbox, global because every module that changes data writes both in its transaction. */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditQueryService, DownloadAlertService, OutboxService],
  exports: [AuditService, OutboxService],
})
export class AuditModule {}
