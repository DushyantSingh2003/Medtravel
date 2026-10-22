import { HttpStatus } from '@nestjs/common';
import type { Prisma } from '@medtravel/db';
import {
  MASTER_CREATE_SCHEMAS,
  MASTER_DEFINITIONS,
  MASTER_UPDATE_SCHEMAS,
} from '@medtravel/contracts';
import { readPage } from '../../../common/cursor.js';
import type { Db } from '../../../database/database.module.js';
import {
  contains,
  defineMaster,
  fieldError,
  iso,
  orderByOf,
  translationMap,
  translationRows,
} from '../master-adapter.js';

const definition = MASTER_DEFINITIONS.treatments;
const include = {
  speciality: { select: { id: true, name: true } },
  translations: { select: { locale: true, name: true, summary: true } },
} satisfies Prisma.TreatmentInclude;
type Treatment = Prisma.TreatmentGetPayload<{ include: typeof include }>;

const toRow = (t: Treatment) => ({
  id: t.id,
  slug: t.slug,
  name: t.name,
  summary: t.summary,
  typicalStayDays: t.typicalStayDays,
  specialityId: t.specialityId,
  speciality: t.speciality,
  active: t.active,
  deletedAt: iso(t.deletedAt),
  createdAt: iso(t.createdAt),
  updatedAt: iso(t.updatedAt),
  translations: translationMap(t.translations),
});

async function assertSpeciality(db: Db, id: string): Promise<void> {
  const speciality = await db.speciality.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!speciality)
    throw fieldError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'specialityId',
      'This speciality does not exist',
    );
}

export const treatmentAdapter = defineMaster({
  definition,
  createSchema: MASTER_CREATE_SCHEMAS.treatments,
  updateSchema: MASTER_UPDATE_SCHEMAS.treatments,

  async list(db, query) {
    const where: Prisma.TreatmentWhereInput = {
      deletedAt: query.deleted ? { not: null } : null,
      ...(query.active === undefined ? {} : { active: query.active }),
      ...(query.specialityId ? { specialityId: query.specialityId } : {}),
      ...(query.q
        ? {
            OR: [
              { name: contains(query.q) },
              { slug: contains(query.q) },
              { translations: { some: { name: contains(query.q) } } },
            ],
          }
        : {}),
    };
    const page = await readPage<Treatment>({
      limit: query.limit,
      cursor: query.cursor,
      keyOf: (t) => t.id,
      find: ({ take, skip, cursorKey }) =>
        db.treatment.findMany({
          where,
          include,
          orderBy: orderByOf(query.sort, definition.sortFields, 'id'),
          take,
          ...(cursorKey ? { skip, cursor: { id: cursorKey } } : {}),
        }),
      count: () => db.treatment.count({ where }),
    });
    return { ...page, rows: page.rows.map(toRow) };
  },

  async get(db, key) {
    const treatment = await db.treatment.findUnique({ where: { id: key }, include });
    return treatment && toRow(treatment);
  },

  async create(db, data) {
    await assertSpeciality(db, data.specialityId);
    const { translations, ...fields } = data;
    return toRow(
      await db.treatment.create({
        data: { ...fields, translations: { create: translationRows(translations) } },
        include,
      }),
    );
  },

  async update(db, key, data) {
    if (data.specialityId) await assertSpeciality(db, data.specialityId);
    const { translations, ...fields } = data;
    return toRow(
      await db.treatment.update({
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
      await db.treatment.update({
        where: { id: key },
        data: { deletedAt: deleted ? new Date() : null, active: !deleted },
        include,
      }),
    );
  },
});
