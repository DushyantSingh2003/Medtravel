'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Announcements,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import type { KanbanCard, KanbanMove } from '../lib/kanban';
import { Badge } from './badge';

export interface KanbanColumn {
  id: string;
  title: string;
}

export interface KanbanBoardLabels {
  /** Name of the board region. */
  board: string;
  /** Read when a card is focused, e.g. "Press space to pick up, arrow keys to move, space to drop." */
  instructions: string;
  emptyColumn: string;
  pickedUp: (card: string) => string;
  movedTo: (card: string, column: string, position: number) => string;
  dropped: (card: string, column: string, position: number) => string;
  cancelled: (card: string) => string;
}

export interface KanbanBoardProps<T extends KanbanCard> {
  columns: KanbanColumn[];
  cards: T[];
  /** Plain-text name of a card, used for screen-reader announcements. */
  cardName: (card: T) => string;
  renderCard: (card: T) => ReactNode;
  /** Called once when a card is dropped in a new place. Apply it with `moveCard`. */
  onMove: (move: KanbanMove) => void;
  labels: KanbanBoardLabels;
  className?: string;
}

function SortableCard<T extends KanbanCard>({ card, children }: { card: T; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { columnId: card.columnId },
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('list-none', isDragging && 'opacity-40')}
    >
      <div
        {...attributes}
        {...listeners}
        data-slot="kanban-card"
        className="flex cursor-grab touch-manipulation items-start gap-2 rounded-lg border bg-card p-3 text-start shadow-sm active:cursor-grabbing"
      >
        <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </li>
  );
}

function Column<T extends KanbanCard>({
  column,
  cards,
  renderCard,
  emptyLabel,
}: {
  column: KanbanColumn;
  cards: T[];
  renderCard: (card: T) => ReactNode;
  emptyLabel: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { columnId: column.id, type: 'column' } });
  return (
    <section
      aria-label={column.title}
      data-column={column.id}
      className="flex w-72 shrink-0 flex-col gap-2 rounded-xl bg-muted/60 p-2 sm:w-80"
    >
      <header className="flex items-center justify-between px-1 pt-1">
        <h3 className="text-sm font-semibold">{column.title}</h3>
        <Badge variant="muted">{cards.length}</Badge>
      </header>
      <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className={cn('flex min-h-24 flex-col gap-2 rounded-lg p-1 transition-colors', isOver && 'bg-accent')}>
          {cards.map((card) => (
            <SortableCard key={card.id} card={card}>
              {renderCard(card)}
            </SortableCard>
          ))}
          {cards.length === 0 ? <li className="list-none px-2 py-6 text-center text-xs text-muted-foreground">{emptyLabel}</li> : null}
        </ul>
      </SortableContext>
    </section>
  );
}

/**
 * Kanban board with mouse, touch and keyboard dragging. The board does not own the cards: it reports
 * a move and the caller updates its state (usually optimistically) and calls the API.
 */
export function KanbanBoard<T extends KanbanCard>({ columns, cards, cardName, renderCard, onMove, labels, className }: KanbanBoardProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    // A small distance lets a tap or a click on content inside a card through without starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byColumn = (columnId: string) => cards.filter((card) => card.columnId === columnId);
  const columnOf = (id: string | number) => columns.find((column) => column.id === id)?.title ?? '';
  const cardById = (id: string | number) => cards.find((card) => card.id === id);

  /** Resolves a drag target (a card or a column) to a column and a position within it. */
  function targetOf(overId: string | number, activeCardId: string): { columnId: string; index: number } | null {
    if (columns.some((column) => column.id === overId)) {
      return { columnId: String(overId), index: byColumn(String(overId)).filter((card) => card.id !== activeCardId).length };
    }
    const overCard = cardById(overId);
    if (!overCard) return null;
    // Hovering over the card being dragged means "still in its current place".
    if (overCard.id === activeCardId) {
      return { columnId: overCard.columnId, index: byColumn(overCard.columnId).findIndex((card) => card.id === activeCardId) };
    }
    const siblings = byColumn(overCard.columnId).filter((card) => card.id !== activeCardId);
    return { columnId: overCard.columnId, index: siblings.findIndex((card) => card.id === overCard.id) };
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const card = cardById(active.id);
      return card ? labels.pickedUp(cardName(card)) : undefined;
    },
    onDragOver: ({ active, over }) => {
      const card = cardById(active.id);
      const target = over ? targetOf(over.id, String(active.id)) : null;
      // Not a move yet: keep the "picked up" announcement instead of replacing it.
      if (card && target && target.columnId === card.columnId && target.index === byColumn(card.columnId).findIndex((c) => c.id === card.id)) return undefined;
      return card && target ? labels.movedTo(cardName(card), columnOf(target.columnId), target.index + 1) : undefined;
    },
    onDragEnd: ({ active, over }) => {
      const card = cardById(active.id);
      const target = over ? targetOf(over.id, String(active.id)) : null;
      return card && target ? labels.dropped(cardName(card), columnOf(target.columnId), target.index + 1) : undefined;
    },
    onDragCancel: ({ active }) => {
      const card = cardById(active.id);
      return card ? labels.cancelled(cardName(card)) : undefined;
    },
  };

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    const card = cardById(active.id);
    if (!over || !card) return;
    const target = targetOf(over.id, card.id);
    if (!target) return;
    const currentIndex = byColumn(card.columnId).findIndex((c) => c.id === card.id);
    if (target.columnId === card.columnId && target.index === currentIndex) return;
    onMove({ cardId: card.id, fromColumnId: card.columnId, toColumnId: target.columnId, toIndex: target.index });
  }

  const active = activeId ? cardById(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={{ announcements, screenReaderInstructions: { draggable: labels.instructions } }}
      onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div
        role="region"
        aria-label={labels.board}
        tabIndex={0}
        data-slot="kanban-board"
        className={cn('flex items-start gap-3 overflow-x-auto pb-3', className)}
      >
        {columns.map((column) => (
          <Column key={column.id} column={column} cards={byColumn(column.id)} renderCard={renderCard} emptyLabel={labels.emptyColumn} />
        ))}
      </div>
      <DragOverlay>
        {active ? (
          <div className="flex items-start gap-2 rounded-lg border bg-card p-3 shadow-lg">
            <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">{renderCard(active)}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
