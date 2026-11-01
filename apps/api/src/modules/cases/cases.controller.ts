import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
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
import { CaseStageService } from './case-stage.service.js';
import {
  CaseIdParamDto,
  CaseListQueryDto,
  CasePageDto,
  CaseViewDto,
  CreateCaseDto,
  HistoryQueryDto,
  StageConfigDto,
  StageConfigListDto,
  StageConfigUpdateDto,
  StageHistoryPageDto,
  StageParamDto,
  TransitionRequestDto,
} from './cases.dto.js';
import { CasesService } from './cases.service.js';
import { StageConfigService } from './stage-config.service.js';

@ApiTags('cases')
@ApiCookieAuth('session')
@Controller('cases')
export class CasesController {
  constructor(
    private readonly cases: CasesService,
    private readonly stages: CaseStageService,
    private readonly config: StageConfigService,
  ) {}

  @Post()
  @Can('create', 'Case')
  @ApiOperation({ operationId: 'createCase', summary: 'Open a new case' })
  @ApiCreatedResponse({ type: CaseViewDto })
  create(
    @CurrentActor() actor: Actor,
    @Body() body: CreateCaseDto,
    @Ctx() context: RequestContext,
  ) {
    return this.cases.create(actor, body, context);
  }

  @Get()
  @Can('read', 'Case')
  @ApiOperation({
    operationId: 'listCases',
    summary: 'List the cases you may see, with filters, sorting and paging',
  })
  @ApiOkResponse({ type: CasePageDto })
  list(@CurrentActor() actor: Actor, @Query() query: CaseListQueryDto) {
    return this.cases.list(actor, query);
  }

  // Fixed paths come before `:id` so "stage-config" is never read as a case id.
  @Get('stage-config')
  @Can('read', 'MasterData')
  @ApiOperation({
    operationId: 'listStageConfig',
    summary: 'Target time, owner role and automatic tasks of each stage',
  })
  @ApiOkResponse({ type: StageConfigListDto })
  async stageConfig() {
    return { items: await this.config.list() };
  }

  @Put('stage-config/:stage')
  @Can('update', 'MasterData')
  @ApiOperation({
    operationId: 'updateStageConfig',
    summary: 'Change the target time, owner role or automatic tasks of a stage',
  })
  @ApiOkResponse({ type: StageConfigDto })
  updateStageConfig(
    @Param() { stage }: StageParamDto,
    @Body() body: StageConfigUpdateDto,
    @Ctx() context: RequestContext,
  ) {
    return this.config.update(stage, body, context);
  }

  @Get(':id')
  @Can('read', 'Case')
  @ApiOperation({ operationId: 'getCase', summary: 'One case, with the moves you could make next' })
  @ApiOkResponse({ type: CaseViewDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: CaseIdParamDto) {
    return this.cases.get(actor, id);
  }

  @Post(':id/transitions')
  @HttpCode(200)
  @Can('update', 'Case')
  @ApiOperation({ operationId: 'transitionCase', summary: 'Move a case to another stage or exit' })
  @ApiOkResponse({ type: CaseViewDto })
  transition(
    @CurrentActor() actor: Actor,
    @Param() { id }: CaseIdParamDto,
    @Body() body: TransitionRequestDto,
    @Ctx() context: RequestContext,
  ) {
    return this.stages.transition(actor, id, body, context);
  }

  @Get(':id/history')
  @Can('read', 'Case')
  @ApiOperation({
    operationId: 'listCaseHistory',
    summary: 'Every stage change of a case, newest first',
  })
  @ApiOkResponse({ type: StageHistoryPageDto })
  history(
    @CurrentActor() actor: Actor,
    @Param() { id }: CaseIdParamDto,
    @Query() query: HistoryQueryDto,
  ) {
    return this.cases.history(actor, id, query);
  }
}
