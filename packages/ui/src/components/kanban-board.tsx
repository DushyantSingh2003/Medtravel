'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Announcements,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { resolveDrop, type KanbanCard, type KanbanMove } from '../lib/kanban';
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
  /** Screen-reader role of a card, e.g. "sortable card". Read together with its name. */
  cardRole: string;
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

function SortableCard<T extends KanbanCard>({
  card,
  roleDescription,
  children,
}: {
  card: T;
  roleDescription: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { columnId: card.columnId },
    attributes: { roleDescription },
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
  cardRole,
}: {
  column: KanbanColumn;
  cards: T[];
  renderCard: (card: T) => ReactNode;
  emptyLabel: string;
  cardRole: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { columnId: column.id, type: 'column' },
  });
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
        <ul
          ref={setNodeRef}
          className={cn(
            'flex min-h-24 flex-col gap-2 rounded-lg p-1 transition-colors',
            isOver && 'bg-accent',
          )}
        >
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} roleDescription={cardRole}>
              {renderCard(card)}
            </SortableCard>
          ))}
          {cards.length === 0 ? (
            <li className="list-none px-2 py-6 text-center text-xs text-muted-foreground">
              {emptyLabel}
            </li>
          ) : null}
        </ul>
      </SortableContext>
    </section>
  );
}

/**
 * Kanban board with mouse, touch and keyboard dragging. The board does not own the cards: it reports
 * a move and the caller updates its state (usually optimistically) and calls the API.
 */
export function KanbanBoard<T extends KanbanCard>({
  columns,
  cards,
  cardName,
  renderCard,
  onMove,
  labels,
  className,
}: KanbanBoardProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // A stable id keeps the generated accessibility ids identical on the server and in the browser.
  const dndId = useId();
  const sensors = useSensors(
    // A few pixels of movement lets a click on content inside a card through without starting a drag.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // On touch a drag starts after a short press, so an ordinary swipe still scrolls the board and the page.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byColumn = (columnId: string) => cards.filter((card) => card.columnId === columnId);
  const columnOf = (id: string | number) => columns.find((column) => column.id === id)?.title ?? '';
  const cardById = (id: string | number) => cards.find((card) => card.id === id);

  const columnIds = columns.map((column) => column.id);
  type Rects = {
    active: { rect: { current: { translated: { top: number; height: number } | null } } };
    over: { rect: { top: number; height: number } } | null;
  };
  /** True when the dragged card's centre is in the lower half of the card it is over. */
  const inLowerHalf = ({ active, over }: Rects): boolean => {
    const moved = active.rect.current.translated;
    return Boolean(
      moved && over && moved.top + moved.height / 2 > over.rect.top + over.rect.height / 2,
    );
  };
  const targetOf = (
    event: Rects & { active: { id: string | number }; over: { id: string | number } | null },
  ) =>
    event.over
      ? resolveDrop(
          cards,
          columnIds,
          String(event.active.id),
          String(event.over.id),
          inLowerHalf(event),
        )
      : null;
  const currentIndexOf = (card: T) => byColumn(card.columnId).findIndex((c) => c.id === card.id);

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const card = cardById(active.id);
      return card ? labels.pickedUp(cardName(card)) : undefined;
    },
    onDragOver: (event) => {
      const card = cardById(event.active.id);
      const target = targetOf(event as never);
      if (!card || !target) return undefined;
      // Not a move yet: keep the "picked up" announcement instead of replacing it.
      if (target.columnId === card.columnId && target.index === currentIndexOf(card))
        return undefined;
      return labels.movedTo(cardName(card), columnOf(target.columnId), target.index + 1);
    },
    onDragEnd: (event) => {
      const card = cardById(event.active.id);
      const target = targetOf(event as never);
      return card && target
        ? labels.dropped(cardName(card), columnOf(target.columnId), target.index + 1)
        : undefined;
    },
    onDragCancel: ({ active }) => {
      const card = cardById(active.id);
      return card ? labels.cancelled(cardName(card)) : undefined;
    },
  };

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const card = cardById(event.active.id);
    const target = targetOf(event as never);
    if (!card || !target) return;
    if (target.columnId === card.columnId && target.index === currentIndexOf(card)) return;
    onMove({
      cardId: card.id,
      fromColumnId: card.columnId,
      toColumnId: target.columnId,
      toIndex: target.index,
    });
  }

  const active = activeId ? cardById(activeId) : undefined;

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: labels.instructions },
      }}
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
          <Column
            key={column.id}
            column={column}
            cards={byColumn(column.id)}
            renderCard={renderCard}
            emptyLabel={labels.emptyColumn}
            cardRole={labels.cardRole}
          />
        ))}
      </div>
      <DragOverlay>
        {active ? (
          <div className="flex items-start gap-2 rounded-lg border bg-card p-3 shadow-lg">
            <GripVertical
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">{renderCard(active)}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
