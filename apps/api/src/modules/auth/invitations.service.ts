import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaClient } from '@medtravel/db';
import { AUTH_LIMITS, canInvite, type Role } from '@medtravel/contracts';
import { AuditService } from '../../audit/audit.service.js';
import type { Actor } from '../../auth/actor.js';
import { RateLimiter } from '../../auth/rate-limiter.js';
import { SessionService } from '../../auth/session.service.js';
import type { RequestContext } from '../../common/request-context.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import { PRISMA } from '../../database/database.module.js';
import { randomToken, sha256Hex } from './crypto/tokens.js';
import { Mailer } from './mail/mailer.js';
import { PasswordService } from './password.service.js';
import { SignInService, type Account, type SignInOutcome } from './sign-in.service.js';

const HOUR_MS = 3_600_000;
const MAGIC_SESSION_HOURS = 8;
const HOSPITAL_ROLES: Role[] = ['hospital_desk', 'doctor'];
const STAFF_ROLES: Role[] = [
  'case_manager',
  'ground_coordinator',
  'interpreter',
  'medical_reviewer',
  'finance',
];

interface InvitationMeta {
  role: Role;
  name: string;
  hospitalId?: string;
  patientId?: string;
}

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly signIn: SignInService,
    private readonly mailer: Mailer,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
  ) {}

  private link(path: string, token: string): string {
    return `${this.env.PORTAL_URL.replace(/\/$/, '')}/en/${path}?token=${token}`;
  }

  /** The hospital a hospital user works for, or null. */
  private async hospitalOf(userId: string): Promise<string | null> {
    const staff = await this.prisma.hospitalStaff.findFirst({
      where: { userId, deletedAt: null },
      select: { hospitalId: true },
    });
    return staff?.hospitalId ?? null;
  }

  // ---- invitations ------------------------------------------------------------------------------------------
  async invite(
    actor: Actor,
    body: { email: string; name: string; role: Role; hospitalId?: string | undefined },
    context: RequestContext,
  ): Promise<void> {
    if (!canInvite(actor.role, body.role))
      throw new ForbiddenException('You cannot invite this kind of user');
    this.limiter.consume(`invite:${actor.userId}`, 30, 3600);

    const meta: InvitationMeta = { role: body.role, name: body.name };
    if (HOSPITAL_ROLES.includes(body.role)) {
      const hospitalId =
        actor.role === 'hospital_desk' ? await this.hospitalOf(actor.userId) : body.hospitalId;
      if (!hospitalId) throw new BadRequestException('Say which hospital this person works for');
      if (actor.role === 'hospital_desk' && body.hospitalId && body.hospitalId !== hospitalId) {
        throw new ForbiddenException('You can only invite people to your own hospital');
      }
      const hospital = await this.prisma.hospital.findFirst({
        where: { id: hospitalId, deletedAt: null },
        select: { id: true },
      });
      if (!hospital) throw new NotFoundException('Hospital not found');
      meta.hospitalId = hospital.id;
    } else if (body.role === 'attendant') {
      const patient = await this.prisma.patient.findFirst({
        where: { userId: actor.userId, deletedAt: null },
        select: { id: true },
      });
      if (!patient) throw new ForbiddenException('Only a patient can invite an attendant');
      meta.patientId = patient.id;
    }
    if (
      await this.prisma.user.findFirst({
        where: { email: body.email, deletedAt: null },
        select: { id: true },
      })
    ) {
      throw new ConflictException('This email address already has an account');
    }

    const token = randomToken();
    await this.prisma.$transaction(async (tx) => {
      await tx.authChallenge.deleteMany({
        where: { kind: 'invitation', target: body.email, consumedAt: null },
      });
      const challenge = await tx.authChallenge.create({
        data: {
          kind: 'invitation',
          target: body.email,
          tokenHash: sha256Hex(token),
          meta: { ...meta },
          createdById: actor.userId,
          expiresAt: new Date(Date.now() + AUTH_LIMITS.invitationDays * 24 * HOUR_MS),
        },
      });
      await this.audit.record(tx, context, {
        action: 'auth.invitation_created',
        entityType: 'AuthChallenge',
        entityId: challenge.id,
        after: { role: body.role },
      });
    });
    await this.mailer.send({
      to: body.email,
      subject: 'You are invited to MedTravel',
      text: `You have been invited to MedTravel as ${body.role.replace('_', ' ')}. Accept the invitation and choose a password: ${this.link('accept-invitation', token)}`,
      template: 'invitation',
      secret: token,
    });
  }

  private async openInvitation(token: string) {
    const challenge = await this.prisma.authChallenge.findUnique({
      where: { tokenHash: sha256Hex(token) },
    });
    if (
      !challenge ||
      challenge.kind !== 'invitation' ||
      challenge.consumedAt ||
      challenge.expiresAt <= new Date() ||
      !challenge.target
    ) {
      throw new NotFoundException('This invitation is not valid any more');
    }
    return {
      challenge,
      email: challenge.target,
      meta: challenge.meta as unknown as InvitationMeta,
    };
  }

  async previewInvitation(token: string) {
    const { email, meta } = await this.openInvitation(token);
    return { email, name: meta.name, role: meta.role };
  }

  async accept(
    token: string,
    body: { password: string; name?: string | undefined },
    context: RequestContext,
  ): Promise<void> {
    const { challenge, email, meta } = await this.openInvitation(token);
    const passwordHash = await this.passwords.hash(body.password);
    try {
      await this.prisma.$transaction(async (tx) => {
        const consumed = await tx.authChallenge.updateMany({
          where: { id: challenge.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        if (consumed.count !== 1)
          throw new NotFoundException('This invitation is not valid any more');
        const user = await tx.user.create({
          data: {
            name: body.name ?? meta.name,
            email,
            role: meta.role,
            status: 'active',
            passwordHash,
            passwordChangedAt: new Date(),
            emailVerifiedAt: new Date(),
          },
          select: { id: true },
        });
        if (meta.hospitalId)
          await tx.hospitalStaff.create({ data: { userId: user.id, hospitalId: meta.hospitalId } });
        if (meta.patientId)
          await tx.attendant.create({
            data: {
              fullName: body.name ?? meta.name,
              email,
              patientId: meta.patientId,
              userId: user.id,
            },
          });
        if (STAFF_ROLES.includes(meta.role))
          await tx.staffProfile.create({ data: { userId: user.id } });
        await this.audit.record(tx, context, {
          action: 'auth.invitation_accepted',
          entityType: 'User',
          entityId: user.id,
          after: { role: meta.role },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('This email address already has an account');
      throw error;
    }
  }

  // ---- magic links ------------------------------------------------------------------------------------------
  /** A hospital desk sends a doctor a link to one case the hospital has been sent. */
  async createMagicLink(
    actor: Actor,
    body: { email: string; name: string; caseId: string },
    context: RequestContext,
  ): Promise<void> {
    if (actor.role !== 'hospital_desk')
      throw new ForbiddenException('Only a hospital desk can send a doctor a link');
    this.limiter.consume(`magic:${actor.userId}`, 30, 3600);
    const hospitalId = await this.hospitalOf(actor.userId);
    if (!hospitalId) throw new ForbiddenException('Your account is not linked to a hospital');
    const sent = await this.prisma.opinionRequest.findFirst({
      where: { caseId: body.caseId, hospitalId, status: { not: 'draft' } },
      select: { id: true },
    });
    if (!sent) throw new NotFoundException('This case was not sent to your hospital');

    const token = randomToken();
    await this.prisma.$transaction(async (tx) => {
      let doctor = await tx.user.findFirst({
        where: { email: body.email, deletedAt: null },
        select: { id: true, role: true, status: true },
      });
      if (doctor && (doctor.role !== 'doctor' || doctor.status !== 'active'))
        throw new ConflictException('This email address belongs to another kind of account');
      if (!doctor) {
        doctor = await tx.user.create({
          data: {
            name: body.name,
            email: body.email,
            role: 'doctor',
            status: 'active',
            emailVerifiedAt: new Date(),
          },
          select: { id: true, role: true, status: true },
        });
      }
      await tx.hospitalStaff.upsert({
        where: { userId_hospitalId: { userId: doctor.id, hospitalId } },
        update: { deletedAt: null },
        create: { userId: doctor.id, hospitalId },
      });
      await tx.authChallenge.deleteMany({
        where: {
          kind: 'magic_link',
          userId: doctor.id,
          consumedAt: null,
          meta: { path: ['caseId'], equals: body.caseId },
        },
      });
      const challenge = await tx.authChallenge.create({
        data: {
          kind: 'magic_link',
          target: body.email,
          tokenHash: sha256Hex(token),
          userId: doctor.id,
          createdById: actor.userId,
          meta: { caseId: body.caseId },
          expiresAt: new Date(Date.now() + AUTH_LIMITS.magicLinkHours * HOUR_MS),
        },
      });
      await this.audit.record(tx, context, {
        action: 'auth.magic_link_created',
        entityType: 'AuthChallenge',
        entityId: challenge.id,
        after: { caseId: body.caseId },
      });
    });
    await this.mailer.send({
      to: body.email,
      subject: 'A MedTravel case is waiting for your opinion',
      text: `Open the case (the link works for ${AUTH_LIMITS.magicLinkHours} hours): ${this.link('magic', token)}`,
      template: 'magic_link',
      secret: token,
    });
  }

  /** Turns a magic link into a session that can see one case and nothing else. */
  async redeemMagicLink(token: string, context: RequestContext): Promise<SignInOutcome> {
    const challenge = await this.prisma.authChallenge.findUnique({
      where: { tokenHash: sha256Hex(token) },
    });
    if (
      !challenge ||
      challenge.kind !== 'magic_link' ||
      challenge.consumedAt ||
      challenge.expiresAt <= new Date() ||
      !challenge.userId
    ) {
      throw new NotFoundException('This link is not valid any more');
    }
    const caseId = (challenge.meta as { caseId?: string } | null)?.caseId;
    if (!caseId) throw new NotFoundException('This link is not valid any more');
    const consumed = await this.prisma.authChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw new NotFoundException('This link is not valid any more');
    const user = (await this.signIn.accountById(challenge.userId)) as Account | null;
    if (!user || user.status !== 'active' || user.role !== 'doctor')
      throw new NotFoundException('This link is not valid any more');

    const expiresAt = new Date(
      Math.min(Date.now() + MAGIC_SESSION_HOURS * HOUR_MS, challenge.expiresAt.getTime()),
    );
    const session = await this.sessions.create(this.prisma, {
      user,
      kind: 'magic_link',
      twoFactorVerified: false,
      scopeCaseId: caseId,
      expiresAt,
      context,
    });
    await this.audit.record(
      this.prisma,
      {
        ...context,
        actor: {
          userId: user.id,
          role: user.role,
          sessionId: session.sessionId,
          scopeCaseId: caseId,
        },
      },
      {
        action: 'auth.magic_link_redeemed',
        entityType: 'AuthChallenge',
        entityId: challenge.id,
        after: { caseId },
      },
    );
    return {
      body: {
        status: 'signed_in',
        challengeToken: null,
        user: this.signIn.view(user, false, caseId),
      },
      session,
    };
  }
}
