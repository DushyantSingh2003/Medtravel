import { randomUUID } from 'node:crypto';
import {
  CASE_STAGES,
  DEFAULT_STAGE_TARGET_MINUTES,
  STATUS_OF_STAGE,
  type CaseStage,
} from '@medtravel/contracts';
import type { Prisma, PrismaClient } from '../../src/client.ts';
import { devEmail } from './dev-users.ts';

/**
 * Believable demo data for every portal (F-11): three hospitals with departments, doctors and packages, three agencies,
 * and 40 patients whose cases sit in every stage, with the records each stage would have by then. Idempotent: hospitals,
 * doctors, packages and agencies are upserted by a stable key, and the patients (with all that hangs off them) are created
 * once, guarded by the first demo case number. Everything is fictional. Demo case numbers start at 900001 of the year.
 */
export const DEMO_DOMAIN = 'demo.medtravel.test';
const DAY = 86_400_000;
const HOUR = 3_600_000;

interface HospitalSpec {
  slug: string;
  name: string;
  citySlug: string;
  address: string;
  bedCount: number;
  establishedYear: number;
  specialities: string[];
  treatments: string[];
  doctors: [string, string][];
}

const HOSPITALS: HospitalSpec[] = [
  {
    slug: 'dev-hospital',
    name: 'Meridian Heart & Research Institute',
    citySlug: 'delhi-ncr',
    address: 'Sector 12, Saket, New Delhi',
    bedCount: 650,
    establishedYear: 1996,
    specialities: ['cardiology', 'orthopaedics', 'oncology', 'neurosurgery', 'transplant'],
    treatments: [
      'bypass-surgery',
      'angioplasty',
      'knee-replacement',
      'hip-replacement',
      'chemotherapy',
      'radiotherapy',
      'spine-surgery',
      'brain-tumour-surgery',
      'kidney-transplant',
      'liver-transplant',
    ],
    doctors: [
      ['Dr. Rajiv Malhotra', 'cardiology'],
      ['Dr. Anita Deshmukh', 'orthopaedics'],
      ['Dr. Sanjay Kapoor', 'oncology'],
      ['Dr. Vikram Sethi', 'neurosurgery'],
      ['Dr. Meera Iyer', 'transplant'],
    ],
  },
  {
    slug: 'coastal-medicity-mumbai',
    name: 'Coastal Medicity Hospital',
    citySlug: 'mumbai',
    address: 'Bandra Kurla Complex, Mumbai',
    bedCount: 480,
    establishedYear: 2003,
    specialities: ['oncology', 'urology', 'ivf', 'ophthalmology', 'gastroenterology'],
    treatments: [
      'breast-cancer-surgery',
      'immunotherapy',
      'robotic-prostatectomy',
      'kidney-stone-removal',
      'ivf-cycle',
      'icsi',
      'egg-freezing',
      'cataract-surgery',
      'lasik',
      'colonoscopy',
    ],
    doctors: [
      ['Dr. Farah Khan', 'oncology'],
      ['Dr. Nikhil Joshi', 'urology'],
      ['Dr. Priya Nair', 'ivf'],
      ['Dr. Arvind Shah', 'ophthalmology'],
      ['Dr. Kabir Mehta', 'gastroenterology'],
    ],
  },
  {
    slug: 'marina-multispeciality-chennai',
    name: 'Marina Multi-speciality Hospital',
    citySlug: 'chennai',
    address: 'Adyar, Chennai',
    bedCount: 540,
    establishedYear: 1999,
    specialities: ['cardiac-surgery', 'orthopaedics', 'bariatric-surgery', 'dental', 'ent'],
    treatments: [
      'bypass-surgery',
      'angioplasty',
      'knee-replacement',
      'shoulder-replacement',
      'gastric-bypass',
      'sleeve-gastrectomy',
      'dental-implants',
      'cochlear-implant',
      'sinus-surgery',
      'hip-replacement',
    ],
    doctors: [
      ['Dr. Lakshmi Narayanan', 'cardiac-surgery'],
      ['Dr. Suresh Babu', 'orthopaedics'],
      ['Dr. Kavitha Raman', 'bariatric-surgery'],
      ['Dr. Arjun Pillai', 'dental'],
      ['Dr. Deepa Krishnan', 'ent'],
    ],
  },
];

const AGENTS = [
  {
    code: 'DEMO-IQ-001',
    company: 'Baghdad Medical Travel',
    contact: 'Hassan Al-Jaberi',
    country: 'IQ',
    languages: ['ar', 'en'],
  },
  {
    code: 'DEMO-UZ-001',
    company: 'Tashkent Health Bridge',
    contact: 'Dilshod Karimov',
    country: 'UZ',
    languages: ['ru', 'en'],
  },
  {
    code: 'DEMO-KE-001',
    company: 'Nairobi Care Connect',
    contact: 'Wanjiru Mwangi',
    country: 'KE',
    languages: ['en', 'sw'],
  },
] as const;

const NAMES: Record<string, string[]> = {
  IQ: [
    'Ali Hussein',
    'Zainab Al-Rubaie',
    'Mustafa Kadhim',
    'Noor Al-Tamimi',
    'Hiba Jassim',
    'Omar Al-Saadi',
    'Fatima Abbas',
    'Karrar Mahdi',
    'Sara Al-Obaidi',
    'Yousif Naji',
    'Rana Hamid',
    'Haider Salman',
  ],
  UZ: [
    'Aziz Rakhimov',
    'Malika Yusupova',
    'Bobur Tashkentov',
    'Nilufar Karimova',
    'Sardor Abdullaev',
    'Dilnoza Umarova',
    'Jasur Ismoilov',
    'Madina Saidova',
  ],
  KE: [
    'James Otieno',
    'Grace Wambui',
    'Peter Kamau',
    'Mercy Achieng',
    'Brian Mutua',
    'Faith Njeri',
    'Samuel Kiprop',
    'Lucy Wanjiku',
  ],
  AE: [
    'Khalid Al-Mansoori',
    'Aisha Al-Falasi',
    'Rashid Al-Nuaimi',
    'Mariam Al-Kaabi',
    'Saeed Al-Zaabi',
  ],
  OM: ['Salim Al-Harthy', 'Huda Al-Balushi', 'Nasser Al-Rashdi', 'Amal Al-Siyabi'],
  NG: ['Chinedu Okafor', 'Ngozi Adeyemi', 'Tunde Bakare'],
};
const COUNTRY_PLAN = [
  ...Array<string>(12).fill('IQ'),
  ...Array<string>(8).fill('UZ'),
  ...Array<string>(8).fill('KE'),
  ...Array<string>(5).fill('AE'),
  ...Array<string>(4).fill('OM'),
  ...Array<string>(3).fill('NG'),
];
const PHONE_PREFIX: Record<string, string> = {
  IQ: '+9647',
  UZ: '+9989',
  KE: '+2547',
  AE: '+9715',
  OM: '+9689',
  NG: '+2348',
};
const LANGUAGE: Record<string, string> = {
  IQ: 'ar',
  UZ: 'ru',
  KE: 'en',
  AE: 'ar',
  OM: 'ar',
  NG: 'en',
};
const CONDITIONS: [string, string, string][] = [
  ['Coronary artery disease, two vessels blocked', 'bypass-surgery', 'cardiology'],
  ['Severe knee osteoarthritis, both knees', 'knee-replacement', 'orthopaedics'],
  ['Breast cancer stage II, needs surgery and chemotherapy', 'breast-cancer-surgery', 'oncology'],
  ['Lumbar disc herniation with nerve compression', 'spine-surgery', 'neurosurgery'],
  ['End-stage kidney disease, living donor available', 'kidney-transplant', 'transplant'],
  ['Infertility after five years, previous failed cycles', 'ivf-cycle', 'ivf'],
  ['Bilateral cataracts affecting daily life', 'cataract-surgery', 'ophthalmology'],
  ['Morbid obesity, BMI 41, diabetes', 'gastric-bypass', 'bariatric-surgery'],
  ['Hip fracture not healed after six months', 'hip-replacement', 'orthopaedics'],
  ['Prostate enlargement needing surgery', 'robotic-prostatectomy', 'urology'],
  ['Blocked left coronary artery, repeat angina', 'angioplasty', 'cardiology'],
  ['Hearing loss in both ears, cochlear implant candidate', 'cochlear-implant', 'ent'],
];

type Plan = {
  stage: CaseStage;
  lostAt?: CaseStage;
  hold?: boolean;
  closed?: boolean;
  lost?: boolean;
};
/** 40 cases: every stage, a closed one, one on hold, and five lost at different points. */
const PLANS: Plan[] = [
  ...[...Array(4)].map((): Plan => ({ stage: 'enquiry' })),
  ...[...Array(4)].map((): Plan => ({ stage: 'qualification' })),
  ...[...Array(3)].map((): Plan => ({ stage: 'medical_review' })),
  ...[...Array(4)].map((): Plan => ({ stage: 'hospital_opinions' })),
  ...[...Array(3)].map((): Plan => ({ stage: 'quote_decision' })),
  ...[...Array(2)].map((): Plan => ({ stage: 'booking_deposit' })),
  ...[...Array(3)].map((): Plan => ({ stage: 'visa' })),
  ...[...Array(2)].map((): Plan => ({ stage: 'travel_planning' })),
  ...[...Array(2)].map((): Plan => ({ stage: 'arrival' })),
  ...[...Array(2)].map((): Plan => ({ stage: 'treatment' })),
  { stage: 'discharge_return' },
  ...[...Array(3)].map((): Plan => ({ stage: 'follow_up' })),
  { stage: 'follow_up', closed: true },
  ...(
    ['enquiry', 'qualification', 'medical_review', 'hospital_opinions', 'quote_decision'] as const
  ).map((lostAt): Plan => ({ stage: 'enquiry', lost: true, lostAt })),
  { stage: 'visa', hold: true },
];

const idx = (stage: CaseStage) => CASE_STAGES.indexOf(stage);

async function lookup(prisma: PrismaClient) {
  const [cities, specialities, treatments, countries] = await Promise.all([
    prisma.city.findMany({ select: { id: true, slug: true } }),
    prisma.speciality.findMany({ select: { id: true, slug: true } }),
    prisma.treatment.findMany({ select: { id: true, slug: true, specialityId: true } }),
    prisma.country.findMany({
      where: { code: { in: ['IQ', 'UZ', 'KE', 'AE', 'OM', 'NG', 'IN'] } },
      select: { code: true },
    }),
  ]);
  const by = <T extends { slug: string }>(rows: T[]) => new Map(rows.map((r) => [r.slug, r]));
  return {
    cities: by(cities),
    specialities: by(specialities),
    treatments: by(treatments),
    countries: new Set(countries.map((c) => c.code)),
  };
}

async function seedHospitals(prisma: PrismaClient, ref: Awaited<ReturnType<typeof lookup>>) {
  const hospitalIds: string[] = [];
  const packageByHospital = new Map<
    string,
    { id: string; treatmentSlug: string; priceMinor: number }[]
  >();
  const doctorByHospital = new Map<string, string[]>();
  for (const [h, spec] of HOSPITALS.entries()) {
    const city = ref.cities.get(spec.citySlug);
    if (!city) throw new Error(`Unknown city ${spec.citySlug}`);
    const data = {
      name: spec.name,
      status: 'published' as const,
      address: spec.address,
      website: `https://${spec.slug}.example.com`,
      email: `info@${spec.slug}.example.com`,
      phone: `+9111${String(4000000 + h * 1111111).slice(0, 8)}`,
      description: `${spec.name} is a fictional partner hospital used for demonstration.`,
      internationalDeskName: 'International Patient Desk',
      internationalDeskEmail: `intl@${spec.slug}.example.com`,
      agreementBp: 1200 + h * 100,
      bedCount: spec.bedCount,
      establishedYear: spec.establishedYear,
      publishedAt: new Date(),
      cityId: city.id,
    };
    const hospital = await prisma.hospital.upsert({
      where: { slug: spec.slug },
      update: {},
      create: { slug: spec.slug, ...data },
    });
    hospitalIds.push(hospital.id);
    // The development hospital is renamed once, and only while it still has the name the dev-user seed gave it.
    if (spec.slug === 'dev-hospital')
      await prisma.hospital.updateMany({
        where: { slug: spec.slug, name: 'Dev Hospital' },
        data,
      });
    for (const body of ['nabh', 'jci'] as const) {
      const has = await prisma.accreditation.findFirst({
        where: { hospitalId: hospital.id, body },
        select: { id: true },
      });
      if (!has) await prisma.accreditation.create({ data: { body, hospitalId: hospital.id } });
    }
    for (const slug of spec.specialities) {
      const speciality = ref.specialities.get(slug);
      if (speciality)
        await prisma.department.upsert({
          where: {
            hospitalId_specialityId: { hospitalId: hospital.id, specialityId: speciality.id },
          },
          update: {},
          create: { hospitalId: hospital.id, specialityId: speciality.id },
        });
    }
    const doctorIds: string[] = [];
    for (const [d, [fullName, specialitySlug]] of spec.doctors.entries()) {
      const speciality = ref.specialities.get(specialitySlug);
      if (!speciality) continue;
      const slug = `${spec.slug}-doctor-${d + 1}`;
      const doctor = await prisma.doctor.upsert({
        where: { slug },
        update: {},
        create: {
          slug,
          fullName,
          hospitalId: hospital.id,
          specialityId: speciality.id,
          qualifications: 'MBBS, MS, fellowship (fictional)',
          experienceYears: 12 + d * 3,
          consultFeeMinor: BigInt(8000 + d * 1000),
          consultFeeCurrency: 'USD',
          published: true,
          bio: `${fullName} treats international patients and consults by video.`,
        },
      });
      doctorIds.push(doctor.id);
    }
    doctorByHospital.set(hospital.id, doctorIds);
    const packages: { id: string; treatmentSlug: string; priceMinor: number }[] = [];
    for (const [p, treatmentSlug] of spec.treatments.entries()) {
      const treatment = ref.treatments.get(treatmentSlug);
      if (!treatment) continue;
      const name = `${treatmentSlug.replace(/-/g, ' ')} package`;
      const priceMinor = (3500 + ((h * 7 + p * 13) % 20) * 450) * 100;
      const existing = await prisma.package.findFirst({
        where: { hospitalId: hospital.id, treatmentId: treatment.id, name },
      });
      const pack =
        existing ??
        (await prisma.package.create({
          data: {
            name,
            roomCategory: p % 2 ? 'Private room' : 'Twin sharing',
            priceMinor: BigInt(priceMinor),
            stayDays: 5 + (p % 6),
            currency: 'USD',
            hospitalId: hospital.id,
            treatmentId: treatment.id,
          },
        }));
      packages.push({ id: pack.id, treatmentSlug, priceMinor: Number(pack.priceMinor) });
    }
    packageByHospital.set(hospital.id, packages);
  }
  return { hospitalIds, packageByHospital, doctorByHospital };
}

async function seedAgents(prisma: PrismaClient) {
  const ids: string[] = [];
  for (const a of AGENTS) {
    const agent = await prisma.agent.upsert({
      where: { referralCode: a.code },
      update: {},
      create: {
        referralCode: a.code,
        companyName: a.company,
        contactName: a.contact,
        email: `${a.code.toLowerCase()}@${DEMO_DOMAIN}`,
        status: 'approved',
        approvedAt: new Date(),
        countryCode: a.country,
        languages: [...a.languages],
      },
    });
    ids.push(agent.id);
  }
  const devAgent = await prisma.user.findUnique({
    where: { email: devEmail('agent') },
    select: { id: true },
  });
  if (devAgent && ids[0])
    await prisma.agentUser.upsert({
      where: { userId: devAgent.id },
      update: {},
      create: { userId: devAgent.id, agentId: ids[0], owner: true },
    });
  return ids;
}

/** Points the development doctor at a doctor record and the ground coordinator at Delhi, so their portals have cases. */
async function linkDevStaff(
  prisma: PrismaClient,
  hosp: Awaited<ReturnType<typeof seedHospitals>>,
  ref: Awaited<ReturnType<typeof lookup>>,
): Promise<void> {
  const doctorUser = await prisma.user.findUnique({
    where: { email: devEmail('doctor') },
    select: { id: true },
  });
  const delhi = hosp.hospitalIds[0];
  const doctorId = delhi ? hosp.doctorByHospital.get(delhi)?.[0] : undefined;
  if (doctorUser && delhi && doctorId)
    await prisma.hospitalStaff.updateMany({
      where: { userId: doctorUser.id, hospitalId: delhi },
      data: { doctorId },
    });
  const coordinator = await prisma.user.findUnique({
    where: { email: devEmail('ground_coordinator') },
    select: { id: true },
  });
  const city = ref.cities.get('delhi-ncr');
  if (coordinator && city)
    await prisma.staffProfile.updateMany({
      where: { userId: coordinator.id },
      data: { cityId: city.id },
    });
}

/** The patients, their cases and everything each case would have by its stage. */
async function seedCases(
  prisma: PrismaClient,
  ref: Awaited<ReturnType<typeof lookup>>,
  hosp: Awaited<ReturnType<typeof seedHospitals>>,
  agentIds: string[],
): Promise<number> {
  const now = Date.now();
  const year = new Date().getUTCFullYear();
  // The second demo patient always exists once the demo data does (the first may be the development patient), whatever the year.
  const existing = await prisma.patient.findFirst({
    where: { email: `demo-02@${DEMO_DOMAIN}` },
    select: { id: true },
  });
  if (existing) return 0;
  const [owner, reviewer, devPatientUser, lostReasons, desk] = await Promise.all([
    prisma.user.findUnique({ where: { email: devEmail('case_manager') }, select: { id: true } }),
    prisma.user.findUnique({
      where: { email: devEmail('medical_reviewer') },
      select: { id: true },
    }),
    prisma.user.findUnique({ where: { email: devEmail('patient') }, select: { id: true } }),
    prisma.lostReason.findMany({ select: { id: true } }),
    prisma.user.findUnique({ where: { email: devEmail('hospital_desk') }, select: { id: true } }),
  ]);
  const devAttendant = await prisma.attendant.findFirst({
    where: { user: { email: devEmail('attendant') } },
    select: { id: true },
  });
  const devPatient = devPatientUser
    ? await prisma.patient.findUnique({
        where: { userId: devPatientUser.id },
        select: { id: true },
      })
    : null;

  const rows = {
    patients: [] as Prisma.PatientCreateManyInput[],
    cases: [] as Prisma.CaseCreateManyInput[],
    history: [] as Prisma.CaseStageHistoryCreateManyInput[],
    intakes: [] as Prisma.CaseIntakeCreateManyInput[],
    summaries: [] as Prisma.MedicalSummaryCreateManyInput[],
    consents: [] as Prisma.ConsentCreateManyInput[],
    requests: [] as Prisma.OpinionRequestCreateManyInput[],
    opinions: [] as Prisma.OpinionCreateManyInput[],
    quotes: [] as Prisma.QuoteCreateManyInput[],
    quoteLines: [] as Prisma.QuoteLineCreateManyInput[],
    payments: [] as Prisma.PaymentCreateManyInput[],
    visas: [] as Prisma.VisaApplicationCreateManyInput[],
    bookings: [] as Prisma.BookingCreateManyInput[],
    tasks: [] as Prisma.TaskCreateManyInput[],
    conversations: [] as Prisma.ConversationCreateManyInput[],
    messages: [] as Prisma.MessageCreateManyInput[],
    documents: [] as Prisma.DocumentCreateManyInput[],
    shares: [] as Prisma.DocumentShareCreateManyInput[],
    caseAttendants: [] as Prisma.CaseAttendantCreateManyInput[],
  };
  const countryCounters: Record<string, number> = {};

  for (const [n, plan] of PLANS.entries()) {
    const country = COUNTRY_PLAN[n] ?? 'IQ';
    const used = (countryCounters[country] = (countryCounters[country] ?? 0) + 1);
    const names = NAMES[country] ?? NAMES['IQ']!;
    const fullName = names[(used - 1) % names.length] as string;
    const [condition, treatmentSlug, specialitySlug] = CONDITIONS[n % CONDITIONS.length] as [
      string,
      string,
      string,
    ];
    const treatment = ref.treatments.get(treatmentSlug);
    const speciality = ref.specialities.get(specialitySlug);
    const patientId = n === 0 && devPatient ? devPatient.id : randomUUID();
    const caseId = randomUUID();
    const stage = plan.lost ? (plan.lostAt as CaseStage) : plan.stage;
    const at = idx(stage);
    const created = now - (90 - n * 2) * DAY;
    const agentIndex = country === 'IQ' ? 0 : country === 'UZ' ? 1 : country === 'KE' ? 2 : -1;
    const agentId = agentIndex >= 0 && n % 2 === 0 ? agentIds[agentIndex] : undefined;
    const exit = plan.lost ? 'lost' : plan.hold ? 'on_hold' : null;
    const enteredAt = new Date(now - (plan.closed ? 20 : 1 + (n % 9)) * DAY - (n % 5) * HOUR);
    // Travel dates: ahead of us until arrival, under way during treatment, in the past once the patient is home.
    const arrivalDays = at === 7 ? 12 : at === 8 ? 1 : at === 9 ? -6 : -25;
    const target = DEFAULT_STAGE_TARGET_MINUTES[CASE_STAGES[at] as CaseStage];

    if (!(n === 0 && devPatient))
      rows.patients.push({
        id: patientId,
        fullName,
        email: `demo-${String(n + 1).padStart(2, '0')}@${DEMO_DOMAIN}`,
        // Reserved-looking numbers (all zeros then a serial) so no message can reach a real person.
        phone: `${PHONE_PREFIX[country]}0000${String(n + 1).padStart(4, '0')}`,
        gender: n % 2 ? 'female' : 'male',
        dateOfBirth: new Date(Date.UTC(1950 + ((n * 7) % 45), n % 12, 1 + (n % 27))),
        nationalityCode: country,
        countryOfResidenceCode: country,
        preferredLanguage: LANGUAGE[country] ?? 'en',
      });
    rows.cases.push({
      id: caseId,
      caseNo: `CASE-${year}-${String(900_001 + n)}`,
      patientId,
      stage: exit ?? stage,
      status: plan.closed ? 'closed' : (exit ?? STATUS_OF_STAGE[stage]),
      urgency: (['routine', 'soon', 'urgent', 'routine'] as const)[n % 4],
      source: agentId ? 'agent' : (['website', 'whatsapp', 'phone', 'website'] as const)[n % 4],
      budgetMinor: BigInt((8 + (n % 12)) * 100_000),
      budgetCurrency: 'USD',
      preferredLanguage: LANGUAGE[country] ?? 'en',
      countryCode: country,
      treatmentId: treatment?.id,
      agentId,
      ownerId: at >= 1 ? owner?.id : null,
      reviewerId: at >= 2 ? reviewer?.id : null,
      hospitalId: at >= 5 ? hosp.hospitalIds[n % 3] : null,
      stageEnteredAt: enteredAt,
      createdAt: new Date(created),
      slaDueAt:
        exit || plan.closed || !target ? null : new Date(enteredAt.getTime() + target * 60_000),
      slaBreachedAt:
        !exit && !plan.closed && target && enteredAt.getTime() + target * 60_000 < now
          ? new Date(enteredAt.getTime() + target * 60_000 + HOUR)
          : null,
      closedAt: plan.closed || plan.lost ? enteredAt : null,
      lostReasonId: plan.lost ? lostReasons[n % Math.max(lostReasons.length, 1)]?.id : null,
      plannedArrivalAt: at >= 7 ? new Date(now + arrivalDays * DAY) : null,
      plannedDepartureAt: at >= 7 ? new Date(now + (arrivalDays + 12) * DAY) : null,
    });
    // History: one row per stage reached, spaced from creation to the time it entered the current stage.
    const reached = CASE_STAGES.slice(0, at + 1);
    const span = Math.max(enteredAt.getTime() - created, reached.length);
    /** When the case entered stage i; the records of that stage are dated from it. */
    const tAt = (i: number) => created + (span * Math.min(i, at)) / Math.max(reached.length - 1, 1);
    reached.forEach((s, i) => {
      rows.history.push({
        caseId,
        fromStage: i === 0 ? null : reached[i - 1],
        toStage: s,
        actorId: owner?.id ?? null,
        createdAt: new Date(tAt(i)),
      });
    });
    if (exit)
      rows.history.push({
        caseId,
        fromStage: stage,
        toStage: exit,
        actorId: owner?.id ?? null,
        note: plan.lost ? 'Patient declined' : 'Waiting for patient to confirm dates',
        // A second after the last stage row, so the order is the same on every run.
        createdAt: new Date(enteredAt.getTime() + 1000),
      });
    if (n === 0 && devAttendant) rows.caseAttendants.push({ caseId, attendantId: devAttendant.id });
    rows.intakes.push({
      caseId,
      condition,
      history: 'Referred with reports; no known drug allergies.',
      medications: 'As prescribed by the home physician.',
    });

    const reportId = randomUUID();
    if (at >= 2) {
      rows.summaries.push({
        caseId,
        version: 1,
        diagnosis: condition,
        findings: 'Reports reviewed and complete.',
        urgency: 'routine',
        reviewerId: reviewer?.id,
        recommendedSpecialityId: speciality?.id,
      });
      rows.documents.push(
        {
          id: reportId,
          kind: 'report',
          fileName: 'medical-report.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 182_400,
          storageKey: `demo/${caseId}/medical-report.pdf`,
          scanStatus: 'clean',
          scannedAt: new Date(tAt(2)),
          pageCount: 6,
          patientId,
          caseId,
        },
        {
          kind: 'passport',
          fileName: 'passport.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 94_100,
          storageKey: `demo/${caseId}/passport.pdf`,
          scanStatus: 'clean',
          scannedAt: new Date(tAt(2)),
          pageCount: 2,
          patientId,
          caseId,
        },
      );
    }
    // Opinions: three hospitals asked from "hospital opinions" on; answered once the case is past that stage.
    const asked = at >= 3 ? hosp.hospitalIds : [];
    const opinionIds: {
      requestId: string;
      opinionId: string;
      hospitalId: string;
      estimate: number;
    }[] = [];
    for (const [k, hospitalId] of asked.entries()) {
      const consentId = randomUUID();
      const requestId = randomUUID();
      const answered = at > 3 || (at === 3 && k === 0);
      rows.consents.push({
        id: consentId,
        type: 'share_medical_with_hospital',
        patientId,
        caseId,
        hospitalId,
        textVersion: 'share-medical-v1',
        grantedAt: new Date(tAt(3) - HOUR),
      });
      if (at >= 2)
        rows.shares.push({
          documentId: reportId,
          hospitalId,
          consentId,
          sharedById: owner?.id ?? null,
        });
      rows.requests.push({
        id: requestId,
        caseId,
        hospitalId,
        status: answered ? 'answered' : 'viewed',
        sentAt: new Date(tAt(3)),
        dueAt: new Date(tAt(3) + 2 * DAY),
        viewedAt: new Date(tAt(3) + HOUR),
        respondedAt: answered ? new Date(tAt(3) + DAY) : null,
        consentId,
        doctorId: k === 0 ? hosp.doctorByHospital.get(hospitalId)?.[0] : null,
        sentById: owner?.id,
        summaryId: null,
      });
      if (answered) {
        const pack =
          hosp.packageByHospital.get(hospitalId)?.find((p) => p.treatmentSlug === treatmentSlug) ??
          hosp.packageByHospital.get(hospitalId)?.[0];
        const estimate = (pack?.priceMinor ?? 600_000) + k * 40_000;
        const opinionId = randomUUID();
        rows.opinions.push({
          id: opinionId,
          opinionRequestId: requestId,
          treatmentPlan: `Proposed plan for ${treatmentSlug.replace(/-/g, ' ')} with ${5 + k} days in hospital and follow-up teleconsults.`,
          stayDaysHospital: 5 + k,
          stayDaysOutside: 7,
          estimateMinor: BigInt(estimate),
          currency: 'USD',
          packageId: pack?.id,
          submittedById: desk?.id,
          validUntil: new Date(now + 20 * DAY),
        });
        opinionIds.push({ requestId, opinionId, hospitalId, estimate });
      }
    }
    if (agentId)
      rows.consents.push({
        type: 'share_stage_with_agent',
        patientId,
        caseId,
        agentId,
        textVersion: 'share-stage-v1',
        grantedAt: new Date(created),
      });
    // Quote, then the money.
    if (at >= 4 && opinionIds[0]) {
      const quoteId = randomUUID();
      const base = opinionIds[0].estimate;
      const lines: [Prisma.QuoteLineCreateManyInput['kind'], string, number][] = [
        ['hospital', 'Hospital package', base],
        ['stay', 'Guest house, 8 nights', 64_000],
        ['transfer', 'Airport transfers', 12_000],
        ['service_fee', 'Service fee', Number((BigInt(base) * 8n) / 100n)],
      ];
      const total = lines.reduce((sum, l) => sum + l[2], 0);
      const deposit = (BigInt(total) * 30n) / 100n;
      rows.quotes.push({
        id: quoteId,
        quoteNo: `Q-${String(900_001 + n)}`,
        caseId,
        opinionId: opinionIds[0].opinionId,
        status: at >= 5 ? 'accepted' : 'sent',
        totalMinor: BigInt(total),
        currency: 'USD',
        sentAt: new Date(tAt(4)),
        acceptedAt: at >= 5 ? new Date(tAt(5)) : null,
        fxRate: '1.00000000',
        fxRateAt: new Date(tAt(4)),
        fxSource: 'seed',
        validUntil: new Date(now + 10 * DAY),
        fxBaseCurrency: 'USD',
        createdById: owner?.id,
      });
      lines.forEach(([kind, description, amount], i) =>
        rows.quoteLines.push({
          quoteId,
          kind,
          description,
          unitPriceMinor: BigInt(amount),
          amountMinor: BigInt(amount),
          currency: 'USD',
          sortOrder: i,
        }),
      );
      if (at >= 5)
        rows.payments.push({
          type: 'deposit',
          method: 'bank_wire',
          status: at >= 6 ? 'succeeded' : 'pending',
          amountMinor: deposit,
          currency: 'USD',
          paidAt: at >= 6 ? new Date(tAt(6)) : null,
          caseId,
          quoteId,
          payerName: fullName,
        });
      if (at >= 10)
        rows.payments.push({
          type: 'service',
          method: 'card',
          status: 'succeeded',
          amountMinor: BigInt(total) - deposit,
          currency: 'USD',
          paidAt: new Date(tAt(10)),
          caseId,
          quoteId,
          payerName: fullName,
        });
    }
    if (at >= 6)
      rows.visas.push({
        caseId,
        patientId,
        status:
          at >= 7
            ? 'approved'
            : (['documents_pending', 'invitation_issued', 'applied'] as const)[n % 3],
        applicationId: `EMV-${900_000 + n}`,
        appliedAt: new Date(tAt(6) + DAY),
        decisionAt: at >= 7 ? new Date(tAt(7)) : null,
      });
    if (at >= 7) {
      const arrival = new Date(now + (at === 7 ? 12 : at === 8 ? 1 : -6) * DAY);
      rows.bookings.push(
        {
          type: 'flight',
          status: 'confirmed',
          startsAt: arrival,
          reference: `PNR${100_000 + n}`,
          caseId,
          currency: 'USD',
          priceMinor: 45_000n,
        },
        {
          type: 'stay',
          status: at >= 8 ? 'in_progress' : 'confirmed',
          startsAt: arrival,
          endsAt: new Date(arrival.getTime() + 12 * DAY),
          caseId,
          currency: 'USD',
          priceMinor: 64_000n,
        },
        {
          type: 'transfer',
          status: at >= 8 ? 'completed' : 'requested',
          startsAt: arrival,
          caseId,
          currency: 'USD',
          priceMinor: 6_000n,
        },
      );
    }
    // Tasks and a short conversation.
    if (!exit && !plan.closed)
      rows.tasks.push(
        {
          title: 'Follow up with the patient',
          caseId,
          assigneeId: owner?.id,
          dueAt: new Date(now + ((n % 5) - 1) * DAY),
          priority: n % 4 === 0 ? 'high' : 'normal',
          createdById: owner?.id,
        },
        {
          title: 'Check the documents are complete',
          caseId,
          assigneeId: owner?.id,
          dueAt: new Date(now + (1 + (n % 3)) * DAY),
          createdById: owner?.id,
        },
      );
    const conversationId = randomUUID();
    rows.conversations.push({
      id: conversationId,
      kind: 'patient',
      subject: 'Your treatment enquiry',
      caseId,
      lastMessageAt: new Date(now - (n % 6) * HOUR),
    });
    rows.messages.push(
      {
        conversationId,
        channel: 'whatsapp',
        direction: 'inbound',
        body: `Hello, I need help with: ${condition.toLowerCase()}.`,
        senderLabel: fullName,
        createdAt: new Date(created + HOUR),
        deliveredAt: new Date(created + HOUR),
      },
      {
        conversationId,
        channel: 'whatsapp',
        direction: 'outbound',
        body: 'Thank you for contacting MedTravel. Please send your latest reports and we will arrange the best hospital options.',
        senderId: owner?.id,
        senderLabel: 'Care team',
        createdAt: new Date(created + 2 * HOUR),
        deliveredAt: new Date(created + 2 * HOUR),
        readAt: new Date(created + 3 * HOUR),
      },
      {
        conversationId,
        channel: 'whatsapp',
        direction: 'inbound',
        body: 'I have uploaded them. When can I hear back?',
        senderLabel: fullName,
        createdAt: new Date(now - (n % 6) * HOUR - HOUR),
      },
    );
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.patient.createMany({ data: rows.patients });
      await tx.case.createMany({ data: rows.cases });
      await tx.caseStageHistory.createMany({ data: rows.history });
      await tx.caseIntake.createMany({ data: rows.intakes });
      await tx.medicalSummary.createMany({ data: rows.summaries });
      await tx.consent.createMany({ data: rows.consents });
      await tx.opinionRequest.createMany({ data: rows.requests });
      await tx.opinion.createMany({ data: rows.opinions });
      await tx.quote.createMany({ data: rows.quotes });
      await tx.quoteLine.createMany({ data: rows.quoteLines });
      await tx.payment.createMany({ data: rows.payments });
      await tx.visaApplication.createMany({ data: rows.visas });
      await tx.booking.createMany({ data: rows.bookings });
      await tx.task.createMany({ data: rows.tasks });
      await tx.conversation.createMany({ data: rows.conversations });
      await tx.message.createMany({ data: rows.messages });
      await tx.document.createMany({ data: rows.documents });
      await tx.documentShare.createMany({ data: rows.shares });
      await tx.caseAttendant.createMany({ data: rows.caseAttendants });
    },
    { timeout: 25_000 },
  );
  return rows.cases.length;
}

/** Demo data for every portal. Returns the number of cases created (0 when it already exists). */
export async function seedDemoData(
  prisma: PrismaClient,
): Promise<{ cases: number; hospitals: number }> {
  // Fictional hospitals, patients and payments must never reach a real database (same rule as the development users).
  if (!['development', 'test'].includes(process.env['NODE_ENV'] ?? 'development'))
    throw new Error('Refusing to create demo data outside development and test');
  const ref = await lookup(prisma);
  for (const code of ['IQ', 'UZ', 'KE', 'AE', 'OM', 'NG', 'IN'])
    if (!ref.countries.has(code))
      throw new Error(`Seed the master data first: country ${code} is missing`);
  const hosp = await seedHospitals(prisma, ref);
  const agentIds = await seedAgents(prisma);
  await linkDevStaff(prisma, hosp, ref);
  const cases = await seedCases(prisma, ref, hosp, agentIds);
  return { cases, hospitals: hosp.hospitalIds.length };
}
