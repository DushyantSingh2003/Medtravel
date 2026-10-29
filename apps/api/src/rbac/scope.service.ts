import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@medtravel/db';
import { scopeOf, type PermissionSubject } from '@medtravel/contracts';
import type { Actor } from '../auth/actor.js';
import { PRISMA } from '../database/database.module.js';

const DAY_MS = 86_400_000;
/** Ground coordinators see cases whose planned arrival is this close to today, in either direction. */
export const ARRIVAL_WINDOW_DAYS = 30;

/** Matches nothing: the answer for a role with no access, so a forgotten check returns an empty list, never everything. */
const NOTHING = { id: { in: [] } } satisfies Prisma.CaseWhereInput;

/** The records a user is linked to, loaded once per call. */
interface Links {
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
        staffProfile: { select: { isManager: true, cityId: true, managerId: true } },
        hospitalStaffs: {
          where: { deletedAt: null },
          select: { hospitalId: true, doctorId: true },
        },
        agentUser: { where: { deletedAt: null }, select: { agentId: true } },
      },
    });
    return {
      staff: user?.staffProfile ?? null,
      hospitalIds: user?.hospitalStaffs.map((link) => link.hospitalId) ?? [],
      doctorIds:
        user?.hospitalStaffs.flatMap((link) => (link.doctorId ? [link.doctorId] : [])) ?? [],
      agentId: user?.agentUser?.agentId ?? null,
    };
  }

  /** Cases sent to a hospital: an opinion request that has left draft. */
  private sentTo(hospitalIds: string[]): Prisma.CaseWhereInput {
    return {
      opinionRequests: {
        some: { hospitalId: { in: hospitalIds }, status: { not: 'draft' }, deletedAt: null },
      },
    };
  }

  /** The cases the actor may see, as a filter to AND with the module's own. */
  async caseWhere(actor: Actor): Promise<Prisma.CaseWhereInput> {
    const base: Prisma.CaseWhereInput = { deletedAt: null };
    if (!scopeOf(actor.role, 'Case')) return NOTHING;
    const links = await this.linksOf(actor.userId);

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
        return { patient: { userId: actor.userId } };
      case 'attendant':
        return {
          caseAttendants: {
            some: { deletedAt: null, attendant: { userId: actor.userId, deletedAt: null } },
          },
        };
      case 'agent':
        return links.agentId ? { agentId: links.agentId } : NOTHING;
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
          bookings: {
            some: { deletedAt: null, interpreter: { userId: actor.userId } },
          },
        };
      case 'medical_reviewer':
        return {
          OR: [{ reviewerId: actor.userId }, { reviewerId: null, stage: 'medical_review' }],
        };
      case 'hospital_desk':
        return links.hospitalIds.length ? this.sentTo(links.hospitalIds) : NOTHING;
      case 'doctor':
        return links.doctorIds.length
          ? {
              opinionRequests: {
                some: {
                  doctorId: { in: links.doctorIds },
                  status: { not: 'draft' },
                  deletedAt: null,
                },
              },
            }
          : NOTHING;
      case 'finance':
      case 'super_admin':
        return {};
    }
  }

  /** The documents the actor may see. Agents never get any; hospital users get only what a live consent shared with them. */
  async documentWhere(actor: Actor): Promise<Prisma.DocumentWhereInput> {
    const nothing: Prisma.DocumentWhereInput = { id: { in: [] } };
    if (!scopeOf(actor.role, 'Document')) return nothing;
    const base: Prisma.DocumentWhereInput = { deletedAt: null };
    const caseScope = await this.caseWhere(actor);
    const links = await this.linksOf(actor.userId);

    switch (actor.role) {
      case 'patient':
        return {
          AND: [base, { OR: [{ patient: { userId: actor.userId } }, { case: caseScope }] }],
        };
      case 'attendant':
        return { AND: [base, { uploadedById: actor.userId, case: caseScope }] };
      case 'hospital_desk':
      case 'doctor':
        return links.hospitalIds.length
          ? {
              AND: [
                base,
                { case: caseScope },
                {
                  shares: {
                    some: {
                      hospitalId: { in: links.hospitalIds },
                      revokedAt: null,
                      deletedAt: null,
                      consent: { withdrawnAt: null, deletedAt: null },
                    },
                  },
                },
              ],
            }
          : nothing;
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
