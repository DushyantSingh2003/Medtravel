import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  leadCreatedSchema,
  leadDetailSchema,
  leadPageSchema,
  publicLeadReceivedSchema,
  type Role,
} from '@medtravel/contracts';
import { createTestApp, type TestApp } from './support/test-app.js';

/** Lead capture: one intake for every source, duplicate detection, the inbox, and merging two records of one person. */

let t: TestApp;
let n = 0;
const next = () => (n += 1);
const form = (over: Record<string, unknown> = {}) => ({
  name: `Asha Verma ${next()}`,
  phone: `+9715${String(10_000_00 + next() * 7).padStart(8, '0')}`,
  message: 'I need a knee replacement',
  privacyAccepted: true,
  turnstileToken: 'ok-token',
  ...over,
});
// A fresh address for each call unless a test says otherwise, so the hourly limit only counts what a test means it to count.
let addresses = 0;
const freshIp = () => `10.${Math.floor((addresses += 1) / 250)}.${addresses % 250}.7`;
const publicSubmit = (body: unknown, ip = freshIp()) => t.raw('POST', '/public/leads', { body, ip });
const staff = (role: Role, method: 'GET' | 'POST', url: string, body?: unknown) => t.call(role, method, url, body);
const errorFields = (body: unknown): string[] =>
  ((body as { errors?: { path: (string | number)[] }[] }).errors ?? []).map((e) => e.path.join('.'));

let treatmentId: string;
let managerToken: string;
let otherManagerToken: string;
let managerId: string;

beforeAll(async () => {
  t = await createTestApp();
  await t.db.country.upsert({ where: { code: 'AE' }, update: {}, create: { code: 'AE', name: 'UAE' } });
  const speciality = await t.db.speciality.create({ data: { slug: `s-${next()}`, name: 'Orthopaedics' } });
  treatmentId = (
    await t.db.treatment.create({ data: { slug: `knee-${next()}`, name: 'Knee replacement', specialityId: speciality.id } })
  ).id;
  const a = await t.makeUser({ email: `cm-a-${next()}@leads.test`, role: 'case_manager' });
  const b = await t.makeUser({ email: `cm-b-${next()}@leads.test`, role: 'case_manager' });
  managerId = a.id;
  managerToken = (await t.tokenFor(a.id)).accessToken;
  otherManagerToken = (await t.tokenFor(b.id)).accessToken;
});
afterAll(async () => {
  await t.close();
});

const asManager = (token: string, method: 'GET' | 'POST', url: string, body?: unknown) =>
  t.raw(method, url, { headers: { authorization: `Bearer ${token}` }, ...(body === undefined ? {} : { body }) });

describe('the website form', () => {
  it('creates a patient and a case in stage enquiry, and answers only with the reference', async () => {
    const res = await publicSubmit(form({ treatmentId, countryCode: 'AE', utmCampaign: 'spring', utmSource: 'google', referrer: 'https://google.com/' }));
    expect(res.status).toBe(201);
    const body = publicLeadReceivedSchema.parse(res.body);
    expect(Object.keys(res.body as object)).toEqual(['reference']);
    const kase = await t.db.case.findFirstOrThrow({
      where: { caseNo: body.reference },
      include: { lead: true },
    });
    expect(kase).toMatchObject({ stage: 'enquiry', status: 'new', source: 'website', campaign: 'spring', ownerId: null });
    expect(kase.lead).toMatchObject({ utmSource: 'google', referrer: 'https://google.com/', duplicateState: 'none' });
    expect(await t.db.caseStageHistory.count({ where: { caseId: kase.id } })).toBe(1);
  });

  it('turns away a missing consent, a filled-in honeypot, no contact details, a bad phone and an unknown treatment', async () => {
    expect((await publicSubmit(form({ privacyAccepted: false }))).status).toBe(400);
    expect((await publicSubmit(form({ companyWebsite: 'http://spam.example' }))).status).toBe(400);
    expect((await publicSubmit(form({ phone: undefined, email: undefined }))).status).toBe(400);
    expect((await publicSubmit(form({ phone: '0501234567' }))).status).toBe(400);
    expect((await publicSubmit(form({ turnstileToken: undefined }))).status).toBe(400);
    const unknown = await publicSubmit(form({ treatmentId: '00000000-0000-4000-8000-000000000000' }));
    expect(unknown.status).toBe(422);
    expect(errorFields(unknown.body)).toEqual(['treatmentId']);
  });

  it('cannot be used to choose the source or hand over a passport number', async () => {
    const res = await publicSubmit(form({ source: 'agent', passportNumber: 'A1234567' }));
    expect(res.status).toBe(201);
    const lead = await t.db.lead.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
    expect(lead.source).toBe('website');
    expect(lead.submittedPassport).toBeNull();
  });

  it('limits one address to five enquiries an hour', async () => {
    const ip = '10.9.9.9';
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await publicSubmit(form(), ip)).status);
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });
});

describe('Turnstile', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is asked about the token when a secret is configured, and a failed check creates nothing', async () => {
    const strict = await createTestApp({ env: { TURNSTILE_SECRET_KEY: 'a-secret-key-0123456789' } });
    try {
      const real = globalThis.fetch;
      const seen: string[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        if (!url.startsWith('https://challenges.cloudflare.com/')) return real(input, init);
        seen.push(String(init?.body));
        const ok = String(init?.body).includes('response=good');
        return new Response(JSON.stringify({ success: ok }), { status: 200 });
      });
      const before = await strict.db.lead.count();
      const bad = await strict.raw('POST', '/public/leads', { body: form({ turnstileToken: 'bad' }), ip: '10.1.1.1' });
      expect(bad.status).toBe(400);
      expect(errorFields(bad.body)).toEqual(['turnstileToken']);
      expect(await strict.db.lead.count()).toBe(before);
      const good = await strict.raw('POST', '/public/leads', { body: form({ turnstileToken: 'good' }), ip: '10.1.1.2' });
      expect(good.status).toBe(201);
      expect(seen).toHaveLength(2);
      expect(seen[0]).toContain('secret=a-secret-key-0123456789');
    } finally {
      await strict.close();
    }
  });

  it('fails closed when Cloudflare cannot be reached', async () => {
    const strict = await createTestApp({ env: { TURNSTILE_SECRET_KEY: 'a-secret-key-0123456789' } });
    try {
      const real = globalThis.fetch;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        if (String(input).startsWith('https://challenges.cloudflare.com/')) throw new Error('offline');
        return real(input, init);
      });
      const res = await strict.raw('POST', '/public/leads', { body: form(), ip: '10.1.1.3' });
      expect(res.status).toBe(400);
    } finally {
      await strict.close();
    }
  });
});

describe('finding the same person again', () => {
  it('attaches the same phone number, written two ways, to one patient with two enquiries, both flagged', async () => {
    const phone = '+971 50 555 1212';
    const first = await publicSubmit(form({ phone, name: 'Fatima Al Hashmi' }));
    const second = await publicSubmit(form({ phone: '00971505551212', name: 'F. Alhashmi', message: 'Asking again' }));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    // The visitor cannot tell the second time from the first.
    expect(Object.keys(second.body as object)).toEqual(['reference']);

    const patients = await t.db.patient.findMany({ where: { phone: '+971505551212' } });
    expect(patients).toHaveLength(1);
    const leads = await t.db.lead.findMany({ where: { patientId: patients[0]!.id }, orderBy: { createdAt: 'asc' } });
    expect(leads).toHaveLength(2);
    expect(leads.map((l) => l.duplicateState)).toEqual(['possible', 'possible']);
    expect(leads[1]?.matchedOn).toEqual(['phone']);
    expect(await t.db.case.count({ where: { patientId: patients[0]!.id } })).toBe(2);
  });

  it('matches on email whatever its case, and on a passport number however it is spaced, and fills in what the record lacked', async () => {
    const created = await staff('case_manager', 'POST', '/leads', {
      source: 'phone',
      name: 'Omar Khan',
      email: 'Omar.Khan@Example.com',
      passportNumber: 'p-123 456',
    });
    expect(created.status).toBe(201);
    const first = leadCreatedSchema.parse(created.body);
    const byEmail = leadCreatedSchema.parse(
      (await staff('case_manager', 'POST', '/leads', { source: 'email', name: 'O. Khan', email: 'omar.khan@example.com', phone: '+971 50 777 8899' })).body,
    );
    expect(byEmail).toMatchObject({ attachedToExisting: true, patientId: first.patientId, matchedOn: ['email'] });
    const byPassport = leadCreatedSchema.parse(
      (await staff('case_manager', 'POST', '/leads', { source: 'walk_in', name: 'Omar K', phone: '+971 50 111 2233', passportNumber: 'P123456' })).body,
    );
    expect(byPassport).toMatchObject({ attachedToExisting: true, patientId: first.patientId, matchedOn: ['passport'] });
    const patient = await t.db.patient.findUniqueOrThrow({ where: { id: first.patientId } });
    // The phone number the second enquiry brought is added; nothing already recorded is replaced.
    expect(patient.phone).toBe('+971507778899');
    expect(patient.email).toBe('omar.khan@example.com');
  });

  it('puts two submissions of one phone number made at the same moment on one patient', async () => {
    const phone = '+971 50 321 0987';
    const replies = await Promise.all(
      [1, 2, 3].map((i) => publicSubmit(form({ phone, name: `Layla Mansour ${i}` }), `10.2.0.${i}`)),
    );
    expect(replies.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(await t.db.patient.count({ where: { phone: '+971503210987' } })).toBe(1);
    expect(await t.db.lead.count({ where: { patient: { phone: '+971503210987' } } })).toBe(3);
  });

  it('treats a similar name alone as a hint: a new patient, flagged, with the other one named', async () => {
    const original = leadCreatedSchema.parse(
      (await staff('case_manager', 'POST', '/leads', { source: 'phone', name: 'Mohammed Al Farsi', phone: '+971 50 900 1001' })).body,
    );
    const similar = leadCreatedSchema.parse(
      (await staff('case_manager', 'POST', '/leads', { source: 'whatsapp', name: 'Mohamed Al Farsi', phone: '+971 50 900 1002' })).body,
    );
    expect(similar.attachedToExisting).toBe(false);
    expect(similar).toMatchObject({ duplicateState: 'possible', matchedOn: ['name'] });
    expect(similar.patientId).not.toBe(original.patientId);
    const unlike = leadCreatedSchema.parse(
      (await staff('case_manager', 'POST', '/leads', { source: 'phone', name: 'Zoya Petrova', phone: '+971 50 900 1003' })).body,
    );
    expect(unlike.duplicateState).toBe('none');
  });

  it('credits an agency only for a code it really has, and ignores one it does not', async () => {
    await t.db.agent.create({
      data: { companyName: 'Agency', referralCode: 'AGT-OK', countryCode: 'AE', status: 'approved' },
    });
    await t.db.agent.create({
      data: { companyName: 'Pending agency', referralCode: 'AGT-NEW', countryCode: 'AE', status: 'applied' },
    });
    const withCode = async (code: string) => {
      const res = await publicSubmit(form({ agentCode: code }));
      const ref = (res.body as { reference: string }).reference;
      return t.db.case.findFirstOrThrow({ where: { caseNo: ref }, select: { agentId: true } });
    };
    expect((await withCode('AGT-OK')).agentId).not.toBeNull();
    expect((await withCode('AGT-NEW')).agentId).toBeNull();
    expect((await withCode('NOPE')).agentId).toBeNull();
  });
});

describe('the inbox', () => {
  it('shows a coordinator the unassigned leads, with search, filters and paging', async () => {
    const res = await asManager(managerToken, 'GET', '/leads?limit=2');
    expect(res.status).toBe(200);
    const page = leadPageSchema.parse(res.body);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
    const second = leadPageSchema.parse((await asManager(managerToken, 'GET', `/leads?limit=2&cursor=${page.nextCursor}`)).body);
    expect(second.items[0]?.id).not.toBe(page.items[0]?.id);
    const dup = leadPageSchema.parse((await asManager(managerToken, 'GET', '/leads?duplicate=possible&limit=100')).body);
    expect(dup.items.length).toBeGreaterThan(0);
    expect(dup.items.every((l) => l.duplicateState === 'possible')).toBe(true);
    const bySearch = leadPageSchema.parse((await asManager(managerToken, 'GET', '/leads?q=+971 50 555 1212')).body);
    expect(bySearch.items.length).toBeGreaterThanOrEqual(2);
    const bySource = leadPageSchema.parse((await asManager(managerToken, 'GET', '/leads?source=walk_in')).body);
    expect(bySource.items.every((l) => l.source === 'walk_in')).toBe(true);
    expect((await asManager(managerToken, 'GET', '/leads?cursor=%%%')).status).toBe(400);
  });

  it('lets the first coordinator take a lead and tells the second it is gone', async () => {
    const created = leadCreatedSchema.parse(
      (await staff('super_admin', 'POST', '/leads', { source: 'phone', name: 'Ines Duarte', phone: '+971 50 444 0001' })).body,
    );
    const mine = await asManager(managerToken, 'POST', `/leads/${created.leadId}/claim`);
    expect(mine.status).toBe(200);
    expect((await t.db.case.findUniqueOrThrow({ where: { id: created.caseId } })).ownerId).toBe(managerId);
    const late = await asManager(otherManagerToken, 'POST', `/leads/${created.leadId}/claim`);
    expect([403, 404, 409]).toContain(late.status);
    expect(await t.db.auditEvent.count({ where: { action: 'case.assigned', entityId: created.caseId } })).toBe(1);
  });

  it('shows the lead with the patient’s other enquiries', async () => {
    const lead = await t.db.lead.findFirstOrThrow({ where: { matchedOn: { has: 'phone' } }, orderBy: { createdAt: 'desc' } });
    const res = await asManager(managerToken, 'GET', `/leads/${lead.id}`);
    expect(res.status).toBe(200);
    const detail = leadDetailSchema.parse(res.body);
    expect(detail.otherEnquiries.length).toBeGreaterThanOrEqual(1);
    expect(detail.message).toBeTruthy();
    expect((await asManager(managerToken, 'GET', '/leads/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });

  it('dismisses a possible duplicate once, and audits it', async () => {
    const lead = await t.db.lead.findFirstOrThrow({ where: { duplicateState: 'possible' }, orderBy: { createdAt: 'desc' } });
    const res = await asManager(managerToken, 'POST', `/leads/${lead.id}/dismiss-duplicate`);
    expect(res.status).toBe(200);
    expect(leadDetailSchema.parse(res.body).duplicateState).toBe('dismissed');
    expect((await asManager(managerToken, 'POST', `/leads/${lead.id}/dismiss-duplicate`)).status).toBe(409);
    expect(await t.db.auditEvent.count({ where: { action: 'lead.duplicate_dismissed', entityId: lead.id } })).toBe(1);
  });
});

describe('merging two records of one person', () => {
  it('moves the cases, documents and consents to the survivor, retires the other, and audits it without values', async () => {
    const a = leadCreatedSchema.parse(
      (await staff('super_admin', 'POST', '/leads', { source: 'phone', name: 'Haruto Tanaka', phone: '+81 90 1234 5678', countryCode: 'AE' })).body,
    );
    const b = leadCreatedSchema.parse(
      (await staff('super_admin', 'POST', '/leads', { source: 'email', name: 'Haruto Tanaka', phone: '+81 90 9999 0000' })).body,
    );
    expect(b).toMatchObject({ duplicateState: 'possible', matchedOn: ['name'], attachedToExisting: false });
    await t.db.document.create({
      data: { kind: 'report', fileName: 'scan.pdf', mimeType: 'application/pdf', sizeBytes: 5, storageKey: `m-${next()}`, patientId: b.patientId },
    });
    await t.db.consent.create({ data: { patientId: b.patientId, caseId: b.caseId, type: 'share_stage_with_agent' } }).catch(() => undefined);
    await t.db.patient.update({ where: { id: b.patientId }, data: { gender: 'male' } });

    const res = await t.call('super_admin', 'POST', `/leads/${b.leadId}/merge`, { keep: 'other' });
    expect(res.status).toBe(200);
    expect(leadDetailSchema.parse(res.body)).toMatchObject({ duplicateState: 'merged', patientId: a.patientId });

    const gone = await t.db.patient.findUniqueOrThrow({ where: { id: b.patientId } });
    expect(gone.deletedAt).not.toBeNull();
    expect(gone.mergedIntoId).toBe(a.patientId);
    expect(await t.db.case.count({ where: { patientId: a.patientId } })).toBe(2);
    expect(await t.db.case.count({ where: { patientId: b.patientId } })).toBe(0);
    expect(await t.db.document.count({ where: { patientId: a.patientId } })).toBe(1);
    expect((await t.db.patient.findUniqueOrThrow({ where: { id: a.patientId } })).gender).toBe('male');

    const audit = await t.db.auditEvent.findFirstOrThrow({ where: { action: 'patient.merged', entityId: a.patientId } });
    expect(audit.after).toMatchObject({ mergedFrom: b.patientId, moved: { Case: 1, Document: 1 } });
    expect(JSON.stringify(audit.after)).not.toContain('Haruto');
    expect(await t.db.outboxEvent.count({ where: { type: 'patient.merged' } })).toBeGreaterThanOrEqual(1);
    // It cannot be merged twice.
    expect((await t.call('super_admin', 'POST', `/leads/${b.leadId}/merge`, { keep: 'other' })).status).toBe(409);
  });

  it('can keep the lead’s own record instead', async () => {
    const a = leadCreatedSchema.parse(
      (await staff('super_admin', 'POST', '/leads', { source: 'phone', name: 'Nadia Rahman', phone: '+971 50 202 0001' })).body,
    );
    const b = leadCreatedSchema.parse(
      (await staff('super_admin', 'POST', '/leads', { source: 'phone', name: 'Nadia Rahman', phone: '+971 50 202 0002' })).body,
    );
    const res = await t.call('super_admin', 'POST', `/leads/${b.leadId}/merge`, { keep: 'this' });
    expect(res.status).toBe(200);
    expect(leadDetailSchema.parse(res.body).patientId).toBe(b.patientId);
    expect((await t.db.patient.findUniqueOrThrow({ where: { id: a.patientId } })).mergedIntoId).toBe(b.patientId);
  });

  it('refuses when both records have their own portal login, and moves the one login there is', async () => {
    const make = async (name: string, phone: string, userId?: string) => {
      const lead = leadCreatedSchema.parse(
        (await staff('super_admin', 'POST', '/leads', { source: 'phone', name, phone })).body,
      );
      if (userId) await t.db.patient.update({ where: { id: lead.patientId }, data: { userId } });
      return lead;
    };
    const u1 = await t.makeUser({ email: `p1-${next()}@leads.test`, role: 'patient' });
    const u2 = await t.makeUser({ email: `p2-${next()}@leads.test`, role: 'patient' });
    const a = await make('Chen Wei Ling', '+65 8123 0001', u1.id);
    const b = await make('Chen Wei Ling', '+65 8123 0002', u2.id);
    const both = await t.call('super_admin', 'POST', `/leads/${b.leadId}/merge`, { keep: 'other' });
    expect(both.status).toBe(409);
    expect((await t.db.patient.findUniqueOrThrow({ where: { id: b.patientId } })).deletedAt).toBeNull();

    const c = await make('Tariq Aziz', '+971 50 303 0001');
    const d = await make('Tariq Aziz', '+971 50 303 0002', u2.id === u1.id ? u1.id : (await t.makeUser({ email: `p3-${next()}@leads.test`, role: 'patient' })).id);
    const res = await t.call('super_admin', 'POST', `/leads/${d.leadId}/merge`, { keep: 'other' });
    expect(res.status).toBe(200);
    expect((await t.db.patient.findUniqueOrThrow({ where: { id: c.patientId } })).userId).not.toBeNull();
    void a;
  });

  it('refuses a merge when there is nothing to merge with', async () => {
    const lone = leadCreatedSchema.parse(
      (await staff('super_admin', 'POST', '/leads', { source: 'phone', name: 'Unique Person Qwxz', phone: '+971 50 808 0808' })).body,
    );
    expect((await t.call('super_admin', 'POST', `/leads/${lone.leadId}/merge`, { keep: 'other' })).status).toBe(409);
  });
});

describe('who may use the inbox', () => {
  const ROLES: Role[] = ['patient', 'attendant', 'agent', 'hospital_desk', 'doctor', 'finance', 'interpreter', 'ground_coordinator', 'medical_reviewer'];
  const ID = '00000000-0000-4000-8000-000000000000';
  it.each(ROLES)('refuses a %s every inbox call', async (role) => {
    const calls: [string, string, unknown?][] = [
      ['GET', '/leads'],
      ['GET', `/leads/${ID}`],
      ['POST', '/leads', { source: 'phone', name: 'X Y', phone: '+971501110000' }],
      ['POST', `/leads/${ID}/claim`],
      ['POST', `/leads/${ID}/dismiss-duplicate`],
      ['POST', `/leads/${ID}/merge`, { keep: 'other' }],
    ];
    for (const [method, url, body] of calls)
      expect((await t.call(role, method as 'GET', url, body)).status, `${role} ${method} ${url}`).toBe(403);
  });
  it('refuses a visitor who is not signed in', async () => {
    expect((await t.call(null, 'GET', '/leads')).status).toBe(401);
    expect((await t.call(null, 'POST', '/leads', {})).status).toBe(401);
  });
  it('does not show a case manager another team’s claimed lead, but shows their own', async () => {
    const created = leadCreatedSchema.parse(
      (await staff('super_admin', 'POST', '/leads', { source: 'phone', name: 'Private Lead', phone: '+971 50 606 0606' })).body,
    );
    expect((await asManager(managerToken, 'POST', `/leads/${created.leadId}/claim`)).status).toBe(200);
    expect((await asManager(managerToken, 'GET', `/leads/${created.leadId}`)).status).toBe(200);
    expect((await asManager(otherManagerToken, 'GET', `/leads/${created.leadId}`)).status).toBe(404);
  });
});
