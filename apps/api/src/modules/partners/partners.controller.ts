import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Can, CurrentActor } from '../../auth/decorators.js';
import type { Actor } from '../../auth/actor.js';
import { Ctx, type RequestContext } from '../../common/request-context.js';
import { PartnerHealthService } from './partner-health.service.js';
import { PartnerHospitalsService } from './partner-hospitals.service.js';
import { PartnerRequestsService } from './partner-requests.service.js';
import {
  AgreementDto,
  ChangeRequestDetailDto,
  ChangeRequestListQueryDto,
  ChangeRequestPageDto,
  HospitalDetailDto,
  HospitalListQueryDto,
  HospitalPageDto,
  IdParamDto,
  PartnerHealthDto,
  PublishResultDto,
  RejectRequestDto,
  VerifyAccreditationDto,
} from './partners.dto.js';

/** Partner approvals for the super admin (`Setting` permission): the review queue, hospitals, publishing and partner health. */
@ApiTags('admin-partners')
@ApiCookieAuth('session')
@Controller('admin/partners')
export class PartnersController {
  constructor(
    private readonly requests: PartnerRequestsService,
    private readonly hospitals: PartnerHospitalsService,
    private readonly health: PartnerHealthService,
  ) {}

  @Get('requests')
  @Can('read', 'Setting')
  @ApiOperation({ operationId: 'listPartnerRequests', summary: 'The review queue: onboarding, profile edits and price changes' })
  @ApiOkResponse({ type: ChangeRequestPageDto })
  listRequests(@CurrentActor() actor: Actor, @Query() query: ChangeRequestListQueryDto) {
    return this.requests.list(actor, query);
  }

  @Get('requests/:id')
  @Can('read', 'Setting')
  @ApiOperation({ operationId: 'getPartnerRequest', summary: 'One request with a side-by-side diff' })
  @ApiOkResponse({ type: ChangeRequestDetailDto })
  getRequest(@Param() { id }: IdParamDto) {
    return this.requests.get(id);
  }

  @Post('requests/:id/approve')
  @Can('update', 'Setting')
  @ApiOperation({ operationId: 'approvePartnerRequest', summary: 'Approve a request and apply it' })
  @ApiOkResponse({ type: ChangeRequestDetailDto })
  approve(@CurrentActor() actor: Actor, @Param() { id }: IdParamDto, @Ctx() context: RequestContext) {
    return this.requests.approve(actor, id, context);
  }

  @Post('requests/:id/reject')
  @Can('update', 'Setting')
  @ApiOperation({ operationId: 'rejectPartnerRequest', summary: 'Reject a request with a reason' })
  @ApiOkResponse({ type: ChangeRequestDetailDto })
  reject(
    @CurrentActor() actor: Actor,
    @Param() { id }: IdParamDto,
    @Body() body: RejectRequestDto,
    @Ctx() context: RequestContext,
  ) {
    return this.requests.reject(actor, id, body, context);
  }

  // Fixed paths before `:id`.
  @Get('health')
  @Can('read', 'Setting')
  @ApiOperation({ operationId: 'getPartnerHealth', summary: 'Expiring accreditations and agreements, and response-time trends' })
  @ApiOkResponse({ type: PartnerHealthDto })
  getHealth() {
    return this.health.health();
  }

  @Get('hospitals')
  @Can('read', 'Setting')
  @ApiOperation({ operationId: 'listPartnerHospitals', summary: 'Hospitals with status, referral fee and waiting requests' })
  @ApiOkResponse({ type: HospitalPageDto })
  listHospitals(@Query() query: HospitalListQueryDto) {
    return this.hospitals.list(query);
  }

  @Get('hospitals/:id')
  @Can('read', 'Setting')
  @ApiOperation({ operationId: 'getPartnerHospital', summary: 'A hospital with its agreement, accreditations, doctors and packages' })
  @ApiOkResponse({ type: HospitalDetailDto })
  getHospital(@Param() { id }: IdParamDto) {
    return this.hospitals.get(id);
  }

  @Put('hospitals/:id/agreement')
  @Can('update', 'Setting')
  @ApiOperation({ operationId: 'setHospitalAgreement', summary: 'Set the referral fee, agreement dates and document' })
  @ApiOkResponse({ type: HospitalDetailDto })
  setAgreement(@Param() { id }: IdParamDto, @Body() body: AgreementDto, @Ctx() context: RequestContext) {
    return this.hospitals.setAgreement(id, body, context);
  }

  @Post('hospitals/:id/publish')
  @Can('update', 'Setting')
  @ApiOperation({ operationId: 'publishHospital', summary: 'Show a hospital on the website' })
  @ApiCreatedResponse({ type: PublishResultDto })
  publishHospital(@Param() { id }: IdParamDto, @Ctx() context: RequestContext) {
    return this.hospitals.publishHospital(id, context);
  }

  @Post('hospitals/:id/unpublish')
  @Can('update', 'Setting')
  @ApiOperation({ operationId: 'unpublishHospital', summary: 'Take a hospital off the website' })
  @ApiCreatedResponse({ type: PublishResultDto })
  unpublishHospital(@Param() { id }: IdParamDto, @Ctx() context: RequestContext) {
    return this.hospitals.unpublishHospital(id, context);
  }

  @Post('accreditations/:id/verify')
  @Can('update', 'Setting')
  @ApiOperation({ operationId: 'verifyAccreditation', summary: 'Mark an accreditation certificate as checked, or remove the check' })
  @ApiCreatedResponse({ type: HospitalDetailDto })
  verifyAccreditation(
    @CurrentActor() actor: Actor,
    @Param() { id }: IdParamDto,
    @Body() body: VerifyAccreditationDto,
    @Ctx() context: RequestContext,
  ) {
    return this.hospitals.verifyAccreditation(actor, id, body, context);
  }

  @Post('doctors/:id/publish')
  @Can('update', 'Setting')
  @ApiOperation({ operationId: 'publishDoctor', summary: 'Show a doctor on the website' })
  @ApiCreatedResponse({ type: PublishResultDto })
  publishDoctor(@Param() { id }: IdParamDto, @Ctx() context: RequestContext) {
    return this.hospitals.setDoctorPublished(id, true, context);
  }

  @Post('doctors/:id/unpublish')
  @Can('update', 'Setting')
  @ApiOperation({ operationId: 'unpublishDoctor', summary: 'Take a doctor off the website' })
  @ApiCreatedResponse({ type: PublishResultDto })
  unpublishDoctor(@Param() { id }: IdParamDto, @Ctx() context: RequestContext) {
    return this.hospitals.setDoctorPublished(id, false, context);
  }

  @Post('packages/:id/publish')
  @Can('update', 'Setting')
  @ApiOperation({ operationId: 'publishPackage', summary: 'Show a package on the website' })
  @ApiCreatedResponse({ type: PublishResultDto })
  publishPackage(@Param() { id }: IdParamDto, @Ctx() context: RequestContext) {
    return this.hospitals.setPackagePublished(id, true, context);
  }

  @Post('packages/:id/unpublish')
  @Can('update', 'Setting')
  @ApiOperation({ operationId: 'unpublishPackage', summary: 'Take a package off the website' })
  @ApiCreatedResponse({ type: PublishResultDto })
  unpublishPackage(@Param() { id }: IdParamDto, @Ctx() context: RequestContext) {
    return this.hospitals.setPackagePublished(id, false, context);
  }
}
