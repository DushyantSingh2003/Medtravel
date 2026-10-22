import { HttpException, HttpStatus } from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import type { z } from 'zod';
import type { MasterDefinition, MasterListQuery, MasterRow } from '@medtravel/contracts';
import type { Db } from '../../database/database.module.js';

export interface MasterPage {
  rows: MasterRow[];
  nextCursor: string | null;
  total: number;
}

/**
 * What the service needs from one master table. Adapters take untyped input from the service and validate it with
 * their own Zod schema before calling the typed functions they were defined with (see `defineMaster`).
 */
export interface MasterAdapter {
  readonly definition: MasterDefinition;
  list(db: Db, query: MasterListQuery): Promise<MasterPage>;
  get(db: Db, key: string): Promise<MasterRow | null>;
  create(db: Db, body: unknown): Promise<MasterRow>;
  update(db: Db, key: string, body: unknown): Promise<MasterRow>;
  /** Soft delete (`true`) or restore (`false`). Only called when the definition says rows can be soft-deleted. */
  setDeleted(db: Db, key: string, deleted: boolean): Promise<MasterRow>;
}

interface MasterSpec<C extends z.ZodType, U extends z.ZodType> {
  definition: MasterDefinition;
  createSchema: C;
  updateSchema: U;
  list: MasterAdapter['list'];
  get: MasterAdapter['get'];
  create(db: Db, data: z.output<C>): Promise<MasterRow>;
  update(db: Db, key: string, data: z.output<U>): Promise<MasterRow>;
  setDeleted: MasterAdapter['setDeleted'];
}

/** Wraps typed functions into an adapter that validates whatever it is handed. */
export function defineMaster<C extends z.ZodType, U extends z.ZodType>(
  spec: MasterSpec<C, U>,
): MasterAdapter {
  const parse = <S extends z.ZodType>(schema: S, body: unknown): z.output<S> => {
    const result = schema.safeParse(body);
    if (!result.success) throw new ZodValidationException(result.error);
    return result.data;
  };
  return {
    definition: spec.definition,
    list: spec.list,
    get: spec.get,
    setDeleted: spec.setDeleted,
    create: (db, body) => spec.create(db, parse(spec.createSchema, body)),
    update: (db, key, body) => spec.update(db, key, parse(spec.updateSchema, body)),
  };
}

/** An error the admin screen can show on the right field. Same body shape as a validation error. */
export function fieldError(status: HttpStatus, field: string, message: string): HttpException {
  return new HttpException(
    { statusCode: status, message, errors: [{ path: [field], message }] },
    status,
  );
}

export const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);

interface TranslationRow {
  locale: string;
  name: string;
  summary?: string | null;
}

/** `[{ locale: 'ar', name }]` as the `{ ar: { name } }` map the API returns. */
export function translationMap(rows: readonly TranslationRow[]): MasterRow['translations'] {
  return Object.fromEntries(
    rows.map((row) => [
      row.locale,
      { name: row.name, ...(row.summary === undefined ? {} : { summary: row.summary }) },
    ]),
  );
}

/** The `{ ar: { name } }` map of a write body as rows to insert. */
export function translationRows(
  map:
    Record<string, { name: string; summary?: string | null | undefined } | undefined> | undefined,
): { locale: string; name: string; summary?: string | null }[] {
  return Object.entries(map ?? {}).flatMap(([locale, value]) =>
    value
      ? [
          {
            locale,
            name: value.name,
            ...(value.summary === undefined ? {} : { summary: value.summary }),
          },
        ]
      : [],
  );
}

/** One sort field and direction from `?sort=name` or `?sort=-name`, checked against the table's allowed fields. */
export function orderByOf<F extends string, K extends string>(
  sort: string | undefined,
  allowed: readonly F[],
  tiebreak: K,
): ({ [P in F]?: 'asc' | 'desc' } | { [P in K]?: 'asc' })[] {
  const descending = sort?.startsWith('-') ?? false;
  const field = (sort ? sort.replace(/^-/, '') : 'name') as F;
  if (!allowed.includes(field)) {
    throw fieldError(
      HttpStatus.BAD_REQUEST,
      'sort',
      `Cannot sort by ${field}. Use one of: ${allowed.join(', ')}`,
    );
  }
  return [
    { [field]: descending ? 'desc' : 'asc' } as { [P in F]?: 'asc' | 'desc' },
    { [tiebreak]: 'asc' } as { [P in K]?: 'asc' },
  ];
}

/** Case-insensitive substring match, the same way for every table. */
export const contains = (q: string) => ({ contains: q, mode: 'insensitive' as const });
