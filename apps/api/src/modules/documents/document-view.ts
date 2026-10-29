import type { Prisma } from '@medtravel/db';
import type { DocumentView, Role } from '@medtravel/contracts';

/** What a document row needs to be shown: the file's facts, its type, uploader, case number and live shares. */
export const DOCUMENT_SELECT = {
  id: true,
  kind: true,
  visibility: true,
  typeId: true,
  type: { select: { name: true } },
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  scanStatus: true,
  scanDetail: true,
  pageCount: true,
  thumbnailKey: true,
  notes: true,
  patientId: true,
  caseId: true,
  case: { select: { caseNo: true } },
  uploadedById: true,
  uploadedBy: { select: { name: true } },
  createdAt: true,
  shares: {
    where: {
      revokedAt: null,
      deletedAt: null,
      consent: { withdrawnAt: null, deletedAt: null },
    },
    select: { hospitalId: true, hospital: { select: { name: true } } },
  },
} satisfies Prisma.DocumentSelect;

export type DocumentRow = Prisma.DocumentGetPayload<{ select: typeof DOCUMENT_SELECT }>;

const HOSPITAL_ROLES: readonly Role[] = ['hospital_desk', 'doctor'];

/** The API shape of a row. A hospital user is not told which other hospitals the patient shared the file with. */
export function toDocumentView(row: DocumentRow, role: Role): DocumentView {
  return {
    id: row.id,
    kind: row.kind,
    visibility: row.visibility,
    typeId: row.typeId,
    typeName: row.type?.name ?? null,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    scanStatus: row.scanStatus,
    scanDetail: row.scanDetail,
    pageCount: row.pageCount,
    hasThumbnail: row.thumbnailKey !== null,
    notes: row.notes,
    patientId: row.patientId,
    caseId: row.caseId,
    caseNo: row.case?.caseNo ?? null,
    uploadedById: row.uploadedById,
    uploadedByName: row.uploadedBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    shares: HOSPITAL_ROLES.includes(role)
      ? []
      : row.shares.map((share) => ({
          hospitalId: share.hospitalId,
          hospitalName: share.hospital.name,
        })),
  };
}
