import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@medtravel/db';
import { scopeOf, type PermissionSubject } from '@medtravel/contracts';
import type { Actor } from '../auth/actor.js';
import { PRISMA } from '../database/database.module.js';

const DAY_MS = 86_400_000;
/** Ground coordinators see cases whose planned arrival is this close to today, in either direction. */
export const ARRIVAL_WINDOW_DAYS = 30;

/** An opinion request in one of these states gives its hospital access to the case (not draft, declined, expired or cancelled). */
const LIVE_REQUEST_STATUSES = ['sent', 'viewed', 'accepted', 'answered'] as const;

/** Matches nothing: the answer for a role with no access, so a forgotten check returns an empty list, never everything. */
const NOTHING = { id: { in: [] } } satisfies Prisma.CaseWhereInput;

/** The records a user is linked to, loaded once per call. */
interface Links {
  active: boolean;
  staff: { isManager: boolean; cityId: string | null; managerId: string | null } | null;
  hospitalIds: string[];
  doctorIds: string[];
  agentId: string | null;
}

/**
 * Data scoping in one place (CLAUDE.md: "Data scoping by role lives ONLY in the rbac module"). The permission matrix in
 * `@medtravel/contracts` says which scope a role has for a subject; this turns the scope into a Prisma filter. Modules
 * combine the filter with their own (`where: { AND: [scope, filters] }`) and never write a role check of their own.
 */
@Injectable()
export class ScopeService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  private async linksOf(userId: string): Promise<Links> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        deletedAt: true,
        staffProfile: {
          select: { isManager: true, cityId: true, managerId: true, deletedAt: true },
        },
        hospitalStaffs: {
          where: { deletedAt: null },
          select: { hospitalId: true, doctorId: true },
        },
        agentUser: { where: { deletedAt: null }, select: { agentId: true } },
      },
    });
    const staff = user?.staffProfile && !user.staffProfile.deletedAt ? user.staffProfile : null;
    return {
      active: user?.status === 'active' && !user.deletedAt,
      staff,
      hospitalIds: user?.hospitalStaffs.map((link) => link.hospitalId) ?? [],
      doctorIds:
        user?.hospitalStaffs.flatMap((link) => (link.doctorId ? [link.doctorId] : [])) ?? [],
      agentId: user?.agentUser?.agentId ?? null,
    };
  }

  /**
   * Cases sent to a hospital: an opinion request that is live (sent, viewed, accepted or answered, not a draft, declined,
   * expired or cancelled) and whose consent has not been withdrawn.
   */
  private sentTo(hospitalIds: string[], doctorIds?: string[]): Prisma.CaseWhereInput {
    return {
      opinionRequests: {
        some: {
          ...(doctorIds ? { doctorId: { in: doctorIds } } : { hospitalId: { in: hospitalIds } }),
          status: { in: [...LIVE_REQUEST_STATUSES] },
          deletedAt: null,
          consent: { is: { withdrawnAt: null, deletedAt: null } },
        },
      },
    };
  }

  /** The cases the actor may see, as a filter to AND with the module's own. */
  async caseWhere(actor: Actor): Promise<Prisma.CaseWhereInput> {
    return this.caseWhereWith(actor, await this.linksOf(actor.userId));
  }

  private caseWhereWith(actor: Actor, links: Links): Prisma.CaseWhereInput {
    const base: Prisma.CaseWhereInput = { deletedAt: null };
    if (!scopeOf(actor.role, 'Case') || !links.active) return NOTHING;

    // A magic link opens one case, for the hospital that sent it, whatever the role says.
    if (actor.scopeCaseId) {
      return links.hospitalIds.length === 0
        ? NOTHING
        : { AND: [base, { id: actor.scopeCaseId }, this.sentTo(links.hospitalIds)] };
    }
    return { AND: [base, this.byRole(actor, links)] };
  }

  private byRole(actor: Actor, links: Links): Prisma.CaseWhereInput {
    switch (actor.role) {
      case 'patient':
        return { patient: { userId: actor.userId, deletedAt: null } };
      case 'attendant':
        return {
          caseAttendants: {
            some: {
              deletedAt: null,
              attendant: { userId: actor.userId, deletedAt: null, anonymizedAt: null },
            },
          },
        };
      case 'agent':
        // Only referrals whose patient agreed to share the stage with this agency, and has not withdrawn it.
        return links.agentId
          ? {
              agentId: links.agentId,
              consents: {
                some: {
                  type: 'share_stage_with_agent',
                  agentId: links.agentId,
                  withdrawnAt: null,
                  deletedAt: null,
                },
              },
            }
          : NOTHING;
      case 'case_manager': {
        if (!links.staff) return { ownerId: actor.userId };
        if (links.staff.isManager) return {};
        return links.staff.managerId
          ? {
              OR: [
                { ownerId: actor.userId },
                { owner: { staffProfile: { managerId: links.staff.managerId } } },
              ],
            }
          : { ownerId: actor.userId };
      }
      case 'ground_coordinator': {
        const cityId = links.staff?.cityId;
        if (!cityId) return NOTHING;
        const now = Date.now();
        return {
          AND: [
            { OR: [{ hospital: { cityId } }, { hospitalId: null, preferredCityId: cityId }] },
            {
              plannedArrivalAt: {
                gte: new Date(now - ARRIVAL_WINDOW_DAYS * DAY_MS),
                lte: new Date(now + ARRIVAL_WINDOW_DAYS * DAY_MS),
              },
            },
          ],
        };
      }
      case 'interpreter':
        return {
          // An assignment that was cancelled or finished no longer opens the case.
          bookings: {
            some: {
              deletedAt: null,
              status: { notIn: ['cancelled', 'completed'] },
              interpreter: { userId: actor.userId, deletedAt: null },
            },
          },
        };
      case 'medical_reviewer':
        return {
          OR: [{ reviewerId: actor.userId }, { reviewerId: null, stage: 'medical_review' }],
        };
      case 'hospital_desk':
        return links.hospitalIds.length ? this.sentTo(links.hospitalIds) : NOTHING;
      case 'doctor':
        return links.doctorIds.length ? this.sentTo(links.hospitalIds, links.doctorIds) : NOTHING;
      case 'finance':
      case 'super_admin':
        return {};
    }
  }

  /**
   * The documents the actor may see. Agents never get any. Patients and attendants never see staff-internal files. Hospital
   * users get what a live consent shared with their hospital and the virus scan passed, plus what their own hospital
   * uploaded, always within the cases they may see.
   */
  async documentWhere(actor: Actor): Promise<Prisma.DocumentWhereInput> {
    const nothing: Prisma.DocumentWhereInput = { id: { in: [] } };
    if (!scopeOf(actor.role, 'Document')) return nothing;
    const links = await this.linksOf(actor.userId);
    const base: Prisma.DocumentWhereInput = { deletedAt: null };
    const caseScope = this.caseWhereWith(actor, links);

    switch (actor.role) {
      case 'patient':
        return {
          AND: [
            base,
            { visibility: 'private' },
            { OR: [{ patient: { userId: actor.userId, deletedAt: null } }, { case: caseScope }] },
          ],
        };
      case 'attendant':
        return {
          AND: [base, { visibility: 'private', uploadedById: actor.userId, case: caseScope }],
        };
      case 'hospital_desk':
      case 'doctor': {
        if (!links.hospitalIds.length) return nothing;
        const shared: Prisma.DocumentWhereInput = {
          scanStatus: 'clean',
          visibility: 'private',
          shares: {
            some: {
              hospitalId: { in: links.hospitalIds },
              revokedAt: null,
              deletedAt: null,
              consent: {
                type: 'share_medical_with_hospital',
                withdrawnAt: null,
                deletedAt: null,
              },
            },
          },
        };
        // The desk also reads what its own hospital uploaded (visa letters, discharge summaries, bills).
        const own: Prisma.DocumentWhereInput = {
          hospitalId: { in: links.hospitalIds },
          visibility: 'private',
        };
        return {
          AND: [
            base,
            { case: caseScope },
            { OR: actor.role === 'hospital_desk' ? [shared, own] : [shared] },
          ],
        };
      }
      case 'case_manager':
      case 'medical_reviewer':
        return { AND: [base, { case: caseScope }] };
      case 'super_admin':
        return base;
      default:
        return nothing;
    }
  }

  /** The patient files the actor may see: their own, or those of the cases they may see. */
  async patientWhere(actor: Actor): Promise<Prisma.PatientWhereInput> {
    const nothing: Prisma.PatientWhereInput = { id: { in: [] } };
    const scope = scopeOf(actor.role, 'Patient');
    if (!scope) return nothing;
    const base: Prisma.PatientWhereInput = { deletedAt: null };
    if (scope === 'own') return { AND: [base, { userId: actor.userId }] };
    if (scope === 'all' && !actor.scopeCaseId) return base;
    return { AND: [base, { cases: { some: await this.caseWhere(actor) } }] };
  }

  /** Whether the actor may act on this subject at all for the case; use before loading anything from a case's children. */
  async assertCaseAccess(
    actor: Actor,
    caseId: string,
    subject: PermissionSubject = 'Case',
  ): Promise<void> {
    if (!scopeOf(actor.role, subject)) throw new NotFoundException('Case not found');
    const found = await this.prisma.case.findFirst({
      where: { AND: [{ id: caseId }, await this.caseWhere(actor)] },
      select: { id: true },
    });
    // A case outside the actor's scope looks exactly like one that does not exist.
    if (!found) throw new NotFoundException('Case not found');
  }
}
