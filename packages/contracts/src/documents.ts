import { z } from 'zod';
import { cursorPageSchema, cursorQuerySchema } from './primitives.js';
import { documentKindSchema, documentVisibilitySchema, scanStatusSchema } from './enums.js';

// ---- what may be uploaded ---------------------------------------------------------------------------------------
/** The largest file the platform takes (PRD 5.1, 5.2): 500 MiB. */
export const DOCUMENT_MAX_BYTES = 500 * 1024 * 1024;
/** S3 multipart parts must be at least 5 MiB (except the last); this is the smallest the API expects the browser to use. */
export const MULTIPART_MIN_PART_BYTES = 5 * 1024 * 1024;
/** S3 allows at most 10,000 parts. */
export const MULTIPART_MAX_PARTS = 10_000;
/** The API watermarks PDFs and images up to this size; larger ones are delivered as stored. */
export const WATERMARK_MAX_BYTES = 50 * 1024 * 1024;

/** Allowed types: PDF, JPG, PNG, HEIC, DOCX, and a ZIP (of DICOM). The API checks the name and the declared type; the worker checks the content. */
export const DOCUMENT_TYPES = [
  { extension: '.pdf', mimeTypes: ['application/pdf'] },
  { extension: '.jpg', mimeTypes: ['image/jpeg'] },
  { extension: '.jpeg', mimeTypes: ['image/jpeg'] },
  { extension: '.png', mimeTypes: ['image/png'] },
  { extension: '.heic', mimeTypes: ['image/heic', 'image/heif'] },
  {
    extension: '.docx',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  },
  {
    extension: '.zip',
    mimeTypes: [
      'application/zip',
      'application/x-zip-compressed',
      'application/x-zip',
      'application/octet-stream',
    ],
  },
] as const;

/** For the uploader's `allowedFileTypes`: MIME types and extensions together. */
export const DOCUMENT_ACCEPT: string[] = [
  ...new Set(DOCUMENT_TYPES.flatMap((type) => [...type.mimeTypes, type.extension])),
];

/** Whether a file name and declared MIME type are one of the allowed types. */
export function isAllowedUpload(fileName: string, mimeType: string): boolean {
  const name = fileName.toLowerCase();
  const type = mimeType.toLowerCase();
  return DOCUMENT_TYPES.some(
    (allowed) =>
      name.endsWith(allowed.extension) && (allowed.mimeTypes as readonly string[]).includes(type),
  );
}

/** The most parts a file of `sizeBytes` can have when the smallest part is 5 MiB: the signer refuses part numbers beyond it. */
export const maxPartsFor = (sizeBytes: number): number =>
  Math.min(MULTIPART_MAX_PARTS, Math.max(1, Math.ceil(sizeBytes / MULTIPART_MIN_PART_BYTES)));

/** Object keys of uploads are chosen by the API. */
export const UPLOAD_KEY_PATTERN =
  /^files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ---- signing the browser's S3 requests -------------------------------------------------------------------------------
const fileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(
    (name) => !/[\\/\p{Cc}]/u.test(name),
    'A file name has no slashes or control characters',
  );

/** What a new upload is, sent with the request that starts it. */
export const uploadFileSchema = z.object({
  fileName: fileNameSchema,
  mimeType: z.string().trim().min(1).max(127),
  sizeBytes: z.number().int().min(1).max(DOCUMENT_MAX_BYTES),
  kind: documentKindSchema.default('other'),
  visibility: documentVisibilitySchema.default('private'),
  typeId: z.uuid().optional(),
  caseId: z.uuid().optional(),
  patientId: z.uuid().optional(),
});
export type UploadFile = z.infer<typeof uploadFileSchema>;

/** One S3 request the uploader wants a presigned URL for. The key and upload id are what S3 itself uses. */
export const signUploadRequestSchema = z.object({
  request: z.object({
    method: z.enum(['POST', 'PUT', 'GET', 'DELETE']),
    key: z.string().min(1).max(200),
    uploadId: z.string().min(1).max(512).optional(),
    partNumber: z.number().int().min(1).max(MULTIPART_MAX_PARTS).optional(),
  }),
  /** Required on the request that starts the upload (POST without an upload id). */
  file: uploadFileSchema.optional(),
});
export type SignUploadRequest = z.infer<typeof signUploadRequestSchema>;

export const signedUploadSchema = z.object({
  url: z.string().max(4096),
  /** The key the API chose, which replaces the one the browser proposed. */
  key: z.string().max(200),
});
export type SignedUpload = z.infer<typeof signedUploadSchema>;

export const completeUploadSchema = z.object({ key: z.string().min(1).max(200) });
export type CompleteUpload = z.infer<typeof completeUploadSchema>;

// ---- documents -------------------------------------------------------------------------------------------------------
export const documentShareSchema = z.object({
  hospitalId: z.uuid(),
  hospitalName: z.string().max(200),
});

export const documentSchema = z.object({
  id: z.uuid(),
  kind: documentKindSchema,
  visibility: documentVisibilitySchema,
  typeId: z.uuid().nullable(),
  typeName: z.string().max(200).nullable(),
  fileName: z.string().max(200),
  mimeType: z.string().max(127),
  sizeBytes: z.number().int().min(0),
  scanStatus: scanStatusSchema,
  /** The virus signature, or `type_mismatch`, when the file is not clean. */
  scanDetail: z.string().max(200).nullable(),
  pageCount: z.number().int().nullable(),
  hasThumbnail: z.boolean(),
  notes: z.string().max(2000).nullable(),
  patientId: z.uuid().nullable(),
  caseId: z.uuid().nullable(),
  caseNo: z.string().max(40).nullable(),
  uploadedById: z.uuid().nullable(),
  uploadedByName: z.string().max(200).nullable(),
  createdAt: z.iso.datetime(),
  shares: z.array(documentShareSchema),
});
export type DocumentView = z.infer<typeof documentSchema>;

export const documentListQuerySchema = cursorQuerySchema.extend({
  caseId: z.uuid().optional(),
  patientId: z.uuid().optional(),
  kind: documentKindSchema.optional(),
});
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;
export const documentPageSchema = cursorPageSchema(documentSchema);

export const updateDocumentSchema = z
  .object({
    kind: documentKindSchema,
    typeId: z.uuid().nullable(),
    notes: z.string().trim().max(2000).nullable(),
  })
  .partial()
  .strict();
export type UpdateDocument = z.infer<typeof updateDocumentSchema>;

/** A link to the file: valid for five minutes, and whether it was stamped with the viewer's name. */
export const fileLinkSchema = z.object({
  url: z.string().max(4096),
  expiresAt: z.iso.datetime(),
  watermarked: z.boolean(),
  fileName: z.string().max(200),
});
export type FileLink = z.infer<typeof fileLinkSchema>;

export const shareTargetSchema = z.object({
  hospitalId: z.uuid(),
  hospitalName: z.string().max(200),
  shared: z.boolean(),
});
export const shareTargetsSchema = z.object({ targets: z.array(shareTargetSchema) });
export const setShareSchema = z.object({ shared: z.boolean() });
export type SetShare = z.infer<typeof setShareSchema>;
