import { HttpStatus } from '@nestjs/common';
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
  fieldError,
  iso,
  orderByOf,
  translationMap,
  translationRows,
} from '../master-adapter.js';

const definition = MASTER_DEFINITIONS.specialities;
const include = {
  translations: { select: { locale: true, name: true } },
} satisfies Prisma.SpecialityInclude;
type Speciality = Prisma.SpecialityGetPayload<{ include: typeof include }>;

const toRow = (s: Speciality) => ({
  id: s.id,
  slug: s.slug,
  name: s.name,
  active: s.active,
  deletedAt: iso(s.deletedAt),
  createdAt: iso(s.createdAt),
  updatedAt: iso(s.updatedAt),
  translations: translationMap(s.translations),
});

export const specialityAdapter = defineMaster({
  definition,
  createSchema: MASTER_CREATE_SCHEMAS.specialities,
  updateSchema: MASTER_UPDATE_SCHEMAS.specialities,

  async list(db, query) {
    const where: Prisma.SpecialityWhereInput = {
      deletedAt: query.deleted ? { not: null } : null,
      ...(query.active === undefined ? {} : { active: query.active }),
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
    const page = await readPage<Speciality>({
      limit: query.limit,
      cursor: query.cursor,
      keyOf: (s) => s.id,
      find: ({ take, skip, cursorKey }) =>
        db.speciality.findMany({
          where,
          include,
          orderBy: orderByOf(query.sort, definition.sortFields, 'id'),
          take,
          ...(cursorKey ? { skip, cursor: { id: cursorKey } } : {}),
        }),
      count: () => db.speciality.count({ where }),
    });
    return { ...page, rows: page.rows.map(toRow) };
  },

  async get(db, key) {
    const speciality = await db.speciality.findUnique({ where: { id: key }, include });
    return speciality && toRow(speciality);
  },

  async create(db, data) {
    const { translations, ...fields } = data;
    return toRow(
      await db.speciality.create({
        data: { ...fields, translations: { create: translationRows(translations) } },
        include,
      }),
    );
  },

  async update(db, key, data) {
    const { translations, ...fields } = data;
    return toRow(
      await db.speciality.update({
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
    if (deleted) {
      const inUse = await db.treatment.count({ where: { specialityId: key, deletedAt: null } });
      if (inUse > 0) {
        throw fieldError(
          HttpStatus.CONFLICT,
          'id',
          `${inUse} treatment(s) still belong to this speciality. Move or delete them first.`,
        );
      }
    }
    return toRow(
      await db.speciality.update({
        where: { id: key },
        data: { deletedAt: deleted ? new Date() : null },
        include,
      }),
    );
  },
});
