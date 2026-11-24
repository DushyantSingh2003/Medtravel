import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PATIENT_OWNED_TABLES } from './patient-merge.service.js';

const schema = readFileSync(new URL('../../../../../packages/db/prisma/schema.prisma', import.meta.url), 'utf8');

/** Every model with a relation to Patient through a `patientId` column. */
function modelsWithPatientId(): string[] {
  const found: string[] = [];
  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const [, name, body] = match;
    // The audit log is append-only: its rows keep the patient id they were written with.
    if (name === 'AuditEvent') continue;
    if (name && body && /^\s+patientId\s+String\??\s/m.test(body) && name !== 'Patient') found.push(name);
  }
  return found.sort();
}

describe('merging patients', () => {
  it('moves every table that holds a patient id, so no history is left on the retired record', () => {
    expect([...PATIENT_OWNED_TABLES].sort()).toEqual(modelsWithPatientId());
  });
});
