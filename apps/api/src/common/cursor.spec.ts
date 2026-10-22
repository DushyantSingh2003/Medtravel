import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, readPage } from './cursor.js';

describe('cursors', () => {
  it('round-trip a key and look like opaque text', () => {
    const key = '3f2b1c3e-0a7d-4f0e-9a52-1d2b7a6c9e10';
    const cursor = encodeCursor(key);
    expect(cursor).not.toContain(key);
    expect(decodeCursor(cursor)).toBe(key);
  });

  it('reject text that is not a cursor', () => {
    for (const bad of ['', '!!!', 'a b', 'not+base64/'])
      expect(() => decodeCursor(bad), bad).toThrow();
  });
});

describe('readPage', () => {
  const rows = ['a', 'b', 'c', 'd', 'e'];
  const source = (limit: number, cursor?: string) => ({
    limit,
    cursor,
    keyOf: (row: string) => row,
    count: () => Promise.resolve(rows.length),
    find: ({ take, cursorKey }: { take: number; skip?: number; cursorKey?: string }) =>
      Promise.resolve(rows.slice(cursorKey ? rows.indexOf(cursorKey) + 1 : 0).slice(0, take)),
  });

  it('reads one row more than the limit to know whether another page exists', async () => {
    const first = await readPage(source(2));
    expect(first.rows).toEqual(['a', 'b']);
    expect(first.total).toBe(5);
    const second = await readPage(source(2, first.nextCursor ?? undefined));
    expect(second.rows).toEqual(['c', 'd']);
    const last = await readPage(source(2, second.nextCursor ?? undefined));
    expect(last).toMatchObject({ rows: ['e'], nextCursor: null });
  });

  it('has no next cursor when the last page is exactly full', async () => {
    expect((await readPage(source(5))).nextCursor).toBeNull();
  });
});
