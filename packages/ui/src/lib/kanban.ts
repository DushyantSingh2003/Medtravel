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
  const inserted = [
    ...target.slice(0, index),
    { ...moving, columnId: move.toColumnId },
    ...target.slice(index),
  ];
  return [...others, ...inserted];
}

export interface DropTarget {
  columnId: string;
  /** Position within the column, counted without the card being moved (what `moveCard` expects). */
  index: number;
}

/**
 * Where a dragged card lands, given what it is currently over.
 *
 * - Over a column's empty area: the end of that column.
 * - Over itself: its current place (not a move).
 * - Over another card in the same column: that card's position, as an array "move" does it, so a card
 *   dragged down past a neighbour goes after it and one dragged up goes before it.
 * - Over a card in another column: before that card, or after it when the pointer is in its lower half.
 */
export function resolveDrop<T extends KanbanCard>(
  cards: T[],
  columnIds: string[],
  activeId: string,
  overId: string,
  pointerInLowerHalf = false,
): DropTarget | null {
  const active = cards.find((card) => card.id === activeId);
  if (!active) return null;

  if (columnIds.includes(overId)) {
    return {
      columnId: overId,
      index: cards.filter((card) => card.columnId === overId && card.id !== activeId).length,
    };
  }

  const over = cards.find((card) => card.id === overId);
  if (!over) return null;
  const column = cards.filter((card) => card.columnId === over.columnId);
  const overIndex = column.findIndex((card) => card.id === over.id);

  if (over.id === active.id) return { columnId: over.columnId, index: overIndex };
  if (over.columnId === active.columnId) return { columnId: over.columnId, index: overIndex };
  return { columnId: over.columnId, index: overIndex + (pointerInLowerHalf ? 1 : 0) };
}
