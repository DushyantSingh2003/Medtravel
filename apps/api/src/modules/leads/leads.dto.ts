import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  createLeadSchema,
  leadCreatedSchema,
  leadDetailSchema,
  leadListQuerySchema,
  leadPageSchema,
  mergeLeadSchema,
  publicLeadReceivedSchema,
  publicLeadSchema,
} from '@medtravel/contracts';

export class LeadIdParamDto extends createZodDto(z.object({ id: z.uuid() })) {}
export class PublicLeadDto extends createZodDto(publicLeadSchema) {}
export class PublicLeadReceivedDto extends createZodDto(publicLeadReceivedSchema) {}
export class CreateLeadDto extends createZodDto(createLeadSchema) {}
export class LeadCreatedDto extends createZodDto(leadCreatedSchema) {}
export class LeadListQueryDto extends createZodDto(leadListQuerySchema) {}
export class LeadPageDto extends createZodDto(leadPageSchema) {}
export class LeadDetailDto extends createZodDto(leadDetailSchema) {}
export class MergeLeadDto extends createZodDto(mergeLeadSchema) {}
