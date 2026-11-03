import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Can, CurrentActor, Throttle } from '../../auth/decorators.js';
import type { Actor } from '../../auth/actor.js';
import { SessionCookies } from '../../auth/cookies.js';
import { Ctx, type RequestContext } from '../../common/request-context.js';
import {
  CreateLeaveDto,
  HistoryQueryDto,
  ImpersonationStartedDto,
  LeaveParamsDto,
  LoginHistoryPageDto,
  TeamDto,
  TeamIdParamDto,
  TeamListDto,
  TeamWriteDto,
  UpdateUserDto,
  UserDetailDto,
  UserIdParamDto,
  UserListQueryDto,
  UserPageDto,
} from './users.dto.js';
import { TeamsService } from './teams.service.js';
import { UsersService } from './users.service.js';

/** Staff management for the super admin (`User` permission): people, access, teams and read-only impersonation. */
@ApiTags('admin-users')
@ApiCookieAuth('session')
@Controller('admin')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly teams: TeamsService,
    private readonly cookies: SessionCookies,
  ) {}

  @Get('users')
  @Can('read', 'User')
  @ApiOperation({
    operationId: 'listUsers',
    summary: 'Staff and hospital users, with search and filters',
  })
  @ApiOkResponse({ type: UserPageDto })
  list(@Query() query: UserListQueryDto) {
    return this.users.list(query);
  }

  // Fixed paths before `:id`.
  @Get('teams')
  @Can('read', 'User')
  @ApiOperation({
    operationId: 'listTeams',
    summary: 'Teams with their managers and member counts',
  })
  @ApiOkResponse({ type: TeamListDto })
  async listTeams() {
    return { items: await this.teams.list() };
  }

  @Post('teams')
  @Can('create', 'User')
  @ApiOperation({ operationId: 'createTeam', summary: 'Create a team' })
  @ApiCreatedResponse({ type: TeamDto })
  createTeam(@Body() body: TeamWriteDto, @Ctx() context: RequestContext) {
    return this.teams.create(body, context);
  }

  @Put('teams/:id')
  @Can('update', 'User')
  @ApiOperation({ operationId: 'updateTeam', summary: 'Rename a team or change its manager' })
  @ApiOkResponse({ type: TeamDto })
  updateTeam(
    @Param() { id }: TeamIdParamDto,
    @Body() body: TeamWriteDto,
    @Ctx() context: RequestContext,
  ) {
    return this.teams.update(id, body, context);
  }

  @Delete('teams/:id')
  @HttpCode(204)
  @Can('delete', 'User')
  @ApiOperation({ operationId: 'deleteTeam', summary: 'Delete an empty team' })
  async deleteTeam(@Param() { id }: TeamIdParamDto, @Ctx() context: RequestContext): Promise<void> {
    await this.teams.remove(id, context);
  }

  @Get('users/:id')
  @Can('read', 'User')
  @ApiOperation({ operationId: 'getUser', summary: 'One user with their staff settings and leave' })
  @ApiOkResponse({ type: UserDetailDto })
  get(@Param() { id }: UserIdParamDto) {
    return this.users.get(id);
  }

  @Patch('users/:id')
  @Can('update', 'User')
  @ApiOperation({
    operationId: 'updateUser',
    summary: 'Change role, team, city, languages, working hours or capacity',
  })
  @ApiOkResponse({ type: UserDetailDto })
  update(
    @CurrentActor() actor: Actor,
    @Param() { id }: UserIdParamDto,
    @Body() body: UpdateUserDto,
    @Ctx() context: RequestContext,
  ) {
    return this.users.update(actor, id, body, context);
  }

  @Post('users/:id/leave')
  @Can('update', 'User')
  @ApiOperation({ operationId: 'addUserLeave', summary: 'Record days a person is away' })
  @ApiCreatedResponse({ type: UserDetailDto })
  addLeave(
    @Param() { id }: UserIdParamDto,
    @Body() body: CreateLeaveDto,
    @Ctx() context: RequestContext,
  ) {
    return this.users.addLeave(id, body, context);
  }

  @Delete('users/:id/leave/:leaveId')
  @Can('update', 'User')
  @ApiOperation({ operationId: 'removeUserLeave', summary: 'Remove recorded leave' })
  @ApiOkResponse({ type: UserDetailDto })
  removeLeave(@Param() { id, leaveId }: LeaveParamsDto, @Ctx() context: RequestContext) {
    return this.users.removeLeave(id, leaveId, context);
  }

  @Post('users/:id/deactivate')
  @HttpCode(200)
  @Can('update', 'User')
  @ApiOperation({
    operationId: 'deactivateUser',
    summary: 'End a person’s access and sign them out everywhere',
  })
  @ApiOkResponse({ type: UserDetailDto })
  deactivate(
    @CurrentActor() actor: Actor,
    @Param() { id }: UserIdParamDto,
    @Ctx() context: RequestContext,
  ) {
    return this.users.deactivate(actor, id, context);
  }

  @Post('users/:id/reactivate')
  @HttpCode(200)
  @Can('update', 'User')
  @ApiOperation({
    operationId: 'reactivateUser',
    summary: 'Let a deactivated person sign in again',
  })
  @ApiOkResponse({ type: UserDetailDto })
  reactivate(@Param() { id }: UserIdParamDto, @Ctx() context: RequestContext) {
    return this.users.reactivate(id, context);
  }

  @Post('users/:id/two-factor/reset')
  @HttpCode(200)
  @Can('update', 'User')
  @ApiOperation({
    operationId: 'resetUserTwoFactor',
    summary: 'Remove a person’s second factor and sign them out',
  })
  @ApiOkResponse({ type: UserDetailDto })
  resetTwoFactor(@Param() { id }: UserIdParamDto, @Ctx() context: RequestContext) {
    return this.users.resetTwoFactor(id, context);
  }

  @Get('users/:id/logins')
  @Can('read', 'User')
  @ApiOperation({
    operationId: 'listUserLogins',
    summary: 'Sign-ins, failures and sign-outs of a person, newest first',
  })
  @ApiOkResponse({ type: LoginHistoryPageDto })
  logins(@Param() { id }: UserIdParamDto, @Query() query: HistoryQueryDto) {
    return this.users.loginHistory(id, query);
  }

  @Post('users/:id/impersonate')
  @HttpCode(200)
  @Can('update', 'User')
  @Throttle({ limit: 20, windowSeconds: 60 })
  @ApiOperation({
    operationId: 'impersonateUser',
    summary: 'View the product as this user, read-only, for 30 minutes',
  })
  @ApiOkResponse({ type: ImpersonationStartedDto })
  async impersonate(
    @CurrentActor() actor: Actor,
    @Param() { id }: UserIdParamDto,
    @Ctx() context: RequestContext,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const issued = await this.users.startImpersonation(actor, id, context);
    this.cookies.setImpersonation(reply, issued.token, issued.maxAgeSeconds);
    return { expiresAt: issued.expiresAt.toISOString() };
  }
}
