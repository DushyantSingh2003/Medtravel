import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../src/client.ts';

/**
 * Applies the migrations to an empty throwaway database and checks the schema with real SQL: the
 * migration applies cleanly, the rules Prisma cannot express are enforced, and search works.
 */

const baseUrl = process.env['DATABASE_URL'];
if (!baseUrl)
  throw new Error('DATABASE_URL must point at a PostgreSQL server that allows CREATE DATABASE');

const dbName = `f01_${randomBytes(4).toString('hex')}`;
const urlFor = (name: string) => {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
};

let admin: PrismaClient;
let db: PrismaClient;

beforeAll(async () => {
  admin = createPrismaClient({ connectionString: baseUrl });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  // The same command the deploy uses, against an empty database.
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--config', 'prisma7.config.ts'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, DATABASE_URL: urlFor(dbName) },
    stdio: 'pipe',
  });
  db = createPrismaClient({ connectionString: urlFor(dbName) });
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

const seed = async () => {
  await db.currency.createMany({
    data: [
      { code: 'USD', name: 'US dollar', minorUnits: 2 },
      { code: 'INR', name: 'Indian rupee', minorUnits: 2 },
    ],
    skipDuplicates: true,
  });
  await db.country.upsert({
    where: { code: 'OM' },
    update: {},
    create: { code: 'OM', name: 'Oman' },
  });
  await db.country.upsert({
    where: { code: 'IN' },
    update: {},
    create: { code: 'IN', name: 'India' },
  });
  const city = await db.city.upsert({
    where: { slug: 'delhi' },
    update: {},
    create: { slug: 'delhi', name: 'Delhi', countryCode: 'IN' },
  });
  return city;
};

describe('migrations on an empty database', () => {
  it('create every table, enum and the extensions', async () => {
    const tables = await db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`;
    expect(Number(tables[0]!.n)).toBe(71);
    const extensions = await db.$queryRaw<{ extname: string }[]>`SELECT extname FROM pg_extension`;
    expect(extensions.map((e) => e.extname)).toEqual(
      expect.arrayContaining(['pg_trgm', 'unaccent']),
    );
    const enums = await db.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*) AS n FROM pg_type WHERE typtype = 'e'`;
    expect(Number(enums[0]!.n)).toBe(47);
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

  it('use soft delete columns and UTC timestamps on business tables', async () => {
    const rows = await db.$queryRaw<{ data_type: string }[]>`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Case' AND column_name IN ('createdAt', 'updatedAt', 'deletedAt')`;
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.data_type))).toEqual(new Set(['timestamp with time zone']));
  });
});

describe('rules the database enforces', () => {
  let patientId = '';
  let caseId = '';
  let hospitalId = '';

  beforeAll(async () => {
    const city = await seed();
    const patient = await db.patient.create({
      data: { fullName: 'Asha Verma', nationalityCode: 'OM' },
    });
    patientId = patient.id;
    const kase = await db.case.create({ data: { caseNo: 'CASE-2026-000001', patientId } });
    caseId = kase.id;
    const hospital = await db.hospital.create({
      data: { slug: 'apollo-delhi', name: 'Apollo Delhi', cityId: city.id },
    });
    hospitalId = hospital.id;
  });

  it('rejects a foreign key to a currency that does not exist', async () => {
    const message = await rejection(
      db.quote.create({ data: { quoteNo: 'Q-000001', caseId, totalMinor: 100, currency: 'XXX' } }),
    );
    expect(message).toMatch(/foreign key|Foreign key/);
  });

  it('rejects negative or zero money', async () => {
    expect(
      await rejection(
        db.quote.create({ data: { quoteNo: 'Q-000002', caseId, totalMinor: -1, currency: 'USD' } }),
      ),
    ).toMatch(/Quote_total_check/);
    expect(
      await rejection(
        db.payment.create({
          data: { caseId, type: 'deposit', method: 'card', amountMinor: 0, currency: 'USD' },
        }),
      ),
    ).toMatch(/Payment_amount_check/);
    expect(
      await rejection(
        db.case.update({ where: { id: caseId }, data: { budgetMinor: -5, budgetCurrency: 'USD' } }),
      ),
    ).toMatch(/Case_budget_check/);
  });

  it('accepts a valid quote with its exchange-rate snapshot and lines', async () => {
    const quote = await db.quote.create({
      data: {
        quoteNo: 'Q-000003',
        caseId,
        totalMinor: 1_250_000,
        currency: 'USD',
        fxBaseCurrency: 'INR',
        fxRate: '0.01190000',
        fxRateAt: new Date('2026-10-01T00:00:00Z'),
        lines: {
          create: [
            {
              kind: 'hospital',
              description: 'Hospital package',
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

  it('rejects rates outside 0 to 100 percent and ratings outside 1 to 5', async () => {
    expect(
      await rejection(
        db.hospital.update({ where: { id: hospitalId }, data: { agreementBp: 10_001 } }),
      ),
    ).toMatch(/Hospital_agreement_check/);
    expect(
      await rejection(db.feedback.create({ data: { caseId, patientId, hospitalRating: 6 } })),
    ).toMatch(/Feedback_ratings_check/);
  });

  it('rejects an upper-case email, so the unique index is case-insensitive in practice', async () => {
    expect(
      await rejection(
        db.user.create({ data: { name: 'X', role: 'patient', email: 'Asha@Example.com' } }),
      ),
    ).toMatch(/lowercase_check/);
    await db.user.create({ data: { name: 'X', role: 'patient', email: 'asha@example.com' } });
    expect(
      await rejection(
        db.user.create({ data: { name: 'Y', role: 'patient', email: 'asha@example.com' } }),
      ),
    ).toMatch(/Unique constraint/);
  });

  it('keeps files between 1 byte and 500 MB', async () => {
    const base = {
      patientId,
      kind: 'report' as const,
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
    };
    expect(
      await rejection(db.document.create({ data: { ...base, sizeBytes: 0, storageKey: 'k/0' } })),
    ).toMatch(/Document_size_check/);
    expect(
      await rejection(
        db.document.create({ data: { ...base, sizeBytes: 524_288_001, storageKey: 'k/big' } }),
      ),
    ).toMatch(/Document_size_check/);
    await db.document.create({ data: { ...base, sizeBytes: 524_288_000, storageKey: 'k/max' } });
  });

  it('requires a visa application to be for exactly one traveller', async () => {
    const attendant = await db.attendant.create({ data: { patientId, fullName: 'Fatima Ali' } });
    expect(await rejection(db.visaApplication.create({ data: { caseId } }))).toMatch(
      /one_traveller_check/,
    );
    expect(
      await rejection(
        db.visaApplication.create({ data: { caseId, patientId, attendantId: attendant.id } }),
      ),
    ).toMatch(/one_traveller_check/);
    await db.visaApplication.create({ data: { caseId, patientId } });
    await db.visaApplication.create({ data: { caseId, attendantId: attendant.id } });
  });

  it('allows one current medical summary per case and keeps old versions', async () => {
    await db.medicalSummary.create({
      data: { caseId, version: 1, diagnosis: 'v1', current: false },
    });
    await db.medicalSummary.create({
      data: { caseId, version: 2, diagnosis: 'v2', current: true },
    });
    expect(
      await rejection(
        db.medicalSummary.create({ data: { caseId, version: 3, diagnosis: 'v3', current: true } }),
      ),
    ).toMatch(/one_current_per_case/);
    expect(
      await rejection(
        db.medicalSummary.create({
          data: { caseId, version: 2, diagnosis: 'dup', current: false },
        }),
      ),
    ).toMatch(/Unique constraint/);
  });

  it('enforces one request per case and hospital, and one share per document and hospital', async () => {
    await db.opinionRequest.create({ data: { caseId, hospitalId } });
    expect(await rejection(db.opinionRequest.create({ data: { caseId, hospitalId } }))).toMatch(
      /Unique constraint/,
    );
    const document = await db.document.create({
      data: {
        patientId,
        kind: 'scan',
        fileName: 'mri.zip',
        mimeType: 'application/zip',
        sizeBytes: 10,
        storageKey: 'k/share',
      },
    });
    await db.documentShare.create({ data: { documentId: document.id, hospitalId } });
    expect(
      await rejection(db.documentShare.create({ data: { documentId: document.id, hospitalId } })),
    ).toMatch(/Unique constraint/);
  });

  it('keeps the audit trail append-only', async () => {
    const event = await db.auditEvent.create({
      data: { action: 'document.view', entityType: 'Document', entityId: patientId, patientId },
    });
    expect(
      await rejection(
        db.auditEvent.update({ where: { id: event.id }, data: { action: 'tampered' } }),
      ),
    ).toMatch(/append-only/);
    // Deleting is the retention job's business, and stays possible.
    await db.auditEvent.delete({ where: { id: event.id } });
  });

  it('keeps the case number unique and refuses to delete a patient that has cases', async () => {
    expect(
      await rejection(db.case.create({ data: { caseNo: 'CASE-2026-000001', patientId } })),
    ).toMatch(/Unique constraint/);
    expect(await rejection(db.patient.delete({ where: { id: patientId } }))).toMatch(
      /foreign key|Foreign key/,
    );
  });

  it('defaults a new case to the first stage and status', async () => {
    const created = await db.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(created.stage).toBe('enquiry');
    expect(created.status).toBe('new');
    expect(created.urgency).toBe('routine');
    expect(created.deletedAt).toBeNull();
  });
});

describe('full-text search', () => {
  const search = (table: string, query: string) =>
    db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "${table}" WHERE "searchVector" @@ to_tsquery('simple', f_unaccent($1))`,
      query,
    );

  beforeAll(async () => {
    const city = await seed();
    await db.patient.create({
      data: {
        fullName: 'José García',
        phone: '+91 98765 43210',
        passportNumber: 'P1234567',
        nationalityCode: 'OM',
      },
    });
    await db.patient.create({ data: { fullName: 'محمد علي', phone: '+968 9123 4567' } });
    await db.hospital.create({
      data: {
        slug: 'fortis-mumbai',
        name: 'Fortis Hospital',
        address: 'Mulund, Mumbai',
        cityId: city.id,
      },
    });
    const speciality = await db.speciality.create({
      data: { slug: 'cardiology', name: 'Cardiology' },
    });
    const hospital = await db.hospital.findUniqueOrThrow({ where: { slug: 'fortis-mumbai' } });
    await db.doctor.create({
      data: {
        hospitalId: hospital.id,
        specialityId: speciality.id,
        fullName: 'Dr. Priya Nair',
        qualifications: 'MBBS, MD, DM Cardiology',
      },
    });
    await db.treatment.create({
      data: {
        slug: 'knee-replacement',
        name: 'Knee replacement',
        summary: 'Total knee arthroplasty',
        specialityId: speciality.id,
      },
    });
  });

  it('finds a patient by name ignoring accents, by prefix, by phone digits and by passport number', async () => {
    expect(await search('Patient', 'jose & garcia')).toHaveLength(1);
    expect(await search('Patient', 'gar:*')).toHaveLength(1);
    expect(await search('Patient', '919876543210')).toHaveLength(1);
    expect(await search('Patient', '43210')).toHaveLength(1);
    expect(await search('Patient', 'p1234567')).toHaveLength(1);
    expect(await search('Patient', 'nobody')).toHaveLength(0);
  });

  it('finds Arabic names and phone numbers', async () => {
    expect(await search('Patient', 'محمد')).toHaveLength(1);
    expect(await search('Patient', '96891234567')).toHaveLength(1);
  });

  it('finds hospitals, doctors and treatments', async () => {
    expect(await search('Hospital', 'fortis')).toHaveLength(1);
    expect(await search('Hospital', 'mumbai')).toHaveLength(1);
    expect(await search('Doctor', 'priya')).toHaveLength(1);
    expect(await search('Doctor', 'cardiology')).toHaveLength(1);
    expect(await search('Treatment', 'arthroplasty')).toHaveLength(1);
    expect(await search('Treatment', 'knee:*')).toHaveLength(1);
  });

  it('refreshes the search column when the row changes', async () => {
    const patient = await db.patient.findFirstOrThrow({ where: { fullName: 'José García' } });
    await db.patient.update({ where: { id: patient.id }, data: { fullName: 'Joseph Garcia' } });
    expect(await search('Patient', 'joseph')).toHaveLength(1);
    expect(await search('Patient', 'jose & garcia')).toHaveLength(0);
  });

  it('uses the GIN index', async () => {
    const plan = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      return tx.$queryRawUnsafe<Record<string, string>[]>(
        `EXPLAIN SELECT id FROM "Patient" WHERE "searchVector" @@ to_tsquery('simple', 'garcia')`,
      );
    });
    expect(plan.map((row) => row['QUERY PLAN']).join('\n')).toContain('Patient_searchVector_idx');
  });
});
