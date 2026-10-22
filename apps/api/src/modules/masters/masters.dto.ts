import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  cursorPageSchema,
  masterListQuerySchema,
  masterResourceSchema,
  masterRowSchema,
} from '@medtravel/contracts';

export class ResourceParamsDto extends createZodDto(z.object({ resource: masterResourceSchema })) {}

export class KeyParamsDto extends createZodDto(
  z.object({ resource: masterResourceSchema, id: z.string().trim().min(1).max(64) }),
) {}

export class MasterListQueryDto extends createZodDto(masterListQuerySchema) {}

/**
 * The write body differs per resource, so the controller accepts any object and the service validates it with the
 * resource's own schema from `packages/contracts` (the admin forms use the same schemas).
 */
export class MasterWriteDto extends createZodDto(z.record(z.string(), z.unknown())) {}

export class MasterRowDto extends createZodDto(masterRowSchema) {}
export class MasterPageDto extends createZodDto(cursorPageSchema(masterRowSchema)) {}
