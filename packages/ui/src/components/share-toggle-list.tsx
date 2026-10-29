import { cn } from '../lib/cn';
import { Switch } from './switch';

export interface ShareTarget {
  id: string;
  name: string;
  shared: boolean;
}

export interface ShareToggleListLabels {
  listLabel: string;
  /** Spoken name of one switch: "Share with Hospital A". */
  toggle: (name: string) => string;
  shared: string;
  notShared: string;
  /** Shown when there is no hospital to share with yet. */
  empty: string;
}

export interface ShareToggleListProps {
  targets: ShareTarget[];
  labels: ShareToggleListLabels;
  onToggle: (id: string, shared: boolean) => void;
  /** The hospital a change is being saved for; its switch is disabled meanwhile. */
  busyId?: string | null;
  disabled?: boolean;
  className?: string;
}

/** One switch per hospital: whether the patient lets that hospital see a document. Turning one on is their consent. */
export function ShareToggleList({
  targets,
  labels,
  onToggle,
  busyId = null,
  disabled,
  className,
}: ShareToggleListProps) {
  if (targets.length === 0) return <p className="text-sm text-muted-foreground">{labels.empty}</p>;
  return (
    <ul
      data-slot="share-toggle-list"
      aria-label={labels.listLabel}
      className={cn('divide-y rounded-xl border', className)}
    >
      {targets.map((target) => (
        <li key={target.id} className="flex items-center justify-between gap-3 p-3">
          <span className="min-w-0">
            <span className="block truncate font-medium">
              <bdi>{target.name}</bdi>
            </span>
            <span className="text-sm text-muted-foreground">
              {target.shared ? labels.shared : labels.notShared}
            </span>
          </span>
          <Switch
            checked={target.shared}
            disabled={disabled || busyId === target.id}
            aria-label={labels.toggle(target.name)}
            onCheckedChange={(next) => onToggle(target.id, next)}
          />
        </li>
      ))}
    </ul>
  );
}
