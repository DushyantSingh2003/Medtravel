import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, PrismaClient } from '@medtravel/db';
import { STAFF_ROLES, type Team, type TeamWrite } from '@medtravel/contracts';
import { AuditService } from '../../audit/audit.service.js';
import type { RequestContext } from '../../common/request-context.js';
import { PRISMA, type Db } from '../../database/database.module.js';

const field = (path: string, message: string) =>
  new HttpException(
    { statusCode: HttpStatus.UNPROCESSABLE_ENTITY, message, errors: [{ path: [path], message }] },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );

/** Teams of staff under a manager. A manager gets the manager flag the case scoping reads; losing the last team takes it away. */
@Injectable()
export class TeamsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  private view(row: {
    id: string;
    name: string;
    managerId: string | null;
    manager: { name: string } | null;
    _count: { members: number };
  }): Team {
    return {
      id: row.id,
      name: row.name,
      managerId: row.managerId,
      managerName: row.manager?.name ?? null,
      memberCount: row._count.members,
    };
  }

  private readonly select = {
    id: true,
    name: true,
    managerId: true,
    manager: { select: { name: true } },
    _count: { select: { members: { where: { deletedAt: null } } } },
  } satisfies Prisma.TeamSelect;

  async list(): Promise<Team[]> {
    const rows = await this.prisma.team.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: this.select,
    });
    return rows.map((row) => this.view(row));
  }

  private async assertManager(db: Db, managerId: string | null | undefined): Promise<void> {
    if (!managerId) return;
    const found = await db.user.findFirst({
      where: { id: managerId, deletedAt: null, status: 'active', role: { in: [...STAFF_ROLES] } },
      select: { id: true },
    });
    if (!found) throw field('managerId', 'Choose an active staff member');
  }

  /** The manager flag follows the teams a person manages. */
  async syncManagerFlag(db: Db, userId: string): Promise<void> {
    const manages = await db.team.count({ where: { managerId: userId, deletedAt: null } });
    await db.staffProfile.updateMany({ where: { userId }, data: { isManager: manages > 0 } });
  }

  async create(input: TeamWrite, context: RequestContext): Promise<Team> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertManager(tx, input.managerId);
      const existing = await tx.team.findFirst({
        where: { name: input.name },
        select: { id: true },
      });
      if (existing) throw field('name', 'A team with this name already exists');
      const created = await tx.team.create({
        data: { name: input.name, managerId: input.managerId ?? null },
        select: this.select,
      });
      if (input.managerId) {
        await tx.staffProfile.upsert({
          where: { userId: input.managerId },
          update: {},
          create: { userId: input.managerId },
        });
        await this.syncManagerFlag(tx, input.managerId);
      }
      await this.audit.record(tx, context, {
        action: 'team.created',
        entityType: 'Team',
        entityId: created.id,
        after: { name: created.name, managerId: created.managerId },
      });
      return this.view(created);
    });
  }

  async update(id: string, input: TeamWrite, context: RequestContext): Promise<Team> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.team.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, name: true, managerId: true },
      });
      if (!before) throw new NotFoundException('Team not found');
      await this.assertManager(tx, input.managerId);
      const clash = await tx.team.findFirst({
        where: { name: input.name, id: { not: id } },
        select: { id: true },
      });
      if (clash) throw field('name', 'A team with this name already exists');
      const managerId = input.managerId === undefined ? before.managerId : input.managerId;
      const updated = await tx.team.update({
        where: { id },
        data: { name: input.name, managerId },
        select: this.select,
      });
      // Members report to the team's manager (the case scoping reads this).
      await tx.staffProfile.updateMany({
        where: { teamId: id, userId: { not: managerId ?? undefined } },
        data: { managerId },
      });
      for (const userId of new Set([before.managerId, managerId])) {
        if (!userId) continue;
        if (userId === managerId)
          await tx.staffProfile.upsert({ where: { userId }, update: {}, create: { userId } });
        await this.syncManagerFlag(tx, userId);
      }
      await this.audit.record(tx, context, {
        action: 'team.updated',
        entityType: 'Team',
        entityId: id,
        before: { name: before.name, managerId: before.managerId },
        after: { name: updated.name, managerId: updated.managerId },
      });
      return this.view(updated);
    });
  }

  async remove(id: string, context: RequestContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const team = await tx.team.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true,
          name: true,
          managerId: true,
          _count: { select: { members: { where: { deletedAt: null } } } },
        },
      });
      if (!team) throw new NotFoundException('Team not found');
      if (team._count.members > 0)
        throw new ConflictException('Move the team’s members to another team first');
      await tx.team.update({ where: { id }, data: { deletedAt: new Date() } });
      if (team.managerId) await this.syncManagerFlag(tx, team.managerId);
      await this.audit.record(tx, context, {
        action: 'team.deleted',
        entityType: 'Team',
        entityId: id,
        before: { name: team.name },
      });
    });
  }
}
