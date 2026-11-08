import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  changeRequestDetailSchema,
  changeRequestPageSchema,
  changeRequestRowSchema,
  hospitalDetailSchema,
  hospitalPageSchema,
  partnerHealthSchema,
  publishResultSchema,
  type Role,
} from '@medtravel/contracts';
import { createTestApp, type TestApp } from './support/test-app.js';

/** Partner approvals: submissions, the review queue, decisions that apply changes, agreements, publishing and health. */

let t: TestApp;
let n = 0;
const next = () => (n += 1);
const errorFields = (body: unknown): string[] =>
  ((body as { errors?: { path: (string | number)[] }[] }).errors ?? []).map((e) => e.path.join('.'));
const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
const inDays = (days: number) => new Date(today.getTime() + days * 86_400_000);
const dayText = (d: Date) => d.toISOString().slice(0, 10);

interface Fx {
  hospitalId: string;
  otherHospitalId: string;
  packageId: string;
  doctorId: string;
  accreditationId: string;
  documentId: string;
  agreementDocId: string;
  deskToken: string;
  otherDeskToken: string;
}
let fx: Fx;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const asDesk = (token: string, method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown) =>
  t.raw(method, url, { headers: bearer(token), ...(body === undefined ? {} : { body }) });

beforeAll(async () => {
  t = await createTestApp();
  await t.db.country.upsert({ where: { code: 'IN' }, update: {}, create: { code: 'IN', name: 'India' } });
  await t.db.currency.createMany({
    data: [
      { code: 'USD', name: 'US dollar', minorUnits: 2 },
      { code: 'INR', name: 'Indian rupee', minorUnits: 2 },
    ],
  });
  const city = await t.db.city.create({ data: { slug: `delhi-${next()}`, name: 'Delhi', countryCode: 'IN' } });
  const speciality = await t.db.speciality.create({ data: { slug: `s-${next()}`, name: 'Cardiology' } });
  const treatment = await t.db.treatment.create({
    data: { slug: `t-${next()}`, name: 'Bypass', specialityId: speciality.id },
  });
  const hospital = await t.db.hospital.create({
    data: { slug: `apollo-${next()}`, name: 'Apollo', cityId: city.id, status: 'draft', bedCount: 100 },
  });
  const other = await t.db.hospital.create({
    data: { slug: `fortis-${next()}`, name: 'Fortis', cityId: city.id, status: 'published' },
  });
  const pack = await t.db.package.create({
    data: {
      name: 'Bypass package',
      priceMinor: 500_000n,
      currency: 'USD',
      hospitalId: hospital.id,
      treatmentId: treatment.id,
      active: true,
    },
  });
  const doctor = await t.db.doctor.create({
    data: { fullName: 'Dr Rao', hospitalId: hospital.id, specialityId: speciality.id, slug: `rao-${next()}` },
  });
  const document = await t.db.document.create({
    data: {
      kind: 'other',
      fileName: 'nabh.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      storageKey: `k-${next()}`,
      hospitalId: hospital.id,
    },
  });
  const agreementDoc = await t.db.document.create({
    data: {
      kind: 'agreement',
      fileName: 'agreement.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      storageKey: `k-${next()}`,
      hospitalId: hospital.id,
    },
  });
  const accreditation = await t.db.accreditation.create({
    data: {
      body: 'nabh',
      hospitalId: hospital.id,
      certificateId: document.id,
      expiresAt: inDays(365),
    },
  });
  const desk = await t.makeUser({ email: `desk-${next()}@partners.test`, role: 'hospital_desk' });
  const otherDesk = await t.makeUser({ email: `desk-${next()}@partners.test`, role: 'hospital_desk' });
  await t.db.hospitalStaff.create({ data: { userId: desk.id, hospitalId: hospital.id } });
  await t.db.hospitalStaff.create({ data: { userId: otherDesk.id, hospitalId: other.id } });
  fx = {
    hospitalId: hospital.id,
    otherHospitalId: other.id,
    packageId: pack.id,
    doctorId: doctor.id,
    accreditationId: accreditation.id,
    documentId: document.id,
    agreementDocId: agreementDoc.id,
    deskToken: (await t.tokenFor(desk.id)).accessToken,
    otherDeskToken: (await t.tokenFor(otherDesk.id)).accessToken,
  };
});
afterAll(async () => {
  await t.close();
});

describe('who may use partner approvals', () => {
  const ADMIN: [string, string, unknown?][] = [
    ['GET', '/admin/partners/requests'],
    ['GET', '/admin/partners/hospitals'],
    ['GET', '/admin/partners/health'],
    ['POST', '/admin/partners/requests/00000000-0000-4000-8000-000000000000/approve'],
    ['POST', '/admin/partners/requests/00000000-0000-4000-8000-000000000000/reject', { reason: 'Not enough' }],
    ['POST', '/admin/partners/hospitals/00000000-0000-4000-8000-000000000000/publish'],
    ['POST', '/admin/partners/doctors/00000000-0000-4000-8000-000000000000/publish'],
    ['POST', '/admin/partners/packages/00000000-0000-4000-8000-000000000000/publish'],
    [
      'PUT',
      '/admin/partners/hospitals/00000000-0000-4000-8000-000000000000/agreement',
      { agreementBp: 1000, startsOn: '2026-01-01', endsOn: '2027-01-01', documentId: null },
    ],
    ['POST', '/admin/partners/accreditations/00000000-0000-4000-8000-000000000000/verify', { verified: true }],
  ];
  const ROLES: Role[] = ['case_manager', 'finance', 'agent', 'patient', 'hospital_desk', 'doctor'];
  it.each(ROLES)('refuses every admin call to a %s', async (role) => {
    for (const [method, url, body] of ADMIN)
      expect((await t.call(role, method as 'GET', url, body)).status, `${role} ${url}`).toBe(403);
  });
  it('refuses a visitor', async () => {
    expect((await t.call(null, 'GET', '/admin/partners/requests')).status).toBe(401);
    expect((await t.call(null, 'POST', '/hospital/change-requests/profile', {})).status).toBe(401);
  });
  it('refuses the hospital endpoints to roles that are not hospital staff or admins', async () => {
    for (const role of ['agent', 'patient'] as Role[]) {
      expect((await t.call(role, 'GET', '/hospital/change-requests')).status).toBe(403);
      expect((await t.call(role, 'POST', '/hospital/change-requests/onboarding', {})).status).toBe(403);
    }
  });
});

describe('submitting for review', () => {
  it('sends a draft hospital to review once, and the hospital can withdraw it', async () => {
    const res = await asDesk(fx.deskToken, 'POST', '/hospital/change-requests/onboarding', { note: 'Ready' });
    expect(res.status).toBe(201);
    const row = changeRequestRowSchema.parse(res.body);
    expect(row).toMatchObject({ kind: 'hospital_onboarding', status: 'pending', hospitalName: 'Apollo' });
    expect(
      (await t.db.hospital.findUniqueOrThrow({ where: { id: fx.hospitalId } })).status,
    ).toBe('pending_review');
    const again = await asDesk(fx.deskToken, 'POST', '/hospital/change-requests/onboarding', {});
    expect(again.status).toBe(409);

    expect((await asDesk(fx.deskToken, 'DELETE', `/hospital/change-requests/${row.id}`)).status).toBe(204);
    expect(
      (await t.db.hospital.findUniqueOrThrow({ where: { id: fx.hospitalId } })).status,
    ).toBe('draft');
    expect((await asDesk(fx.deskToken, 'DELETE', `/hospital/change-requests/${row.id}`)).status).toBe(409);
  });

  it('keeps hospitals apart: another hospital’s desk cannot touch this one', async () => {
    const res = await asDesk(fx.otherDeskToken, 'POST', '/hospital/change-requests/price', {
      packageId: fx.packageId,
      priceMinor: 400_000,
      currency: 'USD',
    });
    expect(res.status).toBe(403);
    const named = await asDesk(fx.otherDeskToken, 'POST', '/hospital/change-requests/profile', {
      hospitalId: fx.hospitalId,
      fields: { name: 'Hijacked' },
    });
    expect(named.status).toBe(403);
  });

  it('refuses a profile edit that changes nothing, names an unknown field, or repeats a pending one', async () => {
    const same = await asDesk(fx.deskToken, 'POST', '/hospital/change-requests/profile', { fields: { name: 'Apollo' } });
    expect(same.status).toBe(422);
    const empty = await asDesk(fx.deskToken, 'POST', '/hospital/change-requests/profile', { fields: {} });
    expect(empty.status).toBe(400);
    const bad = await asDesk(fx.deskToken, 'POST', '/hospital/change-requests/profile', {
      fields: { email: 'not an email' },
    });
    expect(bad.status).toBe(400);
    const status = await asDesk(fx.deskToken, 'POST', '/hospital/change-requests/profile', {
      fields: { name: 'Apollo Delhi', status: 'published' },
    });
    expect(status.status).toBe(201);
    expect((await t.db.hospital.findUniqueOrThrow({ where: { id: fx.hospitalId } })).status).toBe('draft');
    const second = await asDesk(fx.deskToken, 'POST', '/hospital/change-requests/profile', { fields: { bedCount: 120 } });
    expect(second.status).toBe(409);
    const request = await t.db.partnerChangeRequest.findFirstOrThrow({
      where: { hospitalId: fx.hospitalId, kind: 'hospital_profile', status: 'pending' },
    });
    expect(request.proposed).toEqual({ name: 'Apollo Delhi' });
    expect(request.current).toEqual({ name: 'Apollo' });
    await t.db.partnerChangeRequest.update({ where: { id: request.id }, data: { status: 'withdrawn' } });
  });

  it('refuses a price change that is not a change, in an unknown currency, or twice', async () => {
    const send = (body: Record<string, unknown>) =>
      asDesk(fx.deskToken, 'POST', '/hospital/change-requests/price', { packageId: fx.packageId, ...body });
    expect((await send({ priceMinor: 500_000, currency: 'USD' })).status).toBe(422);
    expect((await send({ priceMinor: 450_000, currency: 'ZZZ' })).status).toBe(422);
    expect((await send({ priceMinor: -1, currency: 'USD' })).status).toBe(400);
    expect((await send({ priceMinor: 450_000, currency: 'USD' })).status).toBe(201);
    expect((await send({ priceMinor: 440_000, currency: 'USD' })).status).toBe(409);
  });

  it('lists only the hospital’s own requests to its staff', async () => {
    const mine = await asDesk(fx.deskToken, 'GET', '/hospital/change-requests');
    const page = changeRequestPageSchema.parse(mine.body);
    expect(page.items.every((r) => r.hospitalId === fx.hospitalId)).toBe(true);
    const theirs = await asDesk(fx.otherDeskToken, 'GET', '/hospital/change-requests');
    expect(changeRequestPageSchema.parse(theirs.body).total).toBe(0);
  });
});

describe('reviewing a price change', () => {
  let requestId: string;
  it('shows the queue oldest first, filtered, with a side-by-side diff', async () => {
    const list = await t.call('super_admin', 'GET', '/admin/partners/requests?status=pending&kind=package_price');
    expect(list.status).toBe(200);
    const page = changeRequestPageSchema.parse(list.body);
    expect(page.total).toBe(1);
    const row = page.items[0];
    expect(row).toMatchObject({ kind: 'package_price', packageName: 'Bypass package' });
    requestId = row!.id;
    const detail = changeRequestDetailSchema.parse(
      (await t.call('super_admin', 'GET', `/admin/partners/requests/${requestId}`)).body,
    );
    expect([...detail.diff].sort((a, b) => a.field.localeCompare(b.field))).toEqual([
      { field: 'currency', submitted: 'USD', live: 'USD', proposed: 'USD', stale: false },
      { field: 'priceMinor', submitted: 500_000, live: 500_000, proposed: 450_000, stale: false },
    ]);
  });

  it('flags a field whose live value moved on after the request was made', async () => {
    await t.db.package.update({ where: { id: fx.packageId }, data: { priceMinor: 520_000n } });
    const detail = changeRequestDetailSchema.parse(
      (await t.call('super_admin', 'GET', `/admin/partners/requests/${requestId}`)).body,
    );
    expect(detail.diff.find((d) => d.field === 'priceMinor')).toMatchObject({ live: 520_000, stale: true });
    await t.db.package.update({ where: { id: fx.packageId }, data: { priceMinor: 500_000n } });
  });

  it('approving applies the price to the package the quote builder reads, audits it, and tells the website once published', async () => {
    await t.db.hospital.update({ where: { id: fx.hospitalId }, data: { status: 'published' } });
    await t.db.package.update({ where: { id: fx.packageId }, data: { published: true } });
    const res = await t.call('super_admin', 'POST', `/admin/partners/requests/${requestId}/approve`);
    expect(res.status).toBe(201);
    expect(changeRequestDetailSchema.parse(res.body)).toMatchObject({ status: 'approved' });
    const pack = await t.db.package.findUniqueOrThrow({ where: { id: fx.packageId } });
    expect(pack.priceMinor).toBe(450_000n);
    const audit = await t.db.auditEvent.findFirst({ where: { action: 'partner.package_price_approved' } });
    expect(audit?.before).toMatchObject({ priceMinor: 500_000 });
    expect(audit?.after).toMatchObject({ priceMinor: 450_000 });
    const events = await t.db.outboxEvent.findMany({ where: { type: 'web.revalidate' } });
    expect(events).toHaveLength(1);
    expect((events[0]?.payload as { tags: string[] }).tags).toContain('packages');
    expect(await t.db.outboxEvent.count({ where: { type: 'partner.request_decided' } })).toBe(1);
  });

  it('refuses to decide a request twice, and a rejection needs a reason', async () => {
    expect((await t.call('super_admin', 'POST', `/admin/partners/requests/${requestId}/approve`)).status).toBe(409);
    expect(
      (await t.call('super_admin', 'POST', `/admin/partners/requests/${requestId}/reject`, { reason: 'Because' })).status,
    ).toBe(409);
    expect(
      (await t.call('super_admin', 'POST', `/admin/partners/requests/${requestId}/reject`, { reason: 'no' })).status,
    ).toBe(400);
  });

  it('settles two decisions made at the same moment into one', async () => {
    const created = await asDesk(fx.deskToken, 'POST', '/hospital/change-requests/price', {
      packageId: fx.packageId,
      priceMinor: 400_000,
      currency: 'USD',
    });
    const id = (created.body as { id: string }).id;
    const [a, b] = await Promise.all([
      t.call('super_admin', 'POST', `/admin/partners/requests/${id}/approve`),
      t.call('super_admin', 'POST', `/admin/partners/requests/${id}/reject`, { reason: 'Too low a price' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const request = await t.db.partnerChangeRequest.findUniqueOrThrow({ where: { id } });
    const pack = await t.db.package.findUniqueOrThrow({ where: { id: fx.packageId } });
    expect(pack.priceMinor).toBe(request.status === 'approved' ? 400_000n : 450_000n);
  });
});

describe('reviewing a profile edit and an onboarding', () => {
  it('applies only the approved fields, and a rejection leaves the profile alone and records why', async () => {
    const send = (fields: Record<string, unknown>) =>
      asDesk(fx.deskToken, 'POST', '/hospital/change-requests/profile', { fields });
    const first = ((await send({ bedCount: 150, website: 'https://apollo.example.com' })).body as { id: string }).id;
    const approved = await t.call('super_admin', 'POST', `/admin/partners/requests/${first}/approve`);
    expect(approved.status).toBe(201);
    const after = await t.db.hospital.findUniqueOrThrow({ where: { id: fx.hospitalId } });
    expect(after).toMatchObject({ bedCount: 150, website: 'https://apollo.example.com' });
    expect(after.name).toBe('Apollo');

    const second = ((await send({ bedCount: 999 })).body as { id: string }).id;
    const rejected = await t.call('super_admin', 'POST', `/admin/partners/requests/${second}/reject`, {
      reason: 'The bed count does not match your licence',
    });
    expect(rejected.status).toBe(201);
    expect(changeRequestDetailSchema.parse(rejected.body)).toMatchObject({
      status: 'rejected',
      decisionReason: 'The bed count does not match your licence',
    });
    expect((await t.db.hospital.findUniqueOrThrow({ where: { id: fx.hospitalId } })).bedCount).toBe(150);
  });

  it('approving onboarding makes the hospital approved; rejecting sends it back to draft', async () => {
    await t.db.hospital.update({ where: { id: fx.hospitalId }, data: { status: 'draft' } });
    const submit = async () =>
      ((await asDesk(fx.deskToken, 'POST', '/hospital/change-requests/onboarding', {})).body as { id: string }).id;
    const rejectedId = await submit();
    await t.call('super_admin', 'POST', `/admin/partners/requests/${rejectedId}/reject`, {
      reason: 'The accreditation certificate is missing',
    });
    expect((await t.db.hospital.findUniqueOrThrow({ where: { id: fx.hospitalId } })).status).toBe('draft');
    const approvedId = await submit();
    const res = await t.call('super_admin', 'POST', `/admin/partners/requests/${approvedId}/approve`);
    expect(res.status).toBe(201);
    expect((await t.db.hospital.findUniqueOrThrow({ where: { id: fx.hospitalId } })).status).toBe('approved');
  });
});

describe('agreement, accreditation and publishing', () => {
  it('will not publish before there is a referral fee and a verified, unexpired accreditation', async () => {
    const noFee = await t.call('super_admin', 'POST', `/admin/partners/hospitals/${fx.hospitalId}/publish`);
    expect(noFee.status).toBe(422);
    expect(errorFields(noFee.body)).toEqual(['agreementBp']);
    const set = await t.call('super_admin', 'PUT', `/admin/partners/hospitals/${fx.hospitalId}/agreement`, {
      agreementBp: 1250,
      startsOn: dayText(today),
      endsOn: dayText(inDays(30)),
      documentId: fx.agreementDocId,
    });
    expect(set.status).toBe(200);
    expect(hospitalDetailSchema.parse(set.body)).toMatchObject({
      agreementBp: 1250,
      agreementDocumentId: fx.agreementDocId,
    });
    const unverified = await t.call('super_admin', 'POST', `/admin/partners/hospitals/${fx.hospitalId}/publish`);
    expect(unverified.status).toBe(422);
    expect(errorFields(unverified.body)).toEqual(['accreditations']);
  });

  it('validates the agreement: a fee in range, dates in order, and a document of the right kind', async () => {
    const put = (body: Record<string, unknown>) =>
      t.call('super_admin', 'PUT', `/admin/partners/hospitals/${fx.hospitalId}/agreement`, {
        agreementBp: 1000,
        startsOn: '2026-01-01',
        endsOn: '2027-01-01',
        documentId: null,
        ...body,
      });
    expect((await put({ agreementBp: 10_001 })).status).toBe(400);
    expect((await put({ endsOn: '2025-01-01' })).status).toBe(400);
    const wrongKind = await put({ documentId: fx.documentId });
    expect(wrongKind.status).toBe(422);
    expect(errorFields(wrongKind.body)).toEqual(['documentId']);
    expect((await t.call('super_admin', 'PUT', `/admin/partners/hospitals/${fx.otherHospitalId}/agreement`, {
      agreementBp: 800, startsOn: '2026-01-01', endsOn: '2027-01-01', documentId: null,
    })).status).toBe(200);
  });

  it('verifies a certificate, records who and when, and can take the check back', async () => {
    const res = await t.call('super_admin', 'POST', `/admin/partners/accreditations/${fx.accreditationId}/verify`, {
      verified: true,
      note: 'Checked on the NABH site',
    });
    expect(res.status).toBe(201);
    const a = hospitalDetailSchema.parse(res.body).accreditations[0];
    expect(a).toMatchObject({ verificationNote: 'Checked on the NABH site', expired: false });
    expect(a?.verifiedAt).toBeTruthy();
    expect(a?.verifiedByName).toBeTruthy();
    const none = await t.db.accreditation.create({ data: { body: 'jci', hospitalId: fx.hospitalId } });
    const noCert = await t.call('super_admin', 'POST', `/admin/partners/accreditations/${none.id}/verify`, { verified: true });
    expect(noCert.status).toBe(422);
    const back = await t.call('super_admin', 'POST', `/admin/partners/accreditations/${none.id}/verify`, { verified: false });
    expect(back.status).toBe(201);
    await t.db.accreditation.update({ where: { id: none.id }, data: { deletedAt: new Date() } });
  });

  it('publishes the hospital, then its doctor and package, each telling the website; unpublishing is always possible', async () => {
    await t.db.outboxEvent.deleteMany({ where: { type: 'web.revalidate' } });
    await t.db.hospital.update({ where: { id: fx.hospitalId }, data: { status: 'approved' } });
    const doctorEarly = await t.call('super_admin', 'POST', `/admin/partners/doctors/${fx.doctorId}/publish`);
    expect(doctorEarly.status).toBe(409);
    const pub = await t.call('super_admin', 'POST', `/admin/partners/hospitals/${fx.hospitalId}/publish`);
    expect(pub.status).toBe(201);
    expect(publishResultSchema.parse(pub.body)).toEqual({ id: fx.hospitalId, published: true });
    expect((await t.db.hospital.findUniqueOrThrow({ where: { id: fx.hospitalId } })).publishedAt).not.toBeNull();
    expect((await t.call('super_admin', 'POST', `/admin/partners/hospitals/${fx.hospitalId}/publish`)).status).toBe(409);

    expect((await t.call('super_admin', 'POST', `/admin/partners/doctors/${fx.doctorId}/publish`)).status).toBe(201);
    expect((await t.call('super_admin', 'POST', `/admin/partners/packages/${fx.packageId}/unpublish`)).status).toBe(201);
    expect((await t.call('super_admin', 'POST', `/admin/partners/packages/${fx.packageId}/publish`)).status).toBe(201);
    expect((await t.db.doctor.findUniqueOrThrow({ where: { id: fx.doctorId } })).published).toBe(true);
    expect((await t.db.package.findUniqueOrThrow({ where: { id: fx.packageId } })).published).toBe(true);
    const events = await t.db.outboxEvent.findMany({ where: { type: 'web.revalidate' } });
    expect(events.length).toBe(4);
    const tags = events.flatMap((e) => (e.payload as { tags: string[] }).tags);
    expect(tags).toEqual(expect.arrayContaining(['hospitals', 'doctors', 'packages']));

    const off = await t.call('super_admin', 'POST', `/admin/partners/hospitals/${fx.hospitalId}/unpublish`);
    expect(off.status).toBe(201);
    expect((await t.db.hospital.findUniqueOrThrow({ where: { id: fx.hospitalId } })).status).toBe('unpublished');
    expect((await t.call('super_admin', 'POST', `/admin/partners/hospitals/${fx.hospitalId}/unpublish`)).status).toBe(409);
    expect((await t.call('super_admin', 'POST', `/admin/partners/doctors/${fx.doctorId}/unpublish`)).status).toBe(201);
    const inactive = await t.db.package.create({
      data: { name: 'Old', priceMinor: 1n, currency: 'USD', hospitalId: fx.otherHospitalId, treatmentId: (await t.db.treatment.findFirstOrThrow()).id, active: false },
    });
    expect((await t.call('super_admin', 'POST', `/admin/partners/packages/${inactive.id}/publish`)).status).toBe(422);
  });

  it('will not publish a hospital whose only accreditation has expired', async () => {
    await t.db.accreditation.update({ where: { id: fx.accreditationId }, data: { expiresAt: inDays(-1) } });
    const res = await t.call('super_admin', 'POST', `/admin/partners/hospitals/${fx.hospitalId}/publish`);
    expect(res.status).toBe(422);
    expect(errorFields(res.body)).toEqual(['accreditations']);
    const detail = hospitalDetailSchema.parse(
      (await t.call('super_admin', 'GET', `/admin/partners/hospitals/${fx.hospitalId}`)).body,
    );
    expect(detail.accreditations[0]?.expired).toBe(true);
    await t.db.accreditation.update({ where: { id: fx.accreditationId }, data: { expiresAt: inDays(20) } });
  });
});

describe('hospitals list and partner health', () => {
  it('lists hospitals with filters, paging and the waiting requests', async () => {
    const all = hospitalPageSchema.parse((await t.call('super_admin', 'GET', '/admin/partners/hospitals?limit=1')).body);
    expect(all.items).toHaveLength(1);
    expect(all.total).toBe(2);
    expect(all.nextCursor).not.toBeNull();
    const second = hospitalPageSchema.parse(
      (await t.call('super_admin', 'GET', `/admin/partners/hospitals?limit=1&cursor=${all.nextCursor}`)).body,
    );
    expect(second.items[0]?.id).not.toBe(all.items[0]?.id);
    const filtered = hospitalPageSchema.parse(
      (await t.call('super_admin', 'GET', '/admin/partners/hospitals?status=published&q=fort')).body,
    );
    expect(filtered.items.map((h) => h.name)).toEqual(['Fortis']);
    expect((await t.call('super_admin', 'GET', '/admin/partners/hospitals?cursor=%%%')).status).toBe(400);
    expect((await t.call('super_admin', 'GET', '/admin/partners/hospitals/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });

  it('reports what expires soon and how quickly hospitals answer', async () => {
    const patient = await t.db.patient.create({ data: { fullName: 'P' } });
    const sent = new Date(Date.now() - 5 * 86_400_000);
    // One open request per case and hospital, so each request gets a case of its own.
    for (const [index, hours] of ([6, 12, null] as const).entries()) {
      const kase = await t.db.case.create({
        data: { caseNo: `CASE-2026-88000${index + 1}`, patientId: patient.id },
      });
      const consent = await t.db.consent.create({
        data: { patientId: patient.id, caseId: kase.id, hospitalId: fx.hospitalId, type: 'share_medical_with_hospital' },
      });
      await t.db.opinionRequest.create({
        data: {
          caseId: kase.id,
          consentId: consent.id,
          hospitalId: fx.hospitalId,
          status: hours === null ? 'sent' : 'answered',
          sentAt: sent,
          ...(hours === null ? {} : { respondedAt: new Date(sent.getTime() + hours * 3_600_000) }),
        },
      });
    }
    const res = await t.call('super_admin', 'GET', '/admin/partners/health');
    expect(res.status).toBe(200);
    const health = partnerHealthSchema.parse(res.body);
    expect(health.accreditationExpiries.map((a) => [a.body, a.daysLeft])).toContainEqual(['nabh', 20]);
    expect(health.agreementExpiries.map((a) => [a.hospitalName, a.daysLeft])).toContainEqual(['Apollo', 30]);
    const apollo = health.responseTimes.find((r) => r.hospitalName === 'Apollo');
    expect(apollo?.months).toHaveLength(6);
    const month = apollo?.months.find((m) => m.requests > 0);
    expect(month).toMatchObject({ requests: 3, answered: 2, avgHours: 9 });
    expect(apollo?.months.filter((m) => m.requests === 0).every((m) => m.avgHours === null)).toBe(true);
  });
});
