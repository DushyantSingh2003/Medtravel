import { createZodDto } from 'nestjs-zod';
import {
  fxConvertQuerySchema,
  fxConvertedSchema,
  fxRatesQuerySchema,
  fxRatesSchema,
} from '@medtravel/contracts';

export class FxRatesQueryDto extends createZodDto(fxRatesQuerySchema) {}
export class FxRatesDto extends createZodDto(fxRatesSchema) {}
export class FxConvertQueryDto extends createZodDto(fxConvertQuerySchema) {}
export class FxConvertedDto extends createZodDto(fxConvertedSchema) {}
