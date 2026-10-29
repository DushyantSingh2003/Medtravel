import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROLES, type Role } from '@medtravel/contracts';
import type { Actor } from '../src/auth/actor.js';
import { ScopeService } from '../src/rbac/scope.service.js';
import { DocumentsProbeModule } from './support/documents-probe.js';
import { createTestApp, type TestApp } from './support/test-app.js';

let t: TestApp;
let scope: ScopeService;
let n = 0;
const next = () => (n += 1);
const DAY = 86_400_000;

/** Everything the scoping tests need, by name. */
const world = {
  users: {} as Record<string, string>,
  cases: {} as Record<string, string>,
  docs: {} as Record<string, string>,
};

const actorOf = (key: string, role: Role, scopeCaseId: string | null = null): Actor => ({
  userId: world.users[key] as string,
  role,
  sessionId: 'session',
  scopeCaseId,
});

async function makeCase(
  name: string,
  data: { patientId: string } & Record<string, unknown>,
): Promise<string> {
  const created = await t.db.case.create({
    data: { caseNo: `CASE-2026-${String(900_000 + next())}`, ...data },
    select: { id: true },
  });
  world.cases[name] = created.id;
  return created.id;
}

const namesOf = (ids: string[]): string[] =>
  Object.entries(world.cases)
    .filter(([, id]) => ids.includes(id))
    .map(([name]) => name)
    .sort();

async function visibleTo(actor: Actor): Promise<string[]> {
  const where = await scope.caseWhere(actor);
  const found = await t.db.case.findMany({ where, select: { id: true } });
  return namesOf(found.map((row) => row.id));
}

beforeAll(async () => {
  t = await createTestApp({ imports: [DocumentsProbeModule] });
  scope = t.app.get(ScopeService);

  await t.db.country.upsert({
    where: { code: 'IN' },
    update: {},
    create: { code: 'IN', name: 'India' },
  });
  const [delhi, mumbai] = await Promise.all(
    ['delhi', 'mumbai'].map((slug) =>
      t.db.city.create({ data: { slug: `${slug}-${next()}`, name: slug, countryCode: 'IN' } }),
    ),
  );
  const [hospitalA, hospitalB] = await Promise.all(
    [
      ['a', delhi],
      ['b', mumbai],
    ].map(([slug, city]) =>
      t.db.hospital.create({
        data: {
          slug: `h-${slug as string}-${next()}`,
          name: `Hospital ${slug as string}`,
          cityId: (city as { id: string }).id,
        },
      }),
    ),
  );
  if (!delhi || !mumbai || !hospitalA || !hospitalB) throw new Error('fixtures');
  const speciality = await t.db.speciality.create({
    data: { slug: `s-${next()}`, name: 'Cardiology' },
  });
  const doctor1 = await t.db.doctor.create({
    data: { fullName: 'Dr One', hospitalId: hospitalA.id, specialityId: speciality.id },
  });
  const doctor2 = await t.db.doctor.create({
    data: { fullName: 'Dr Two', hospitalId: hospitalA.id, specialityId: speciality.id },
  });
  const agency = await t.db.agent.create({
    data: { companyName: 'Agency 1', referralCode: `REF${next()}`, countryCode: 'IN' },
  });
  const otherAgency = await t.db.agent.create({
    data: { companyName: 'Agency 2', referralCode: `REF${next()}`, countryCode: 'IN' },
  });

  const user = async (key: string, role: Role) => {
    world.users[key] = (
      await t.makeUser({ email: `${key}-${next()}@rbac.test`.toLowerCase(), role })
    ).id;
    return world.users[key] as string;
  };

  // Staff: a manager with a team of two case managers, and one case manager on another team.
  const manager = await user('manager', 'case_manager');
  await t.db.staffProfile.create({ data: { userId: manager, isManager: true } });
  const cm1 = await user('cm1', 'case_manager');
  const cm2 = await user('cm2', 'case_manager');
  const cm3 = await user('cm3', 'case_manager');
  const otherManager = await user('otherManager', 'case_manager');
  await t.db.staffProfile.create({ data: { userId: otherManager, isManager: true } });
  await t.db.staffProfile.create({ data: { userId: cm1, managerId: manager } });
  await t.db.staffProfile.create({ data: { userId: cm2, managerId: manager } });
  await t.db.staffProfile.create({ data: { userId: cm3, managerId: otherManager } });
  const gc = await user('gc', 'ground_coordinator');
  await t.db.staffProfile.create({ data: { userId: gc, cityId: delhi.id } });
  await user('gcNoCity', 'ground_coordinator');
  const reviewer = await user('reviewer', 'medical_reviewer');
  const interpreterUser = await user('interpreter', 'interpreter');
  const interpreter = await t.db.interpreter.create({
    data: { fullName: 'Interp', userId: interpreterUser },
  });
  await user('finance', 'finance');
  await user('admin', 'super_admin');

  // Hospital side.
  const desk = await user('desk', 'hospital_desk');
  await t.db.hospitalStaff.create({ data: { userId: desk, hospitalId: hospitalA.id } });
  const deskB = await user('deskB', 'hospital_desk');
  await t.db.hospitalStaff.create({ data: { userId: deskB, hospitalId: hospitalB.id } });
  const dr1 = await user('dr1', 'doctor');
  await t.db.hospitalStaff.create({
    data: { userId: dr1, hospitalId: hospitalA.id, doctorId: doctor1.id },
  });
  const dr2 = await user('dr2', 'doctor');
  await t.db.hospitalStaff.create({
    data: { userId: dr2, hospitalId: hospitalA.id, doctorId: doctor2.id },
  });

  // Agents: two users of one agency, one of another.
  const agentOwner = await user('agent', 'agent');
  await t.db.agentUser.create({ data: { userId: agentOwner, agentId: agency.id, owner: true } });
  const agentSub = await user('agentSub', 'agent');
  await t.db.agentUser.create({ data: { userId: agentSub, agentId: agency.id } });
  const agentOther = await user('agentOther', 'agent');
  await t.db.agentUser.create({
    data: { userId: agentOther, agentId: otherAgency.id, owner: true },
  });

  // Patients and an attendant.
  const patientUser = await user('patient', 'patient');
  const patient = await t.db.patient.create({ data: { fullName: 'Pat One', userId: patientUser } });
  const patient2User = await user('patient2', 'patient');
  const patient2 = await t.db.patient.create({
    data: { fullName: 'Pat Two', userId: patient2User },
  });
  const attendantUser = await user('attendant', 'attendant');
  const attendant = await t.db.attendant.create({
    data: { fullName: 'Att', patientId: patient.id, userId: attendantUser },
  });

  const now = Date.now();
  // c1: patient's own case, team A, reviewed by the reviewer, referred by agency 1, sent to hospital A for doctor 1, interpreter booked.
  const c1 = await makeCase('c1', {
    patientId: patient.id,
    ownerId: cm1,
    reviewerId: reviewer,
    agentId: agency.id,
    hospitalId: hospitalA.id,
    plannedArrivalAt: new Date(now + 10 * DAY),
  });
  await makeCase('c2', { patientId: patient2.id, ownerId: cm2 }); // same team as c1
  await makeCase('c3', { patientId: patient2.id, ownerId: cm3, agentId: otherAgency.id }); // other team and agency
  await makeCase('c4', {
    patientId: patient2.id,
    ownerId: cm1,
    hospitalId: hospitalA.id,
    plannedArrivalAt: new Date(now + 90 * DAY),
  }); // arrival too far
  await makeCase('c5', {
    patientId: patient2.id,
    ownerId: cm3,
    hospitalId: hospitalB.id,
    plannedArrivalAt: new Date(now + 5 * DAY),
  }); // other city
  await makeCase('c6', { patientId: patient2.id, ownerId: cm3, stage: 'medical_review' }); // unassigned review
  await makeCase('c7', {
    patientId: patient2.id,
    preferredCityId: delhi.id,
    plannedArrivalAt: new Date(now - 20 * DAY),
  }); // city fallback, in window
  await makeCase('c8', {
    patientId: patient2.id,
    ownerId: cm3,
    hospitalId: hospitalA.id,
    deletedAt: new Date(),
  }); // deleted
  // c9: referred by agency 1 but the patient never agreed to share the stage; c10 and c11 were sent to hospital A and then
  // cancelled / had their consent withdrawn; all three unowned.
  await makeCase('c9', { patientId: patient2.id, agentId: agency.id });
  await makeCase('c10', { patientId: patient2.id });
  await makeCase('c11', { patientId: patient2.id });

  const agentConsent = (patientId: string, agentId: string, caseId: string) =>
    t.db.consent.create({
      data: { patientId, caseId, agentId, type: 'share_stage_with_agent' },
    });
  await agentConsent(patient.id, agency.id, c1);
  await agentConsent(patient2.id, otherAgency.id, world.cases['c3'] as string);
  const agentWithdrawn = await agentConsent(patient2.id, agency.id, world.cases['c9'] as string);
  await t.db.consent.update({
    where: { id: agentWithdrawn.id },
    data: { withdrawnAt: new Date(Date.now() + 1000) },
  });

  await t.db.booking.create({
    data: {
      caseId: c1,
      type: 'interpreter',
      startsAt: new Date(now + DAY),
      interpreterId: interpreter.id,
    },
  });
  await t.db.caseAttendant.create({ data: { caseId: c1, attendantId: attendant.id } });
  await t.db.booking.create({
    data: {
      caseId: world.cases['c2'] as string,
      type: 'interpreter',
      status: 'cancelled',
      startsAt: new Date(now + DAY),
      interpreterId: interpreter.id,
    },
  });

  // A request leaves draft only with a consent from the patient to share with that hospital.
  const consentFor = async (patientId: string, hospitalId: string, caseId: string) =>
    (
      await t.db.consent.create({
        data: { patientId, caseId, hospitalId, type: 'share_medical_with_hospital' },
        select: { id: true },
      })
    ).id;

  // Hospital A got c1 (doctor 1), c2 (no doctor), and c4 only as a draft. Hospital B got c5.
  await t.db.opinionRequest.create({
    data: {
      caseId: c1,
      hospitalId: hospitalA.id,
      doctorId: doctor1.id,
      status: 'sent',
      consentId: await consentFor(patient.id, hospitalA.id, c1),
    },
  });
  await t.db.opinionRequest.create({
    data: {
      caseId: world.cases['c2'] as string,
      hospitalId: hospitalA.id,
      status: 'sent',
      consentId: await consentFor(patient2.id, hospitalA.id, world.cases['c2'] as string),
    },
  });
  await t.db.opinionRequest.create({
    data: {
      caseId: world.cases['c4'] as string,
      hospitalId: hospitalA.id,
      doctorId: doctor1.id,
      status: 'draft',
    },
  });
  await t.db.opinionRequest.create({
    data: {
      caseId: world.cases['c5'] as string,
      hospitalId: hospitalB.id,
      status: 'sent',
      consentId: await consentFor(patient2.id, hospitalB.id, world.cases['c5'] as string),
    },
  });

  await t.db.opinionRequest.create({
    data: {
      caseId: world.cases['c10'] as string,
      hospitalId: hospitalA.id,
      status: 'cancelled',
      consentId: await consentFor(patient2.id, hospitalA.id, world.cases['c10'] as string),
    },
  });
  const withdrawnConsent = await consentFor(
    patient2.id,
    hospitalA.id,
    world.cases['c11'] as string,
  );
  await t.db.opinionRequest.create({
    data: {
      caseId: world.cases['c11'] as string,
      hospitalId: hospitalA.id,
      status: 'sent',
      consentId: withdrawnConsent,
    },
  });
  await t.db.consent.update({
    where: { id: withdrawnConsent },
    data: { withdrawnAt: new Date(Date.now() + 1000) },
  });

  // Documents of c1: a report shared with hospital A, a passport not shared, a report whose consent was withdrawn.
  const docData = (name: string) => ({
    kind: 'report' as const,
    fileName: `${name}.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: 10,
    storageKey: `k-${name}-${next()}`,
    caseId: c1,
    patientId: patient.id,
  });
  const consent = await t.db.consent.create({
    data: {
      patientId: patient.id,
      caseId: c1,
      hospitalId: hospitalA.id,
      type: 'share_medical_with_hospital',
    },
  });
  const withdrawn = await t.db.consent.create({
    data: {
      patientId: patient.id,
      caseId: c1,
      hospitalId: hospitalA.id,
      type: 'share_medical_with_hospital',
    },
  });
  for (const name of [
    'shared',
    'private',
    'withdrawn',
    'attendantUpload',
    'internal',
    'unscanned',
    'hospitalUpload',
  ]) {
    const doc = await t.db.document.create({
      data: {
        ...docData(name),
        ...(name === 'attendantUpload'
          ? { kind: 'passport' as const, uploadedById: attendantUser }
          : {}),
        ...(name === 'internal' ? { visibility: 'internal' as const } : {}),
        ...(name === 'hospitalUpload'
          ? { kind: 'discharge' as const, hospitalId: hospitalA.id }
          : {}),
        scanStatus: name === 'unscanned' ? ('pending' as const) : ('clean' as const),
      },
    });
    world.docs[name] = doc.id;
  }
  await t.db.documentShare.create({
    data: {
      documentId: world.docs['shared'] as string,
      hospitalId: hospitalA.id,
      consentId: consent.id,
    },
  });
  await t.db.documentShare.create({
    data: {
      documentId: world.docs['unscanned'] as string,
      hospitalId: hospitalA.id,
      consentId: consent.id,
    },
  });
  await t.db.documentShare.create({
    data: {
      documentId: world.docs['withdrawn'] as string,
      hospitalId: hospitalA.id,
      consentId: withdrawn.id,
    },
  });
  // The patient changes their mind after sharing: the share row stays, the consent no longer allows it.
  await t.db.consent.update({
    where: { id: withdrawn.id },
    data: { withdrawnAt: new Date(Date.now() + 1000) },
  });
}, 120_000);

afterAll(async () => {
  await t?.close();
});

describe('which cases each role sees', () => {
  it.each([
    ['patient', 'patient', ['c1']],
    ['patient2', 'patient', ['c10', 'c11', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c9']],
    ['attendant', 'attendant', ['c1']],
    ['agent', 'agent', ['c1']],
    ['agentSub', 'agent', ['c1']],
    ['agentOther', 'agent', ['c3']],
    ['cm1', 'case_manager', ['c1', 'c2', 'c4']],
    ['cm2', 'case_manager', ['c1', 'c2', 'c4']],
    ['cm3', 'case_manager', ['c3', 'c5', 'c6']],
    ['manager', 'case_manager', ['c1', 'c10', 'c11', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c9']],
    ['gc', 'ground_coordinator', ['c1', 'c7']],
    ['gcNoCity', 'ground_coordinator', []],
    ['interpreter', 'interpreter', ['c1']],
    ['reviewer', 'medical_reviewer', ['c1', 'c6']],
    ['desk', 'hospital_desk', ['c1', 'c2']],
    ['deskB', 'hospital_desk', ['c5']],
    ['dr1', 'doctor', ['c1']],
    ['dr2', 'doctor', []],
    ['finance', 'finance', ['c1', 'c10', 'c11', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c9']],
    ['admin', 'super_admin', ['c1', 'c10', 'c11', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c9']],
  ] as const)('%s (%s)', async (key, role, expected) => {
    expect(await visibleTo(actorOf(key, role))).toEqual([...expected]);
  });

  it('shows no case to a user with no links, whatever their role', async () => {
    const stray = (await t.makeUser({ email: `stray-${next()}@rbac.test`, role: 'doctor' })).id;
    for (const role of ROLES) {
      if (role === 'finance' || role === 'super_admin') continue;
      const rows = await t.db.case.findMany({
        where: await scope.caseWhere({ userId: stray, role, sessionId: 's', scopeCaseId: null }),
        select: { id: true },
      });
      expect(rows, role).toEqual(role === 'medical_reviewer' ? [{ id: world.cases['c6'] }] : []);
    }
  });

  it('narrows a magic-link session to the one case the hospital was sent', async () => {
    expect(await visibleTo(actorOf('dr2', 'doctor', world.cases['c1'] as string))).toEqual(['c1']);
    // A case the hospital never got, or got only as a draft, stays closed.
    expect(await visibleTo(actorOf('dr2', 'doctor', world.cases['c4'] as string))).toEqual([]);
    expect(await visibleTo(actorOf('dr2', 'doctor', world.cases['c5'] as string))).toEqual([]);
    expect(await visibleTo(actorOf('desk', 'hospital_desk', world.cases['c2'] as string))).toEqual([
      'c2',
    ]);
  });

  it('answers 404 for a case outside the scope, and nothing for a role without the subject', async () => {
    await expect(
      scope.assertCaseAccess(actorOf('cm3', 'case_manager'), world.cases['c1'] as string),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      scope.assertCaseAccess(actorOf('cm1', 'case_manager'), world.cases['c1'] as string),
    ).resolves.toBeUndefined();
    await expect(
      scope.assertCaseAccess(actorOf('cm1', 'case_manager'), world.cases['c8'] as string),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('which documents each role sees', () => {
  const docsFor = async (key: string, role: Role, scopeCaseId: string | null = null) => {
    const rows = await t.db.document.findMany({
      where: await scope.documentWhere(actorOf(key, role, scopeCaseId)),
      select: { id: true },
    });
    return Object.entries(world.docs)
      .filter(([, id]) => rows.some((row) => row.id === id))
      .map(([name]) => name)
      .sort();
  };

  it('gives an agent none, in every form, even for a case they referred', async () => {
    for (const key of ['agent', 'agentSub', 'agentOther'])
      expect(await docsFor(key, 'agent')).toEqual([]);
  });

  it('gives the patient all of their own, and the attendant only what they uploaded', async () => {
    expect(await docsFor('patient', 'patient')).toEqual([
      'attendantUpload',
      'hospitalUpload',
      'private',
      'shared',
      'unscanned',
      'withdrawn',
    ]);
    expect(await docsFor('patient2', 'patient')).toEqual([]);
    expect(await docsFor('attendant', 'attendant')).toEqual(['attendantUpload']);
  });

  it('gives the hospital only what a live consent shared with it', async () => {
    expect(await docsFor('desk', 'hospital_desk')).toEqual(['hospitalUpload', 'shared']);
    expect(await docsFor('dr1', 'doctor')).toEqual(['shared']);
    expect(await docsFor('dr2', 'doctor')).toEqual([]);
    expect(await docsFor('deskB', 'hospital_desk')).toEqual([]);
  });

  it('gives staff with the permission the documents of their cases, and the others none', async () => {
    expect(await docsFor('cm1', 'case_manager')).toEqual([
      'attendantUpload',
      'hospitalUpload',
      'internal',
      'private',
      'shared',
      'unscanned',
      'withdrawn',
    ]);
    expect(await docsFor('cm3', 'case_manager')).toEqual([]);
    expect(await docsFor('reviewer', 'medical_reviewer')).toEqual([
      'attendantUpload',
      'hospitalUpload',
      'internal',
      'private',
      'shared',
      'unscanned',
      'withdrawn',
    ]);
    expect(await docsFor('admin', 'super_admin')).toHaveLength(7);
    for (const [key, role] of [
      ['finance', 'finance'],
      ['gc', 'ground_coordinator'],
      ['interpreter', 'interpreter'],
    ] as const)
      expect(await docsFor(key, role), role).toEqual([]);
  });
});

describe('patient files', () => {
  it('shows a patient only themselves, and staff the patients of their cases', async () => {
    const names = async (key: string, role: Role) =>
      (
        await t.db.patient.findMany({
          where: await scope.patientWhere(actorOf(key, role)),
          select: { fullName: true },
        })
      )
        .map((p) => p.fullName)
        .sort();
    expect(await names('patient', 'patient')).toEqual(['Pat One']);
    expect(await names('agent', 'agent')).toEqual(['Pat One']);
    expect(await names('cm3', 'case_manager')).toEqual(['Pat Two']);
    expect(await names('admin', 'super_admin')).toEqual(['Pat One', 'Pat Two']);
    expect(await names('dr2', 'doctor')).toEqual([]);
  });
});

describe('document endpoints refuse the roles the matrix excludes (403)', () => {
  /** Written out here, not derived from the matrix, so a wrong grant in the matrix fails this test. */
  const MAY_READ: Role[] = [
    'patient',
    'attendant',
    'case_manager',
    'medical_reviewer',
    'hospital_desk',
    'doctor',
    'super_admin',
  ];
  const MAY_UPLOAD: Role[] = [
    'patient',
    'attendant',
    'case_manager',
    'medical_reviewer',
    'hospital_desk',
    'super_admin',
  ];

  it.each(ROLES)('%s', async (role) => {
    const user = await t.makeUser({
      email: `probe-${role}-${next()}@rbac.test`.replace(/_/g, '-'),
      role,
    });
    const { accessToken } = await t.tokenFor(user.id);
    const headers = { authorization: `Bearer ${accessToken}` };
    expect((await t.raw('GET', '/probe/documents', { headers })).status, `${role} GET`).toBe(
      MAY_READ.includes(role) ? 200 : 403,
    );
    expect((await t.raw('POST', '/probe/documents', { headers })).status, `${role} POST`).toBe(
      MAY_UPLOAD.includes(role) ? 201 : 403,
    );
  });

  it('is 403 for an agent on both, and 401 with no sign-in', async () => {
    const agent = await t.makeUser({ email: `agent403-${next()}@rbac.test`, role: 'agent' });
    const headers = { authorization: `Bearer ${(await t.tokenFor(agent.id)).accessToken}` };
    expect((await t.raw('GET', '/probe/documents', { headers })).status).toBe(403);
    expect((await t.raw('POST', '/probe/documents', { headers })).status).toBe(403);
    expect((await t.raw('GET', '/probe/documents')).status).toBe(401);
  });
});
