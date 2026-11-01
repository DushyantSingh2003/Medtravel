import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CASE_STAGES,
  casePageSchema,
  caseViewSchema,
  stageConfigListSchema,
  stageHistoryPageSchema,
  type CaseTarget,
  type CaseView,
  type Role,
} from '@medtravel/contracts';
import { createTestApp, type TestApp } from './support/test-app.js';

let t: TestApp;

interface Who {
  id: string;
  token: string;
}
const people: Record<string, Who> = {};
let counter = 0;
const next = () => (counter += 1);

async function person(key: string, role: Role): Promise<Who> {
  const user = await t.makeUser({ email: `${key}-${next()}@test.example`, role, name: key });
  const { accessToken } = await t.tokenFor(user.id);
  people[key] = { id: user.id, token: accessToken };
  return people[key];
}

const call = (key: string, method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown) =>
  t.raw(method, url, {
    headers: { authorization: `Bearer ${people[key]?.token ?? ''}` },
    ...(body === undefined ? {} : { body }),
  });

const view = (body: unknown): CaseView => caseViewSchema.parse(body);
const errorFields = (body: unknown): string[] =>
  ((body as { errors?: { path: string[] }[] }).errors ?? []).map((e) => e.path.join('.'));

/** A case opened by the super admin (no owner), or by a case manager (who then owns it). */
async function openCase(by = 'admin', patient = 'Asha Verma'): Promise<CaseView> {
  const res = await call(by, 'POST', '/cases', { patient: { fullName: patient } });
  expect(res.status).toBe(201);
  return view(res.body);
}

const move = (key: string, id: string, to: CaseTarget, extra: Record<string, unknown> = {}) =>
  call(key, 'POST', `/cases/${id}/transitions`, { to, ...extra });

/** Gives a case everything the forward moves ask for. */
async function supplyFacts(caseId: string): Promise<void> {
  const owner = people['manager1']?.id as string;
  await t.db.case.update({ where: { id: caseId }, data: { ownerId: owner } });
  await t.db.medicalSummary.create({ data: { caseId, version: 1, diagnosis: 'x' } });
  await t.db.quote.create({
    data: {
      caseId,
      quoteNo: `Q-${String(next()).padStart(6, '0')}`,
      status: 'accepted',
      totalMinor: 1000n,
      currency: 'USD',
    },
  });
  await t.db.payment.create({
    data: {
      caseId,
      type: 'deposit',
      method: 'bank_wire',
      status: 'succeeded',
      amountMinor: 100n,
      currency: 'USD',
    },
  });
}

beforeAll(async () => {
  t = await createTestApp();
  await t.db.currency.create({ data: { code: 'USD', name: 'US dollar', minorUnits: 2 } });
  await t.db.lostReason.create({ data: { code: 'price', name: 'Price' } });
  await t.db.lostReason.create({ data: { code: 'old', name: 'Retired', active: false } });
  await person('admin', 'super_admin');
  await person('manager1', 'case_manager');
  await person('manager2', 'case_manager');
  await person('patient1', 'patient');
  await person('patient2', 'patient');
  await person('finance', 'finance');
  await person('reviewer', 'medical_reviewer');
  await person('desk', 'hospital_desk');
  await person('doctor', 'doctor');
});

afterAll(async () => {
  await t.close();
});

describe('POST /cases', () => {
  it('opens a case at enquiry with a CASE-YYYY-NNNNNN number, a history row, the first task and an event', async () => {
    const res = await call('manager1', 'POST', '/cases', {
      patient: { fullName: 'Omar Khalid', email: 'omar@example.com', phone: '+971501234567' },
      urgency: 'soon',
      budget: { amountMinor: 1_500_000, currency: 'USD' },
      note: 'Referred by a friend',
    });
    expect(res.status).toBe(201);
    const created = view(res.body);
    expect(created).toMatchObject({
      stage: 'enquiry',
      status: 'new',
      urgency: 'soon',
      ownerId: people['manager1']?.id,
      budget: { amountMinor: 1_500_000, currency: 'USD' },
      patientName: 'Omar Khalid',
    });
    expect(created.caseNo).toMatch(new RegExp(`^CASE-${new Date().getUTCFullYear()}-\\d{6}$`));
    expect(created.slaDueAt).toBeTruthy();

    const history = await t.db.caseStageHistory.findMany({ where: { caseId: created.id } });
    expect(history).toMatchObject([{ fromStage: null, toStage: 'enquiry' }]);
    expect(await t.db.caseNote.count({ where: { caseId: created.id } })).toBe(1);
    const tasks = await t.db.task.findMany({ where: { caseId: created.id } });
    expect(tasks).toMatchObject([
      {
        title: 'Assign a case manager',
        autoKey: 'enquiry:assign',
        assigneeRole: 'case_manager',
        assigneeId: people['manager1']?.id,
      },
    ]);
    const events = await t.db.outboxEvent.findMany({
      where: { type: 'case.created', aggregateId: created.id },
    });
    expect(events).toHaveLength(1);
    const audit = await t.db.auditEvent.findMany({
      where: { entityId: created.id, action: 'case.created' },
    });
    expect(audit).toHaveLength(1);
  });

  it('numbers cases one after another without gaps or repeats, even when opened together', async () => {
    const opened = await Promise.all(
      Array.from({ length: 6 }, (_, i) => openCase('admin', `Parallel ${i}`)),
    );
    const numbers = opened.map((c) => Number(c.caseNo?.slice(-6))).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(6);
    expect((numbers.at(-1) as number) - (numbers[0] as number)).toBe(5);
  });

  it('lets a patient open a case for themselves, once with their own record, and never for someone else', async () => {
    const first = await call('patient1', 'POST', '/cases', { urgency: 'routine' });
    expect(first.status).toBe(201);
    expect(view(first.body)).toMatchObject({
      stage: 'enquiry',
      patientName: 'patient1',
      source: 'website',
    });
    await call('patient1', 'POST', '/cases', {});
    const mine = await t.db.patient.count({ where: { userId: people['patient1']?.id } });
    expect(mine).toBe(1);
    const other = await openCase('admin');
    const forged = await call('patient1', 'POST', '/cases', { patientId: other.patientId });
    expect(forged.status).toBe(403);
  });

  it('asks staff to say who the case is for', async () => {
    const res = await call('manager1', 'POST', '/cases', {});
    expect(res.status).toBe(400);
    expect(errorFields(res.body)).toContain('patient');
  });

  it('rejects bad input on the right field', async () => {
    const res = await call('manager1', 'POST', '/cases', {
      patient: { fullName: 'A', phone: '12345' },
      budget: { amountMinor: 1.5, currency: 'US' },
    });
    expect(res.status).toBe(400);
    expect(errorFields(res.body)).toEqual(
      expect.arrayContaining(['patient.fullName', 'patient.phone']),
    );
  });

  it('is forbidden to roles that cannot open cases, and to anyone not signed in', async () => {
    for (const key of ['finance', 'reviewer', 'desk', 'doctor'])
      expect(
        (await call(key, 'POST', '/cases', { patient: { fullName: 'Nobody Here' } })).status,
        key,
      ).toBe(403);
    expect((await t.raw('POST', '/cases', { body: {} })).status).toBe(401);
  });

  it('lets an agent open a case for their agency, and refuses an agent with no agency', async () => {
    await person('agent', 'agent');
    expect(
      (await call('agent', 'POST', '/cases', { patient: { fullName: 'Lina Haddad' } })).status,
    ).toBe(403);
    await t.db.country.upsert({
      where: { code: 'AE' },
      update: {},
      create: { code: 'AE', name: 'United Arab Emirates' },
    });
    const agency = await t.db.agent.create({
      data: {
        companyName: 'Gulf Referrals',
        referralCode: `AG${next()}`,
        languages: ['ar'],
        countryCode: 'AE',
      },
    });
    await t.db.agentUser.create({
      data: { agentId: agency.id, userId: people['agent']?.id as string },
    });
    const res = await call('agent', 'POST', '/cases', { patient: { fullName: 'Lina Haddad' } });
    expect(res.status).toBe(201);
    const row = await t.db.case.findUniqueOrThrow({
      where: { id: (res.body as { id: string }).id },
    });
    expect(row).toMatchObject({ agentId: agency.id, source: 'agent' });
  });
});

describe('what each kind of caller may learn', () => {
  it('keeps the reasons staff write on a case’s moves from patients, and shows them to staff', async () => {
    const own = view((await call('patient1', 'POST', '/cases', {})).body);
    await t.db.case.update({
      where: { id: own.id },
      data: { ownerId: people['manager1']?.id as string },
    });
    expect(
      (await move('admin', own.id, 'on_hold', { note: 'Cannot afford treatment' })).status,
    ).toBe(200);
    const asPatient = stageHistoryPageSchema.parse(
      (await call('patient1', 'GET', `/cases/${own.id}/history`)).body,
    );
    expect(asPatient.items.map((h) => h.toStage)).toEqual(['on_hold', 'enquiry']);
    expect(asPatient.items.every((h) => h.note === null && h.actorId === null)).toBe(true);
    const asStaff = stageHistoryPageSchema.parse(
      (await call('admin', 'GET', `/cases/${own.id}/history`)).body,
    );
    expect(asStaff.items[0]).toMatchObject({ note: 'Cannot afford treatment' });
  });

  it('shows an agency only what its role may read: no internal timers, patient id, owner or source', async () => {
    await person('agent2', 'agent');
    await t.db.country.upsert({
      where: { code: 'AE' },
      update: {},
      create: { code: 'AE', name: 'United Arab Emirates' },
    });
    const agency = await t.db.agent.create({
      data: {
        companyName: 'Agency Two',
        referralCode: `AG${next()}`,
        languages: ['ar'],
        countryCode: 'AE',
      },
    });
    await t.db.agentUser.create({
      data: { agentId: agency.id, userId: people['agent2']?.id as string },
    });
    const res = await call('agent2', 'POST', '/cases', {
      patient: { fullName: 'Lina Haddad' },
      source: 'walk_in',
    });
    expect(res.status).toBe(201);
    const keys = Object.keys(res.body as object).sort();
    expect(keys).toEqual(
      [
        'caseNo',
        'createdAt',
        'id',
        'nextTargets',
        'patientName',
        'stage',
        'stageEnteredAt',
        'status',
        'urgency',
      ].sort(),
    );
    // Their own choice of source is ignored: the case is an agency referral.
    const row = await t.db.case.findUniqueOrThrow({
      where: { id: (res.body as { id: string }).id },
    });
    expect(row.source).toBe('agent');
    for (const query of [
      'ownerId=' + people['manager1']?.id,
      'source=agent',
      'overdue=true',
      'sort=slaDueAt',
    ])
      expect((await call('agent2', 'GET', `/cases?${query}`)).status, query).toBe(400);
  });

  it('keeps a patient’s own source choice out too', async () => {
    const res = await call('patient2', 'POST', '/cases', { source: 'referral' });
    expect(res.status).toBe(201);
    const row = await t.db.case.findUniqueOrThrow({
      where: { id: (res.body as { id: string }).id },
    });
    expect(row.source).toBe('website');
    expect((await call('patient2', 'GET', '/cases?urgency=routine')).status).toBe(200);
  });

  it('answers 422 on the field when the treatment, city or country does not exist', async () => {
    for (const [field, value] of [
      ['treatmentId', randomUUID()],
      ['preferredCityId', randomUUID()],
      ['countryCode', 'ZZ'],
    ] as const) {
      const res = await call('manager1', 'POST', '/cases', {
        patient: { fullName: 'Ref Check' },
        [field]: value,
      });
      expect(res.status, field).toBe(422);
      expect(errorFields(res.body)).toEqual([field]);
    }
  });
});

describe('GET /cases and /cases/:id', () => {
  it('shows a case to the people who may see it and to nobody else', async () => {
    const mine = await openCase('manager1', 'Scope Check');
    expect((await call('manager1', 'GET', `/cases/${mine.id}`)).status).toBe(200);
    expect((await call('admin', 'GET', `/cases/${mine.id}`)).status).toBe(200);
    expect((await call('manager2', 'GET', `/cases/${mine.id}`)).status).toBe(404);
    expect((await call('patient2', 'GET', `/cases/${mine.id}`)).status).toBe(404);
    expect((await call('desk', 'GET', `/cases/${mine.id}`)).status).toBe(404);
    expect((await t.raw('GET', `/cases/${mine.id}`)).status).toBe(401);
    expect((await call('admin', 'GET', '/cases/not-a-uuid')).status).toBe(400);
  });

  it('lists the moves each role could make from the current stage', async () => {
    const created = await openCase('manager1', 'Moves');
    const asManager = view((await call('manager1', 'GET', `/cases/${created.id}`)).body);
    expect([...(asManager.nextTargets ?? [])].sort()).toEqual([
      'cancelled',
      'lost',
      'on_hold',
      'qualification',
    ]);
    const own = await call('patient1', 'POST', '/cases', {});
    const asPatient = view(
      (await call('patient1', 'GET', `/cases/${(own.body as { id: string }).id}`)).body,
    );
    expect(asPatient.nextTargets).toEqual([]);
  });

  it('lists with filters, sorting and cursor paging, within the caller’s scope', async () => {
    const stamp = `Listing ${next()}`;
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) ids.push((await openCase('manager1', `${stamp} ${i}`)).id);
    await t.db.case.update({ where: { id: ids[0] as string }, data: { urgency: 'urgent' } });

    const all = casePageSchema.parse(
      (await call('manager1', 'GET', '/cases?limit=2&sort=createdAt&dir=asc')).body,
    );
    expect(all.items).toHaveLength(2);
    expect(all.nextCursor).toBeTruthy();
    const second = casePageSchema.parse(
      (
        await call(
          'manager1',
          'GET',
          `/cases?limit=2&sort=createdAt&dir=asc&cursor=${all.nextCursor}`,
        )
      ).body,
    );
    expect(second.items.map((c) => c.id)).not.toEqual(
      expect.arrayContaining(all.items.map((c) => c.id)),
    );
    expect(all.total).toBeGreaterThanOrEqual(5);

    const urgent = casePageSchema.parse(
      (await call('manager1', 'GET', '/cases?urgency=urgent')).body,
    );
    expect(urgent.items.map((c) => c.id)).toContain(ids[0]);
    expect(urgent.items.every((c) => c.urgency === 'urgent')).toBe(true);

    const byNumber = casePageSchema.parse(
      (
        await call(
          'manager1',
          'GET',
          `/cases?q=${encodeURIComponent((await t.db.case.findUniqueOrThrow({ where: { id: ids[1] as string } })).caseNo)}`,
        )
      ).body,
    );
    expect(byNumber.items.map((c) => c.id)).toEqual([ids[1]]);

    // A manager never sees another manager's cases; a patient only their own.
    const other = casePageSchema.parse((await call('manager2', 'GET', '/cases')).body);
    expect(other.items.some((c) => ids.includes(c.id))).toBe(false);
    const patient = casePageSchema.parse((await call('patient1', 'GET', '/cases')).body);
    expect(patient.items.length).toBeGreaterThan(0);
    expect(patient.items.every((c) => c.patientName === 'patient1')).toBe(true);
  });

  it('finds the cases past their stage target', async () => {
    const late = await openCase('manager1', 'Running late');
    await t.db.case.update({
      where: { id: late.id },
      data: { slaDueAt: new Date(Date.now() - 60_000) },
    });
    const page = casePageSchema.parse((await call('manager1', 'GET', '/cases?overdue=true')).body);
    expect(page.items.map((c) => c.id)).toContain(late.id);
    expect(page.items.every((c) => c.slaDueAt && new Date(c.slaDueAt) < new Date())).toBe(true);
  });

  it('rejects unknown filters values and bad cursors', async () => {
    expect((await call('admin', 'GET', '/cases?stage=nonsense')).status).toBe(400);
    expect((await call('admin', 'GET', '/cases?cursor=%%%')).status).toBe(400);
    expect((await call('admin', 'GET', '/cases?limit=1000')).status).toBe(400);
  });
});

describe('POST /cases/:id/transitions', () => {
  it('walks a case through all twelve stages and closes it, recording each step', async () => {
    const created = await openCase('admin', 'Full Journey');
    await supplyFacts(created.id);
    for (const stage of CASE_STAGES.slice(1)) {
      const res = await move('admin', created.id, stage);
      expect(res.status, stage).toBe(200);
      expect(view(res.body)).toMatchObject({ stage });
    }
    const closed = await move('admin', created.id, 'closed');
    expect(closed.status).toBe(200);
    expect(view(closed.body)).toMatchObject({ stage: 'follow_up', status: 'closed' });

    const row = await t.db.case.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.closedAt).not.toBeNull();
    const history = await t.db.caseStageHistory.findMany({
      where: { caseId: created.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((h) => h.toStage)).toEqual([...CASE_STAGES, 'follow_up']);
    const events = await t.db.outboxEvent.findMany({
      where: { type: 'case.stage_changed', aggregateId: created.id },
    });
    expect(events).toHaveLength(12);
    const pickup = await t.db.task.findFirst({
      where: { caseId: created.id, title: 'Book airport pickup' },
    });
    expect(pickup).toMatchObject({
      assigneeRole: 'ground_coordinator',
      autoKey: 'travel_planning:airport_pickup',
    });
    // Closed is final.
    expect((await move('admin', created.id, 'qualification')).status).toBe(409);
  });

  it('sets the status and the stage timer from the stage entered', async () => {
    const created = await openCase('admin', 'Timer');
    await supplyFacts(created.id);
    const at = Date.now();
    const res = view((await move('admin', created.id, 'qualification')).body);
    expect(res.status).toBe('qualifying');
    // Qualification should take two hours by default.
    expect(new Date(res.slaDueAt as string).getTime() - at).toBeGreaterThan(119 * 60_000);
    expect(new Date(res.slaDueAt as string).getTime() - at).toBeLessThan(121 * 60_000);
  });

  it('refuses a move the state machine does not allow, with 409', async () => {
    const created = await openCase('admin', 'Skip Ahead');
    await supplyFacts(created.id);
    expect((await move('admin', created.id, 'visa')).status).toBe(409);
    expect((await move('admin', created.id, 'enquiry')).status).toBe(409);
    expect((await move('admin', created.id, 'closed')).status).toBe(409);
    expect((await move('admin', created.id, 'nowhere' as CaseTarget)).status).toBe(400);
  });

  it('asks for the data a move needs and names the field', async () => {
    const created = await openCase('admin', 'Missing Data');
    // No case manager yet.
    let res = await move('admin', created.id, 'qualification');
    expect(res.status).toBe(422);
    expect(errorFields(res.body)).toEqual(['to']);
    await t.db.case.update({
      where: { id: created.id },
      data: { ownerId: people['manager1']?.id as string },
    });
    expect((await move('admin', created.id, 'qualification')).status).toBe(200);
    expect((await move('admin', created.id, 'medical_review')).status).toBe(200);
    res = await move('admin', created.id, 'hospital_opinions');
    expect(res.status).toBe(422);
    await t.db.medicalSummary.create({ data: { caseId: created.id, version: 1, diagnosis: 'x' } });
    expect((await move('admin', created.id, 'hospital_opinions')).status).toBe(200);
    expect((await move('admin', created.id, 'quote_decision')).status).toBe(422);
    await t.db.quote.create({
      data: {
        caseId: created.id,
        quoteNo: `Q-${String(next()).padStart(6, '0')}`,
        status: 'sent',
        totalMinor: 5n,
        currency: 'USD',
      },
    });
    expect((await move('admin', created.id, 'quote_decision')).status).toBe(200);
    // A quote that was only sent is not accepted.
    expect((await move('admin', created.id, 'booking_deposit')).status).toBe(422);
    await t.db.quote.updateMany({ where: { caseId: created.id }, data: { status: 'accepted' } });
    expect((await move('admin', created.id, 'booking_deposit')).status).toBe(200);
    expect(view((await call('admin', 'GET', `/cases/${created.id}`)).body).status).toBe('won');
  });

  it('needs the deposit, or an override with a reason from someone allowed to give it', async () => {
    const created = await openCase('admin', 'Deposit');
    await supplyFacts(created.id);
    await t.db.payment.deleteMany({ where: { caseId: created.id } });
    for (const stage of CASE_STAGES.slice(1, 6))
      expect((await move('admin', created.id, stage)).status).toBe(200);

    let res = await move('admin', created.id, 'visa');
    expect(res.status).toBe(422);
    res = await move('admin', created.id, 'visa', { override: true });
    expect(res.status).toBe(422);
    expect(errorFields(res.body)).toContain('to');
    // A payment that has not succeeded does not count.
    await t.db.payment.create({
      data: {
        caseId: created.id,
        type: 'deposit',
        method: 'card',
        status: 'pending',
        amountMinor: 1n,
        currency: 'USD',
      },
    });
    expect((await move('admin', created.id, 'visa')).status).toBe(422);
    res = await move('admin', created.id, 'visa', {
      override: true,
      note: 'Bank transfer confirmed by phone',
    });
    expect(res.status).toBe(200);
    const history = await t.db.caseStageHistory.findFirstOrThrow({
      where: { caseId: created.id, toStage: 'visa' },
    });
    expect(history.note).toBe('Bank transfer confirmed by phone');
    const audit = await t.db.auditEvent.findFirstOrThrow({
      where: { entityId: created.id, action: 'case.stage_changed' },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(audit.after)).toContain('overridden');
  });

  it('moves back one stage only with a note', async () => {
    const created = await openCase('admin', 'Back');
    await supplyFacts(created.id);
    await move('admin', created.id, 'qualification');
    await move('admin', created.id, 'medical_review');
    const bare = await move('admin', created.id, 'qualification');
    expect(bare.status).toBe(422);
    expect(errorFields(bare.body)).toEqual(['note']);
    const ok = await move('admin', created.id, 'qualification', {
      note: 'Reports were unreadable',
    });
    expect(ok.status).toBe(200);
    // Going back and forth does not create the stage's tasks twice.
    await move('admin', created.id, 'medical_review');
    const summaryTasks = await t.db.task.count({
      where: { caseId: created.id, autoKey: 'medical_review:summary' },
    });
    expect(summaryTasks).toBe(1);
  });

  it('loses a case with a listed reason, holds it, resumes it where it was, and reopens it with a note', async () => {
    const created = await openCase('admin', 'Exits');
    await supplyFacts(created.id);
    await move('admin', created.id, 'qualification');
    await move('admin', created.id, 'medical_review');

    let res = await move('admin', created.id, 'lost');
    expect(res.status).toBe(422);
    expect(errorFields(res.body)).toEqual(['lostReasonId']);
    const retired = await t.db.lostReason.findFirstOrThrow({ where: { code: 'old' } });
    res = await move('admin', created.id, 'lost', { lostReasonId: retired.id });
    expect(res.status).toBe(422);
    expect(errorFields(res.body)).toEqual(['lostReasonId']);

    const hold = await move('admin', created.id, 'on_hold');
    expect(hold.status).toBe(422);
    expect(
      (await move('admin', created.id, 'on_hold', { note: 'Patient is travelling' })).status,
    ).toBe(200);
    expect(view((await call('admin', 'GET', `/cases/${created.id}`)).body)).toMatchObject({
      stage: 'on_hold',
      status: 'on_hold',
      slaDueAt: null,
    });
    // It can only go back where it was.
    expect((await move('admin', created.id, 'visa')).status).toBe(409);
    const resumed = view((await move('admin', created.id, 'medical_review')).body);
    expect(resumed).toMatchObject({ stage: 'medical_review', status: 'in_medical_review' });
    expect(resumed.slaDueAt).toBeTruthy();

    const reason = await t.db.lostReason.findFirstOrThrow({ where: { code: 'price' } });
    const lostRes = view(
      (
        await move('admin', created.id, 'lost', {
          lostReasonId: reason.id,
          note: 'Chose another country',
        })
      ).body,
    );
    expect(lostRes).toMatchObject({ stage: 'lost', status: 'lost', lostReasonId: reason.id });
    expect(lostRes.closedAt).toBeTruthy();
    expect((await move('admin', created.id, 'medical_review')).status).toBe(422);
    const reopened = view(
      (await move('admin', created.id, 'medical_review', { note: 'Patient came back' })).body,
    );
    expect(reopened).toMatchObject({ stage: 'medical_review', lostReasonId: null, closedAt: null });
  });

  it('cancels with a note and never reopens', async () => {
    const created = await openCase('admin', 'Cancelled');
    expect((await move('admin', created.id, 'cancelled')).status).toBe(422);
    const res = view(
      (await move('admin', created.id, 'cancelled', { note: 'Refund requested' })).body,
    );
    expect(res).toMatchObject({ stage: 'cancelled', status: 'cancelled' });
    expect((await move('admin', created.id, 'enquiry')).status).toBe(409);
    expect((await move('admin', created.id, 'lost')).status).toBe(409);
    expect(res.nextTargets).toEqual([]);
  });

  it('lets only the right people move a case, and hides cases outside their scope', async () => {
    const created = await openCase('manager1', 'Who Moves');
    await supplyFacts(created.id);
    // Patients, other managers and unrelated roles cannot.
    const own = await call('patient1', 'POST', '/cases', {});
    expect((await move('patient1', (own.body as { id: string }).id, 'qualification')).status).toBe(
      403,
    );
    expect((await move('manager2', created.id, 'qualification')).status).toBe(404);
    expect((await move('desk', created.id, 'qualification')).status).toBe(404);
    expect(
      (await t.raw('POST', `/cases/${created.id}/transitions`, { body: { to: 'qualification' } }))
        .status,
    ).toBe(401);
    // The case manager who owns it can.
    expect((await move('manager1', created.id, 'qualification')).status).toBe(200);
    expect((await move('manager1', created.id, 'medical_review')).status).toBe(200);
    // The medical reviewer owns this stage; the move to the next needs the summary (given by supplyFacts).
    expect((await move('reviewer', created.id, 'hospital_opinions')).status).toBe(200);
    // But not the stage after: the reviewer neither sees a case outside review nor owns the next stage.
    expect((await move('reviewer', created.id, 'quote_decision')).status).toBe(404);
  });

  it('does not let a stage owner send a case to an exit or an override a requirement they are not allowed to', async () => {
    const created = await openCase('admin', 'Reviewer Limits');
    await supplyFacts(created.id);
    await move('admin', created.id, 'qualification');
    await move('admin', created.id, 'medical_review');
    expect((await move('reviewer', created.id, 'lost')).status).toBe(403);
    expect(
      (
        await move('reviewer', created.id, 'hospital_opinions', {
          override: true,
          note: 'trust me',
        })
      ).status,
    ).toBe(403);
  });

  it('lets two requests race for one move: one wins, the other is told the case moved on', async () => {
    const created = await openCase('admin', 'Race');
    await supplyFacts(created.id);
    const results = await Promise.all([
      move('admin', created.id, 'qualification'),
      move('admin', created.id, 'qualification'),
      move('admin', created.id, 'qualification'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect(
      await t.db.caseStageHistory.count({
        where: { caseId: created.id, toStage: 'qualification' },
      }),
    ).toBe(1);
  });

  it('writes an audit row and a realtime event for the move', async () => {
    const created = await openCase('admin', 'Audit');
    await supplyFacts(created.id);
    await move('admin', created.id, 'qualification');
    const audit = await t.db.auditEvent.findMany({
      where: { entityId: created.id, action: 'case.stage_changed' },
    });
    expect(audit).toHaveLength(1);
    const push = await t.db.outboxEvent.findMany({
      where: { type: 'realtime.publish', aggregateId: `case:${created.id}` },
    });
    expect(push.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /cases/:id/history', () => {
  it('lists every stage change newest first, with paging, for people who may see the case', async () => {
    const created = await openCase('manager1', 'History');
    await supplyFacts(created.id);
    await move('manager1', created.id, 'qualification');
    await move('manager1', created.id, 'medical_review');
    const page = stageHistoryPageSchema.parse(
      (await call('manager1', 'GET', `/cases/${created.id}/history?limit=2`)).body,
    );
    expect(page.items.map((h) => h.toStage)).toEqual(['medical_review', 'qualification']);
    expect(page.items[0]?.actorId).toBe(people['manager1']?.id);
    expect(page.nextCursor).toBeTruthy();
    expect(page.total).toBe(3);
    const rest = stageHistoryPageSchema.parse(
      (
        await call(
          'manager1',
          'GET',
          `/cases/${created.id}/history?limit=2&cursor=${page.nextCursor}`,
        )
      ).body,
    );
    expect(rest.items.map((h) => h.toStage)).toEqual(['enquiry']);
    expect(rest.nextCursor).toBeNull();
    expect((await call('manager2', 'GET', `/cases/${created.id}/history`)).status).toBe(404);
    expect((await t.raw('GET', `/cases/${created.id}/history`)).status).toBe(401);
  });
});

describe('stage configuration', () => {
  it('lists all twelve stages with their defaults', async () => {
    const res = await call('admin', 'GET', '/cases/stage-config');
    expect(res.status).toBe(200);
    const items = stageConfigListSchema.parse((res.body as { items: unknown }).items);
    expect(items.map((i) => i.stage)).toEqual([...CASE_STAGES]);
    expect(items.find((i) => i.stage === 'hospital_opinions')).toMatchObject({
      targetMinutes: 2880,
      ownerRole: 'hospital_desk',
    });
  });

  it('lets the super admin change a stage’s target and tasks, and the next move uses them', async () => {
    const put = await call('admin', 'PUT', '/cases/stage-config/qualification', {
      targetMinutes: 30,
      ownerRole: 'case_manager',
      autoTasks: [
        {
          key: 'call',
          title: 'Call within the half hour',
          assigneeRole: 'case_manager',
          dueInMinutes: 30,
          priority: 'high',
        },
      ],
    });
    expect(put.status).toBe(200);
    const created = await openCase('admin', 'Configured');
    await supplyFacts(created.id);
    const at = Date.now();
    const res = view((await move('admin', created.id, 'qualification')).body);
    expect(new Date(res.slaDueAt as string).getTime() - at).toBeLessThan(31 * 60_000);
    const tasks = await t.db.task.findMany({
      where: { caseId: created.id, autoKey: { startsWith: 'qualification:' } },
    });
    expect(tasks.map((x) => x.title)).toEqual(['Call within the half hour']);
    expect(
      await t.db.auditEvent.count({
        where: { action: 'stage_config.updated', entityId: 'qualification' },
      }),
    ).toBe(1);
  });

  it('lets the configured owner role move the case, instead of the built-in one', async () => {
    const created = await openCase('admin', 'Owner Config');
    await supplyFacts(created.id);
    await move('admin', created.id, 'qualification');
    await move('admin', created.id, 'medical_review');
    // Built in: the medical reviewer owns this stage. Hand it to finance.
    await call('admin', 'PUT', '/cases/stage-config/medical_review', {
      targetMinutes: 60,
      ownerRole: 'finance',
      autoTasks: [],
    });
    expect((await move('reviewer', created.id, 'hospital_opinions')).status).toBe(403);
    await call('admin', 'PUT', '/cases/stage-config/medical_review', {
      targetMinutes: 1440,
      ownerRole: 'medical_reviewer',
      autoTasks: [],
    });
    expect((await move('reviewer', created.id, 'hospital_opinions')).status).toBe(200);
  });

  it('is for the super admin only, and checks its input', async () => {
    const body = { targetMinutes: 60, ownerRole: 'case_manager', autoTasks: [] };
    expect((await call('manager1', 'PUT', '/cases/stage-config/visa', body)).status).toBe(403);
    expect((await call('patient1', 'PUT', '/cases/stage-config/visa', body)).status).toBe(403);
    expect((await t.raw('PUT', '/cases/stage-config/visa', { body })).status).toBe(401);
    expect((await call('admin', 'PUT', '/cases/stage-config/lost', body)).status).toBe(400);
    expect(
      (await call('admin', 'PUT', '/cases/stage-config/visa', { ...body, ownerRole: 'wizard' }))
        .status,
    ).toBe(400);
    expect(
      (await call('admin', 'PUT', '/cases/stage-config/visa', { ...body, targetMinutes: 0 }))
        .status,
    ).toBe(400);
  });
});
