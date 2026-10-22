import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../src/client.ts';

/**
 * Applies the migrations to an empty throwaway database and checks the schema with real SQL: the
 * migration applies cleanly (also as a plain database owner), Prisma sees no drift, the rules Prisma cannot
 * express are enforced, consent binds document sharing, and search works.
 */

const baseUrl = process.env['DATABASE_URL'];
if (!baseUrl)
  throw new Error('DATABASE_URL must point at a PostgreSQL server that allows CREATE DATABASE');

const packageDir = new URL('..', import.meta.url);
const suffix = randomBytes(4).toString('hex');
const dbName = `f01_${suffix}`;
const urlFor = (name: string, user?: { name: string; password: string }) => {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  if (user) {
    url.username = user.name;
    url.password = user.password;
  }
  return url.toString();
};
const prismaCli = (args: string[], databaseUrl: string) =>
  execFileSync('pnpm', ['exec', 'prisma', ...args, '--config', 'prisma7.config.ts'], {
    cwd: packageDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  }).toString();

const schemaText = readFileSync(new URL('prisma/schema.prisma', packageDir), 'utf8');
const modelCount = [...schemaText.matchAll(/^model \w+ \{/gm)].length;
const enumCount = [...schemaText.matchAll(/^enum \w+ \{/gm)].length;

let admin: PrismaClient;
let db: PrismaClient;

beforeAll(async () => {
  admin = createPrismaClient({ connectionString: baseUrl });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  // The same command the deploy uses, against an empty database.
  prismaCli(['migrate', 'deploy'], urlFor(dbName));
  db = createPrismaClient({ connectionString: urlFor(dbName) });
  await cityId();
});

afterAll(async () => {
  await db?.$disconnect();
  await admin?.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin?.$disconnect();
});

/** Rejects with the database's message, so a test can say which rule fired. */
async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return String(error instanceof Error ? error.message : error);
  }
  throw new Error('expected the database to reject this, but it was accepted');
}

let counter = 0;
const next = () => (counter += 1);

// ---- factories: each test builds what it needs, so tests do not depend on each other ------------------
async function cityId(): Promise<string> {
  await db.currency.createMany({
    data: [
      { code: 'USD', name: 'US dollar', minorUnits: 2 },
      { code: 'INR', name: 'Indian rupee', minorUnits: 2 },
      { code: 'UZS', name: 'Uzbek som', minorUnits: 2 },
    ],
    skipDuplicates: true,
  });
  await db.country.upsert({
    where: { code: 'IN' },
    update: {},
    create: { code: 'IN', name: 'India' },
  });
  await db.country.upsert({
    where: { code: 'OM' },
    update: {},
    create: { code: 'OM', name: 'Oman' },
  });
  const city = await db.city.upsert({
    where: { slug: 'delhi' },
    update: {},
    create: { slug: 'delhi', name: 'Delhi', countryCode: 'IN' },
  });
  return city.id;
}
const mkPatient = (fullName = `Patient ${next()}`) =>
  db.patient.create({ data: { fullName, nationalityCode: 'OM' } });
const mkCase = async (patientId?: string) =>
  db.case.create({
    data: {
      caseNo: `CASE-2026-${String(next()).padStart(6, '0')}`,
      patientId: patientId ?? (await mkPatient()).id,
    },
  });
const mkHospital = async () =>
  db.hospital.create({
    data: { slug: `hospital-${next()}`, name: `Hospital ${next()}`, cityId: await cityId() },
  });
const mkDocument = (patientId: string, extra: Record<string, unknown> = {}) =>
  db.document.create({
    data: {
      patientId,
      kind: 'report',
      fileName: 'r.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      storageKey: `k/${next()}`,
      ...extra,
    },
  });
const mkConsent = (
  patientId: string,
  hospitalId: string | null,
  type: 'share_medical_with_hospital' | 'marketing' = 'share_medical_with_hospital',
) => db.consent.create({ data: { patientId, hospitalId, type } });

describe('migrations on an empty database', () => {
  it('create every table and enum, and the extensions', async () => {
    const tables = await db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`;
    expect(Number(tables[0]!.n)).toBe(modelCount);
    const enums = await db.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*) AS n FROM pg_type WHERE typtype = 'e'`;
    expect(Number(enums[0]!.n)).toBe(enumCount);
    const extensions = await db.$queryRaw<{ extname: string }[]>`SELECT extname FROM pg_extension`;
    expect(extensions.map((e) => e.extname)).toEqual(
      expect.arrayContaining(['pg_trgm', 'unaccent']),
    );
  });

  it('leave nothing for Prisma to change (no drift), so `migrate dev` stays quiet', () => {
    const output = prismaCli(
      [
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema.prisma',
        '--exit-code',
      ],
      urlFor(dbName),
    );
    expect(output).toContain('No difference detected');
  });

  it('give every foreign key an index, except the currency codes', async () => {
    const missing = await db.$queryRaw<{ relation: string; fk: string }[]>`
      SELECT c.conrelid::regclass::text AS relation, c.conname AS fk
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.confrelid::regclass::text <> '"Currency"'
        AND NOT EXISTS (
          SELECT 1 FROM pg_index i
          WHERE i.indrelid = c.conrelid
            AND (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey)`;
    expect(missing).toEqual([]);
  });

  it('use UTC timestamps for every createdAt, updatedAt and deletedAt column', async () => {
    const wrong = await db.$queryRaw<
      { table_name: string; column_name: string; data_type: string }[]
    >`
      SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name IN ('createdAt', 'updatedAt', 'deletedAt')
        AND data_type <> 'timestamp with time zone'`;
    expect(wrong).toEqual([]);
  });

  it('apply as a plain database owner, not only as a superuser', async () => {
    const role = `f01_owner_${suffix}`;
    const owned = `f01_owned_${suffix}`;
    const password = 'owner-pass';
    await admin.$executeRawUnsafe(`CREATE ROLE "${role}" LOGIN NOSUPERUSER PASSWORD '${password}'`);
    try {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${owned}" OWNER "${role}"`);
      const output = prismaCli(['migrate', 'deploy'], urlFor(owned, { name: role, password }));
      expect(output).toContain('successfully applied');
    } finally {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${owned}" WITH (FORCE)`);
      await admin.$executeRawUnsafe(`DROP ROLE IF EXISTS "${role}"`);
    }
  });
});

describe('money', () => {
  it('holds amounts far beyond 32 bits, as needed for UZS, IQD and NGN prices', async () => {
    const kase = await mkCase();
    // 25 billion minor units: a 20,000 USD package priced in Uzbek som.
    const quote = await db.quote.create({
      data: {
        quoteNo: `Q-${next()}`,
        caseId: kase.id,
        totalMinor: 25_000_000_000,
        currency: 'UZS',
      },
    });
    expect(quote.totalMinor).toBe(25_000_000_000n);
    await db.payment.create({
      data: {
        caseId: kase.id,
        type: 'deposit',
        method: 'bank_wire',
        amountMinor: 25_000_000_000,
        currency: 'UZS',
      },
    });
  });

  it('rejects a foreign key to a currency that does not exist', async () => {
    const kase = await mkCase();
    expect(
      await rejection(
        db.quote.create({
          data: { quoteNo: `Q-${next()}`, caseId: kase.id, totalMinor: 100, currency: 'XXX' },
        }),
      ),
    ).toMatch(/foreign key|Foreign key/);
  });

  it('rejects negative or zero money', async () => {
    const kase = await mkCase();
    expect(
      await rejection(
        db.quote.create({
          data: { quoteNo: `Q-${next()}`, caseId: kase.id, totalMinor: -1, currency: 'USD' },
        }),
      ),
    ).toMatch(/Quote_total_check/);
    expect(
      await rejection(
        db.payment.create({
          data: {
            caseId: kase.id,
            type: 'deposit',
            method: 'card',
            amountMinor: 0,
            currency: 'USD',
          },
        }),
      ),
    ).toMatch(/Payment_amount_check/);
    expect(
      await rejection(
        db.case.update({
          where: { id: kase.id },
          data: { budgetMinor: -5, budgetCurrency: 'USD' },
        }),
      ),
    ).toMatch(/Case_budget_check/);
  });

  it('rejects an amount without its currency', async () => {
    const kase = await mkCase();
    expect(
      await rejection(db.case.update({ where: { id: kase.id }, data: { budgetMinor: 5000 } })),
    ).toMatch(/Case_budget_currency_check/);
    expect(
      await rejection(
        db.booking.create({
          data: { caseId: kase.id, type: 'transfer', startsAt: new Date(), costMinor: 5000 },
        }),
      ),
    ).toMatch(/Booking_currency_check/);
    await db.booking.create({
      data: {
        caseId: kase.id,
        type: 'transfer',
        startsAt: new Date(),
        costMinor: 5000,
        currency: 'INR',
      },
    });
  });

  it('stores a quote with its exchange-rate snapshot and lines', async () => {
    const kase = await mkCase();
    const quote = await db.quote.create({
      data: {
        quoteNo: `Q-${next()}`,
        caseId: kase.id,
        totalMinor: 1_250_000,
        currency: 'USD',
        fxBaseCurrency: 'INR',
        fxRate: '0.01190000',
        fxRateAt: new Date('2026-10-01T00:00:00Z'),
        lines: {
          create: [
            {
              kind: 'hospital',
              description: 'Package',
              unitPriceMinor: 1_000_000,
              amountMinor: 1_000_000,
              currency: 'USD',
            },
          ],
        },
      },
      include: { lines: true },
    });
    expect(quote.lines).toHaveLength(1);
    expect(quote.fxRate?.toString()).toBe('0.0119');
  });

  it('lets a hospital pay a referral-fee invoice without a case, and insists on who owns an invoice or payment', async () => {
    const hospital = await mkHospital();
    const invoice = await db.invoice.create({
      data: {
        invoiceNo: `INV/26-27/${String(next()).padStart(5, '0')}`,
        kind: 'referral_fee',
        hospitalId: hospital.id,
        subtotalMinor: 100_000,
        totalMinor: 100_000,
        billToName: hospital.name,
        currency: 'INR',
      },
    });
    await db.payment.create({
      data: {
        invoiceId: invoice.id,
        type: 'referral_fee',
        method: 'bank_wire',
        amountMinor: 100_000,
        currency: 'INR',
      },
    });
    expect(
      await rejection(
        db.payment.create({
          data: { type: 'deposit', method: 'card', amountMinor: 1, currency: 'USD' },
        }),
      ),
    ).toMatch(/Payment_owner_check/);
    expect(
      await rejection(
        db.invoice.create({
          data: {
            invoiceNo: `INV/26-27/${String(next()).padStart(5, '0')}`,
            kind: 'service_fee',
            subtotalMinor: 1,
            totalMinor: 1,
            billToName: 'x',
            currency: 'INR',
          },
        }),
      ),
    ).toMatch(/Invoice_owner_check/);
    const kase = await mkCase();
    expect(
      await rejection(
        db.invoice.create({
          data: {
            invoiceNo: `INV/26-27/${String(next()).padStart(5, '0')}`,
            kind: 'referral_fee',
            caseId: kase.id,
            subtotalMinor: 1,
            totalMinor: 1,
            billToName: 'x',
            currency: 'INR',
          },
        }),
      ),
    ).toMatch(/Invoice_owner_check/);
  });

  it('keeps an admission with its bills and currency, one per case and hospital', async () => {
    const kase = await mkCase();
    const hospital = await mkHospital();
    await db.admission.create({
      data: {
        caseId: kase.id,
        hospitalId: hospital.id,
        status: 'admitted',
        admittedAt: new Date('2026-11-01T08:00:00Z'),
        estimateMinor: 500_000_000,
        finalBillMinor: 540_000_000,
        currency: 'INR',
      },
    });
    expect(
      await rejection(db.admission.create({ data: { caseId: kase.id, hospitalId: hospital.id } })),
    ).toMatch(/Unique constraint/);
    const other = await mkHospital();
    expect(
      await rejection(
        db.admission.create({ data: { caseId: kase.id, hospitalId: other.id, estimateMinor: 1 } }),
      ),
    ).toMatch(/Admission_currency_check/);
    expect(
      await rejection(
        db.admission.create({
          data: {
            caseId: kase.id,
            hospitalId: other.id,
            admittedAt: new Date('2026-11-02'),
            dischargedAt: new Date('2026-11-01'),
            currency: 'INR',
          },
        }),
      ),
    ).toMatch(/Admission_dates_check/);
  });
});

describe('rules the database enforces', () => {
  it('rejects rates outside 0 to 100 percent and ratings outside 1 to 5', async () => {
    const hospital = await mkHospital();
    const kase = await mkCase();
    expect(
      await rejection(
        db.hospital.update({ where: { id: hospital.id }, data: { agreementBp: 10_001 } }),
      ),
    ).toMatch(/Hospital_agreement_check/);
    expect(
      await rejection(
        db.feedback.create({
          data: { caseId: kase.id, patientId: kase.patientId, hospitalRating: 6 },
        }),
      ),
    ).toMatch(/Feedback_ratings_check/);
  });

  it('rejects an upper-case email, so the unique index is case-insensitive in practice', async () => {
    const email = `asha${next()}@example.com`;
    expect(
      await rejection(
        db.user.create({ data: { name: 'X', role: 'patient', email: email.toUpperCase() } }),
      ),
    ).toMatch(/lowercase_check/);
    await db.user.create({ data: { name: 'X', role: 'patient', email } });
    expect(
      await rejection(db.user.create({ data: { name: 'Y', role: 'patient', email } })),
    ).toMatch(/Unique constraint/);
    expect(
      await rejection(
        db.agent.create({
          data: {
            companyName: 'A',
            countryCode: 'OM',
            referralCode: `r${next()}`,
            email: 'Agent@Example.com',
          },
        }),
      ),
    ).toMatch(/lowercase_check/);
  });

  it('keeps files between 1 byte and 500 MB, and every file with an owner', async () => {
    const patient = await mkPatient();
    expect(await rejection(mkDocument(patient.id, { sizeBytes: 0 }))).toMatch(
      /Document_size_check/,
    );
    expect(await rejection(mkDocument(patient.id, { sizeBytes: 524_288_001 }))).toMatch(
      /Document_size_check/,
    );
    await mkDocument(patient.id, { sizeBytes: 524_288_000 });
    expect(
      await rejection(
        db.document.create({
          data: {
            kind: 'report',
            fileName: 'x',
            mimeType: 'text/plain',
            sizeBytes: 1,
            storageKey: `k/${next()}`,
          },
        }),
      ),
    ).toMatch(/Document_owner_check/);
  });

  it('requires a visa application to be for exactly one traveller', async () => {
    const kase = await mkCase();
    const attendant = await db.attendant.create({
      data: { patientId: kase.patientId, fullName: 'Fatima Ali' },
    });
    expect(await rejection(db.visaApplication.create({ data: { caseId: kase.id } }))).toMatch(
      /one_traveller_check/,
    );
    expect(
      await rejection(
        db.visaApplication.create({
          data: { caseId: kase.id, patientId: kase.patientId, attendantId: attendant.id },
        }),
      ),
    ).toMatch(/one_traveller_check/);
    await db.visaApplication.create({ data: { caseId: kase.id, patientId: kase.patientId } });
    await db.visaApplication.create({ data: { caseId: kase.id, attendantId: attendant.id } });
  });

  it('allows one current medical summary per case and keeps old versions', async () => {
    const kase = await mkCase();
    await db.medicalSummary.create({
      data: { caseId: kase.id, version: 1, diagnosis: 'v1', current: false },
    });
    await db.medicalSummary.create({
      data: { caseId: kase.id, version: 2, diagnosis: 'v2', current: true },
    });
    expect(
      await rejection(
        db.medicalSummary.create({
          data: { caseId: kase.id, version: 3, diagnosis: 'v3', current: true },
        }),
      ),
    ).toMatch(/one_current_per_case/);
    expect(
      await rejection(
        db.medicalSummary.create({
          data: { caseId: kase.id, version: 2, diagnosis: 'dup', current: false },
        }),
      ),
    ).toMatch(/Unique constraint/);
  });

  it('keeps the case number unique and refuses to delete a patient that has cases', async () => {
    const kase = await mkCase();
    expect(
      await rejection(db.case.create({ data: { caseNo: kase.caseNo, patientId: kase.patientId } })),
    ).toMatch(/Unique constraint/);
    expect(await rejection(db.patient.delete({ where: { id: kase.patientId } }))).toMatch(
      /foreign key|Foreign key/,
    );
  });

  it('defaults a new case to the first stage and status', async () => {
    const created = await mkCase();
    expect(created.stage).toBe('enquiry');
    expect(created.status).toBe('new');
    expect(created.urgency).toBe('routine');
    expect(created.deletedAt).toBeNull();
  });

  it('keeps medical intake text off the case row', async () => {
    const kase = await mkCase();
    const columns = await db.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'Case'`;
    expect(columns.map((c) => c.column_name)).not.toContain('conditionSummary');
    await db.caseIntake.create({ data: { caseId: kase.id, condition: 'Chest pain on exertion' } });
    expect(
      await rejection(db.caseIntake.create({ data: { caseId: kase.id, condition: 'again' } })),
    ).toMatch(/Unique constraint/);
  });
});

describe('one-at-a-time rules and idempotency', () => {
  it('allows one open opinion request per case and hospital, and a new one after a decline', async () => {
    const kase = await mkCase();
    const hospital = await mkHospital();
    const consent = await mkConsent(kase.patientId, hospital.id);
    const first = await db.opinionRequest.create({
      data: { caseId: kase.id, hospitalId: hospital.id, status: 'sent', consentId: consent.id },
    });
    expect(
      await rejection(
        db.opinionRequest.create({
          data: { caseId: kase.id, hospitalId: hospital.id, status: 'sent', consentId: consent.id },
        }),
      ),
    ).toMatch(/one_open_per_case_hospital|Unique constraint/);
    await db.opinionRequest.update({ where: { id: first.id }, data: { status: 'declined' } });
    await db.opinionRequest.create({
      data: { caseId: kase.id, hospitalId: hospital.id, status: 'sent', consentId: consent.id },
    });
  });

  it('does not let a request leave draft without a consent', async () => {
    const kase = await mkCase();
    const hospital = await mkHospital();
    expect(
      await rejection(
        db.opinionRequest.create({
          data: { caseId: kase.id, hospitalId: hospital.id, status: 'sent' },
        }),
      ),
    ).toMatch(/OpinionRequest_consent_check/);
    await db.opinionRequest.create({ data: { caseId: kase.id, hospitalId: hospital.id } });
  });

  it('keeps hospital revisions: many opinions per request, one current', async () => {
    const kase = await mkCase();
    const hospital = await mkHospital();
    const consent = await mkConsent(kase.patientId, hospital.id);
    const request = await db.opinionRequest.create({
      data: { caseId: kase.id, hospitalId: hospital.id, status: 'answered', consentId: consent.id },
    });
    const base = {
      opinionRequestId: request.id,
      treatmentPlan: 'plan',
      estimateMinor: 100,
      currency: 'USD',
    };
    await db.opinion.create({ data: { ...base, version: 1, current: false } });
    await db.opinion.create({ data: { ...base, version: 2, current: true } });
    expect(
      await rejection(db.opinion.create({ data: { ...base, version: 3, current: true } })),
    ).toMatch(/one_current_per_request/);
    expect(
      await rejection(db.opinion.create({ data: { ...base, version: 2, current: false } })),
    ).toMatch(/Unique constraint/);
  });

  it('accepts one quote per case, and numbers quote versions', async () => {
    const kase = await mkCase();
    const quote = (version: number, status: 'accepted' | 'sent') =>
      db.quote.create({
        data: {
          quoteNo: `Q-${next()}`,
          caseId: kase.id,
          version,
          status,
          totalMinor: 1,
          currency: 'USD',
        },
      });
    await quote(1, 'accepted');
    expect(await rejection(quote(2, 'accepted'))).toMatch(/one_accepted_per_case/);
    expect(await rejection(quote(1, 'sent'))).toMatch(/Unique constraint/);
    await quote(2, 'sent');
  });

  it('allows one live commission per case and agent, and a new one after a cancellation', async () => {
    const kase = await mkCase();
    const agent = await db.agent.create({
      data: { companyName: 'Gulf Agents', countryCode: 'OM', referralCode: `ref${next()}` },
    });
    const commission = () =>
      db.commission.create({
        data: {
          caseId: kase.id,
          agentId: agent.id,
          basisMinor: 1000,
          rateBp: 1000,
          amountMinor: 100,
          currency: 'USD',
        },
      });
    const first = await commission();
    expect(await rejection(commission())).toMatch(/one_live_per_case_agent/);
    await db.commission.update({ where: { id: first.id }, data: { status: 'cancelled' } });
    await commission();
  });

  it('does not create the same automatic task or store the same channel message twice', async () => {
    const kase = await mkCase();
    const task = () =>
      db.task.create({
        data: { caseId: kase.id, title: 'Book pickup', autoKey: 'visa_approved:book_pickup' },
      });
    await task();
    expect(await rejection(task())).toMatch(/Task_auto_key_per_case/);
    await db.task.create({ data: { caseId: kase.id, title: 'Manual one' } });
    await db.task.create({ data: { caseId: kase.id, title: 'Manual two' } });

    const conversation = await db.conversation.create({
      data: { kind: 'patient', caseId: kase.id },
    });
    const externalId = `wamid.${next()}`;
    const message = () =>
      db.message.create({
        data: {
          conversationId: conversation.id,
          channel: 'whatsapp',
          direction: 'inbound',
          body: 'hello',
          externalId,
        },
      });
    await message();
    expect(await rejection(message())).toMatch(/Message_external_id_per_channel/);
  });

  it('recognises a replayed webhook and a replayed outbox event', async () => {
    const webhook = () =>
      db.processedWebhook.create({ data: { provider: 'razorpay', eventId: 'evt_1' } });
    await webhook();
    expect(await rejection(webhook())).toMatch(/Unique constraint/);
    const event = () =>
      db.outboxEvent.create({
        data: {
          type: 'case.stage_changed',
          aggregateType: 'Case',
          aggregateId: 'x',
          payload: {},
          dedupeKey: 'case-1:stage-3',
        },
      });
    await event();
    expect(await rejection(event())).toMatch(/Unique constraint/);
  });

  it('keeps conversations honest about who they are with', async () => {
    expect(await rejection(db.conversation.create({ data: { kind: 'hospital' } }))).toMatch(
      /Conversation_party_check/,
    );
    expect(await rejection(db.conversation.create({ data: { kind: 'agent' } }))).toMatch(
      /Conversation_party_check/,
    );
    await db.conversation.create({ data: { kind: 'internal' } });
  });
});

describe('consent binds document sharing', () => {
  it('shares a document only under a hospital-sharing consent of the same patient and hospital', async () => {
    const patient = await mkPatient();
    const stranger = await mkPatient();
    const hospital = await mkHospital();
    const other = await mkHospital();
    const document = await mkDocument(patient.id);
    const share = (consentId: string, hospitalId = hospital.id) =>
      db.documentShare.create({ data: { documentId: document.id, hospitalId, consentId } });

    expect(
      await rejection(share((await mkConsent(patient.id, hospital.id, 'marketing')).id)),
    ).toMatch(/needs a share_medical_with_hospital consent/);
    expect(await rejection(share((await mkConsent(stranger.id, hospital.id)).id))).toMatch(
      /different patient/,
    );
    expect(await rejection(share((await mkConsent(patient.id, other.id)).id))).toMatch(
      /different hospital/,
    );
    const withdrawn = await mkConsent(patient.id, hospital.id);
    await db.consent.update({ where: { id: withdrawn.id }, data: { withdrawnAt: new Date() } });
    expect(await rejection(share(withdrawn.id))).toMatch(/withdrawn/);

    const ok = await share((await mkConsent(patient.id, hospital.id)).id);
    expect(ok.revokedAt).toBeNull();
    expect(await rejection(share((await mkConsent(patient.id, hospital.id)).id))).toMatch(
      /Unique constraint/,
    );
  });

  it('cannot share an agent document or a document nobody consented to', async () => {
    const patient = await mkPatient();
    const hospital = await mkHospital();
    const agent = await db.agent.create({
      data: { companyName: 'KYC Agents', countryCode: 'OM', referralCode: `kyc${next()}` },
    });
    const kyc = await db.document.create({
      data: {
        agentId: agent.id,
        kind: 'kyc',
        fileName: 'id.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1,
        storageKey: `k/${next()}`,
      },
    });
    const consent = await mkConsent(patient.id, hospital.id);
    expect(
      await rejection(
        db.documentShare.create({
          data: { documentId: kyc.id, hospitalId: hospital.id, consentId: consent.id },
        }),
      ),
    ).toMatch(/different patient/);
  });

  it('revokes every share made under a consent when the consent is withdrawn', async () => {
    const patient = await mkPatient();
    const hospital = await mkHospital();
    const consent = await mkConsent(patient.id, hospital.id);
    const first = await mkDocument(patient.id);
    const second = await mkDocument(patient.id);
    await db.documentShare.create({
      data: { documentId: first.id, hospitalId: hospital.id, consentId: consent.id },
    });
    await db.documentShare.create({
      data: { documentId: second.id, hospitalId: hospital.id, consentId: consent.id },
    });

    const live = () =>
      db.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM "DocumentShare" s JOIN "Consent" c ON c."id" = s."consentId"
        WHERE s."hospitalId" = ${hospital.id}::uuid AND s."revokedAt" IS NULL AND s."deletedAt" IS NULL AND c."withdrawnAt" IS NULL`;
    expect(Number((await live())[0]!.n)).toBe(2);
    await db.consent.update({ where: { id: consent.id }, data: { withdrawnAt: new Date() } });
    expect(Number((await live())[0]!.n)).toBe(0);
    const shares = await db.documentShare.findMany({ where: { consentId: consent.id } });
    expect(shares.every((s) => s.revokedAt !== null)).toBe(true);
  });

  it('requires a hospital-sharing consent to name its hospital', async () => {
    const patient = await mkPatient();
    expect(
      await rejection(
        db.consent.create({ data: { patientId: patient.id, type: 'share_medical_with_hospital' } }),
      ),
    ).toMatch(/Consent_target_check/);
    expect(
      await rejection(
        db.consent.create({ data: { patientId: patient.id, type: 'share_stage_with_agent' } }),
      ),
    ).toMatch(/Consent_target_check/);
  });
});

describe('the audit trail', () => {
  it('is append-only: no updates, no truncating, but it can describe rows with ISO-code keys', async () => {
    const event = await db.auditEvent.create({
      data: { action: 'currency.update', entityType: 'Currency', entityId: 'USD' },
    });
    expect(event.entityId).toBe('USD');
    expect(
      await rejection(
        db.auditEvent.update({ where: { id: event.id }, data: { action: 'tampered' } }),
      ),
    ).toMatch(/append-only/);
    expect(await rejection(db.$executeRawUnsafe('TRUNCATE "AuditEvent"'))).toMatch(/append-only/);
    // Deleting a row is the retention job's business, and stays possible.
    await db.auditEvent.delete({ where: { id: event.id } });
  });
});

describe('full-text search', () => {
  const search = (table: string, query: string) =>
    db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "${table}" WHERE "searchVector" @@ websearch_to_tsquery('simple', f_unaccent($1))`,
      query,
    );
  const prefix = (table: string, word: string) =>
    db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "${table}" WHERE "searchVector" @@ to_tsquery('simple', f_unaccent($1) || ':*')`,
      word,
    );

  beforeAll(async () => {
    const city = await cityId();
    await db.patient.create({
      data: {
        fullName: 'José García',
        phone: '+91 98765 43210',
        passportNumber: 'P1234567',
        nationalityCode: 'OM',
      },
    });
    await db.patient.create({ data: { fullName: 'أَحْمَد علي', phone: '+968 9123 4567' } });
    const hospital = await db.hospital.create({
      data: {
        slug: 'fortis-mumbai',
        name: 'Fortis Hospital',
        address: 'Mulund, Mumbai',
        cityId: city,
      },
    });
    await db.hospitalTranslation.create({
      data: { hospitalId: hospital.id, locale: 'ar', name: 'مستشفى فورتيس' },
    });
    const speciality = await db.speciality.create({
      data: { slug: 'cardiology', name: 'Cardiology' },
    });
    const doctor = await db.doctor.create({
      data: {
        hospitalId: hospital.id,
        specialityId: speciality.id,
        fullName: 'Dr. Priya Nair',
        qualifications: 'MBBS, MD, DM Cardiology',
      },
    });
    await db.doctorTranslation.create({
      data: { doctorId: doctor.id, locale: 'ar', fullName: 'د. بريا ناير' },
    });
    const treatment = await db.treatment.create({
      data: {
        slug: 'knee-replacement',
        name: 'Knee replacement',
        summary: 'Total knee arthroplasty',
        specialityId: speciality.id,
      },
    });
    await db.treatmentTranslation.create({
      data: { treatmentId: treatment.id, locale: 'ar', name: 'استبدال مفصل الركبة' },
    });
  });

  it('finds a patient by name ignoring accents, by prefix, by phone digits and by passport number', async () => {
    expect(await search('Patient', 'jose garcia')).toHaveLength(1);
    expect(await prefix('Patient', 'gar')).toHaveLength(1);
    expect(await search('Patient', '919876543210')).toHaveLength(1);
    expect(await search('Patient', '43210')).toHaveLength(1);
    expect(await search('Patient', 'p1234567')).toHaveLength(1);
    expect(await search('Patient', 'nobody')).toHaveLength(0);
  });

  it('survives whatever a user types', async () => {
    for (const text of ['a&', '(', 'john smith', '"', "o'brien", '!!', '']) {
      await search('Patient', text);
    }
  });

  it('finds Arabic names whatever the vowel marks, and phone numbers', async () => {
    expect(await search('Patient', 'احمد')).toHaveLength(1);
    expect(await search('Patient', 'أَحْمَد')).toHaveLength(1);
    expect(await search('Patient', '96891234567')).toHaveLength(1);
  });

  it('finds hospitals, doctors and treatments, in English and in Arabic through their translations', async () => {
    expect(await search('Hospital', 'fortis')).toHaveLength(1);
    expect(await search('Hospital', 'mumbai')).toHaveLength(1);
    expect(await search('Hospital', 'فورتيس')).toHaveLength(1);
    expect(await search('Doctor', 'priya')).toHaveLength(1);
    expect(await search('Doctor', 'cardiology')).toHaveLength(1);
    expect(await search('Doctor', 'ناير')).toHaveLength(1);
    expect(await search('Treatment', 'arthroplasty')).toHaveLength(1);
    expect(await prefix('Treatment', 'knee')).toHaveLength(1);
    expect(await search('Treatment', 'الركبة')).toHaveLength(1);
  });

  it('refreshes the search column when the row or its translation changes', async () => {
    const patient = await db.patient.findFirstOrThrow({ where: { fullName: 'José García' } });
    await db.patient.update({ where: { id: patient.id }, data: { fullName: 'Joseph Garcia' } });
    expect(await search('Patient', 'joseph')).toHaveLength(1);
    expect(await search('Patient', 'jose garcia')).toHaveLength(0);

    const translation = await db.treatmentTranslation.findFirstOrThrow({ where: { locale: 'ar' } });
    await db.treatmentTranslation.update({
      where: { id: translation.id },
      data: { name: 'تغيير مفصل الركبة' },
    });
    expect(await search('Treatment', 'تغيير')).toHaveLength(1);
    expect(await search('Treatment', 'استبدال')).toHaveLength(0);
    await db.treatmentTranslation.delete({ where: { id: translation.id } });
    expect(await search('Treatment', 'تغيير')).toHaveLength(0);
  });

  it('does a fuzzy name lookup through the trigram index', async () => {
    const found = await db.$queryRaw<{ fullName: string }[]>`
      SELECT "fullName" FROM "Patient" WHERE lower("fullName") % lower('Josef Garsia')`;
    expect(found.map((p) => p.fullName)).toContain('Joseph Garcia');
  });

  it('has a GIN index the planner can use for the search column', async () => {
    await db.$executeRawUnsafe(`
      INSERT INTO "Patient" ("fullName", "updatedAt")
      SELECT 'Filler ' || n || ' Person' || (n % 97), now() FROM generate_series(1, 5000) AS n`);
    await db.$executeRawUnsafe('ANALYZE "Patient"');
    const plan = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      return tx.$queryRawUnsafe<Record<string, string>[]>(
        `EXPLAIN SELECT id FROM "Patient" WHERE "searchVector" @@ to_tsquery('simple', 'garcia')`,
      );
    });
    expect(plan.map((row) => row['QUERY PLAN']).join('\n')).toContain('Patient_searchVector_idx');
  });
});

describe('seed', () => {
  it('is idempotent and never overwrites a name an admin changed', async () => {
    const seedDb = `f01_seed_${suffix}`;
    await admin.$executeRawUnsafe(`CREATE DATABASE "${seedDb}"`);
    try {
      const url = urlFor(seedDb);
      prismaCli(['migrate', 'deploy'], url);
      const seed = () =>
        execFileSync('pnpm', ['exec', 'tsx', 'prisma/seed.ts'], {
          cwd: packageDir,
          env: { ...process.env, DATABASE_URL: url },
          stdio: 'pipe',
        });
      seed();
      const seeded = createPrismaClient({ connectionString: url });
      try {
        await seeded.country.update({ where: { code: 'OM' }, data: { name: 'Sultanate of Oman' } });
        const before = await seeded.country.count();
        seed();
        expect(await seeded.country.count()).toBe(before);
        expect((await seeded.country.findUniqueOrThrow({ where: { code: 'OM' } })).name).toBe(
          'Sultanate of Oman',
        );
        expect(await seeded.currency.findUniqueOrThrow({ where: { code: 'KWD' } })).toMatchObject({
          minorUnits: 3,
        });
      } finally {
        await seeded.$disconnect();
      }
    } finally {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${seedDb}" WITH (FORCE)`);
    }
  });
});
