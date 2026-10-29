import { Controller, Get, Module, Param } from '@nestjs/common';
import { Can } from '../../src/auth/decorators.js';
import { AuditService } from '../../src/audit/audit.service.js';
import { Ctx, type RequestContext } from '../../src/common/request-context.js';

/**
 * Stands in for the document and patient read endpoints that later tasks add, so the audit of views and downloads can be
 * proven end to end: the route records the access through `AuditService.recordAccess`, exactly as the real ones must.
 */
@Controller('probe/access')
class AccessProbeController {
  constructor(private readonly audit: AuditService) {}

  @Get('documents/:id/view')
  @Can('read', 'Document')
  async view(@Param('id') id: string, @Ctx() context: RequestContext): Promise<{ ok: true }> {
    await this.audit.recordAccess(context, {
      action: 'document.viewed',
      entityType: 'Document',
      entityId: id,
      patientId: null,
    });
    return { ok: true };
  }

  @Get('documents/:id/download')
  @Can('read', 'Document')
  async download(@Param('id') id: string, @Ctx() context: RequestContext): Promise<{ ok: true }> {
    await this.audit.recordAccess(context, {
      action: 'document.downloaded',
      entityType: 'Document',
      entityId: id,
      patientId: null,
    });
    return { ok: true };
  }
}

@Module({ controllers: [AccessProbeController] })
export class AccessProbeModule {}
