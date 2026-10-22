import type { Prisma } from '@medtravel/db';
import {
  MASTER_CREATE_SCHEMAS,
  MASTER_DEFINITIONS,
  MASTER_UPDATE_SCHEMAS,
} from '@medtravel/contracts';
import { readPage } from '../../../common/cursor.js';
import { contains, defineMaster, orderByOf } from '../master-adapter.js';

const definition = MASTER_DEFINITIONS.languages;

type Language = Prisma.LanguageGetPayload<object>;

const toRow = (l: Language) => ({
  id: l.code,
  code: l.code,
  name: l.name,
  rtl: l.rtl,
  active: l.active,
  deletedAt: null,
  createdAt: null,
  updatedAt: null,
  translations: {},
});

export const languageAdapter = defineMaster({
  definition,
  createSchema: MASTER_CREATE_SCHEMAS.languages,
  updateSchema: MASTER_UPDATE_SCHEMAS.languages,

  async list(db, query) {
    const where: Prisma.LanguageWhereInput = {
      ...(query.active === undefined ? {} : { active: query.active }),
      ...(query.q ? { OR: [{ name: contains(query.q) }, { code: contains(query.q) }] } : {}),
    };
    const page = await readPage<Language>({
      limit: query.limit,
      cursor: query.cursor,
      keyOf: (l) => l.code,
      find: ({ take, skip, cursorKey }) =>
        db.language.findMany({
          where,
          orderBy: orderByOf(query.sort, definition.sortFields, 'code'),
          take,
          ...(cursorKey ? { skip, cursor: { code: cursorKey } } : {}),
        }),
      count: () => db.language.count({ where }),
    });
    return { ...page, rows: page.rows.map(toRow) };
  },

  async get(db, key) {
    const language = await db.language.findUnique({ where: { code: key } });
    return language && toRow(language);
  },

  async create(db, data) {
    return toRow(await db.language.create({ data }));
  },

  async update(db, key, data) {
    return toRow(await db.language.update({ where: { code: key }, data }));
  },

  setDeleted() {
    throw new Error('Languages are deactivated, not deleted');
  },
});
