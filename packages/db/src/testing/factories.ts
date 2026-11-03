import { randomUUID } from 'node:crypto';
import {
  STATUS_OF_STAGE,
  type CaseExitStage,
  type CaseStage,
  type Role,
} from '@medtravel/contracts';
import type { Prisma, PrismaClient } from '../client.ts';

/**
 * Builders for tests that need rows in a real database. Every value that must be unique comes from a counter, so two
 * calls never collide, and every builder takes overrides. They write the row directly (they do not go through the
 * application's services), so a test can arrange any state, including ones the state machine would not reach.
 */
/** One counter for the whole process, so two sets of factories on one database never repeat a value. */
let serial = 0;
const next = () => (serial += 1);

const EXIT_STATUS = { lost: 'lost', on_hold: 'on_hold', cancelled: 'cancelled' } as const;

export function createFactories(prisma: PrismaClient) {
  const pad = (n: number, width = 6) => String(n).padStart(width, '0');

  const country = (code = 'IN', name = 'India') =>
    prisma.country.upsert({ where: { code }, update: {}, create: { code, name } });

  const currency = (code = 'USD', minorUnits = 2) =>
    prisma.currency.upsert({
      where: { code },
      update: {},
      create: { code, name: code, minorUnits },
    });

  const city = async (slug = 'delhi-ncr', name = 'Delhi NCR') => {
    await country();
    return prisma.city.upsert({
      where: { slug },
      update: {},
      create: { slug, name, countryCode: 'IN' },
    });
  };

  const speciality = (slug = 'cardiology', name = 'Cardiology') =>
    prisma.speciality.upsert({ where: { slug }, update: {}, create: { slug, name } });

  const treatment = async (slug = 'bypass-surgery') => {
    const s = await speciality();
    return prisma.treatment.upsert({
      where: { slug },
      update: {},
      create: { slug, name: slug.replace(/-/g, ' '), specialityId: s.id },
    });
  };

  const user = (
    role: Role = 'case_manager',
    overrides: Partial<Prisma.UserUncheckedCreateInput> = {},
  ) => {
    const n = next();
    return prisma.user.create({
      data: {
        email: `${role}-${n}@test.example`,
        name: `Test ${role.replace(/_/g, ' ')} ${n}`,
        role,
        status: 'active',
        emailVerifiedAt: new Date(),
        ...overrides,
      },
    });
  };

  const patient = (overrides: Partial<Prisma.PatientUncheckedCreateInput> = {}) => {
    const n = next();
    return prisma.patient.create({
      data: { fullName: `Test Patient ${n}`, email: `patient-${n}@test.example`, ...overrides },
    });
  };

  const hospital = async (overrides: Partial<Prisma.HospitalUncheckedCreateInput> = {}) => {
    const n = next();
    const c = overrides.cityId ? null : await city();
    return prisma.hospital.create({
      data: {
        slug: `hospital-${n}`,
        name: `Test Hospital ${n}`,
        status: 'published',
        cityId: (c?.id ?? overrides.cityId) as string,
        ...overrides,
      },
    });
  };

  const doctor = async (
    hospitalId: string,
    overrides: Partial<Prisma.DoctorUncheckedCreateInput> = {},
  ) => {
    const n = next();
    const s = overrides.specialityId ? null : await speciality();
    return prisma.doctor.create({
      data: {
        fullName: `Dr. Test ${n}`,
        hospitalId,
        specialityId: (s?.id ?? overrides.specialityId) as string,
        published: true,
        ...overrides,
      },
    });
  };

  const agent = async (overrides: Partial<Prisma.AgentUncheckedCreateInput> = {}) => {
    const n = next();
    await country('AE', 'United Arab Emirates');
    return prisma.agent.create({
      data: {
        companyName: `Test Agency ${n}`,
        referralCode: `TEST-${pad(n)}`,
        countryCode: 'AE',
        languages: ['en'],
        status: 'approved',
        ...overrides,
      },
    });
  };

  /** A case at a stage with the status that goes with it; the patient is created unless one is given. */
  const caseAt = async (
    stage: CaseStage | CaseExitStage = 'enquiry',
    overrides: Partial<Prisma.CaseUncheckedCreateInput> = {},
  ) => {
    const n = next();
    const patientId = overrides.patientId ?? (await patient()).id;
    return prisma.case.create({
      data: {
        caseNo: `CASE-${new Date().getUTCFullYear()}-${pad(800_000 + n)}`,
        patientId,
        stage,
        status:
          stage in EXIT_STATUS
            ? EXIT_STATUS[stage as CaseExitStage]
            : STATUS_OF_STAGE[stage as CaseStage],
        ...overrides,
      },
    });
  };

  const quote = async (
    caseId: string,
    overrides: Partial<Prisma.QuoteUncheckedCreateInput> = {},
  ) => {
    await currency();
    return prisma.quote.create({
      data: {
        quoteNo: `Q-${pad(800_000 + next())}`,
        caseId,
        totalMinor: 500_000n,
        currency: 'USD',
        status: 'sent',
        ...overrides,
      },
    });
  };

  const payment = async (
    caseId: string,
    overrides: Partial<Prisma.PaymentUncheckedCreateInput> = {},
  ) => {
    await currency();
    return prisma.payment.create({
      data: {
        caseId,
        type: 'deposit',
        method: 'bank_wire',
        status: 'succeeded',
        amountMinor: 150_000n,
        currency: 'USD',
        ...overrides,
      },
    });
  };

  const task = (caseId: string, overrides: Partial<Prisma.TaskUncheckedCreateInput> = {}) =>
    prisma.task.create({ data: { caseId, title: `Test task ${next()}`, ...overrides } });

  return {
    country,
    currency,
    city,
    speciality,
    treatment,
    user,
    patient,
    hospital,
    doctor,
    agent,
    caseAt,
    quote,
    payment,
    task,
    uuid: randomUUID,
  };
}

export type Factories = ReturnType<typeof createFactories>;
