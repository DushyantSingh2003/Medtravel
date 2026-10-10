import { describe, expect, it } from 'vitest';
import { moveCard, type KanbanCard } from './kanban';

const board: KanbanCard[] = [
  { id: 'a', columnId: 'todo' },
  { id: 'b', columnId: 'todo' },
  { id: 'c', columnId: 'doing' },
  { id: 'd', columnId: 'done' },
];
const inColumn = (cards: KanbanCard[], column: string) => cards.filter((c) => c.columnId === column).map((c) => c.id);

describe('moveCard', () => {
  it('moves a card to another column at the given position', () => {
    const next = moveCard(board, { cardId: 'a', fromColumnId: 'todo', toColumnId: 'doing', toIndex: 0 });
    expect(inColumn(next, 'doing')).toEqual(['a', 'c']);
    expect(inColumn(next, 'todo')).toEqual(['b']);
  });

  it('appends when the index is past the end', () => {
    const next = moveCard(board, { cardId: 'a', fromColumnId: 'todo', toColumnId: 'doing', toIndex: 99 });
    expect(inColumn(next, 'doing')).toEqual(['c', 'a']);
  });

  it('reorders within a column', () => {
    const next = moveCard(board, { cardId: 'a', fromColumnId: 'todo', toColumnId: 'todo', toIndex: 1 });
    expect(inColumn(next, 'todo')).toEqual(['b', 'a']);
  });

  it('can drop into an empty column', () => {
    const next = moveCard(board, { cardId: 'd', fromColumnId: 'done', toColumnId: 'archive', toIndex: 0 });
    expect(inColumn(next, 'archive')).toEqual(['d']);
    expect(inColumn(next, 'done')).toEqual([]);
  });

  it('never loses or duplicates a card', () => {
    const next = moveCard(board, { cardId: 'b', fromColumnId: 'todo', toColumnId: 'done', toIndex: 0 });
    expect(next.map((c) => c.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ignores an unknown card and does not mutate the input', () => {
    const copy = JSON.stringify(board);
    expect(moveCard(board, { cardId: 'zzz', fromColumnId: 'todo', toColumnId: 'done', toIndex: 0 })).toBe(board);
    moveCard(board, { cardId: 'a', fromColumnId: 'todo', toColumnId: 'done', toIndex: 0 });
    expect(JSON.stringify(board)).toBe(copy);
  });

  it('clamps a negative index to the start', () => {
    const next = moveCard(board, { cardId: 'd', fromColumnId: 'done', toColumnId: 'todo', toIndex: -5 });
    expect(inColumn(next, 'todo')).toEqual(['d', 'a', 'b']);
  });
});
