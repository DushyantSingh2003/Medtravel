import { createZodDto } from 'nestjs-zod';
import { auditFiltersSchema, auditListQuerySchema, auditPageSchema } from '@medtravel/contracts';

export class AuditListQueryDto extends createZodDto(auditListQuerySchema) {}
export class AuditExportQueryDto extends createZodDto(auditFiltersSchema) {}
export class AuditPageDto extends createZodDto(auditPageSchema) {}
