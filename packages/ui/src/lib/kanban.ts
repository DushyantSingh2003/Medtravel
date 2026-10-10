export interface KanbanCard {
  id: string;
  columnId: string;
}

export interface KanbanMove {
  cardId: string;
  fromColumnId: string;
  toColumnId: string;
  /** Position within the target column, counted without the moved card. */
  toIndex: number;
}

/**
 * Applies a move to a flat card list and returns a new list. Cards keep their relative order in
 * every column; the moved card lands at `toIndex` in the target column. Unknown ids leave the list
 * unchanged, so a stale drop event can never corrupt the board.
 */
export function moveCard<T extends KanbanCard>(cards: T[], move: KanbanMove): T[] {
  const moving = cards.find((card) => card.id === move.cardId);
  if (!moving) return cards;
  const rest = cards.filter((card) => card.id !== move.cardId);
  const target = rest.filter((card) => card.columnId === move.toColumnId);
  const others = rest.filter((card) => card.columnId !== move.toColumnId);
  const index = Math.max(0, Math.min(move.toIndex, target.length));
  const inserted = [...target.slice(0, index), { ...moving, columnId: move.toColumnId }, ...target.slice(index)];
  return [...others, ...inserted];
}
