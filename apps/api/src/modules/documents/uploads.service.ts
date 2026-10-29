import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@medtravel/db';
import {
  UPLOAD_KEY_PATTERN,
  isAllowedUpload,
  maxPartsFor,
  type DocumentView,
  type SignUploadRequest,
  type SignedUpload,
  type UploadFile,
} from '@medtravel/contracts';
import type { ObjectStore } from '@medtravel/storage';
import type { Actor } from '../../auth/actor.js';
import { AuditService } from '../../audit/audit.service.js';
import type { RequestContext } from '../../common/request-context.js';
import { PRISMA } from '../../database/database.module.js';
import { OutboxService } from '../../outbox/outbox.service.js';
import { ScopeService } from '../../rbac/scope.service.js';
import { OBJECT_STORE } from '../../storage/storage.module.js';
import { DOCUMENT_SELECT, toDocumentView } from './document-view.js';

/** A browser upload stays open this long; after that its key is no longer signed for. */
const UPLOAD_LIFETIME_MS = 24 * 3_600_000;

/**
 * The browser uploads straight to the bucket, but only through requests this service signs. It chooses the object key, checks
 * what may be uploaded where, and only signs later requests (parts, listing, abort) for uploads it started for the same user.
 */
@Injectable()
export class UploadsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async sign(actor: Actor, body: SignUploadRequest): Promise<SignedUpload> {
    const { request, file } = body;
    if (request.method === 'POST' && !request.uploadId) {
      if (!file) throw new BadRequestException('Say which file this is');
      const key = await this.start(actor, file);
      return { key, url: await this.store.presignMultipart(key, { kind: 'create' }) };
    }
    if (!UPLOAD_KEY_PATTERN.test(request.key)) throw new BadRequestException('Unknown upload');
    if (!request.uploadId) throw new BadRequestException('Only multipart uploads are accepted');
    const upload = await this.ownUpload(actor, request.key);
    await this.bindUploadId(upload.id, upload.uploadId, request.uploadId);

    const uploadId = request.uploadId;
    if (request.method === 'PUT') {
      const partNumber = request.partNumber;
      if (!partNumber) throw new BadRequestException('Say which part this is');
      if (partNumber > maxPartsFor(upload.sizeBytes))
        throw new BadRequestException('That part number is beyond the size of the file');
      return {
        key: upload.key,
        url: await this.store.presignMultipart(upload.key, { kind: 'part', uploadId, partNumber }),
      };
    }
    if (request.method === 'GET')
      return {
        key: upload.key,
        url: await this.store.presignMultipart(upload.key, { kind: 'list', uploadId }),
      };
    if (request.method === 'POST')
      return {
        key: upload.key,
        url: await this.store.presignMultipart(upload.key, { kind: 'complete', uploadId }),
      };
    // DELETE: the browser gives the upload up.
    await this.prisma.fileUpload.updateMany({
      where: { id: upload.id, status: 'open' },
      data: { status: 'aborted' },
    });
    return {
      key: upload.key,
      url: await this.store.presignMultipart(upload.key, { kind: 'abort', uploadId }),
    };
  }

  /** The upload for `key`, if it is this user's, still open and not expired. Anything else looks the same: not allowed. */
  private async ownUpload(actor: Actor, key: string) {
    const upload = await this.prisma.fileUpload.findUnique({ where: { key } });
    if (
      !upload ||
      upload.userId !== actor.userId ||
      upload.status !== 'open' ||
      upload.expiresAt <= new Date()
    )
      throw new ForbiddenException('This upload is not yours, or it is closed');
    return upload;
  }

  /** The first signed part fixes the S3 upload id; every later request must carry the same one. */
  private async bindUploadId(id: string, known: string | null, given: string): Promise<void> {
    if (known === given) return;
    if (known !== null) throw new ForbiddenException('This upload is not yours, or it is closed');
    const bound = await this.prisma.fileUpload.updateMany({
      where: { id, uploadId: null },
      data: { uploadId: given },
    });
    if (bound.count !== 1) {
      const again = await this.prisma.fileUpload.findUnique({
        where: { id },
        select: { uploadId: true },
      });
      if (again?.uploadId !== given)
        throw new ForbiddenException('This upload is not yours, or it is closed');
    }
  }

  /** Checks what is being uploaded and where, records the intent and returns the key the API chose. */
  private async start(actor: Actor, file: UploadFile): Promise<string> {
    if (!isAllowedUpload(file.fileName, file.mimeType))
      throw new UnprocessableEntityException(
        'Only PDF, JPG, PNG, HEIC, DOCX and ZIP files can be uploaded',
      );
    const isPatientSide = actor.role === 'patient' || actor.role === 'attendant';
    if (isPatientSide && file.visibility === 'internal')
      throw new ForbiddenException('Only our staff can add an internal document');
    if (actor.role === 'attendant' && file.kind !== 'passport')
      throw new ForbiddenException('An attendant can upload a passport');

    let caseId: string | null = null;
    let patientId: string | null = null;
    if (file.caseId) {
      await this.scope.assertCaseAccess(actor, file.caseId, 'Document');
      const found = await this.prisma.case.findUnique({
        where: { id: file.caseId },
        select: { patientId: true },
      });
      caseId = file.caseId;
      patientId = found?.patientId ?? null;
    } else if (actor.role === 'patient' && !file.patientId) {
      // A patient's own file: no case needed.
      const own = await this.prisma.patient.findFirst({
        where: { userId: actor.userId, deletedAt: null },
        select: { id: true },
      });
      if (!own) throw new NotFoundException('Patient not found');
      patientId = own.id;
    } else if (file.patientId && actor.role !== 'attendant') {
      const patient = await this.prisma.patient.findFirst({
        where: { AND: [{ id: file.patientId }, await this.scope.patientWhere(actor)] },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('Patient not found');
      patientId = patient.id;
    } else {
      throw new BadRequestException('Say which case or patient this file belongs to');
    }
    if (file.typeId) {
      const type = await this.prisma.documentType.findFirst({
        where: { id: file.typeId, deletedAt: null },
        select: { id: true },
      });
      if (!type) throw new BadRequestException('Unknown document type');
    }
    const hospitalId =
      actor.role === 'hospital_desk'
        ? ((
            await this.prisma.hospitalStaff.findFirst({
              where: { userId: actor.userId, deletedAt: null },
              select: { hospitalId: true },
            })
          )?.hospitalId ?? null)
        : null;

    const key = `files/${randomUUID()}`;
    await this.prisma.fileUpload.create({
      data: {
        key,
        userId: actor.userId,
        fileName: file.fileName,
        mimeType: file.mimeType.toLowerCase(),
        sizeBytes: file.sizeBytes,
        kind: file.kind,
        visibility: file.visibility,
        typeId: file.typeId ?? null,
        caseId,
        patientId,
        hospitalId,
        expiresAt: new Date(Date.now() + UPLOAD_LIFETIME_MS),
      },
    });
    return key;
  }

  /**
   * The browser says the object is in the bucket. Check it really is, and is the size that was announced, then create the
   * document in `pending` (shown as scanning) and queue the scan. Repeating the call returns the same document.
   */
  async complete(actor: Actor, context: RequestContext, key: string): Promise<DocumentView> {
    if (!UPLOAD_KEY_PATTERN.test(key)) throw new BadRequestException('Unknown upload');
    const upload = await this.prisma.fileUpload.findUnique({ where: { key } });
    if (!upload || upload.userId !== actor.userId)
      throw new ForbiddenException('This upload is not yours');
    if (upload.status === 'completed' && upload.documentId) {
      const existing = await this.prisma.document.findUnique({
        where: { id: upload.documentId },
        select: DOCUMENT_SELECT,
      });
      if (existing) return toDocumentView(existing, actor.role);
    }
    if (upload.status !== 'open') throw new ConflictException('This upload is closed');

    const head = await this.store.head(key);
    if (!head) throw new ConflictException('The file has not arrived yet');
    if (head.size !== upload.sizeBytes) {
      // Longer or shorter than announced: the announcement was a lie or the upload broke. Nothing is kept.
      await this.store.delete(key);
      await this.prisma.fileUpload.update({
        where: { id: upload.id },
        data: { status: 'aborted' },
      });
      throw new UnprocessableEntityException('The file is not the size that was announced');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.fileUpload.updateMany({
        where: { id: upload.id, status: 'open' },
        data: { status: 'completed', completedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ConflictException('This upload is closed');
      const document = await tx.document.create({
        data: {
          kind: upload.kind,
          visibility: upload.visibility,
          fileName: upload.fileName,
          mimeType: upload.mimeType,
          sizeBytes: upload.sizeBytes,
          storageKey: upload.key,
          scanStatus: 'pending',
          patientId: upload.patientId,
          caseId: upload.caseId,
          hospitalId: upload.hospitalId,
          typeId: upload.typeId,
          uploadedById: actor.userId,
        },
        select: DOCUMENT_SELECT,
      });
      await tx.fileUpload.update({ where: { id: upload.id }, data: { documentId: document.id } });
      await this.audit.record(tx, context, {
        action: 'document.created',
        entityType: 'Document',
        entityId: document.id,
        patientId: upload.patientId,
        after: {
          kind: upload.kind,
          mimeType: upload.mimeType,
          sizeBytes: upload.sizeBytes,
          visibility: upload.visibility,
        },
      });
      await this.outbox.publish(tx, {
        type: 'document.uploaded',
        aggregateType: 'Document',
        aggregateId: document.id,
        dedupeKey: `document-uploaded:${document.id}`,
        payload: { documentId: document.id },
      });
      return document;
    });
    return toDocumentView(created, actor.role);
  }
}
