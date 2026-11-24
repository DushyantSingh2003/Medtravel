import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Can, CurrentActor, Public, Throttle } from '../../auth/decorators.js';
import type { Actor } from '../../auth/actor.js';
import { Ctx, type RequestContext } from '../../common/request-context.js';
import { LeadIntakeService } from './lead-intake.service.js';
import {
  CreateLeadDto,
  LeadCreatedDto,
  LeadDetailDto,
  LeadIdParamDto,
  LeadListQueryDto,
  LeadPageDto,
  MergeLeadDto,
  PublicLeadDto,
  PublicLeadReceivedDto,
} from './leads.dto.js';
import { LeadsService, assertLeadStaff } from './leads.service.js';
import { TurnstileService } from './turnstile.service.js';

/** The website's enquiry form: open to visitors, so it is guarded by Turnstile, a honeypot and a rate limit. */
@ApiTags('public-leads')
@Controller('public/leads')
export class PublicLeadsController {
  constructor(
    private readonly intake: LeadIntakeService,
    private readonly turnstile: TurnstileService,
  ) {}

  @Post()
  @Public()
  // Five enquiries an hour from one address is plenty for a family and little for a script.
  @Throttle({ limit: 5, windowSeconds: 3600 })
  @ApiOperation({ operationId: 'submitPublicLead', summary: 'Send an enquiry from the website form' })
  @ApiCreatedResponse({ type: PublicLeadReceivedDto })
  async submit(@Body() body: PublicLeadDto, @Ctx() context: RequestContext) {
    // A bot that filled the hidden field is told it worked, so it learns nothing; nothing is saved.
    if (body.companyWebsite) return { reference: 'CASE-0000-000000' };
    if (!(await this.turnstile.verify(body.turnstileToken, context.ip)))
      throw new BadRequestException({
        message: 'The security check failed. Please try again.',
        errors: [{ path: ['turnstileToken'], message: 'The security check failed. Please try again.' }],
      });
    // The address limit is per server and easy to rotate; this one follows the phone number or email.
    if ((await this.intake.recentContactCount(body)) >= 5)
      throw new HttpException('Too many enquiries for these contact details. Please try later.', HttpStatus.TOO_MANY_REQUESTS);
    const { turnstileToken: _token, privacyAccepted: _accepted, companyWebsite: _trap, ...lead } = body;
    void _token;
    void _accepted;
    void _trap;
    const created = await this.intake.intake({ ...lead, source: 'website' }, null, context);
    // The same answer whether or not we already knew this person: the form must not reveal who is on file.
    return { reference: created.caseNo };
  }
}

/** The lead inbox, for the staff who work cases (`Case` permission, scoped the same way as cases). */
@ApiTags('leads')
@ApiCookieAuth('session')
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly intake: LeadIntakeService,
    private readonly leads: LeadsService,
  ) {}

  @Post()
  @Can('create', 'Case')
  @ApiOperation({ operationId: 'createLead', summary: 'Enter a lead by hand (phone call, walk-in, email, WhatsApp)' })
  @ApiCreatedResponse({ type: LeadCreatedDto })
  create(@CurrentActor() actor: Actor, @Body() body: CreateLeadDto, @Ctx() context: RequestContext) {
    assertLeadStaff(actor);
    return this.intake.intake(body, actor, context);
  }

  @Get()
  @Can('read', 'Case')
  @ApiOperation({ operationId: 'listLeads', summary: 'The lead inbox, newest first' })
  @ApiOkResponse({ type: LeadPageDto })
  list(@CurrentActor() actor: Actor, @Query() query: LeadListQueryDto) {
    return this.leads.list(actor, query);
  }

  @Get(':id')
  @Can('read', 'Case')
  @ApiOperation({ operationId: 'getLead', summary: 'One lead with its possible duplicate and the patient’s other enquiries' })
  @ApiOkResponse({ type: LeadDetailDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: LeadIdParamDto) {
    return this.leads.get(actor, id);
  }

  @Post(':id/claim')
  @HttpCode(200)
  @Can('update', 'Case')
  @ApiOperation({ operationId: 'claimLead', summary: 'Take an unassigned lead as your own' })
  @ApiOkResponse({ type: LeadDetailDto })
  claim(@CurrentActor() actor: Actor, @Param() { id }: LeadIdParamDto, @Ctx() context: RequestContext) {
    return this.leads.claim(actor, id, context);
  }

  @Post(':id/dismiss-duplicate')
  @HttpCode(200)
  @Can('update', 'Case')
  @ApiOperation({ operationId: 'dismissLeadDuplicate', summary: 'Mark a possible duplicate as not one' })
  @ApiOkResponse({ type: LeadDetailDto })
  dismiss(@CurrentActor() actor: Actor, @Param() { id }: LeadIdParamDto, @Ctx() context: RequestContext) {
    return this.leads.dismissDuplicate(actor, id, context);
  }

  @Post(':id/merge')
  @HttpCode(200)
  @Can('update', 'Patient')
  @ApiOperation({ operationId: 'mergeLeadPatients', summary: 'Put the two patient records behind a possible duplicate together' })
  @ApiOkResponse({ type: LeadDetailDto })
  merge(
    @CurrentActor() actor: Actor,
    @Param() { id }: LeadIdParamDto,
    @Body() body: MergeLeadDto,
    @Ctx() context: RequestContext,
  ) {
    return this.leads.mergePatients(actor, id, body.keep, context);
  }
}
