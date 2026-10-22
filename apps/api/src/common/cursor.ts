import { BadRequestException } from '@nestjs/common';

/**
 * Cursors are opaque to clients: base64url of the key of the last row on the page. Prisma's native cursor then
 * continues after that row in the same order.
 */
export const encodeCursor = (key: string): string => Buffer.from(key, 'utf8').toString('base64url');

export function decodeCursor(cursor: string): string {
  const key = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!key || encodeCursor(key) !== cursor) {
    throw new BadRequestException({
      message: 'Invalid cursor',
      errors: [{ path: ['cursor'], message: 'Invalid cursor' }],
    });
  }
  return key;
}

export interface PageSource<Row> {
  limit: number;
  cursor?: string | undefined;
  keyOf: (row: Row) => string;
  /** Reads `take` rows starting at the cursor key (inclusive of nothing before it); `skip` is 1 when a cursor is set. */
  find: (page: { take: number; skip?: number; cursorKey?: string }) => Promise<Row[]>;
  count: () => Promise<number>;
}

/** Runs one page query plus the total, and works out the next cursor from the extra row read. */
export async function readPage<Row>(
  source: PageSource<Row>,
): Promise<{ rows: Row[]; nextCursor: string | null; total: number }> {
  const cursorKey = source.cursor ? decodeCursor(source.cursor) : undefined;
  const [found, total] = await Promise.all([
    source.find({ take: source.limit + 1, ...(cursorKey ? { skip: 1, cursorKey } : {}) }),
    source.count(),
  ]);
  const rows = found.slice(0, source.limit);
  const last = rows.at(-1);
  return {
    rows,
    nextCursor: found.length > source.limit && last ? encodeCursor(source.keyOf(last)) : null,
    total,
  };
}
