import { readdirSync, readFileSync } from 'node:fs';
import * as contracts from '@medtravel/contracts';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migrationDir = new URL('../prisma/migrations/', import.meta.url);
const migrationSql = readdirSync(migrationDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => readFileSync(new URL(`${entry.name}/migration.sql`, migrationDir), 'utf8'))
  .join('\n');

interface ParsedModel {
  name: string;
  lines: string[];
}

const enums = new Map<string, string[]>();
for (const match of schema.matchAll(/^enum (\w+) \{\n([\s\S]*?)\n\}/gm)) {
  enums.set(
    match[1]!,
    match[2]!
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('//')),
  );
}

const models: ParsedModel[] = [...schema.matchAll(/^model (\w+) \{\n([\s\S]*?)\n\}/gm)].map(
  (match) => ({
    name: match[1]!,
    lines: match[2]!
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('//')),
  }),
);

const fieldsOf = (model: ParsedModel) =>
  model.lines
    .filter((line) => !line.startsWith('@@'))
    .map((line) => {
      // `prisma format` aligns columns with runs of spaces; compare on single spaces.
      const single = line.replace(/\s+/g, ' ');
      const [name, type, ...rest] = single.split(' ');
      return { name: name!, type: type!, attrs: rest.join(' '), line: single };
    });

const camel = (name: string) => name[0]!.toLowerCase() + name.slice(1);

/** The contracts values a Prisma enum must equal. */
function contractValues(name: string): readonly string[] | undefined {
  if (name === 'CaseStage') return [...contracts.CASE_STAGES, ...contracts.CASE_EXIT_STAGES];
  if (name === 'CaseStatus') return contracts.CASE_STATUSES;
  if (name === 'Role') return contracts.ROLES;
  const zodEnum = (contracts as Record<string, unknown>)[`${camel(name)}Schema`] as
    { options: readonly string[] } | undefined;
  return zodEnum?.options;
}

describe('schema.prisma enums', () => {
  it('declares every enum value the same as packages/contracts, in the same order', () => {
    expect(enums.size).toBeGreaterThan(40);
    for (const [name, values] of enums) {
      expect(contractValues(name), `${name} has no matching enum in packages/contracts`).toEqual(
        values,
      );
    }
  });

  it('has a Prisma enum for every enum in contracts/enums.ts', () => {
    const exported = Object.keys(contracts).filter(
      (key) => key.endsWith('Schema') && key !== 'localeSchema',
    );
    const known = new Set([...enums.keys()].map(camel));
    for (const key of exported) {
      const value = (contracts as Record<string, unknown>)[key] as { options?: readonly string[] };
      if (!value.options) continue;
      const base = key.slice(0, -'Schema'.length);
      // Enums that are not stored in the database as enums (portals, display currencies, locale).
      if (
        [
          'portal',
          'displayCurrency',
          'caseExitStage',
          'caseTarget',
          'staffRole',
          'caseStage',
          'caseStatus',
          'role',
          'masterResource',
          'translationLocale',
          'permissionAction',
          'permissionSubject',
          'auditAccessAction',
          'identifier',
          'notificationEventKey',
          'preferenceChannel',
          'matchField',
        ].includes(base)
      )
        continue;
      expect(known.has(base), `contracts enum ${base} is missing from schema.prisma`).toBe(true);
    }
  });
});

describe('schema.prisma conventions', () => {
  it('covers every entity of PRD section 11 and the task list', () => {
    const names = new Set(models.map((m) => m.name));
    for (const expected of [
      'Admission',
      'CaseIntake',
      'CaseNote',
      'ProcessedWebhook',
      'User',
      'Session',
      'AuthChallenge',
      'BackupCode',
      'FileUpload',
      'Patient',
      'Attendant',
      'Case',
      'Document',
      'MedicalSummary',
      'Hospital',
      'HospitalBranch',
      'Department',
      'Doctor',
      'Package',
      'OpinionRequest',
      'Opinion',
      'Quote',
      'QuoteLine',
      'Payment',
      'Invoice',
      'InvoiceLine',
      'CreditNote',
      'Refund',
      'VisaApplication',
      'Booking',
      'Stay',
      'StayRoom',
      'Vendor',
      'Driver',
      'Vehicle',
      'Interpreter',
      'Agent',
      'AgentUser',
      'CommissionPlan',
      'Commission',
      'Payout',
      'Task',
      'Message',
      'Conversation',
      'Notification',
      'NotificationPreference',
      'Feedback',
      'Incident',
      'Consent',
      'AuditEvent',
      'OutboxEvent',
      'Country',
      'Language',
      'Currency',
      'FxRate',
      'Treatment',
      'Speciality',
      'City',
      'DocumentType',
      'LostReason',
      'TreatmentTranslation',
    ]) {
      expect(names.has(expected), `model ${expected}`).toBe(true);
    }
  });

  it('uses database-generated UUID keys, except the code-keyed reference tables', () => {
    const codeKeyed = new Set([
      'Country',
      'Language',
      'Currency',
      'NumberSequence',
      'StageConfig',
      'FxSetting',
    ]);
    for (const model of models) {
      if (codeKeyed.has(model.name)) continue;
      const id = fieldsOf(model).find((f) => f.name === 'id');
      expect(id?.line, `${model.name}.id`).toBe(
        'id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid',
      );
    }
  });

  it('never stores money or counts as a float, and keeps amounts as Int minor units', () => {
    const decimals = new Set(['fxRate', 'rate', 'distanceKm', 'latitude', 'longitude']);
    for (const model of models) {
      for (const field of fieldsOf(model)) {
        expect(field.type.startsWith('Float'), `${model.name}.${field.name} is a float`).toBe(
          false,
        );
        if (field.name.endsWith('Minor')) {
          // 64-bit: a 32-bit column overflows on ordinary prices in UZS, IQD and NGN.
          expect(field.type, `${model.name}.${field.name}`).toMatch(/^BigInt\??$/);
        }
        if (field.type.startsWith('Decimal')) {
          expect(decimals.has(field.name), `${model.name}.${field.name} is a Decimal`).toBe(true);
        }
      }
    }
  });

  it('pairs every money column with a currency, and checks it in the database where the currency is optional', () => {
    for (const model of models) {
      const fields = fieldsOf(model);
      const money = fields.filter((f) => f.name.endsWith('Minor') && f.name !== 'amountInrMinor');
      if (money.length === 0) continue;
      const currency = fields.find(
        (f) =>
          f.type.replace('?', '') === 'String' &&
          /currency$/i.test(f.name) &&
          !f.name.startsWith('fx'),
      );
      if (model.name === 'InvoiceLine') continue; // priced in its invoice's currency
      expect(currency, `${model.name} has money but no currency`).toBeDefined();
      if (money.some((f) => f.line.includes('?')) && currency!.line.includes('?')) {
        // Amount and currency are both optional: a CHECK must forbid an amount without a currency.
        expect(
          migrationSql.includes(`ALTER TABLE "${model.name}" ADD CONSTRAINT`) &&
            new RegExp(
              `ALTER TABLE "${model.name}" ADD CONSTRAINT "${model.name}_\\w*currency_check"`,
            ).test(migrationSql),
          `${model.name}: optional money needs a currency CHECK`,
        ).toBe(true);
      }
    }
  });

  it('has an index for every foreign key (money currency codes excepted)', () => {
    for (const model of models) {
      const leading = new Set<string>();
      for (const line of model.lines) {
        const composite = line.match(/^@@(?:index|unique|id)\(\[([^\]]+)\]/);
        if (composite) leading.add(composite[1]!.split(',')[0]!.trim());
      }
      for (const field of fieldsOf(model)) {
        if (/@(id|unique)\b/.test(field.attrs)) leading.add(field.name);
      }
      for (const field of fieldsOf(model)) {
        const rel = field.line.match(
          /@relation\((?:"[^"]+", )?fields: \[(\w+)\], references: \[\w+\](?:, onDelete: \w+)?\)/,
        );
        if (!rel) continue;
        if (field.type.replace('?', '') === 'Currency') continue;
        expect(leading.has(rel[1]!), `${model.name}.${rel[1]} has no index`).toBe(true);
      }
    }
  });

  it('keeps createdAt, updatedAt and deletedAt on business records, and omits them only where intended', () => {
    // Append-only logs, tables that live and die with their parent, and the small reference tables.
    const noSoftDelete = new Set([
      'Country',
      'Language',
      'Currency',
      'FxRate',
      'Session',
      'AuthChallenge',
      'BackupCode',
      'FileUpload',
      'NotificationPreference',
      'CaseStageHistory',
      'MedicalSummary',
      'QuoteLine',
      'InvoiceLine',
      'StayRoom',
      'StayHospitalDistance',
      'CommissionRule',
      'MessageAttachment',
      'AuditEvent',
      'OutboxEvent',
      'NumberSequence',
      'StageConfig',
      'FxSetting',
      'MarginRule',
      'DiscountThreshold',
      'FxOverride',
      'PriceItemVersion',
      'PriceItemPrice',
      'ProcessedWebhook',
      'DoctorTranslation',
      'HospitalTranslation',
      'PackageTranslation',
    ]);
    for (const model of models) {
      const names = fieldsOf(model).map((f) => f.name);
      const isTranslation = model.name.endsWith('Translation');
      if (!noSoftDelete.has(model.name) && !isTranslation) {
        expect(names, `${model.name} deletedAt`).toContain('deletedAt');
      } else {
        expect(names, `${model.name} should not have deletedAt`).not.toContain('deletedAt');
      }
    }
    for (const name of ['AuditEvent', 'OutboxEvent', 'CaseStageHistory', 'FxRate']) {
      const names = fieldsOf(models.find((m) => m.name === name)!).map((f) => f.name);
      expect(names, `${name} createdAt`).toContain('createdAt');
      expect(names, `${name} is append-only`).not.toContain('updatedAt');
    }
  });

  it('declares a GIN index on the search column of hospitals, doctors, treatments and patients', () => {
    for (const name of ['Hospital', 'Doctor', 'Treatment', 'Patient']) {
      const model = models.find((m) => m.name === name)!;
      expect(model.lines, name).toContain('@@index([searchVector], type: Gin)');
    }
  });
});

describe('migration SQL', () => {
  it('is a single migration for F-01 and ends with the rules Prisma cannot express', () => {
    expect(migrationSql).toContain('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    expect(migrationSql).toContain('CREATE TRIGGER "AuditEvent_append_only"');
    expect(migrationSql).toContain('CREATE TRIGGER "DocumentShare_consent_check"');
    expect(migrationSql).toContain('CREATE TRIGGER "Consent_withdrawn_revoke_shares"');
  });

  it('has a search trigger for each search column, and a refresh trigger for each translation that feeds one', () => {
    for (const name of ['Treatment', 'Patient', 'Hospital', 'Doctor']) {
      expect(migrationSql, name).toContain(`CREATE TRIGGER "${name}_search_vector"`);
    }
    for (const name of ['TreatmentTranslation', 'HospitalTranslation', 'DoctorTranslation']) {
      expect(migrationSql, name).toContain(`CREATE TRIGGER "${name}_refresh_search"`);
    }
  });

  it('keeps the checks the data-model doc promises', () => {
    for (const rule of [
      'Currency_minor_units_check',
      'FxRate_rate_check',
      'Hospital_agreement_check',
      'Feedback_ratings_check',
      'Document_size_check',
      'Document_owner_check',
      'VisaApplication_one_traveller_check',
      'Payment_owner_check',
      'Invoice_owner_check',
      'OpinionRequest_consent_check',
      'Conversation_party_check',
      'User_email_lowercase_check',
    ]) {
      expect(migrationSql, rule).toContain(rule);
    }
  });
});
