import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Can, CurrentActor } from '../../auth/decorators.js';
import type { Actor } from '../../auth/actor.js';
import { Ctx, type RequestContext } from '../../common/request-context.js';
import { FxAdminService } from './fx-admin.service.js';
import {
  CreateAddOnDto,
  CreateFxOverrideDto,
  DiscountThresholdsDto,
  FxOverrideDto,
  FxOverrideListDto,
  FxSettingsDto,
  ItemCodeParamDto,
  MarginRulesDto,
  OverrideIdParamDto,
  PriceHistoryDto,
  PriceItemDto,
  PriceItemListDto,
  PriceItemListQueryDto,
  PriceLookupDto,
  PriceLookupQueryDto,
  PublishPriceDto,
  UpdateDiscountThresholdsDto,
  UpdateFxSettingsDto,
  UpdateMarginRulesDto,
  UpdatePriceItemDto,
} from './pricing.dto.js';
import { PricingService } from './pricing.service.js';

/** Pricing rules for the super admin (`Setting` permission); the price lookup and discount limits are open to whoever can create quotes. */
@ApiTags('admin-pricing')
@ApiCookieAuth('session')
@Controller('admin/pricing')
export class PricingController {
  constructor(
    private readonly pricing: PricingService,
    private readonly fx: FxAdminService,
  ) {}

  @Get('items')
  @Can('read', 'Setting')
  @ApiOperation({
    operationId: 'listPriceItems',
    summary: 'Service packages and add-ons with their current prices',
  })
  @ApiOkResponse({ type: PriceItemListDto })
  async list(@Query() { kind }: PriceItemListQueryDto) {
    return { items: await this.pricing.listItems(kind) };
  }

  @Post('items')
  @Can('create', 'Setting')
  @ApiOperation({ operationId: 'createAddOn', summary: 'Add an add-on to the price list' })
  @ApiCreatedResponse({ type: PriceItemDto })
  create(@Body() body: CreateAddOnDto, @Ctx() context: RequestContext) {
    return this.pricing.createAddOn(body, context);
  }

  // Fixed paths before `items/:code`.
  @Get('items/:code/price')
  @Can('create', 'Quote')
  @ApiOperation({
    operationId: 'lookupPrice',
    summary: 'The price to put on a quote line, in a currency: its own, or converted from rupees',
  })
  @ApiOkResponse({ type: PriceLookupDto })
  lookup(@Param() { code }: ItemCodeParamDto, @Query() { currency }: PriceLookupQueryDto) {
    return this.pricing.lookup(code, currency);
  }

  @Get('items/:code/history')
  @Can('read', 'Setting')
  @ApiOperation({ operationId: 'getPriceHistory', summary: 'Every published version of a price' })
  @ApiOkResponse({ type: PriceHistoryDto })
  history(@Param() { code }: ItemCodeParamDto) {
    return this.pricing.history(code);
  }

  @Post('items/:code/prices')
  @Can('update', 'Setting')
  @ApiOperation({
    operationId: 'publishPrice',
    summary: 'Publish a new version of an item’s prices; quotes already made keep theirs',
  })
  @ApiCreatedResponse({ type: PriceItemDto })
  publish(
    @CurrentActor() actor: Actor,
    @Param() { code }: ItemCodeParamDto,
    @Body() body: PublishPriceDto,
    @Ctx() context: RequestContext,
  ) {
    return this.pricing.publish(actor, code, body, context);
  }

  @Put('items/:code')
  @Can('update', 'Setting')
  @ApiOperation({
    operationId: 'updatePriceItem',
    summary: 'Change what an item is called, includes, or whether it is offered',
  })
  @ApiOkResponse({ type: PriceItemDto })
  update(
    @Param() { code }: ItemCodeParamDto,
    @Body() body: UpdatePriceItemDto,
    @Ctx() context: RequestContext,
  ) {
    return this.pricing.updateItem(code, body, context);
  }

  @Get('margins')
  @Can('read', 'Setting')
  @ApiOperation({ operationId: 'getMarginRules', summary: 'Margin per quote component' })
  @ApiOkResponse({ type: MarginRulesDto })
  margins() {
    return this.pricing.margins();
  }

  @Put('margins')
  @Can('update', 'Setting')
  @ApiOperation({ operationId: 'updateMarginRules', summary: 'Set the margin per quote component' })
  @ApiOkResponse({ type: MarginRulesDto })
  updateMargins(
    @CurrentActor() actor: Actor,
    @Body() body: UpdateMarginRulesDto,
    @Ctx() context: RequestContext,
  ) {
    return this.pricing.updateMargins(actor, body, context);
  }

  @Get('discounts')
  @Can('create', 'Quote')
  @ApiOperation({
    operationId: 'getDiscountThresholds',
    summary: 'The biggest discount each role may give without approval',
  })
  @ApiOkResponse({ type: DiscountThresholdsDto })
  discounts() {
    return this.pricing.discountThresholds();
  }

  @Put('discounts')
  @Can('update', 'Setting')
  @ApiOperation({
    operationId: 'updateDiscountThresholds',
    summary: 'Set the discount limit per role',
  })
  @ApiOkResponse({ type: DiscountThresholdsDto })
  updateDiscounts(
    @CurrentActor() actor: Actor,
    @Body() body: UpdateDiscountThresholdsDto,
    @Ctx() context: RequestContext,
  ) {
    return this.pricing.updateDiscountThresholds(actor, body, context);
  }

  @Get('fx')
  @Can('read', 'Setting')
  @ApiOperation({ operationId: 'getFxSettings', summary: 'Rate provider and markup' })
  @ApiOkResponse({ type: FxSettingsDto })
  fxSettings() {
    return this.fx.settings();
  }

  @Put('fx')
  @Can('update', 'Setting')
  @ApiOperation({ operationId: 'updateFxSettings', summary: 'Choose the rate provider and markup' })
  @ApiOkResponse({ type: FxSettingsDto })
  updateFx(
    @CurrentActor() actor: Actor,
    @Body() body: UpdateFxSettingsDto,
    @Ctx() context: RequestContext,
  ) {
    return this.fx.updateSettings(actor, body, context);
  }

  @Get('fx/overrides')
  @Can('read', 'Setting')
  @ApiOperation({ operationId: 'listFxOverrides', summary: 'Rates set by hand, newest first' })
  @ApiOkResponse({ type: FxOverrideListDto })
  async overrides() {
    return { items: await this.fx.listOverrides() };
  }

  @Post('fx/overrides')
  @Can('update', 'Setting')
  @ApiOperation({
    operationId: 'createFxOverride',
    summary: 'Set a rate by hand, with a reason, in place of the provider’s',
  })
  @ApiCreatedResponse({ type: FxOverrideDto })
  createOverride(
    @CurrentActor() actor: Actor,
    @Body() body: CreateFxOverrideDto,
    @Ctx() context: RequestContext,
  ) {
    return this.fx.createOverride(actor, body, context);
  }

  @Delete('fx/overrides/:id')
  @HttpCode(204)
  @Can('update', 'Setting')
  @ApiOperation({
    operationId: 'revokeFxOverride',
    summary: 'Stop using a manual rate; the provider’s rate applies again',
  })
  async revokeOverride(
    @Param() { id }: OverrideIdParamDto,
    @Ctx() context: RequestContext,
  ): Promise<void> {
    await this.fx.revokeOverride(id, context);
  }
}
