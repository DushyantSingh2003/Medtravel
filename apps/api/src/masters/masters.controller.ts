import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Can } from '../auth/decorators.js';
import { Ctx, type RequestContext } from '../common/request-context.js';
import {
  KeyParamsDto,
  MasterListQueryDto,
  MasterPageDto,
  MasterRowDto,
  MasterWriteDto,
  ResourceParamsDto,
} from './masters.dto.js';
import { MastersService } from './masters.service.js';

@ApiTags('masters')
@ApiCookieAuth('session')
@Controller('masters/:resource')
export class MastersController {
  constructor(private readonly masters: MastersService) {}

  @Get()
  @Can('read', 'MasterData')
  @ApiOperation({ summary: 'List master data, with search, filters, sorting and cursor paging' })
  @ApiOkResponse({ type: MasterPageDto })
  list(@Param() { resource }: ResourceParamsDto, @Query() query: MasterListQueryDto) {
    return this.masters.list(resource, query);
  }

  @Get(':id')
  @Can('read', 'MasterData')
  @ApiOperation({ summary: 'Get one master record' })
  @ApiOkResponse({ type: MasterRowDto })
  get(@Param() { resource, id }: KeyParamsDto) {
    return this.masters.get(resource, id);
  }

  @Post()
  @Can('create', 'MasterData')
  @ApiOperation({ summary: 'Create a master record' })
  @ApiOkResponse({ type: MasterRowDto })
  create(
    @Param() { resource }: ResourceParamsDto,
    @Body() body: MasterWriteDto,
    @Ctx() context: RequestContext,
  ) {
    return this.masters.create(resource, body, context);
  }

  @Patch(':id')
  @Can('update', 'MasterData')
  @ApiOperation({ summary: 'Change a master record; send only the fields to change' })
  @ApiOkResponse({ type: MasterRowDto })
  update(
    @Param() { resource, id }: KeyParamsDto,
    @Body() body: MasterWriteDto,
    @Ctx() context: RequestContext,
  ) {
    return this.masters.update(resource, id, body, context);
  }

  @Delete(':id')
  @HttpCode(200)
  @Can('delete', 'MasterData')
  @ApiOperation({
    summary: 'Soft-delete a master record (409 for tables that can only be deactivated)',
  })
  @ApiOkResponse({ type: MasterRowDto })
  remove(@Param() { resource, id }: KeyParamsDto, @Ctx() context: RequestContext) {
    return this.masters.remove(resource, id, context);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @Can('update', 'MasterData')
  @ApiOperation({ summary: 'Bring a soft-deleted master record back' })
  @ApiOkResponse({ type: MasterRowDto })
  restore(@Param() { resource, id }: KeyParamsDto, @Ctx() context: RequestContext) {
    return this.masters.restore(resource, id, context);
  }
}
