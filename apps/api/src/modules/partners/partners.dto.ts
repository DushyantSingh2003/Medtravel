import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  agreementSchema,
  changeRequestDetailSchema,
  changeRequestListQuerySchema,
  changeRequestPageSchema,
  changeRequestRowSchema,
  hospitalDetailSchema,
  hospitalListQuerySchema,
  hospitalPageSchema,
  partnerHealthSchema,
  publishResultSchema,
  rejectRequestSchema,
  submitOnboardingSchema,
  submitPriceChangeSchema,
  submitProfileEditSchema,
  verifyAccreditationSchema,
} from '@medtravel/contracts';

const id = z.object({ id: z.uuid() });
export class IdParamDto extends createZodDto(id) {}
export class ChangeRequestListQueryDto extends createZodDto(changeRequestListQuerySchema) {}
export class ChangeRequestPageDto extends createZodDto(changeRequestPageSchema) {}
export class ChangeRequestRowDto extends createZodDto(changeRequestRowSchema) {}
export class ChangeRequestDetailDto extends createZodDto(changeRequestDetailSchema) {}
export class RejectRequestDto extends createZodDto(rejectRequestSchema) {}
export class HospitalListQueryDto extends createZodDto(hospitalListQuerySchema) {}
export class HospitalPageDto extends createZodDto(hospitalPageSchema) {}
export class HospitalDetailDto extends createZodDto(hospitalDetailSchema) {}
export class AgreementDto extends createZodDto(agreementSchema) {}
export class VerifyAccreditationDto extends createZodDto(verifyAccreditationSchema) {}
export class PartnerHealthDto extends createZodDto(partnerHealthSchema) {}
export class PublishResultDto extends createZodDto(publishResultSchema) {}
export class SubmitProfileEditDto extends createZodDto(submitProfileEditSchema) {}
export class SubmitPriceChangeDto extends createZodDto(submitPriceChangeSchema) {}
export class SubmitOnboardingDto extends createZodDto(submitOnboardingSchema) {}
