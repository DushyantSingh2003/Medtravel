import { describe, expect, it } from 'vitest';
import { moveCard, resolveDrop, type KanbanCard } from './kanban';

const board: KanbanCard[] = [
  { id: 'a', columnId: 'todo' },
  { id: 'b', columnId: 'todo' },
  { id: 'c', columnId: 'doing' },
  { id: 'd', columnId: 'done' },
];
const inColumn = (cards: KanbanCard[], column: string) =>
  cards.filter((c) => c.columnId === column).map((c) => c.id);

describe('moveCard', () => {
  it('moves a card to another column at the given position', () => {
    const next = moveCard(board, {
      cardId: 'a',
      fromColumnId: 'todo',
      toColumnId: 'doing',
      toIndex: 0,
    });
    expect(inColumn(next, 'doing')).toEqual(['a', 'c']);
    expect(inColumn(next, 'todo')).toEqual(['b']);
  });

  it('appends when the index is past the end', () => {
    const next = moveCard(board, {
      cardId: 'a',
      fromColumnId: 'todo',
      toColumnId: 'doing',
      toIndex: 99,
    });
    expect(inColumn(next, 'doing')).toEqual(['c', 'a']);
  });

  it('reorders within a column', () => {
    const next = moveCard(board, {
      cardId: 'a',
      fromColumnId: 'todo',
      toColumnId: 'todo',
      toIndex: 1,
    });
    expect(inColumn(next, 'todo')).toEqual(['b', 'a']);
  });

  it('can drop into an empty column', () => {
    const next = moveCard(board, {
      cardId: 'd',
      fromColumnId: 'done',
      toColumnId: 'archive',
      toIndex: 0,
    });
    expect(inColumn(next, 'archive')).toEqual(['d']);
    expect(inColumn(next, 'done')).toEqual([]);
  });

  it('never loses or duplicates a card', () => {
    const next = moveCard(board, {
      cardId: 'b',
      fromColumnId: 'todo',
      toColumnId: 'done',
      toIndex: 0,
    });
    expect(next.map((c) => c.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ignores an unknown card and does not mutate the input', () => {
    const copy = JSON.stringify(board);
    expect(
      moveCard(board, { cardId: 'zzz', fromColumnId: 'todo', toColumnId: 'done', toIndex: 0 }),
    ).toBe(board);
    moveCard(board, { cardId: 'a', fromColumnId: 'todo', toColumnId: 'done', toIndex: 0 });
    expect(JSON.stringify(board)).toBe(copy);
  });

  it('clamps a negative index to the start', () => {
    const next = moveCard(board, {
      cardId: 'd',
      fromColumnId: 'done',
      toColumnId: 'todo',
      toIndex: -5,
    });
    expect(inColumn(next, 'todo')).toEqual(['d', 'a', 'b']);
  });
});

describe('resolveDrop', () => {
  const cards: KanbanCard[] = [
    { id: 'a', columnId: 'todo' },
    { id: 'b', columnId: 'todo' },
    { id: 'c', columnId: 'todo' },
    { id: 'd', columnId: 'doing' },
    { id: 'e', columnId: 'doing' },
  ];
  const columns = ['todo', 'doing', 'done'];
  const order = (column: string, drop: { columnId: string; index: number } | null, id: string) =>
    inColumn(
      moveCard(cards, {
        cardId: id,
        fromColumnId: 'x',
        toColumnId: drop!.columnId,
        toIndex: drop!.index,
      }),
      column,
    );

  it('moves a card DOWN past a neighbour in the same column (it goes after it, not before)', () => {
    const drop = resolveDrop(cards, columns, 'a', 'b');
    expect(drop).toEqual({ columnId: 'todo', index: 1 });
    expect(order('todo', drop, 'a')).toEqual(['b', 'a', 'c']);
  });

  it('moves a card down to the last position', () => {
    const drop = resolveDrop(cards, columns, 'a', 'c');
    expect(order('todo', drop, 'a')).toEqual(['b', 'c', 'a']);
  });

  it('moves a card UP before the card it is over', () => {
    expect(order('todo', resolveDrop(cards, columns, 'c', 'a'), 'c')).toEqual(['c', 'a', 'b']);
    expect(order('todo', resolveDrop(cards, columns, 'c', 'b'), 'c')).toEqual(['a', 'c', 'b']);
  });

  it('treats hovering over itself as staying where it is', () => {
    expect(resolveDrop(cards, columns, 'b', 'b')).toEqual({ columnId: 'todo', index: 1 });
  });

  it('drops into another column before or after the card, by pointer position', () => {
    expect(order('doing', resolveDrop(cards, columns, 'a', 'd', false), 'a')).toEqual([
      'a',
      'd',
      'e',
    ]);
    expect(order('doing', resolveDrop(cards, columns, 'a', 'd', true), 'a')).toEqual([
      'd',
      'a',
      'e',
    ]);
    expect(order('doing', resolveDrop(cards, columns, 'a', 'e', true), 'a')).toEqual([
      'd',
      'e',
      'a',
    ]);
  });

  it('drops on a column area at the end, including an empty column', () => {
    expect(resolveDrop(cards, columns, 'a', 'doing')).toEqual({ columnId: 'doing', index: 2 });
    expect(resolveDrop(cards, columns, 'a', 'done')).toEqual({ columnId: 'done', index: 0 });
    // Dropping a card on its own column's area puts it last, without counting itself.
    expect(resolveDrop(cards, columns, 'a', 'todo')).toEqual({ columnId: 'todo', index: 2 });
  });

  it('returns null for unknown ids', () => {
    expect(resolveDrop(cards, columns, 'zzz', 'a')).toBeNull();
    expect(resolveDrop(cards, columns, 'a', 'zzz')).toBeNull();
  });
});
