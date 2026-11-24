import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@medtravel/db';
import {
  NAME_HINT_THRESHOLD,
  nameSimilarity,
  normaliseEmail,
  normaliseName,
  normalisePassport,
  phoneDigits,
  type CaseSource,
  type DuplicateState,
  type LeadCreated,
  type MatchField,
} from '@medtravel/contracts';
import type { Actor } from '../../auth/actor.js';
import { AuditService } from '../../audit/audit.service.js';
import type { RequestContext } from '../../common/request-context.js';
import { PRISMA, type Db } from '../../database/database.module.js';
import { OutboxService } from '../../outbox/outbox.service.js';
import { CasesService } from '../cases/cases.service.js';

/** Everything a source knows about a lead. Contact details arrive already normalised (see `normalisePhone`). */
export interface LeadInput {
  source: CaseSource;
  name: string;
  email?: string | undefined;
  phone?: string | undefined;
  passportNumber?: string | undefined;
  countryCode?: string | undefined;
  language?: string | undefined;
  treatmentId?: string | undefined;
  message?: string | undefined;
  utmSource?: string | undefined;
  utmMedium?: string | undefined;
  utmCampaign?: string | undefined;
  referrer?: string | undefined;
  agentCode?: string | undefined;
}

interface Match {
  patientId: string;
  fields: MatchField[];
}

const fieldError = (path: string, message: string) =>
  new HttpException(
    { statusCode: HttpStatus.UNPROCESSABLE_ENTITY, message, errors: [{ path: [path], message }] },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );

/**
 * The one way a lead enters the platform, whatever its source (website form, WhatsApp, agent, email, staff entry, phone call).
 * It finds the person if we already know them, opens the case, and records where the lead came from.
 */
@Injectable()
export class LeadIntakeService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly cases: CasesService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Patients we already have that share a phone number, email or passport number (strong matches, which the lead is attached to),
   * in that order of trust, then one with a similar name (a hint only).
   */
  async findMatches(
    db: Db,
    input: Pick<LeadInput, 'phone' | 'email' | 'passportNumber' | 'name'>,
  ): Promise<{ strong: Match[]; hint: { patientId: string } | null }> {
    const live = { deletedAt: null, mergedIntoId: null } as const;
    const byField = new Map<string, Set<MatchField>>();
    const note = (ids: { id: string }[], field: MatchField) => {
      for (const { id } of ids) byField.set(id, (byField.get(id) ?? new Set()).add(field));
    };
    if (input.phone) {
      const digits = phoneDigits(input.phone);
      note(
        await db.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "Patient"
          WHERE "deletedAt" IS NULL AND "mergedIntoId" IS NULL
            AND regexp_replace("phone", '[^0-9]', '', 'g') = ${digits}
          ORDER BY "createdAt" ASC LIMIT 10`,
        'phone',
      );
    }
    if (input.email)
      note(
        await db.patient.findMany({
          where: { ...live, email: normaliseEmail(input.email) },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
          take: 10,
        }),
        'email',
      );
    if (input.passportNumber) {
      const key = normalisePassport(input.passportNumber);
      if (key.length >= 4)
        note(
          await db.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "Patient"
            WHERE "deletedAt" IS NULL AND "mergedIntoId" IS NULL
              AND upper(regexp_replace("passportNumber", '[^A-Za-z0-9]', '', 'g')) = ${key}
            ORDER BY "createdAt" ASC LIMIT 10`,
          'passport',
        );
    }
    // The patient that matched on the most fields comes first, then the oldest record.
    const strong = [...byField.entries()]
      .map(([patientId, fields]) => ({ patientId, fields: [...fields] }))
      .sort((a, b) => b.fields.length - a.fields.length);
    if (strong.length > 0) return { strong, hint: null };

    // A first, cheap look: patients whose name shares the first letters of one of this name's longer words. A slip in the middle of
    // a word ("Mohammed" and "Mohamed") must not hide a match, so the comparison itself is done on the few rows this returns.
    const stems = normaliseName(input.name)
      .split(' ')
      .filter((word) => word.length >= 3)
      .slice(0, 3)
      .map((word) => word.slice(0, 3));
    if (stems.length === 0) return { strong, hint: null };
    const candidates = await db.patient.findMany({
      where: { ...live, OR: stems.map((stem) => ({ fullName: { contains: stem, mode: 'insensitive' as const } })) },
      select: { id: true, fullName: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const best = candidates
      .map((c) => ({ id: c.id, score: nameSimilarity(input.name, c.fullName) }))
      .filter((c) => c.score >= NAME_HINT_THRESHOLD)
      .sort((a, b) => b.score - a.score)[0];
    return { strong, hint: best ? { patientId: best.id } : null };
  }

  /** Two submissions of the same phone, email or passport at the same moment must find each other, not both create a patient. */
  private async lockContacts(tx: Db, input: LeadInput): Promise<void> {
    const keys = [
      input.phone ? `p:${phoneDigits(input.phone)}` : null,
      input.email ? `e:${normaliseEmail(input.email)}` : null,
      input.passportNumber ? `d:${normalisePassport(input.passportNumber)}` : null,
    ]
      .filter((key): key is string => key !== null)
      .sort();
    for (const key of keys)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lead:${key}`}))`;
  }

  async intake(
    input: LeadInput,
    actor: Actor | null,
    context: RequestContext,
  ): Promise<LeadCreated> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockContacts(tx, input);
      if (input.treatmentId) {
        const found = await tx.treatment.findFirst({
          where: { id: input.treatmentId, deletedAt: null },
          select: { id: true },
        });
        if (!found) throw fieldError('treatmentId', 'Choose one of the listed options');
      }
      if (input.countryCode) {
        const found = await tx.country.findUnique({
          where: { code: input.countryCode },
          select: { code: true },
        });
        if (!found) throw fieldError('countryCode', 'Choose one of the listed options');
      }
      // A referral code we do not recognise is kept as text but credits nobody.
      const agent = input.agentCode
        ? await tx.agent.findFirst({
            where: { referralCode: input.agentCode, status: 'approved', deletedAt: null },
            select: { id: true },
          })
        : null;

      const { strong, hint } = await this.findMatches(tx, input);
      const primary = strong[0];
      const otherStrong = strong[1];
      let patientId: string;
      let duplicateOfPatientId: string | null = null;
      let duplicateState: DuplicateState = 'none';
      let matchedOn: MatchField[] = [];

      if (primary) {
        patientId = primary.patientId;
        matchedOn = primary.fields;
        duplicateState = 'possible';
        // A second, different patient also matched: they may be one person on two records.
        duplicateOfPatientId = otherStrong?.patientId ?? null;
        await this.fillBlanks(tx, patientId, input);
      } else {
        const created = await tx.patient.create({
          data: {
            fullName: input.name,
            ...(input.email ? { email: normaliseEmail(input.email) } : {}),
            ...(input.phone ? { phone: input.phone } : {}),
            ...(input.passportNumber ? { passportNumber: input.passportNumber } : {}),
            ...(input.language ? { preferredLanguage: input.language } : {}),
          },
          select: { id: true },
        });
        patientId = created.id;
        if (hint) {
          duplicateState = 'possible';
          duplicateOfPatientId = hint.patientId;
          matchedOn = ['name'];
        }
      }

      const opened = await this.cases.openEnquiry(
        tx,
        {
          patientId,
          source: input.source,
          ownerId: actor?.role === 'case_manager' ? actor.userId : null,
          agentId: agent?.id ?? null,
          actorUserId: actor?.userId ?? null,
          treatmentId: input.treatmentId ?? null,
          countryCode: input.countryCode ?? null,
          preferredLanguage: input.language ?? null,
          campaign: input.utmCampaign ?? null,
        },
        context,
      );

      const lead = await tx.lead.create({
        data: {
          source: input.source,
          submittedName: input.name,
          matchedOn,
          duplicateState,
          patientId,
          caseId: opened.id,
          ...(duplicateOfPatientId ? { duplicateOfPatientId } : {}),
          ...(actor ? { createdById: actor.userId } : {}),
          ...(input.email ? { submittedEmail: normaliseEmail(input.email) } : {}),
          ...(input.phone ? { submittedPhone: input.phone } : {}),
          ...(input.passportNumber ? { submittedPassport: input.passportNumber } : {}),
          ...(input.language ? { language: input.language } : {}),
          ...(input.message ? { message: input.message } : {}),
          ...(input.utmSource ? { utmSource: input.utmSource } : {}),
          ...(input.utmMedium ? { utmMedium: input.utmMedium } : {}),
          ...(input.utmCampaign ? { utmCampaign: input.utmCampaign } : {}),
          ...(input.referrer ? { referrer: input.referrer } : {}),
          ...(input.agentCode ? { agentCode: input.agentCode } : {}),
        },
        select: { id: true },
      });

      // The patient's earlier enquiries are flagged too: the repeat is worth a look from whoever has the first one.
      if (primary)
        await tx.lead.updateMany({
          where: { patientId, id: { not: lead.id }, duplicateState: 'none', deletedAt: null },
          data: { duplicateState: 'possible', matchedOn },
        });

      await this.audit.record(tx, context, {
        action: 'lead.created',
        entityType: 'Lead',
        entityId: lead.id,
        patientId,
        // Which fields matched, never their values.
        after: {
          source: input.source,
          caseId: opened.id,
          attachedToExisting: Boolean(primary),
          duplicateState,
          matchedOn,
        },
      });
      await this.outbox.publish(tx, {
        type: 'lead.created',
        aggregateType: 'Lead',
        aggregateId: lead.id,
        payload: { leadId: lead.id, caseId: opened.id, source: input.source },
      });

      return {
        leadId: lead.id,
        caseId: opened.id,
        caseNo: opened.caseNo,
        patientId,
        attachedToExisting: Boolean(primary),
        duplicateState,
        matchedOn,
      };
    });
  }

  /** What the lead tells us that the existing patient record lacks. Nothing already recorded is overwritten. */
  private async fillBlanks(tx: Db, patientId: string, input: LeadInput): Promise<void> {
    const patient = await tx.patient.findUniqueOrThrow({
      where: { id: patientId },
      select: { email: true, phone: true, passportNumber: true, preferredLanguage: true },
    });
    const data: Prisma.PatientUpdateInput = {
      ...(!patient.email && input.email ? { email: normaliseEmail(input.email) } : {}),
      ...(!patient.phone && input.phone ? { phone: input.phone } : {}),
      ...(!patient.passportNumber && input.passportNumber
        ? { passportNumber: input.passportNumber }
        : {}),
      ...(!patient.preferredLanguage && input.language ? { preferredLanguage: input.language } : {}),
    };
    if (Object.keys(data).length > 0) await tx.patient.update({ where: { id: patientId }, data });
  }
}
