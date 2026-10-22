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

const definition = MASTER_DEFINITIONS.countries;
const include = {
  translations: { select: { locale: true, name: true } },
} satisfies Prisma.CountryInclude;
type Country = Prisma.CountryGetPayload<{ include: typeof include }>;

const toRow = (c: Country) => ({
  id: c.code,
  code: c.code,
  name: c.name,
  dialCode: c.dialCode,
  region: c.region,
  active: c.active,
  deletedAt: null,
  createdAt: iso(c.createdAt),
  updatedAt: iso(c.updatedAt),
  translations: translationMap(c.translations),
});

export const countryAdapter = defineMaster({
  definition,
  createSchema: MASTER_CREATE_SCHEMAS.countries,
  updateSchema: MASTER_UPDATE_SCHEMAS.countries,

  async list(db, query) {
    const where: Prisma.CountryWhereInput = {
      ...(query.active === undefined ? {} : { active: query.active }),
      ...(query.q
        ? {
            OR: [
              { name: contains(query.q) },
              { code: contains(query.q) },
              { dialCode: contains(query.q) },
              { region: contains(query.q) },
              { translations: { some: { name: contains(query.q) } } },
            ],
          }
        : {}),
    };
    const page = await readPage<Country>({
      limit: query.limit,
      cursor: query.cursor,
      keyOf: (c) => c.code,
      find: ({ take, skip, cursorKey }) =>
        db.country.findMany({
          where,
          include,
          orderBy: orderByOf(query.sort, definition.sortFields, 'code'),
          take,
          ...(cursorKey ? { skip, cursor: { code: cursorKey } } : {}),
        }),
      count: () => db.country.count({ where }),
    });
    return { ...page, rows: page.rows.map(toRow) };
  },

  async get(db, key) {
    const country = await db.country.findUnique({ where: { code: key }, include });
    return country && toRow(country);
  },

  async create(db, data) {
    const { translations, ...fields } = data;
    return toRow(
      await db.country.create({
        data: { ...fields, translations: { create: translationRows(translations) } },
        include,
      }),
    );
  },

  async update(db, key, data) {
    const { translations, ...fields } = data;
    return toRow(
      await db.country.update({
        where: { code: key },
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

  setDeleted() {
    throw new Error('Countries are deactivated, not deleted');
  },
});
