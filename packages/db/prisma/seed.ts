import 'dotenv/config';
import type { DocumentKind } from '../generated/prisma/enums.ts';
import { createPrismaClient, type PrismaClient } from '../src/client.ts';

/**
 * Seed data for local development. Idempotent, and it never overwrites a row that exists: an admin who
 * renames a country in the admin screens keeps the new name when the seed runs again.
 *
 * F-01 seeds the master data every later screen needs (currencies, countries, languages, cities,
 * specialities, treatments, document types, lost reasons) with Arabic names. F-11 adds one user per role,
 * hospitals, doctors, cases and the rest. The Arabic names are a machine draft (packages/i18n/REVIEW.md).
 */

const CURRENCIES = [
  { code: 'USD', name: 'US dollar', minorUnits: 2, symbol: '$' },
  { code: 'EUR', name: 'Euro', minorUnits: 2, symbol: '€' },
  { code: 'INR', name: 'Indian rupee', minorUnits: 2, symbol: '₹' },
  { code: 'AED', name: 'UAE dirham', minorUnits: 2, symbol: 'AED' },
  { code: 'KWD', name: 'Kuwaiti dinar', minorUnits: 3, symbol: 'KWD' },
  { code: 'JPY', name: 'Japanese yen', minorUnits: 0, symbol: '¥' },
];

const LANGUAGES = [
  { code: 'en', name: 'English', rtl: false, active: true },
  { code: 'ar', name: 'العربية', rtl: true, active: true },
  { code: 'ru', name: 'Русский', rtl: false, active: false },
  { code: 'fr', name: 'Français', rtl: false, active: false },
];

/** [code, English, Arabic, dial code, region] */
const COUNTRIES: [string, string, string, string, string][] = [
  ['IN', 'India', 'الهند', '+91', 'South Asia'],
  ['OM', 'Oman', 'سلطنة عُمان', '+968', 'Gulf'],
  ['AE', 'United Arab Emirates', 'الإمارات العربية المتحدة', '+971', 'Gulf'],
  ['SA', 'Saudi Arabia', 'المملكة العربية السعودية', '+966', 'Gulf'],
  ['KW', 'Kuwait', 'الكويت', '+965', 'Gulf'],
  ['QA', 'Qatar', 'قطر', '+974', 'Gulf'],
  ['BH', 'Bahrain', 'البحرين', '+973', 'Gulf'],
  ['IQ', 'Iraq', 'العراق', '+964', 'Middle East'],
  ['YE', 'Yemen', 'اليمن', '+967', 'Middle East'],
  ['EG', 'Egypt', 'مصر', '+20', 'Africa'],
  ['KE', 'Kenya', 'كينيا', '+254', 'Africa'],
  ['NG', 'Nigeria', 'نيجيريا', '+234', 'Africa'],
  ['ET', 'Ethiopia', 'إثيوبيا', '+251', 'Africa'],
  ['TZ', 'Tanzania', 'تنزانيا', '+255', 'Africa'],
  ['UG', 'Uganda', 'أوغندا', '+256', 'Africa'],
  ['BD', 'Bangladesh', 'بنغلاديش', '+880', 'South Asia'],
  ['AF', 'Afghanistan', 'أفغانستان', '+93', 'South Asia'],
  ['UZ', 'Uzbekistan', 'أوزبكستان', '+998', 'Central Asia'],
  ['RU', 'Russia', 'روسيا', '+7', 'Europe'],
  ['GB', 'United Kingdom', 'المملكة المتحدة', '+44', 'Europe'],
  ['US', 'United States', 'الولايات المتحدة', '+1', 'Americas'],
];

/** [slug, English, Arabic] */
const CITIES: [string, string, string][] = [
  ['delhi-ncr', 'Delhi NCR', 'دلهي والمنطقة المحيطة'],
  ['mumbai', 'Mumbai', 'مومباي'],
  ['chennai', 'Chennai', 'تشيناي'],
  ['bengaluru', 'Bengaluru', 'بنغالور'],
  ['hyderabad', 'Hyderabad', 'حيدر أباد'],
  ['kolkata', 'Kolkata', 'كولكاتا'],
];

const SPECIALITIES: [string, string, string][] = [
  ['cardiology', 'Cardiology', 'أمراض القلب'],
  ['orthopaedics', 'Orthopaedics', 'جراحة العظام'],
  ['oncology', 'Oncology', 'الأورام'],
  ['neurosurgery', 'Neurosurgery', 'جراحة الأعصاب'],
  ['transplant', 'Transplant surgery', 'جراحة زراعة الأعضاء'],
  ['ivf', 'Fertility and IVF', 'الخصوبة وأطفال الأنابيب'],
];

/** [slug, speciality slug, English, Arabic, typical stay in days] */
const TREATMENTS: [string, string, string, string, number][] = [
  ['bypass-surgery', 'cardiology', 'Coronary bypass surgery', 'جراحة تجاوز الشريان التاجي', 14],
  ['angioplasty', 'cardiology', 'Angioplasty', 'رأب الأوعية', 5],
  ['knee-replacement', 'orthopaedics', 'Knee replacement', 'استبدال مفصل الركبة', 10],
  ['hip-replacement', 'orthopaedics', 'Hip replacement', 'استبدال مفصل الورك', 10],
  ['spine-surgery', 'neurosurgery', 'Spine surgery', 'جراحة العمود الفقري', 12],
  ['brain-tumour-surgery', 'neurosurgery', 'Brain tumour surgery', 'جراحة أورام المخ', 18],
  ['chemotherapy', 'oncology', 'Chemotherapy', 'العلاج الكيميائي', 7],
  ['bone-marrow-transplant', 'transplant', 'Bone marrow transplant', 'زراعة نخاع العظم', 35],
  ['kidney-transplant', 'transplant', 'Kidney transplant', 'زراعة الكلى', 21],
  ['ivf-cycle', 'ivf', 'IVF cycle', 'دورة أطفال الأنابيب', 15],
];

/** [code, kind, English, Arabic] */
const DOCUMENT_TYPES: [string, string, string, string][] = [
  ['medical_report', 'report', 'Medical report', 'تقرير طبي'],
  ['lab_result', 'report', 'Laboratory result', 'نتيجة مختبر'],
  ['mri_scan', 'scan', 'MRI scan', 'صورة رنين مغناطيسي'],
  ['ct_scan', 'scan', 'CT scan', 'صورة أشعة مقطعية'],
  ['prescription', 'prescription', 'Prescription', 'وصفة طبية'],
  ['passport', 'passport', 'Passport', 'جواز سفر'],
  ['visa', 'visa', 'Visa', 'تأشيرة'],
  ['discharge_summary', 'discharge', 'Discharge summary', 'ملخص الخروج'],
  ['invitation_letter', 'invitation_letter', 'Visa invitation letter', 'خطاب دعوة للتأشيرة'],
];

const LOST_REASONS: [string, string, string][] = [
  ['price_too_high', 'Price too high', 'السعر مرتفع'],
  ['chose_another_country', 'Chose another country', 'اختار دولة أخرى'],
  ['chose_another_provider', 'Chose another provider', 'اختار جهة أخرى'],
  ['no_response', 'No response from the patient', 'لا يوجد رد من المريض'],
  ['visa_refused', 'Visa refused', 'رفض التأشيرة'],
  ['medically_unsuitable', 'Medically unsuitable for travel', 'غير مناسب طبيًا للسفر'],
  ['treated_locally', 'Treated at home', 'تم العلاج محليًا'],
  ['patient_deceased', 'Patient deceased', 'وفاة المريض'],
];

async function seedMasters(prisma: PrismaClient): Promise<void> {
  for (const currency of CURRENCIES) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: currency,
      create: currency,
    });
  }
  for (const language of LANGUAGES) {
    await prisma.language.upsert({
      where: { code: language.code },
      update: language,
      create: language,
    });
  }
  for (const [code, name, arabic, dialCode, region] of COUNTRIES) {
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
      create: { code, name, kind: kind as DocumentKind },
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
