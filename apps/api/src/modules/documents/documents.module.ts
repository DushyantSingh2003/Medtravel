import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { DownloadsService } from './downloads.service.js';
import { SharesService } from './shares.service.js';
import { UploadsService } from './uploads.service.js';

@Module({
  controllers: [DocumentsController],
  providers: [UploadsService, DocumentsService, DownloadsService, SharesService],
})
export class DocumentsModule {}
