'use client';

import { CASE_STAGES, type CaseStage } from '@medtravel/contracts';
import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';

export interface StageTrackerLabels {
  /** Heading read by screen readers, e.g. "Case progress". */
  title: string;
  /** Per stage, translated. */
  stages: Record<CaseStage, string>;
  /** Spoken after each stage name, e.g. "completed", "current stage", "upcoming". */
  done: string;
  current: string;
  upcoming: string;
}

export interface StageTrackerProps {
  current: CaseStage;
  labels: StageTrackerLabels;
  /**
   * `responsive` (default) is vertical on phones and horizontal from the `md` breakpoint, because
   * twelve stages cannot fit across a 360 px screen.
   */
  orientation?: 'horizontal' | 'vertical' | 'responsive';
  className?: string;
}

/** Twelve-stage progress for a case. Position in the sequence is conveyed in text, not colour alone. */
export function StageTracker({
  current,
  labels,
  orientation = 'responsive',
  className,
}: StageTrackerProps) {
  const currentIndex = CASE_STAGES.indexOf(current);
  const horizontal = orientation === 'horizontal';
  const vertical = orientation === 'vertical';
  const listRef = useRef<HTMLOListElement>(null);
  const [scrolls, setScrolls] = useState(false);

  // A scrolling region must be reachable with the keyboard, but a list that fits (a phone's vertical
  // layout, a wide screen) should not add a pointless tab stop.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => setScrolls(list.scrollWidth > list.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label={labels.title} className={className}>
      <ol
        ref={listRef}
        tabIndex={scrolls ? 0 : undefined}
        className={cn(
          'flex gap-0',
          vertical && 'flex-col',
          horizontal && 'flex-row overflow-x-auto pb-2',
          orientation === 'responsive' && 'flex-col md:flex-row md:overflow-x-auto md:pb-2',
        )}
      >
        {CASE_STAGES.map((stage, index) => {
          const state =
            index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming';
          const last = index === CASE_STAGES.length - 1;
          return (
            <li
              key={stage}
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
              className={cn(
                'relative flex gap-3',
                vertical && 'pb-5 last:pb-0',
                horizontal && 'min-w-28 flex-1 flex-col items-start',
                orientation === 'responsive' &&
                  'pb-5 last:pb-0 md:min-w-28 md:flex-1 md:flex-col md:items-start md:pb-0',
              )}
            >
              <div
                className={cn(
                  'flex items-center',
                  (horizontal || orientation === 'responsive') && 'md:w-full',
                )}
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold',
                    state === 'done' && 'border-primary bg-primary text-primary-foreground',
                    state === 'current' &&
                      'border-primary bg-background text-primary ring-4 ring-primary/20',
                    state === 'upcoming' && 'border-border bg-background text-muted-foreground',
                  )}
                  aria-hidden="true"
                >
                  {state === 'done' ? <Check className="size-4" /> : index + 1}
                </span>
                {!last ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'hidden h-0.5 flex-1',
                      index < currentIndex ? 'bg-primary' : 'bg-border',
                      (horizontal || orientation === 'responsive') && 'md:block',
                    )}
                  />
                ) : null}
              </div>
              {!last && !horizontal ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute start-3.5 top-7 bottom-0 w-0.5 -translate-x-1/2 rtl:translate-x-1/2',
                    index < currentIndex ? 'bg-primary' : 'bg-border',
                    orientation === 'responsive' && 'md:hidden',
                  )}
                />
              ) : null}
              <div
                className={cn(
                  'min-w-0',
                  horizontal && 'pe-2',
                  orientation === 'responsive' && 'md:pe-2',
                )}
              >
                <p
                  className={cn(
                    'text-sm',
                    state === 'current' ? 'font-semibold' : 'font-medium text-muted-foreground',
                  )}
                >
                  {labels.stages[stage]}
                </p>
                <p className="sr-only">{labels[state]}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
