import type { CaseExitStage, CaseStage, CaseStatus } from '@medtravel/contracts';
import { Badge, type BadgeProps } from './badge';

type Tone = NonNullable<BadgeProps['variant']>;

/** Colour group for each status, so a status looks the same in every list and report. */
const TONES: Record<CaseStatus, Tone> = {
  new: 'info',
  qualifying: 'info',
  in_medical_review: 'default',
  awaiting_opinions: 'default',
  quote_sent: 'default',
  won: 'success',
  visa_in_process: 'secondary',
  travel_booked: 'secondary',
  arrived: 'secondary',
  in_treatment: 'secondary',
  discharged: 'success',
  returned_home: 'success',
  follow_up: 'info',
  closed: 'muted',
  lost: 'destructive',
  on_hold: 'warning',
  cancelled: 'destructive',
};

const STAGE_TONES: Record<CaseStage | CaseExitStage, Tone> = {
  enquiry: 'info',
  qualification: 'info',
  medical_review: 'default',
  hospital_opinions: 'default',
  quote_decision: 'default',
  booking_deposit: 'success',
  visa: 'secondary',
  travel_planning: 'secondary',
  arrival: 'secondary',
  treatment: 'secondary',
  discharge_return: 'success',
  follow_up: 'info',
  lost: 'destructive',
  on_hold: 'warning',
  cancelled: 'destructive',
};

export interface StatusBadgeProps extends Omit<BadgeProps, 'variant' | 'children'> {
  /** A case status, or a stage / exit stage identifier. */
  status: CaseStatus | CaseStage | CaseExitStage;
  /** Already translated by the caller; the badge never invents text. */
  label: string;
}

export function StatusBadge({ status, label, ...props }: StatusBadgeProps) {
  const tone =
    (TONES as Record<string, Tone>)[status] ??
    (STAGE_TONES as Record<string, Tone>)[status] ??
    'muted';
  return (
    <Badge variant={tone} data-status={status} {...props}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </Badge>
  );
}
