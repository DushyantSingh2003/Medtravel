import 'dotenv/config';
import { documentKindSchema } from '@medtravel/contracts';
import { createPrismaClient, type PrismaClient } from '../src/client.ts';
import { CITIES } from './seed-data/cities.ts';
import { seedCountries } from './seed-data/countries.ts';
import { CURRENCIES } from './seed-data/currencies.ts';
import { DOCUMENT_TYPES } from './seed-data/document-types.ts';
import { LANGUAGES } from './seed-data/languages.ts';
import { LOST_REASONS } from './seed-data/lost-reasons.ts';
import { SPECIALITIES } from './seed-data/specialities.ts';
import { seedPricing } from './seed-data/pricing.ts';
import { seedDemoData } from './seed-data/demo.ts';
import { seedDevUsers } from './seed-data/dev-users.ts';
import { TREATMENTS } from './seed-data/treatments.ts';

/**
 * Seed data for local development. Idempotent, and it never overwrites a row that exists: an admin who
 * renames a country in the admin screens keeps the new name when the seed runs again.
 *
 * F-01 seeds the master data every later screen needs (currencies, countries, languages, cities,
 * specialities, treatments, document types, lost reasons) with Arabic names. F-11 adds one user per role,
 * hospitals, doctors, cases and the rest. The Arabic names are a machine draft (packages/i18n/REVIEW.md).
 */

async function seedMasters(prisma: PrismaClient): Promise<void> {
  for (const currency of CURRENCIES) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: {},
      create: currency,
    });
  }
  for (const language of LANGUAGES) {
    await prisma.language.upsert({
      where: { code: language.code },
      update: {},
      create: language,
    });
  }
  for (const { code, name, arabic, dialCode, region } of seedCountries()) {
    await prisma.country.upsert({
      where: { code },
      update: {},
      create: { code, name, dialCode, region },
    });
    await prisma.countryTranslation.upsert({
      where: { countryCode_locale: { countryCode: code, locale: 'ar' } },
      update: {},
      create: { countryCode: code, locale: 'ar', name: arabic },
    });
  }
  for (const [slug, name, arabic] of CITIES) {
    const city = await prisma.city.upsert({
      where: { slug },
      update: {},
      create: { slug, name, countryCode: 'IN' },
    });
    await prisma.cityTranslation.upsert({
      where: { cityId_locale: { cityId: city.id, locale: 'ar' } },
      update: {},
      create: { cityId: city.id, locale: 'ar', name: arabic },
    });
  }
  const specialityIds = new Map<string, string>();
  for (const [slug, name, arabic] of SPECIALITIES) {
    const speciality = await prisma.speciality.upsert({
      where: { slug },
      update: {},
      create: { slug, name },
    });
    specialityIds.set(slug, speciality.id);
    await prisma.specialityTranslation.upsert({
      where: { specialityId_locale: { specialityId: speciality.id, locale: 'ar' } },
      update: {},
      create: { specialityId: speciality.id, locale: 'ar', name: arabic },
    });
  }
  for (const [slug, specialitySlug, name, arabic, typicalStayDays] of TREATMENTS) {
    const specialityId = specialityIds.get(specialitySlug);
    if (!specialityId) throw new Error(`Unknown speciality ${specialitySlug}`);
    const treatment = await prisma.treatment.upsert({
      where: { slug },
      update: {},
      create: { slug, name, typicalStayDays, specialityId },
    });
    await prisma.treatmentTranslation.upsert({
      where: { treatmentId_locale: { treatmentId: treatment.id, locale: 'ar' } },
      update: {},
      create: { treatmentId: treatment.id, locale: 'ar', name: arabic },
    });
  }
  for (const [code, kind, name, arabic] of DOCUMENT_TYPES) {
    const type = await prisma.documentType.upsert({
      where: { code },
      update: {},
      create: { code, name, kind: documentKindSchema.parse(kind) },
    });
    await prisma.documentTypeTranslation.upsert({
      where: { documentTypeId_locale: { documentTypeId: type.id, locale: 'ar' } },
      update: {},
      create: { documentTypeId: type.id, locale: 'ar', name: arabic },
    });
  }
  for (const [code, name, arabic] of LOST_REASONS) {
    const reason = await prisma.lostReason.upsert({
      where: { code },
      update: {},
      create: { code, name },
    });
    await prisma.lostReasonTranslation.upsert({
      where: { lostReasonId_locale: { lostReasonId: reason.id, locale: 'ar' } },
      update: {},
      create: { lostReasonId: reason.id, locale: 'ar', name: arabic },
    });
  }
}

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy packages/db/.env.example to .env first.');
  }

  const prisma = createPrismaClient({ connectionString });
  try {
    await seedMasters(prisma);
    await seedPricing(prisma);
    if (process.env['SEED_DEV_USERS'] === 'true') {
      console.warn(
        `Seed: ${await seedDevUsers(prisma)} development users ready (docs/dev-users.md).`,
      );
    }
    if (process.env['SEED_DEMO_DATA'] === 'true') {
      const started = Date.now();
      const demo = await seedDemoData(prisma);
      console.warn(
        `Seed: demo data ready (${demo.hospitals} hospitals, ${demo.cases} new cases) in ${Date.now() - started} ms.`,
      );
    }
    const [countries, treatments] = await Promise.all([
      prisma.country.count(),
      prisma.treatment.count(),
    ]);
    console.warn(
      `Seed: master data ready (${countries} countries, ${treatments} treatments, ...).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
