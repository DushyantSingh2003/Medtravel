import type { Prisma } from '@medtravel/db';
import {
  canMoveCase,
  isCaseStaff,
  describeTransition,
  CASE_TARGETS,
  pickReadable,
  type CaseStage,
  type CaseState,
  type CaseTarget,
  type CaseView,
  type Role,
} from '@medtravel/contracts';

export const CASE_SELECT = {
  id: true,
  caseNo: true,
  stage: true,
  status: true,
  stageEnteredAt: true,
  urgency: true,
  plannedArrivalAt: true,
  plannedDepartureAt: true,
  preferredCityId: true,
  countryCode: true,
  preferredLanguage: true,
  treatmentId: true,
  budgetMinor: true,
  budgetCurrency: true,
  ownerId: true,
  reviewerId: true,
  hospitalId: true,
  source: true,
  campaign: true,
  agentId: true,
  lostReasonId: true,
  slaDueAt: true,
  slaBreachedAt: true,
  closedAt: true,
  createdAt: true,
  patientId: true,
  patient: { select: { fullName: true } },
} satisfies Prisma.CaseSelect;

export type CaseRow = Prisma.CaseGetPayload<{ select: typeof CASE_SELECT }>;

const iso = (date: Date | null | undefined): string | null => date?.toISOString() ?? null;

/** Moves the caller's role may try from a state (the data a move needs is checked when it is made). */
export function nextTargetsOf(
  role: Role,
  from: CaseState,
  resumeStage: CaseStage | null,
  ownerRole?: Role,
): CaseTarget[] {
  return CASE_TARGETS.filter(
    (target) =>
      describeTransition(from, target, resumeStage).allowed &&
      canMoveCase(role, from, target, ownerRole),
  );
}

/**
 * A case as the role may read it: the fields of its field groups (`FIELD_GROUPS.Case`), always with the id and creation
 * time. The stage group also carries the timer dates.
 */
export function toCaseView(row: CaseRow, role: Role, nextTargets?: CaseTarget[]): CaseView {
  const record = {
    caseNo: row.caseNo,
    patientName: row.patient.fullName,
    stage: row.stage,
    status: row.status,
    stageEnteredAt: row.stageEnteredAt.toISOString(),
    urgency: row.urgency,
    plannedArrivalAt: iso(row.plannedArrivalAt),
    plannedDepartureAt: iso(row.plannedDepartureAt),
    preferredCityId: row.preferredCityId,
    countryCode: row.countryCode,
    preferredLanguage: row.preferredLanguage,
    treatmentId: row.treatmentId,
    budgetMinor: row.budgetMinor,
    budgetCurrency: row.budgetCurrency,
    ownerId: row.ownerId,
    reviewerId: row.reviewerId,
    hospitalId: row.hospitalId,
    source: row.source,
    campaign: row.campaign,
    agentId: row.agentId,
    lostReasonId: row.lostReasonId,
  };
  const visible = pickReadable(role, 'Case', record);
  const { budgetMinor, budgetCurrency, ...rest } = visible;
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    ...rest,
    ...('caseNo' in visible && role !== 'agent' ? { patientId: row.patientId } : {}),
    ...(budgetMinor !== undefined && budgetMinor !== null && budgetCurrency
      ? { budget: { amountMinor: Number(budgetMinor), currency: budgetCurrency } }
      : 'budgetMinor' in visible
        ? { budget: null }
        : {}),
    ...('stage' in visible && isCaseStaff(role)
      ? {
          slaDueAt: iso(row.slaDueAt),
          slaBreachedAt: iso(row.slaBreachedAt),
          closedAt: iso(row.closedAt),
        }
      : {}),
    ...(nextTargets ? { nextTargets } : {}),
  } as CaseView;
}
