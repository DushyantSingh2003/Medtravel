import type { Prisma } from '@medtravel/db';
import {
  MASTER_CREATE_SCHEMAS,
  MASTER_DEFINITIONS,
  MASTER_UPDATE_SCHEMAS,
} from '@medtravel/contracts';
import { readPage } from '../../../common/cursor.js';
import {
  contains,
  defineMaster,
  iso,
  orderByOf,
  translationMap,
  translationRows,
} from '../master-adapter.js';

const definition = MASTER_DEFINITIONS['document-types'];
const include = {
  translations: { select: { locale: true, name: true } },
} satisfies Prisma.DocumentTypeInclude;
type DocumentType = Prisma.DocumentTypeGetPayload<{ include: typeof include }>;

const toRow = (r: DocumentType) => ({
  id: r.id,
  code: r.code,
  kind: r.kind,
  name: r.name,
  active: r.active,
  deletedAt: iso(r.deletedAt),
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
  translations: translationMap(r.translations),
});

export const documentTypeAdapter = defineMaster({
  definition,
  createSchema: MASTER_CREATE_SCHEMAS['document-types'],
  updateSchema: MASTER_UPDATE_SCHEMAS['document-types'],

  async list(db, query) {
    const where: Prisma.DocumentTypeWhereInput = {
      deletedAt: query.deleted ? { not: null } : null,
      ...(query.active === undefined ? {} : { active: query.active }),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.q
        ? {
            OR: [
              { name: contains(query.q) },
              { code: contains(query.q) },
              { translations: { some: { name: contains(query.q) } } },
            ],
          }
        : {}),
    };
    const page = await readPage<DocumentType>({
      limit: query.limit,
      cursor: query.cursor,
      keyOf: (r) => r.id,
      find: ({ take, skip, cursorKey }) =>
        db.documentType.findMany({
          where,
          include,
          orderBy: orderByOf(query.sort, definition.sortFields, 'id'),
          take,
          ...(cursorKey ? { skip, cursor: { id: cursorKey } } : {}),
        }),
      count: () => db.documentType.count({ where }),
    });
    return { ...page, rows: page.rows.map(toRow) };
  },

  async get(db, key) {
    const row = await db.documentType.findUnique({ where: { id: key }, include });
    return row && toRow(row);
  },

  async create(db, data) {
    const { translations, ...fields } = data;
    return toRow(
      await db.documentType.create({
        data: { ...fields, translations: { create: translationRows(translations) } },
        include,
      }),
    );
  },

  async update(db, key, data) {
    const { translations, ...fields } = data;
    return toRow(
      await db.documentType.update({
        where: { id: key },
        data: {
          ...fields,
          ...(translations
            ? { translations: { deleteMany: {}, create: translationRows(translations) } }
            : {}),
        },
        include,
      }),
    );
  },

  async setDeleted(db, key, deleted) {
    return toRow(
      await db.documentType.update({
        where: { id: key },
        data: { deletedAt: deleted ? new Date() : null, active: !deleted },
        include,
      }),
    );
  },
});
