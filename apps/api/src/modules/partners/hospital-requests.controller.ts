import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Can, CurrentActor } from '../../auth/decorators.js';
import type { Actor } from '../../auth/actor.js';
import { Ctx, type RequestContext } from '../../common/request-context.js';
import { PartnerRequestsService } from './partner-requests.service.js';
import {
  ChangeRequestListQueryDto,
  ChangeRequestPageDto,
  ChangeRequestRowDto,
  IdParamDto,
  SubmitOnboardingDto,
  SubmitPriceChangeDto,
  SubmitProfileEditDto,
} from './partners.dto.js';

/** What a hospital sends us for review: its first submission, profile edits and package price changes. */
@ApiTags('hospital-requests')
@ApiCookieAuth('session')
@Controller('hospital/change-requests')
export class HospitalRequestsController {
  constructor(private readonly requests: PartnerRequestsService) {}

  @Get()
  @Can('update', 'Hospital')
  @ApiOperation({ operationId: 'listMyChangeRequests', summary: 'Requests of the hospital the user works for' })
  @ApiOkResponse({ type: ChangeRequestPageDto })
  list(@CurrentActor() actor: Actor, @Query() query: ChangeRequestListQueryDto) {
    return this.requests.list(actor, query);
  }

  @Post('onboarding')
  @Can('update', 'Hospital')
  @ApiOperation({ operationId: 'submitHospitalForReview', summary: 'Submit a draft hospital profile for review' })
  @ApiCreatedResponse({ type: ChangeRequestRowDto })
  onboarding(@CurrentActor() actor: Actor, @Body() body: SubmitOnboardingDto, @Ctx() context: RequestContext) {
    return this.requests.submitOnboarding(actor, body, context);
  }

  @Post('profile')
  @Can('update', 'Hospital')
  @ApiOperation({ operationId: 'submitProfileEdit', summary: 'Ask for a change to the hospital profile' })
  @ApiCreatedResponse({ type: ChangeRequestRowDto })
  profile(@CurrentActor() actor: Actor, @Body() body: SubmitProfileEditDto, @Ctx() context: RequestContext) {
    return this.requests.submitProfileEdit(actor, body, context);
  }

  @Post('price')
  @Can('update', 'Hospital')
  @ApiOperation({ operationId: 'submitPriceChange', summary: 'Ask for a new price on a package' })
  @ApiCreatedResponse({ type: ChangeRequestRowDto })
  price(@CurrentActor() actor: Actor, @Body() body: SubmitPriceChangeDto, @Ctx() context: RequestContext) {
    return this.requests.submitPriceChange(actor, body, context);
  }

  @Delete(':id')
  @HttpCode(204)
  @Can('update', 'Hospital')
  @ApiOperation({ operationId: 'withdrawChangeRequest', summary: 'Withdraw a request that is still waiting' })
  async withdraw(
    @CurrentActor() actor: Actor,
    @Param() { id }: IdParamDto,
    @Ctx() context: RequestContext,
  ): Promise<void> {
    await this.requests.withdraw(actor, id, context);
  }
}
