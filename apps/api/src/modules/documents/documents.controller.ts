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
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentActor, Can, Throttle } from '../../auth/decorators.js';
import type { Actor } from '../../auth/actor.js';
import { NoAuditFallback } from '../../audit/audit-trail.js';
import { Ctx, type RequestContext } from '../../common/request-context.js';
import {
  CompleteUploadDto,
  DocumentDto,
  DocumentListQueryDto,
  DocumentPageDto,
  DocumentParamsDto,
  FileLinkDto,
  SetShareDto,
  ShareParamsDto,
  ShareTargetsDto,
  SignUploadRequestDto,
  SignedUploadDto,
  UpdateDocumentDto,
} from './documents.dto.js';
import { DocumentsService } from './documents.service.js';
import { DownloadsService } from './downloads.service.js';
import { SharesService } from './shares.service.js';
import { UploadsService } from './uploads.service.js';

@ApiTags('documents')
@ApiCookieAuth('session')
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly documents: DocumentsService,
    private readonly downloads: DownloadsService,
    private readonly shares: SharesService,
  ) {}

  // ---- uploads ----------------------------------------------------------------------------------------------
  @Post('uploads/sign')
  @HttpCode(200)
  @Can('create', 'Document')
  @NoAuditFallback()
  @Throttle({ limit: 600, windowSeconds: 60 })
  @ApiOperation({
    operationId: 'signUpload',
    summary: 'Sign one S3 request of a browser upload (start, part, list parts, complete or abort)',
  })
  @ApiOkResponse({ type: SignedUploadDto })
  sign(@CurrentActor() actor: Actor, @Body() body: SignUploadRequestDto) {
    return this.uploads.sign(actor, body);
  }

  @Post('uploads/complete')
  @Can('create', 'Document')
  @ApiOperation({
    operationId: 'completeUpload',
    summary: 'The file has been uploaded: check it, create the document and queue the virus scan',
  })
  @ApiOkResponse({ type: DocumentDto })
  complete(
    @CurrentActor() actor: Actor,
    @Ctx() context: RequestContext,
    @Body() body: CompleteUploadDto,
  ) {
    return this.uploads.complete(actor, context, body.key);
  }

  // ---- documents --------------------------------------------------------------------------------------------
  @Get()
  @Can('read', 'Document')
  @ApiOperation({ operationId: 'listDocuments', summary: 'List the documents the caller may see' })
  @ApiOkResponse({ type: DocumentPageDto })
  list(@CurrentActor() actor: Actor, @Query() query: DocumentListQueryDto) {
    return this.documents.list(actor, query);
  }

  @Get(':id')
  @Can('read', 'Document')
  @ApiOperation({ operationId: 'getDocument', summary: 'Get one document' })
  @ApiOkResponse({ type: DocumentDto })
  get(@CurrentActor() actor: Actor, @Param() { id }: DocumentParamsDto) {
    return this.documents.get(actor, id);
  }

  @Patch(':id')
  @Can('update', 'Document')
  @ApiOperation({
    operationId: 'updateDocument',
    summary: "Change a document's kind, type or notes",
  })
  @ApiOkResponse({ type: DocumentDto })
  update(
    @CurrentActor() actor: Actor,
    @Ctx() context: RequestContext,
    @Param() { id }: DocumentParamsDto,
    @Body() body: UpdateDocumentDto,
  ) {
    return this.documents.update(actor, context, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Can('delete', 'Document')
  @ApiOperation({ operationId: 'deleteDocument', summary: 'Delete a document (soft)' })
  remove(
    @CurrentActor() actor: Actor,
    @Ctx() context: RequestContext,
    @Param() { id }: DocumentParamsDto,
  ) {
    return this.documents.remove(actor, context, id);
  }

  // ---- reading the file -------------------------------------------------------------------------------------
  @Post(':id/download')
  @HttpCode(200)
  @Can('read', 'Document')
  @Throttle({ limit: 120, windowSeconds: 60 })
  @ApiOperation({
    operationId: 'downloadDocument',
    summary:
      'A five-minute link that downloads the file (audited; PDFs and images are watermarked)',
  })
  @ApiOkResponse({ type: FileLinkDto })
  download(
    @CurrentActor() actor: Actor,
    @Ctx() context: RequestContext,
    @Param() { id }: DocumentParamsDto,
  ) {
    return this.downloads.link(actor, context, id, 'download');
  }

  @Post(':id/preview')
  @HttpCode(200)
  @Can('read', 'Document')
  @Throttle({ limit: 120, windowSeconds: 60 })
  @ApiOperation({
    operationId: 'previewDocument',
    summary:
      'A five-minute link that shows the file in the browser (audited; PDFs and images are watermarked)',
  })
  @ApiOkResponse({ type: FileLinkDto })
  preview(
    @CurrentActor() actor: Actor,
    @Ctx() context: RequestContext,
    @Param() { id }: DocumentParamsDto,
  ) {
    return this.downloads.link(actor, context, id, 'preview');
  }

  @Get(':id/thumbnail')
  @Can('read', 'Document')
  @Throttle({ limit: 120, windowSeconds: 60 })
  @ApiOperation({
    operationId: 'getDocumentThumbnail',
    summary: 'A five-minute link to the preview image (audited)',
  })
  thumbnail(
    @CurrentActor() actor: Actor,
    @Ctx() context: RequestContext,
    @Param() { id }: DocumentParamsDto,
  ) {
    return this.downloads.thumbnail(actor, context, id);
  }

  // ---- sharing ----------------------------------------------------------------------------------------------
  @Get(':id/shares')
  @Can('read', 'Document')
  @ApiOperation({
    operationId: 'listDocumentShares',
    summary: 'The hospitals this document can be shared with, and whether it is',
  })
  @ApiOkResponse({ type: ShareTargetsDto })
  async shareTargets(@CurrentActor() actor: Actor, @Param() { id }: DocumentParamsDto) {
    return { targets: await this.shares.targets(actor, id) };
  }

  @Put(':id/shares/:hospitalId')
  @HttpCode(204)
  @Can('update', 'Document')
  @ApiOperation({
    operationId: 'setDocumentShare',
    summary:
      'The patient shares the document with a hospital (recording their consent) or stops sharing it',
  })
  setShare(
    @CurrentActor() actor: Actor,
    @Ctx() context: RequestContext,
    @Param() { id, hospitalId }: ShareParamsDto,
    @Body() body: SetShareDto,
  ) {
    return this.shares.set(actor, context, id, hospitalId, body.shared);
  }
}
