import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, Throttle } from '../../auth/decorators.js';
import { FxConvertQueryDto, FxConvertedDto, FxRatesDto, FxRatesQueryDto } from './fx.dto.js';
import { FxService } from './fx.service.js';

@ApiTags('fx')
@Controller('fx')
export class FxController {
  constructor(private readonly fx: FxService) {}

  @Get('rates')
  @Public()
  @Throttle({ limit: 60, windowSeconds: 60 })
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
  @ApiOperation({
    operationId: 'getFxRates',
    summary: 'Exchange rates from one currency, for showing prices on the website',
  })
  @ApiOkResponse({ type: FxRatesDto })
  rates(@Query() { base }: FxRatesQueryDto) {
    return this.fx.rates(base);
  }

  @Get('convert')
  @Public()
  @Throttle({ limit: 60, windowSeconds: 60 })
  @ApiOperation({
    operationId: 'convertMoney',
    summary: 'Convert an amount between two currencies at the stored rate',
  })
  @ApiOkResponse({ type: FxConvertedDto })
  convert(@Query() query: FxConvertQueryDto) {
    return this.fx.convert(query);
  }
}
