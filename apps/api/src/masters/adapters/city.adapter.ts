import { HttpStatus } from '@nestjs/common';
import type { Prisma } from '@medtravel/db';
import {
  MASTER_CREATE_SCHEMAS,
  MASTER_DEFINITIONS,
  MASTER_UPDATE_SCHEMAS,
} from '@medtravel/contracts';
import { readPage } from '../../common/cursor.js';
import type { Db } from '../../database/database.module.js';
import {
  contains,
  defineMaster,
  fieldError,
  iso,
  orderByOf,
  translationMap,
  translationRows,
} from '../master-adapter.js';

const definition = MASTER_DEFINITIONS.cities;
const include = {
  translations: { select: { locale: true, name: true } },
} satisfies Prisma.CityInclude;
type City = Prisma.CityGetPayload<{ include: typeof include }>;

const toRow = (c: City) => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  countryCode: c.countryCode,
  active: c.active,
  deletedAt: iso(c.deletedAt),
  createdAt: iso(c.createdAt),
  updatedAt: iso(c.updatedAt),
  translations: translationMap(c.translations),
});

async function assertCountry(db: Db, code: string): Promise<void> {
  const country = await db.country.findUnique({ where: { code }, select: { code: true } });
  if (!country)
    throw fieldError(HttpStatus.UNPROCESSABLE_ENTITY, 'countryCode', 'This country does not exist');
}

export const cityAdapter = defineMaster({
  definition,
  createSchema: MASTER_CREATE_SCHEMAS.cities,
  updateSchema: MASTER_UPDATE_SCHEMAS.cities,

  async list(db, query) {
    const where: Prisma.CityWhereInput = {
      deletedAt: query.deleted ? { not: null } : null,
      ...(query.active === undefined ? {} : { active: query.active }),
      ...(query.countryCode ? { countryCode: query.countryCode } : {}),
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
    const page = await readPage<City>({
      limit: query.limit,
      cursor: query.cursor,
      keyOf: (c) => c.id,
      find: ({ take, skip, cursorKey }) =>
        db.city.findMany({
          where,
          include,
          orderBy: orderByOf(query.sort, definition.sortFields, 'id'),
          take,
          ...(cursorKey ? { skip, cursor: { id: cursorKey } } : {}),
        }),
      count: () => db.city.count({ where }),
    });
    return { ...page, rows: page.rows.map(toRow) };
  },

  async get(db, key) {
    const city = await db.city.findUnique({ where: { id: key }, include });
    return city && toRow(city);
  },

  async create(db, data) {
    await assertCountry(db, data.countryCode);
    const { translations, ...fields } = data;
    return toRow(
      await db.city.create({
        data: { ...fields, translations: { create: translationRows(translations) } },
        include,
      }),
    );
  },

  async update(db, key, data) {
    if (data.countryCode) await assertCountry(db, data.countryCode);
    const { translations, ...fields } = data;
    return toRow(
      await db.city.update({
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
      await db.city.update({
        where: { id: key },
        data: { deletedAt: deleted ? new Date() : null, active: !deleted },
        include,
      }),
    );
  },
});
