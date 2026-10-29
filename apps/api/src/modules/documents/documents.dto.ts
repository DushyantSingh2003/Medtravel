import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  completeUploadSchema,
  documentListQuerySchema,
  documentPageSchema,
  documentSchema,
  fileLinkSchema,
  setShareSchema,
  shareTargetsSchema,
  signUploadRequestSchema,
  signedUploadSchema,
  updateDocumentSchema,
} from '@medtravel/contracts';

export class SignUploadRequestDto extends createZodDto(signUploadRequestSchema) {}
export class SignedUploadDto extends createZodDto(signedUploadSchema) {}
export class CompleteUploadDto extends createZodDto(completeUploadSchema) {}
export class DocumentDto extends createZodDto(documentSchema) {}
export class DocumentListQueryDto extends createZodDto(documentListQuerySchema) {}
export class DocumentPageDto extends createZodDto(documentPageSchema) {}
export class UpdateDocumentDto extends createZodDto(updateDocumentSchema) {}
export class FileLinkDto extends createZodDto(fileLinkSchema) {}
export class ShareTargetsDto extends createZodDto(shareTargetsSchema) {}
export class SetShareDto extends createZodDto(setShareSchema) {}
export class DocumentParamsDto extends createZodDto(z.object({ id: z.uuid() })) {}
export class ShareParamsDto extends createZodDto(
  z.object({ id: z.uuid(), hospitalId: z.uuid() }),
) {}
