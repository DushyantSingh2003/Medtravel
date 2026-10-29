import { createCipheriv, randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { ROLES, requiresTwoFactor, type Role } from '@medtravel/contracts';
import type { PrismaClient } from '../../src/client.ts';

/**
 * One user per role for local development and the browser tests (docs/dev-users.md). Created only when
 * `SEED_DEV_USERS=true`, and never when NODE_ENV is production: these accounts share a published password.
 */
export const DEV_PASSWORD = 'Dev@12345';
export const DEV_DOMAIN = 'dev.medtravel.test';
export const devEmail = (role: Role): string => `${role.replace(/_/g, '-')}@${DEV_DOMAIN}`;

/** A staff user who has never set up two-factor, to try the forced set-up page (it is only forced when the skip flag is off). */
export const DEV_UNENROLLED_EMAIL = `staff-setup@${DEV_DOMAIN}`;

/** A user whose second factor is already on, with a fixed secret, so browser tests can compute the codes. */
export const DEV_TWO_FACTOR_EMAIL = `admin-2fa@${DEV_DOMAIN}`;
export const DEV_TWO_FACTOR_SECRET = 'KRSXG5CTMVRXEZLUKN2XAZLSKRSXG5CT';

const DEV_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/** Same format as the API's secret box (`v1.<iv>.<tag>.<ciphertext>`, AES-256-GCM). */
function encryptSecret(keyHex: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export async function seedDevUsers(prisma: PrismaClient): Promise<number> {
  // These accounts share a published password: only where the environment is explicitly a development or test one.
  if (!['development', 'test'].includes(process.env['NODE_ENV'] ?? 'development'))
    throw new Error('Refusing to create development users outside development and test');
  const passwordHash = await hash(DEV_PASSWORD, {
    algorithm: 2,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  await prisma.country.upsert({
    where: { code: 'IN' },
    update: {},
    create: { code: 'IN', name: 'India' },
  });
  const city = await prisma.city.upsert({
    where: { slug: 'delhi-ncr' },
    update: {},
    create: { slug: 'delhi-ncr', name: 'Delhi NCR', countryCode: 'IN' },
  });
  const hospital = await prisma.hospital.upsert({
    where: { slug: 'dev-hospital' },
    update: {},
    create: { slug: 'dev-hospital', name: 'Dev Hospital', cityId: city.id },
  });

  // Every development user has a phone number so the SMS and WhatsApp channels can be tried (they land in Mailpit).
  let phoneSerial = 0;
  const create = async (email: string, role: Role, extra: { twoFactorSecret?: string } = {}) => {
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) return existing.id;
    phoneSerial += 1;
    const user = await prisma.user.create({
      data: {
        email,
        role,
        name: `Dev ${role.replace(/_/g, ' ')}`,
        status: 'active',
        passwordHash,
        passwordChangedAt: new Date(),
        emailVerifiedAt: new Date(),
        phone: `+9198000${String(phoneSerial).padStart(5, '0')}`,
        phoneVerifiedAt: new Date(),
        ...(extra.twoFactorSecret
          ? { twoFactorEnabled: true, twoFactorSecret: extra.twoFactorSecret }
          : {}),
      },
      select: { id: true },
    });
    return user.id;
  };

  // With SEED_DEV_2FA=true (CI) every role that must use a second factor gets one, with the shared secret below, so browser
  // tests can sign in as them with the enforcement switched on. Locally they stay un-enrolled and AUTH_DEV_SKIP_2FA applies.
  const encrypted = encryptSecret(
    process.env['AUTH_ENCRYPTION_KEY'] ?? DEV_ENCRYPTION_KEY,
    DEV_TWO_FACTOR_SECRET,
  );
  const enrolAll = process.env['SEED_DEV_2FA'] === 'true';
  const ids = new Map<Role, string>();
  for (const role of ROLES) {
    ids.set(
      role,
      await create(
        devEmail(role),
        role,
        enrolAll && requiresTwoFactor(role) ? { twoFactorSecret: encrypted } : {},
      ),
    );
  }

  const patientUser = ids.get('patient');
  if (patientUser && !(await prisma.patient.findUnique({ where: { userId: patientUser } }))) {
    const patient = await prisma.patient.create({
      data: { userId: patientUser, fullName: 'Dev patient', email: devEmail('patient') },
    });
    const attendantUser = ids.get('attendant');
    if (attendantUser) {
      await prisma.attendant.create({
        data: {
          fullName: 'Dev attendant',
          email: devEmail('attendant'),
          patientId: patient.id,
          userId: attendantUser,
        },
      });
    }
  }
  for (const role of ['hospital_desk', 'doctor'] as const) {
    const userId = ids.get(role);
    if (userId) {
      await prisma.hospitalStaff.upsert({
        where: { userId_hospitalId: { userId, hospitalId: hospital.id } },
        update: {},
        create: { userId, hospitalId: hospital.id },
      });
    }
  }
  for (const role of [
    'case_manager',
    'ground_coordinator',
    'interpreter',
    'medical_reviewer',
    'finance',
  ] as const) {
    const userId = ids.get(role);
    if (userId)
      await prisma.staffProfile.upsert({ where: { userId }, update: {}, create: { userId } });
  }

  await create(DEV_TWO_FACTOR_EMAIL, 'super_admin', {
    twoFactorSecret: encryptSecret(
      process.env['AUTH_ENCRYPTION_KEY'] ?? DEV_ENCRYPTION_KEY,
      DEV_TWO_FACTOR_SECRET,
    ),
  });
  await seedSampleAudit(prisma, ids.get('case_manager'), ids.get('super_admin'));

  const unenrolledId = await create(DEV_UNENROLLED_EMAIL, 'case_manager');
  await prisma.staffProfile.upsert({
    where: { userId: unenrolledId },
    update: {},
    create: { userId: unenrolledId },
  });
  return ROLES.length + 2;
}

/** A few audit events so the admin audit screen has something to show on a fresh database (marked with request id `seed`). */
async function seedSampleAudit(
  prisma: PrismaClient,
  caseManagerId: string | undefined,
  adminId: string | undefined,
): Promise<void> {
  if (!caseManagerId || !adminId) return;
  if (await prisma.auditEvent.count({ where: { requestId: 'seed' } })) return;
  const base = { requestId: 'seed', ip: '203.0.113.10', userAgent: 'Seed data' };
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
  await prisma.auditEvent.createMany({
    data: [
      {
        ...base,
        actorId: caseManagerId,
        actorRole: 'case_manager',
        action: 'document.viewed',
        entityType: 'Document',
        entityId: '00000000-0000-4000-8000-0000000000d1',
        createdAt: minutesAgo(30),
      },
      {
        ...base,
        actorId: caseManagerId,
        actorRole: 'case_manager',
        action: 'document.downloaded',
        entityType: 'Document',
        entityId: '00000000-0000-4000-8000-0000000000d1',
        createdAt: minutesAgo(25),
      },
      {
        ...base,
        actorId: adminId,
        actorRole: 'super_admin',
        action: 'master_data.updated',
        entityType: 'Treatment',
        entityId: '00000000-0000-4000-8000-0000000000e1',
        before: { name: 'Knee replacement' },
        after: { name: 'Total knee replacement' },
        createdAt: minutesAgo(10),
      },
    ],
  });
}
