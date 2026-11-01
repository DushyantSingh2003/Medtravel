import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  caseListQuerySchema,
  casePageSchema,
  caseStageSchema,
  caseViewSchema,
  createCaseSchema,
  cursorQuerySchema,
  stageConfigListSchema,
  stageConfigSchema,
  stageConfigUpdateSchema,
  stageHistoryPageSchema,
  transitionRequestSchema,
} from '@medtravel/contracts';

export class CaseIdParamDto extends createZodDto(z.object({ id: z.uuid() })) {}
export class StageParamDto extends createZodDto(z.object({ stage: caseStageSchema })) {}
export class CreateCaseDto extends createZodDto(createCaseSchema) {}
export class CaseListQueryDto extends createZodDto(caseListQuerySchema) {}
export class CaseViewDto extends createZodDto(caseViewSchema) {}
export class CasePageDto extends createZodDto(casePageSchema) {}
export class TransitionRequestDto extends createZodDto(transitionRequestSchema) {}
export class HistoryQueryDto extends createZodDto(cursorQuerySchema) {}
export class StageHistoryPageDto extends createZodDto(stageHistoryPageSchema) {}
export class StageConfigDto extends createZodDto(stageConfigSchema) {}
export class StageConfigListDto extends createZodDto(z.object({ items: stageConfigListSchema })) {}
export class StageConfigUpdateDto extends createZodDto(stageConfigUpdateSchema) {}
