import type { Prisma } from '@medtravel/db';
import {
  MASTER_CREATE_SCHEMAS,
  MASTER_DEFINITIONS,
  MASTER_UPDATE_SCHEMAS,
} from '@medtravel/contracts';
import { readPage } from '../../../common/cursor.js';
import { contains, defineMaster, orderByOf } from '../master-adapter.js';

const definition = MASTER_DEFINITIONS.currencies;

type Currency = Prisma.CurrencyGetPayload<object>;

const toRow = (c: Currency) => ({
  id: c.code,
  code: c.code,
  name: c.name,
  minorUnits: c.minorUnits,
  symbol: c.symbol,
  active: c.active,
  deletedAt: null,
  createdAt: null,
  updatedAt: null,
  translations: {},
});

export const currencyAdapter = defineMaster({
  definition,
  createSchema: MASTER_CREATE_SCHEMAS.currencies,
  updateSchema: MASTER_UPDATE_SCHEMAS.currencies,

  async list(db, query) {
    const where: Prisma.CurrencyWhereInput = {
      ...(query.active === undefined ? {} : { active: query.active }),
      ...(query.q ? { OR: [{ name: contains(query.q) }, { code: contains(query.q) }] } : {}),
    };
    const page = await readPage<Currency>({
      limit: query.limit,
      cursor: query.cursor,
      keyOf: (c) => c.code,
      find: ({ take, skip, cursorKey }) =>
        db.currency.findMany({
          where,
          orderBy: orderByOf(query.sort, definition.sortFields, 'code'),
          take,
          ...(cursorKey ? { skip, cursor: { code: cursorKey } } : {}),
        }),
      count: () => db.currency.count({ where }),
    });
    return { ...page, rows: page.rows.map(toRow) };
  },

  async get(db, key) {
    const currency = await db.currency.findUnique({ where: { code: key } });
    return currency && toRow(currency);
  },

  async create(db, data) {
    return toRow(await db.currency.create({ data }));
  },

  async update(db, key, data) {
    return toRow(await db.currency.update({ where: { code: key }, data }));
  },

  setDeleted() {
    throw new Error('Currencies are deactivated, not deleted');
  },
});
