import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type PrismaClient } from '@medtravel/db';
import {
  STAFF_ROLES,
  type CreateLeave,
  type CursorPage,
  type LoginHistoryItem,
  type Role,
  type UpdateUser,
  type UserDetail,
  type UserListQuery,
  type UserRow,
  type WorkingHours,
} from '@medtravel/contracts';
import type { Actor } from '../../auth/actor.js';
import { AuditService } from '../../audit/audit.service.js';
import { SessionService } from '../../auth/session.service.js';
import { ImpersonationService } from '../../auth/impersonation.service.js';
import { readPage } from '../../common/cursor.js';
import type { RequestContext } from '../../common/request-context.js';
import { PRISMA, type Db } from '../../database/database.module.js';
import { OutboxService } from '../../outbox/outbox.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { TeamsService } from './teams.service.js';

/** The accounts an admin manages here: staff and hospital users. Patients, attendants and agencies have their own screens. */
const MANAGED_ROLES: Role[] = [...STAFF_ROLES, 'hospital_desk', 'doctor'];

const fieldError = (path: string, message: string, status = HttpStatus.UNPROCESSABLE_ENTITY) =>
  new HttpException({ statusCode: status, message, errors: [{ path: [path], message }] }, status);

const today = (): Date => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
const dateText = (d: Date): string => d.toISOString().slice(0, 10);

const ROW_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  twoFactorEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  staffProfile: { select: { teamId: true, cityId: true, team: { select: { name: true } } } },
} satisfies Prisma.UserSelect;

type Row = Prisma.UserGetPayload<{ select: typeof ROW_SELECT }>;

@Injectable()
export class UsersService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly sessions: SessionService,
    private readonly realtime: RealtimeService,
    private readonly impersonation: ImpersonationService,
    private readonly teams: TeamsService,
  ) {}

  private row(row: Row, onLeave: boolean): UserRow {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      status: row.status,
      twoFactorEnabled: row.twoFactorEnabled,
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      teamId: row.staffProfile?.teamId ?? null,
      teamName: row.staffProfile?.team?.name ?? null,
      cityId: row.staffProfile?.cityId ?? null,
      onLeave,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Which of these people are away today. One query for the page, not one per person. */
  private async awayToday(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const day = today();
    const rows = await this.prisma.staffLeave.findMany({
      where: { userId: { in: ids }, deletedAt: null, startsOn: { lte: day }, endsOn: { gte: day } },
      select: { userId: true },
    });
    return new Set(rows.map((r) => r.userId));
  }

  async list(query: UserListQuery): Promise<CursorPage<UserRow>> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      role: query.role ? query.role : { in: MANAGED_ROLES },
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.teamId || query.cityId
        ? {
            staffProfile: {
              is: {
                ...(query.teamId ? { teamId: query.teamId } : {}),
                ...(query.cityId ? { cityId: query.cityId } : {}),
              },
            },
          }
        : {}),
    };
    if (query.role && !MANAGED_ROLES.includes(query.role))
      return { items: [], nextCursor: null, total: 0 };
    const { rows, nextCursor, total } = await readPage<Row>({
      limit: query.limit,
      cursor: query.cursor,
      keyOf: (r) => r.id,
      find: ({ take, skip, cursorKey }) =>
        this.prisma.user.findMany({
          where,
          select: ROW_SELECT,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          take,
          ...(cursorKey ? { cursor: { id: cursorKey }, skip: skip ?? 1 } : {}),
        }),
      count: () => this.prisma.user.count({ where }),
    });
    const away = await this.awayToday(rows.map((r) => r.id));
    return { items: rows.map((r) => this.row(r, away.has(r.id))), nextCursor, total };
  }

  private async load(db: Db, id: string) {
    const user = await db.user.findFirst({
      where: { id, deletedAt: null, role: { in: MANAGED_ROLES } },
      select: {
        ...ROW_SELECT,
        phone: true,
        language: true,
        timezone: true,
        staffProfile: {
          select: {
            teamId: true,
            cityId: true,
            team: { select: { name: true } },
            title: true,
            languages: true,
            managerId: true,
            assignable: true,
            maxOpenCases: true,
            workingHours: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async get(id: string): Promise<UserDetail> {
    const user = await this.load(this.prisma, id);
    const day = today();
    const leaves = await this.prisma.staffLeave.findMany({
      where: { userId: id, deletedAt: null, endsOn: { gte: day } },
      orderBy: { startsOn: 'asc' },
      take: 50,
    });
    const profile = user.staffProfile;
    const onLeave = leaves.some((l) => l.startsOn <= day && l.endsOn >= day);
    return {
      ...this.row(user, onLeave),
      phone: user.phone,
      language: user.language,
      timezone: user.timezone,
      title: profile?.title ?? null,
      languages: profile?.languages ?? [],
      managerId: profile?.managerId ?? null,
      assignable: profile?.assignable ?? true,
      maxOpenCases: profile?.maxOpenCases ?? null,
      workingHours: (profile?.workingHours as WorkingHours | null) ?? null,
      leaves: leaves.map((l) => ({
        id: l.id,
        startsOn: dateText(l.startsOn),
        endsOn: dateText(l.endsOn),
        note: l.note,
      })),
      hasStaffProfile: profile !== null,
    };
  }

  /** The number of active super admins other than `exceptId`: the last one cannot be demoted, deactivated or locked out. */
  private async otherActiveAdmins(db: Db, exceptId: string): Promise<number> {
    // Counted one transaction at a time: two admins deactivating each other at once must not both see the other as still there.
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('last-super-admin'))`;
    return db.user.count({
      where: { role: 'super_admin', status: 'active', deletedAt: null, id: { not: exceptId } },
    });
  }

  async update(
    actor: Actor,
    id: string,
    input: UpdateUser,
    context: RequestContext,
  ): Promise<UserDetail> {
    await this.prisma.$transaction(async (tx) => {
      const user = await this.load(tx, id);
      const isStaff = (STAFF_ROLES as readonly Role[]).includes(user.role);

      if (input.role && input.role !== user.role) {
        if (!isStaff)
          throw fieldError('role', 'The role of hospital users is managed with the hospital');
        if (id === actor.userId)
          throw fieldError('role', 'You cannot change your own role', HttpStatus.FORBIDDEN);
        if (user.role === 'super_admin' && (await this.otherActiveAdmins(tx, id)) === 0)
          throw fieldError(
            'role',
            'There must be at least one active super admin',
            HttpStatus.CONFLICT,
          );
      }
      const wantsStaffFields = [
        'title',
        'languages',
        'cityId',
        'teamId',
        'assignable',
        'maxOpenCases',
        'workingHours',
      ].some((key) => (input as Record<string, unknown>)[key] !== undefined);
      if (wantsStaffFields && !(isStaff || (input.role && STAFF_ROLES.includes(input.role))))
        throw fieldError('role', 'Only staff have these settings');

      if (input.cityId) {
        const city = await tx.city.findFirst({
          where: { id: input.cityId, deletedAt: null },
          select: { id: true },
        });
        if (!city) throw fieldError('cityId', 'Choose one of the listed cities');
      }
      let team: { id: string; managerId: string | null } | null | undefined;
      if (input.teamId) {
        team = await tx.team.findFirst({
          where: { id: input.teamId, deletedAt: null },
          select: { id: true, managerId: true },
        });
        if (!team) throw fieldError('teamId', 'Choose one of the listed teams');
      } else if (input.teamId === null) team = null;

      const before = {
        name: user.name,
        role: user.role,
        title: user.staffProfile?.title ?? null,
        languages: user.staffProfile?.languages ?? [],
        cityId: user.staffProfile?.cityId ?? null,
        teamId: user.staffProfile?.teamId ?? null,
        assignable: user.staffProfile?.assignable ?? true,
        maxOpenCases: user.staffProfile?.maxOpenCases ?? null,
        timezone: user.timezone,
      };

      await tx.user.update({
        where: { id },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.role ? { role: input.role } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        },
      });
      // Someone who stops being a case manager stops leading teams: the manager flag is not carried over to a later return.
      if (input.role && input.role !== user.role && user.role === 'case_manager') {
        await tx.team.updateMany({ where: { managerId: id }, data: { managerId: null } });
        await tx.staffProfile.updateMany({ where: { managerId: id }, data: { managerId: null } });
        await tx.staffProfile.updateMany({ where: { userId: id }, data: { isManager: false } });
      }
      const profileData: Prisma.StaffProfileUncheckedUpdateInput = {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.languages ? { languages: input.languages } : {}),
        ...(input.cityId !== undefined ? { cityId: input.cityId } : {}),
        ...(input.assignable !== undefined ? { assignable: input.assignable } : {}),
        ...(input.maxOpenCases !== undefined ? { maxOpenCases: input.maxOpenCases } : {}),
        ...(input.workingHours !== undefined
          ? {
              workingHours:
                input.workingHours === null
                  ? Prisma.JsonNull
                  : (input.workingHours as unknown as Prisma.InputJsonValue),
            }
          : {}),
        ...(team !== undefined
          ? {
              teamId: team?.id ?? null,
              managerId: team && team.managerId !== id ? team.managerId : null,
            }
          : {}),
      };
      if (wantsStaffFields || input.role) {
        await tx.staffProfile.upsert({
          where: { userId: id },
          update: profileData,
          create: { ...(profileData as Prisma.StaffProfileUncheckedCreateInput), userId: id },
        });
      }
      const after = {
        name: input.name ?? before.name,
        role: input.role ?? before.role,
        title: input.title !== undefined ? input.title : before.title,
        languages: input.languages ?? before.languages,
        cityId: input.cityId !== undefined ? input.cityId : before.cityId,
        teamId: team !== undefined ? (team?.id ?? null) : before.teamId,
        assignable: input.assignable ?? before.assignable,
        maxOpenCases: input.maxOpenCases !== undefined ? input.maxOpenCases : before.maxOpenCases,
        timezone: input.timezone !== undefined ? input.timezone : before.timezone,
        ...(input.workingHours !== undefined ? { workingHoursChanged: true } : {}),
      };
      await this.audit.record(tx, context, {
        action: 'user.updated',
        entityType: 'User',
        entityId: id,
        before,
        after,
      });
      if (input.role && input.role !== user.role)
        await this.outbox.publish(tx, {
          type: 'user.role_changed',
          aggregateType: 'User',
          aggregateId: id,
          payload: { userId: id, from: user.role, to: input.role },
        });
    });
    return this.get(id);
  }

  // ---- leave ------------------------------------------------------------------------------------------------
  async addLeave(id: string, input: CreateLeave, context: RequestContext): Promise<UserDetail> {
    await this.prisma.$transaction(async (tx) => {
      await this.load(tx, id);
      const startsOn = new Date(`${input.startsOn}T00:00:00.000Z`);
      const endsOn = new Date(`${input.endsOn}T00:00:00.000Z`);
      const clash = await tx.staffLeave.findFirst({
        where: {
          userId: id,
          deletedAt: null,
          startsOn: { lte: endsOn },
          endsOn: { gte: startsOn },
        },
        select: { id: true },
      });
      if (clash)
        throw fieldError(
          'startsOn',
          'This overlaps leave that is already recorded',
          HttpStatus.CONFLICT,
        );
      const created = await tx.staffLeave.create({
        data: { userId: id, startsOn, endsOn, note: input.note ?? null },
      });
      await this.audit.record(tx, context, {
        action: 'user.leave_added',
        entityType: 'User',
        entityId: id,
        after: { leaveId: created.id, startsOn: input.startsOn, endsOn: input.endsOn },
      });
    });
    return this.get(id);
  }

  async removeLeave(id: string, leaveId: string, context: RequestContext): Promise<UserDetail> {
    await this.prisma.$transaction(async (tx) => {
      const leave = await tx.staffLeave.findFirst({
        where: { id: leaveId, userId: id, deletedAt: null },
      });
      if (!leave) throw new NotFoundException('Leave not found');
      await tx.staffLeave.update({ where: { id: leaveId }, data: { deletedAt: new Date() } });
      await this.audit.record(tx, context, {
        action: 'user.leave_removed',
        entityType: 'User',
        entityId: id,
        before: { leaveId, startsOn: dateText(leave.startsOn), endsOn: dateText(leave.endsOn) },
      });
    });
    return this.get(id);
  }

  // ---- access -----------------------------------------------------------------------------------------------
  /**
   * Ends a person's access now: status, every session, pending sign-in challenges and the teams they led, all in one transaction;
   * then their live connections are closed. Their very next HTTP request fails because the guard checks the status each time.
   */
  async deactivate(actor: Actor, id: string, context: RequestContext): Promise<UserDetail> {
    await this.prisma.$transaction(async (tx) => {
      const user = await this.load(tx, id);
      if (id === actor.userId)
        throw fieldError('id', 'You cannot deactivate yourself', HttpStatus.FORBIDDEN);
      if (user.status === 'deactivated')
        throw new ConflictException('This account is already deactivated');
      if (user.role === 'super_admin' && (await this.otherActiveAdmins(tx, id)) === 0)
        throw fieldError(
          'id',
          'There must be at least one active super admin',
          HttpStatus.CONFLICT,
        );
      await tx.user.update({ where: { id }, data: { status: 'deactivated' } });
      await this.sessions.revokeAll(tx, id);
      await tx.authChallenge.deleteMany({ where: { userId: id } });
      // The people this person led lose that manager; the teams stay, to be given a new one.
      const led = await tx.team.findMany({
        where: { managerId: id, deletedAt: null },
        select: { id: true },
      });
      await tx.team.updateMany({ where: { managerId: id }, data: { managerId: null } });
      await tx.staffProfile.updateMany({ where: { managerId: id }, data: { managerId: null } });
      await tx.staffProfile.updateMany({
        where: { userId: id },
        data: { isManager: false, assignable: false },
      });
      await this.audit.record(tx, context, {
        action: 'user.deactivated',
        entityType: 'User',
        entityId: id,
        before: { status: user.status },
        after: { status: 'deactivated', teamsUnled: led.length },
      });
      await this.outbox.publish(tx, {
        type: 'user.deactivated',
        aggregateType: 'User',
        aggregateId: id,
        payload: { userId: id },
      });
    });
    await this.realtime.signOutEverywhere(id, 'deactivated');
    return this.get(id);
  }

  async reactivate(id: string, context: RequestContext): Promise<UserDetail> {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id, deletedAt: null, role: { in: MANAGED_ROLES } },
        select: { status: true, passwordHash: true },
      });
      if (!user) throw new NotFoundException('User not found');
      if (user.status !== 'deactivated' && user.status !== 'suspended')
        throw new ConflictException('This account is not deactivated');
      // Someone who never set a password goes back to "invited": they still have to accept an invitation.
      const status = user.passwordHash ? 'active' : 'invited';
      await tx.user.update({
        where: { id },
        data: { status, failedLoginCount: 0, lockedUntil: null },
      });
      await this.audit.record(tx, context, {
        action: 'user.reactivated',
        entityType: 'User',
        entityId: id,
        before: { status: user.status },
        after: { status },
      });
    });
    return this.get(id);
  }

  /** Removes the second factor and signs the person out everywhere; staff must set it up again at their next sign-in. */
  async resetTwoFactor(actor: Actor, id: string, context: RequestContext): Promise<UserDetail> {
    // Your own second factor is changed from your security page, where it asks for your password.
    if (id === actor.userId)
      throw fieldError(
        'id',
        'Use your account security page for your own two-factor',
        HttpStatus.FORBIDDEN,
      );
    await this.prisma.$transaction(async (tx) => {
      const user = await this.load(tx, id);
      await tx.user.update({
        where: { id },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      });
      await tx.backupCode.deleteMany({ where: { userId: id } });
      await this.sessions.revokeAll(tx, id);
      await tx.authChallenge.deleteMany({ where: { userId: id } });
      await this.audit.record(tx, context, {
        action: 'user.two_factor_reset',
        entityType: 'User',
        entityId: id,
        before: { twoFactorEnabled: user.twoFactorEnabled },
        after: { twoFactorEnabled: false },
      });
      await this.outbox.publish(tx, {
        type: 'user.two_factor_reset',
        aggregateType: 'User',
        aggregateId: id,
        payload: { userId: id },
      });
    });
    await this.realtime.signOutEverywhere(id, 'two_factor_reset');
    return this.get(id);
  }

  /** Sign-ins, failures, lockouts and sign-outs of this person, newest first, from the audit trail. */
  async loginHistory(
    id: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<CursorPage<LoginHistoryItem>> {
    await this.load(this.prisma, id);
    const where: Prisma.AuditEventWhereInput = {
      entityType: 'User',
      entityId: id,
      action: { startsWith: 'auth.' },
    };
    type Event = Prisma.AuditEventGetPayload<object>;
    const { rows, nextCursor, total } = await readPage<Event>({
      limit: query.limit,
      cursor: query.cursor,
      keyOf: (r) => r.id,
      find: ({ take, skip, cursorKey }) =>
        this.prisma.auditEvent.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          ...(cursorKey ? { cursor: { id: cursorKey }, skip: skip ?? 1 } : {}),
        }),
      count: () => this.prisma.auditEvent.count({ where }),
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        at: r.createdAt.toISOString(),
        ip: r.ip,
        userAgent: r.userAgent,
        method:
          typeof (r.after as { method?: unknown } | null)?.method === 'string'
            ? (r.after as { method: string }).method
            : null,
      })),
      nextCursor,
      total,
    };
  }

  // ---- impersonation ----------------------------------------------------------------------------------------
  /** Checks the admin may look at this person and returns the cookie that starts it. */
  async startImpersonation(
    actor: Actor,
    id: string,
    reason: string,
    context: RequestContext,
  ): Promise<{ token: string; expiresAt: Date; maxAgeSeconds: number }> {
    if (actor.impersonatorId) throw new ForbiddenException('Stop viewing as another user first');
    if (id === actor.userId)
      throw fieldError('id', 'You cannot view the product as yourself', HttpStatus.FORBIDDEN);
    const target = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, role: true, status: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'super_admin')
      throw fieldError(
        'id',
        'You cannot view the product as another super admin',
        HttpStatus.FORBIDDEN,
      );
    if (target.status !== 'active')
      throw fieldError('id', 'Only active accounts can be viewed', HttpStatus.CONFLICT);
    const issued = this.impersonation.issue(actor.userId, actor.sessionId, id);
    await this.audit.recordNow(context, {
      action: 'user.impersonation_started',
      entityType: 'User',
      entityId: id,
      after: { role: target.role, reason, expiresAt: issued.expiresAt.toISOString() },
    });
    return issued;
  }
}
