/**
 * Renders docs/data-model.md from prisma/schema.prisma, so the entity reference cannot go stale: a test
 * fails when the committed file differs from this output. Regenerate with
 * `pnpm --filter @medtravel/db docs:model`.
 */

interface Field {
  name: string;
  type: string;
  optional: boolean;
  list: boolean;
  attrs: string;
}

interface Model {
  name: string;
  doc: string;
  fields: Field[];
  blockAttrs: string[];
}

export interface Enum {
  name: string;
  doc: string;
  values: string[];
}

const DOMAINS: { title: string; blurb: string; models: string[] }[] = [
  {
    title: 'Master data and translations',
    blurb:
      'Reference tables edited by admins (PRD 9.1). Countries, languages and currencies are keyed by their ISO or BCP 47 code. Every translatable master has a `<Name>Translation` table with one row per language; the English text lives on the master row.',
    models: [
      'Country',
      'CountryTranslation',
      'Language',
      'Currency',
      'FxRate',
      'Speciality',
      'SpecialityTranslation',
      'Treatment',
      'TreatmentTranslation',
      'City',
      'CityTranslation',
      'DocumentType',
      'DocumentTypeTranslation',
      'LostReason',
      'LostReasonTranslation',
    ],
  },
  {
    title: 'Users and access',
    blurb:
      'One `User` per login. What a user is linked to depends on the role: a Patient, an agent organisation, a hospital, or our own staff.',
    models: [
      'User',
      'Session',
      'AuthChallenge',
      'BackupCode',
      'StaffProfile',
      'AgentUser',
      'HospitalStaff',
    ],
  },
  {
    title: 'Patients and consent',
    blurb: 'Personal and medical data. Hospitals and agents see only what a `Consent` row allows.',
    models: ['Patient', 'Attendant', 'CaseAttendant', 'Consent'],
  },
  {
    title: 'Cases',
    blurb:
      'The central entity: one patient, one treatment episode. Everything else hangs off the Case.',
    models: [
      'Case',
      'CaseIntake',
      'CaseNote',
      'CaseStageHistory',
      'MedicalSummary',
      'Document',
      'FileUpload',
      'DocumentShare',
    ],
  },
  {
    title: 'Hospitals and doctors',
    blurb: 'Partner hospitals, their doctors and fixed-price packages.',
    models: [
      'Hospital',
      'HospitalTranslation',
      'HospitalBranch',
      'Accreditation',
      'Department',
      'Doctor',
      'DoctorTranslation',
      'Package',
      'PackageTranslation',
      'Admission',
    ],
  },
  {
    title: 'Opinions and quotes',
    blurb:
      'A case goes to hospitals as `OpinionRequest`s, they answer with an `Opinion`, and we offer the patient a `Quote`.',
    models: ['OpinionRequest', 'Opinion', 'Quote', 'QuoteLine'],
  },
  {
    title: 'Money',
    blurb: 'Invoices, payments, refunds. Amounts are integer minor units next to a currency code.',
    models: ['Invoice', 'InvoiceLine', 'CreditNote', 'Payment', 'Refund'],
  },
  {
    title: 'Visa and logistics',
    blurb:
      'The visa tracker, bookings, and the masters the logistics board uses (stays, vendors, drivers, vehicles, interpreters).',
    models: [
      'VisaApplication',
      'Booking',
      'Vendor',
      'Stay',
      'StayRoom',
      'StayHospitalDistance',
      'Driver',
      'Vehicle',
      'Interpreter',
    ],
  },
  {
    title: 'Agents and commission',
    blurb: 'Referral partners, how they are paid, and what they earned.',
    models: ['Agent', 'CommissionPlan', 'CommissionRule', 'Commission', 'Payout'],
  },
  {
    title: 'Work, messages and feedback',
    blurb: 'Tasks, conversations, notifications, ratings and incidents.',
    models: [
      'Task',
      'Conversation',
      'Message',
      'MessageAttachment',
      'Notification',
      'NotificationPreference',
      'Feedback',
      'Incident',
    ],
  },
  {
    title: 'Platform',
    blurb: 'Audit trail, the event outbox and the counters behind human-readable numbers.',
    models: ['AuditEvent', 'OutboxEvent', 'ProcessedWebhook', 'NumberSequence'],
  },
];

export function parseSchema(schema: string): { models: Model[]; enums: Enum[] } {
  const models: Model[] = [];
  const enums: Enum[] = [];
  const blocks = schema.matchAll(/((?:^\/\/\/.*\n)*)^(model|enum) (\w+) \{\n([\s\S]*?)\n\}/gm);
  for (const match of blocks) {
    const doc = (match[1] ?? '')
      .split('\n')
      .map((line) => line.replace(/^\/\/\/\s?/, '').trim())
      .filter(Boolean)
      .join(' ');
    const lines = match[4]!
      .split('\n')
      .map((line) => line.trim().replace(/\s+/g, ' '))
      .filter((line) => line && !line.startsWith('//'));
    if (match[2] === 'enum') {
      enums.push({ name: match[3]!, doc, values: lines });
      continue;
    }
    const fields: Field[] = [];
    const blockAttrs: string[] = [];
    for (const line of lines) {
      if (line.startsWith('@@')) {
        blockAttrs.push(line);
        continue;
      }
      const [name, rawType, ...rest] = line.split(' ');
      fields.push({
        name: name!,
        type: rawType!.replace(/[?[\]]/g, ''),
        optional: rawType!.endsWith('?'),
        list: rawType!.endsWith('[]'),
        attrs: rest.join(' '),
      });
    }
    models.push({ name: match[3]!, doc, fields, blockAttrs });
  }
  return { models, enums };
}

const code = (items: string[]) =>
  items.length ? items.map((item) => `\`${item}\``).join(', ') : '';

function describe(model: Model, modelNames: Set<string>) {
  const belongsTo = model.fields
    .filter(
      (f) =>
        modelNames.has(f.type) &&
        !f.list &&
        f.attrs.includes('@relation(') &&
        f.type !== 'Currency',
    )
    .map((f) => (f.optional ? `${f.type} (${f.name}, optional)` : `${f.type} (${f.name})`));
  const hasMany = model.fields
    .filter((f) => modelNames.has(f.type) && f.list)
    .map((f) => `${f.type} (${f.name})`);
  const hasOne = model.fields
    .filter(
      (f) => modelNames.has(f.type) && !f.list && f.optional && !f.attrs.includes('@relation('),
    )
    .map((f) => `${f.type} (${f.name})`);
  const notes: string[] = [];
  const names = model.fields.map((f) => f.name);
  if (names.includes('deletedAt')) notes.push('soft delete');
  if (model.fields.some((f) => f.name === 'searchVector')) notes.push('full-text search');
  if (model.fields.some((f) => /Minor$/.test(f.name))) notes.push('money in minor units');
  const uniques = model.blockAttrs
    .filter((a) => a.startsWith('@@unique'))
    .map((a) => a.replace(/^@@unique\(\[|\]\)$/g, '').replace(/,\s*/g, ' + '));
  if (uniques.length) notes.push(`unique: ${uniques.join('; ')}`);
  return { belongsTo, hasMany: [...hasMany, ...hasOne], notes };
}

export function renderDataModelDoc(schema: string): string {
  const { models, enums } = parseSchema(schema);
  const byName = new Map(models.map((m) => [m.name, m]));
  const modelNames = new Set(models.map((m) => m.name));
  const placed = new Set(DOMAINS.flatMap((d) => d.models));
  const missing = models.map((m) => m.name).filter((name) => !placed.has(name));
  if (missing.length)
    throw new Error(
      `Models missing from DOMAINS in scripts/data-model-doc.ts: ${missing.join(', ')}`,
    );
  for (const name of placed)
    if (!byName.has(name)) throw new Error(`DOMAINS lists ${name}, which is not in the schema`);

  const out: string[] = [];
  out.push('# Data model', '');
  out.push(
    '> Generated from `packages/db/prisma/schema.prisma` by `pnpm --filter @medtravel/db docs:model`. Do not edit by hand: a test fails when this file is out of date.',
    '',
  );
  out.push(
    `The database holds **${models.length} tables** and **${enums.length} enums** (PRD section 11). The central entity is the **Case**: one patient, one treatment episode, and everything else hangs off it.`,
    '',
  );
  out.push('## Overview', '');
  out.push('```mermaid', 'flowchart LR');
  const edges = [
    'Patient --> Case',
    'Case --> Document',
    'Case --> MedicalSummary',
    'Case --> OpinionRequest',
    'OpinionRequest --> Hospital',
    'OpinionRequest --> Opinion',
    'Case --> Quote',
    'Quote --> QuoteLine',
    'Case --> Payment',
    'Case --> Invoice',
    'Case --> VisaApplication',
    'Case --> Booking',
    'Case --> Task',
    'Case --> Conversation',
    'Conversation --> Message',
    'Agent --> Case',
    'Case --> Commission',
    'Hospital --> Doctor',
    'Hospital --> Package',
    'Document --> DocumentShare',
    'DocumentShare --> Hospital',
    'Case --> Feedback',
    'Case --> Incident',
    'User --> Patient',
    'Case --> CaseStageHistory',
  ];
  out.push(...edges.map((edge) => `  ${edge}`), '```', '');

  out.push('## Conventions', '');
  out.push(
    '- **Keys** are UUIDs generated by the database (`gen_random_uuid()`). Country, Language and Currency use their ISO / BCP 47 code.',
    '- **Business records** have `createdAt`, `updatedAt` and `deletedAt` (soft delete; hard delete only through retention jobs). Append-only tables (audit, outbox, stage history, exchange rates, sessions, medical summary versions) have no `updatedAt`.',
    '- **Time** is `timestamptz` in UTC; dates without a time (birthday, passport expiry, validity) are `date`.',
    '- **Money** is a `BigInt` (64-bit) in minor units next to an ISO currency code that is a foreign key to `Currency`; never a float. 64 bits because a 32-bit column overflows on ordinary prices in UZS, IQD and NGN. Where the amount is optional, a CHECK forbids an amount without its currency. Quotes and payments store the exchange rate they used (`Decimal(18,8)`).',
    '- **Rates** (agreement %, commission %, tax %) are **basis points** (1250 = 12.5%), 0 to 10000.',
    '- **Indexes**: every foreign key has one (except the currency codes on money columns, which have a handful of distinct values), plus the columns the screens filter or sort by: case stage, owner, agent, treatment, hospital, country, dates.',
    "- **Search**: Hospital, Doctor, Treatment and Patient have a `searchVector` (`tsvector`, `simple` configuration, accents removed with `f_unaccent`) kept up to date by a trigger, with a GIN index. Patient search covers name, phone (as typed and digits only), passport number and email. Query with `\"searchVector\" @@ to_tsquery('simple', f_unaccent('asha:*'))`.",
    '- **Enums** mirror `packages/contracts`; a test fails when they differ.',
    '- **Personal data** (names, passport numbers, phones, medical text, messages) must never be logged. The passport number is searchable by design (the lead inbox and duplicate detection need it), so it sits in the search vector in clear; bank and payout details are `Json` columns the application is expected to encrypt (F-03 and later), the schema does not do it.',
    '- **Access to patient data is through rows, not flags.** A hospital reaches a document only through a live `DocumentShare`, which can only exist under a `Consent` of the right type for the same patient and hospital; withdrawing the consent revokes its shares in the same transaction. Free medical text lives in `CaseIntake` and `MedicalSummary`, not on the `Case` row that lists and agents read. Staff-only notes are `CaseNote`, never `Message`.',
    '',
  );
  out.push('## Human-readable numbers', '');
  out.push(
    '`NumberSequence` hands out gap-free numbers inside the transaction that uses them: `CASE-YYYY-NNNNNN` (`Case.caseNo`), `Q-NNNNNN` (`Quote.quoteNo`), `INV/YY-YY/NNNNN` (`Invoice.invoiceNo`, the Indian financial year) and the credit-note number. The key says which counter, the period (year or financial year) restarts it.',
    '',
  );
  out.push('## Rules the database enforces', '');
  out.push(
    'Beyond foreign keys and unique constraints (added in the migration SQL because Prisma cannot express them):',
    '',
    '- money is never negative; payments, refunds, payouts and credit notes are never zero',
    '- rates are 0 to 10000 basis points; ratings are 1 to 5',
    '- an e-mail is stored lower-case, so the unique index is case-insensitive in practice',
    '- an amount always comes with its currency; an invoice is for a case or a hospital (a referral-fee invoice always for a hospital); a payment is for a case or an invoice; a file belongs to someone',
    '- a document share needs a consent of type `share_medical_with_hospital` for the same patient and hospital, and is revoked when the consent is withdrawn',
    '- an opinion request leaves draft only with a consent recorded',
    '- one open opinion request per case and hospital, one current opinion per request, one accepted quote per case, one live commission per case and agent',
    '- a retried event cannot create the same automatic task, or the same WhatsApp message, twice',
    '- a file is 1 byte to 500 MB',
    '- a visa application is for exactly one traveller (the patient or an attendant)',
    '- one *current* medical summary per case; older versions stay',
    '- the audit trail rejects updates and truncation (append-only); it has no foreign keys and its entity id is text, so it can describe ISO-keyed rows such as a country',
    '- an exchange rate is positive and between two different currencies',
    '',
  );

  for (const domain of DOMAINS) {
    out.push(`## ${domain.title}`, '', domain.blurb, '');
    out.push(
      '| Entity | What it is | Belongs to | Has | Notes |',
      '| --- | --- | --- | --- | --- |',
    );
    for (const name of domain.models) {
      const model = byName.get(name)!;
      const info = describe(model, modelNames);
      out.push(
        `| **${name}** | ${model.doc.replace(/\|/g, '\\|') || ''} | ${info.belongsTo.join(', ')} | ${info.hasMany.join(', ')} | ${info.notes.join('; ')} |`,
      );
    }
    out.push('');
  }

  out.push('## Enums', '');
  out.push('| Enum | Values |', '| --- | --- |');
  for (const e of enums) out.push(`| **${e.name}** | ${code(e.values)} |`);
  out.push('');
  return out.join('\n');
}
