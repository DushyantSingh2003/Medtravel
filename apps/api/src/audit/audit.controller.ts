import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Can } from '../auth/decorators.js';
import { Ctx, type RequestContext } from '../common/request-context.js';
import { AuditExportQueryDto, AuditListQueryDto, AuditPageDto } from './audit.dto.js';
import { AuditQueryService } from './audit-query.service.js';
import { AuditService } from './audit.service.js';
import { auditCsv } from './audit-csv.js';

@ApiTags('audit')
@ApiCookieAuth('session')
@Controller('audit')
export class AuditController {
  constructor(
    private readonly query: AuditQueryService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Can('read', 'AuditLog')
  @ApiOperation({
    operationId: 'listAudit',
    summary: 'Search the audit trail: who did or viewed what, newest first',
  })
  @ApiOkResponse({ type: AuditPageDto })
  list(@Query() { cursor, limit, ...filters }: AuditListQueryDto) {
    return this.query.list(filters, { cursor, limit });
  }

  @Get('export')
  @Can('export', 'AuditLog')
  @Header('content-type', 'text/csv; charset=utf-8')
  @ApiOperation({ operationId: 'exportAudit', summary: 'Download the filtered audit trail as CSV' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV, newest first, up to 10,000 rows', type: String })
  async export(
    @Query() filters: AuditExportQueryDto,
    @Ctx() context: RequestContext,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    const events = await this.query.forExport(filters);
    // Exporting the trail is itself something to audit.
    await this.audit.recordNow(context, {
      action: 'audit.exported',
      entityType: 'AuditLog',
      entityId: 'export',
      after: { filters, rows: events.length },
    });
    void reply.header('content-disposition', 'attachment; filename="audit-log.csv"');
    return auditCsv(events);
  }
}
