import { randomBytes } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DOCUMENT_MAX_BYTES,
  documentPageSchema,
  documentSchema,
  fileLinkSchema,
  shareTargetsSchema,
  signedUploadSchema,
  type DocumentView,
  type Role,
} from '@medtravel/contracts';
import { createTestApp, type TestApp } from './support/test-app.js';

let t: TestApp;
let n = 0;
const next = () => (n += 1);
const MIB = 1024 * 1024;

interface Who {
  id: string;
  headers: Record<string, string>;
}
const users: Record<string, Who> = {};
const ids = {
  patient1: '',
  patient2: '',
  case1: '',
  case2: '',
  hospitalA: '',
  hospitalB: '',
  docType: '',
};

async function makeUser(key: string, role: Role, name?: string): Promise<Who> {
  const user = await t.makeUser({
    email: `${key}-${next()}@docs.test`.toLowerCase(),
    role,
    ...(name ? { name } : {}),
  });
  const { accessToken } = await t.tokenFor(user.id);
  users[key] = { id: user.id, headers: { authorization: `Bearer ${accessToken}` } };
  return users[key] as Who;
}

const call = (
  who: Who,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
) => t.raw(method, url, { headers: who.headers, ...(body === undefined ? {} : { body }) });

const asDocument = (body: unknown): DocumentView => documentSchema.parse(body);

/** What the browser's uploader does: sign each request, send it to the bucket, then tell the API it is done. */
async function upload(
  who: Who,
  file: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    kind?: string;
    caseId?: string;
    patientId?: string;
  },
  content: Buffer,
  partSize = 6 * MIB,
): Promise<{ key: string; document: DocumentView }> {
  const sign = async (request: Record<string, unknown>, withFile = false) => {
    const res = await call(who, 'POST', '/documents/uploads/sign', {
      request,
      ...(withFile ? { file } : {}),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return signedUploadSchema.parse(res.body);
  };
  const started = await sign({ method: 'POST', key: 'files/browser-proposal' }, true);
  const created = await fetch(started.url, { method: 'POST' });
  const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(await created.text())?.[1] as string;
  const parts: string[] = [];
  for (let offset = 0, number = 1; offset < content.length; offset += partSize, number += 1) {
    const signed = await sign({ method: 'PUT', key: started.key, uploadId, partNumber: number });
    const put = await fetch(signed.url, {
      method: 'PUT',
      body: content.subarray(offset, offset + partSize),
    });
    parts.push(put.headers.get('etag') ?? '');
  }
  const finish = await sign({ method: 'POST', key: started.key, uploadId });
  const xml = `<CompleteMultipartUpload>${parts.map((etag, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${etag}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
  expect((await fetch(finish.url, { method: 'POST', body: xml })).status).toBe(200);
  const done = await call(who, 'POST', '/documents/uploads/complete', { key: started.key });
  expect(done.status, JSON.stringify(done.body)).toBe(201);
  return { key: started.key, document: asDocument(done.body) };
}

/** A small real PDF put straight into the bucket, with a clean document row, so downloads can be tested without a scan. */
async function seedDocument(options: {
  owner: 'patient1' | 'patient2';
  caseKey?: 'case1' | 'case2' | null;
  mimeType?: string;
  fileName?: string;
  scanStatus?: 'pending' | 'clean' | 'infected' | 'failed';
  visibility?: 'private' | 'internal';
  uploadedBy?: string;
  body?: Buffer;
  shareWith?: string;
}): Promise<{ id: string; body: Buffer; key: string }> {
  const mimeType = options.mimeType ?? 'application/pdf';
  let content = options.body;
  if (!content) {
    if (mimeType === 'application/pdf') {
      const pdf = await PDFDocument.create();
      pdf.addPage([300, 400]);
      pdf.addPage([300, 400]);
      content = Buffer.from(await pdf.save());
    } else if (mimeType === 'image/png') {
      content = await sharp({
        create: { width: 400, height: 300, channels: 3, background: '#2266aa' },
      })
        .png()
        .toBuffer();
    } else {
      content = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), randomBytes(2000)]);
    }
  }
  const body: Buffer = content ?? Buffer.alloc(0);
  const key = `files/${crypto.randomUUID()}`;
  t.s3.put(t.bucket, key, body, mimeType);
  const caseId = options.caseKey === null ? null : (ids[options.caseKey ?? 'case1'] as string);
  const doc = await t.db.document.create({
    data: {
      kind: 'report',
      fileName: options.fileName ?? `report-${next()}.pdf`,
      mimeType,
      sizeBytes: body.length,
      storageKey: key,
      scanStatus: options.scanStatus ?? 'clean',
      visibility: options.visibility ?? 'private',
      patientId: ids[options.owner],
      caseId,
      ...(options.uploadedBy ? { uploadedById: options.uploadedBy } : {}),
    },
  });
  return { id: doc.id, body, key };
}

beforeAll(async () => {
  t = await createTestApp();
  await t.db.country.upsert({
    where: { code: 'IN' },
    update: {},
    create: { code: 'IN', name: 'India' },
  });
  const city = await t.db.city.create({
    data: { slug: `docs-city-${next()}`, name: 'City', countryCode: 'IN' },
  });
  const [a, b] = await Promise.all(
    ['a', 'b'].map((slug) =>
      t.db.hospital.create({
        data: {
          slug: `docs-h-${slug}-${next()}`,
          name: `Hospital ${slug.toUpperCase()}`,
          cityId: city.id,
        },
      }),
    ),
  );
  ids.hospitalA = a?.id as string;
  ids.hospitalB = b?.id as string;
  ids.docType = (
    await t.db.documentType.create({
      data: { code: `report_${next()}`, name: 'Medical report', kind: 'report' },
    })
  ).id;

  await makeUser('admin', 'super_admin');
  await makeUser('cm1', 'case_manager');
  await makeUser('cm2', 'case_manager');
  await makeUser('agent', 'agent');
  await makeUser('finance', 'finance');
  await makeUser('gc', 'ground_coordinator');
  await makeUser('interpreter', 'interpreter');
  await makeUser('reviewer', 'medical_reviewer');
  const patientUser = await makeUser('patient1', 'patient', 'Asha Rao');
  const patient2User = await makeUser('patient2', 'patient', 'Omar Hadi');
  const attendantUser = await makeUser('attendant', 'attendant');
  const deskA = await makeUser('deskA', 'hospital_desk');
  const deskB = await makeUser('deskB', 'hospital_desk');

  ids.patient1 = (
    await t.db.patient.create({ data: { fullName: 'Asha Rao', userId: patientUser.id } })
  ).id;
  ids.patient2 = (
    await t.db.patient.create({ data: { fullName: 'Omar Hadi', userId: patient2User.id } })
  ).id;
  const attendant = await t.db.attendant.create({
    data: { fullName: 'Att', patientId: ids.patient1, userId: attendantUser.id },
  });
  await t.db.staffProfile.create({ data: { userId: users['cm1']?.id as string } });
  await t.db.staffProfile.create({ data: { userId: users['cm2']?.id as string } });
  ids.case1 = (
    await t.db.case.create({
      data: {
        caseNo: 'CASE-2026-700001',
        patientId: ids.patient1,
        ownerId: users['cm1']?.id as string,
        reviewerId: users['reviewer']?.id as string,
      },
    })
  ).id;
  ids.case2 = (
    await t.db.case.create({
      data: {
        caseNo: 'CASE-2026-700002',
        patientId: ids.patient2,
        ownerId: users['cm2']?.id as string,
      },
    })
  ).id;
  await t.db.caseAttendant.create({ data: { caseId: ids.case1, attendantId: attendant.id } });
  await t.db.hospitalStaff.create({ data: { userId: deskA.id, hospitalId: ids.hospitalA } });
  await t.db.hospitalStaff.create({ data: { userId: deskB.id, hospitalId: ids.hospitalB } });
  // Hospital A has been asked about case 1 (with the patient's consent), hospital B has not.
  const consent = await t.db.consent.create({
    data: {
      patientId: ids.patient1,
      caseId: ids.case1,
      hospitalId: ids.hospitalA,
      type: 'share_medical_with_hospital',
    },
  });
  await t.db.opinionRequest.create({
    data: { caseId: ids.case1, hospitalId: ids.hospitalA, status: 'sent', consentId: consent.id },
  });
}, 180_000);

afterAll(async () => {
  await t?.close();
});

describe('uploading a file', () => {
  it('goes straight to the bucket in parts through signed requests, and ends as a document waiting for its scan', async () => {
    const content = randomBytes(11 * MIB);
    const { key, document } = await upload(
      users['patient1'] as Who,
      {
        fileName: 'Asha MRI report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: content.length,
        kind: 'report',
        caseId: ids.case1,
      },
      content,
    );
    // The API chose the key: the browser's proposal and the file name never reach the bucket path.
    expect(key).toMatch(/^files\/[0-9a-f-]{36}$/);
    expect(key).not.toContain('browser-proposal');
    expect(document).toMatchObject({
      fileName: 'Asha MRI report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: content.length,
      scanStatus: 'pending',
      caseId: ids.case1,
      caseNo: 'CASE-2026-700001',
      patientId: ids.patient1,
      uploadedById: users['patient1']?.id,
      uploadedByName: 'Asha Rao',
      visibility: 'private',
      shares: [],
    });
    expect(t.s3.get(t.bucket, key)?.body.equals(content)).toBe(true);

    const row = await t.db.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(row.storageKey).toBe(key);
    const event = await t.db.outboxEvent.findFirstOrThrow({
      where: { type: 'document.uploaded', aggregateId: document.id },
    });
    expect(event).toMatchObject({ status: 'pending', payload: { documentId: document.id } });
    expect(await t.db.fileUpload.findUniqueOrThrow({ where: { key } })).toMatchObject({
      status: 'completed',
      documentId: document.id,
    });
    const audit = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'document.created', entityId: document.id },
    });
    expect(audit).toMatchObject({ actorId: users['patient1']?.id, patientId: ids.patient1 });
    expect(JSON.stringify(audit.after)).not.toContain('MRI');
    // Preparing an upload is not a change: signing requests leave no fallback rows.
    expect(
      await t.db.auditEvent.count({
        where: { action: 'http.post', actorId: users['patient1']?.id },
      }),
    ).toBe(0);
  }, 120_000);

  it('can be reported complete again without making a second document', async () => {
    const content = randomBytes(2000);
    const { key, document } = await upload(
      users['patient1'] as Who,
      {
        fileName: 'a.png',
        mimeType: 'image/png',
        sizeBytes: content.length,
        patientId: ids.patient1,
      },
      content,
    );
    const again = await call(users['patient1'] as Who, 'POST', '/documents/uploads/complete', {
      key,
    });
    expect(again.status).toBe(201);
    expect(asDocument(again.body).id).toBe(document.id);
    expect(await t.db.document.count({ where: { storageKey: key } })).toBe(1);
  });

  it('refuses what may not be uploaded, before any URL is signed', async () => {
    const start = (file: Record<string, unknown>, who = users['patient1'] as Who) =>
      call(who, 'POST', '/documents/uploads/sign', {
        request: { method: 'POST', key: 'files/x' },
        file,
      });
    const base = {
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1000,
      caseId: ids.case1,
    };
    expect(
      (await start({ ...base, fileName: 'run.exe', mimeType: 'application/octet-stream' })).status,
    ).toBe(422);
    expect((await start({ ...base, mimeType: 'image/png' })).status).toBe(422);
    expect((await start({ ...base, sizeBytes: DOCUMENT_MAX_BYTES + 1 })).status).toBe(400);
    expect((await start({ ...base, sizeBytes: 0 })).status).toBe(400);
    expect((await start({ ...base, fileName: '../../a.pdf' })).status).toBe(400);
    // Staff must say which case or patient; a patient's own file needs neither.
    const bare = { fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10 };
    expect((await start(bare, users['cm1'] as Who)).status).toBe(400);
    expect((await start(bare)).status).toBe(200);
    expect(
      (
        await call(users['patient1'] as Who, 'POST', '/documents/uploads/sign', {
          request: { method: 'POST', key: 'files/x' },
        })
      ).status,
    ).toBe(400);
    // Someone else's case does not exist as far as the patient is concerned.
    expect((await start({ ...base, caseId: ids.case2 })).status).toBe(404);
    expect((await start({ ...base, caseId: undefined, patientId: ids.patient2 })).status).toBe(404);
    // Patients and attendants cannot make a file staff-only, and an attendant uploads passports.
    expect((await start({ ...base, visibility: 'internal' })).status).toBe(403);
    expect((await start({ ...base, kind: 'report' }, users['attendant'] as Who)).status).toBe(403);
    expect(
      (
        await start(
          { ...base, kind: 'passport', mimeType: 'application/pdf' },
          users['attendant'] as Who,
        )
      ).status,
    ).toBe(200);
    // Nothing was recorded for the refusals.
    expect(await t.db.fileUpload.count({ where: { fileName: 'run.exe' } })).toBe(0);
  });

  it("signs later requests only for an upload that is the caller's, open, and within the part count", async () => {
    const who = users['patient1'] as Who;
    const file = {
      fileName: 'b.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 3000,
      caseId: ids.case1,
    };
    const started = signedUploadSchema.parse(
      (
        await call(who, 'POST', '/documents/uploads/sign', {
          request: { method: 'POST', key: 'files/p' },
          file,
        })
      ).body,
    );
    const sign = (as: Who, request: Record<string, unknown>) =>
      call(as, 'POST', '/documents/uploads/sign', { request });
    const created = await fetch(started.url, { method: 'POST' });
    const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(await created.text())?.[1] as string;

    expect(
      (await sign(who, { method: 'PUT', key: started.key, uploadId, partNumber: 1 })).status,
    ).toBe(200);
    // A 3,000 byte file has one part.
    expect(
      (await sign(who, { method: 'PUT', key: started.key, uploadId, partNumber: 2 })).status,
    ).toBe(400);
    // Another user, another upload id, a key that is not one of ours, a single-request upload: all refused.
    expect(
      (
        await sign(users['patient2'] as Who, {
          method: 'PUT',
          key: started.key,
          uploadId,
          partNumber: 1,
        })
      ).status,
    ).toBe(403);
    expect(
      (await sign(who, { method: 'PUT', key: started.key, uploadId: 'another', partNumber: 1 }))
        .status,
    ).toBe(403);
    expect(
      (
        await sign(who, {
          method: 'PUT',
          key: 'files/00000000-0000-4000-8000-000000000000',
          uploadId,
          partNumber: 1,
        })
      ).status,
    ).toBe(403);
    expect(
      (await sign(who, { method: 'PUT', key: '../files/x', uploadId, partNumber: 1 })).status,
    ).toBe(400);
    expect((await sign(who, { method: 'PUT', key: started.key })).status).toBe(400);

    // Giving up closes it: nothing more is signed.
    expect((await sign(who, { method: 'DELETE', key: started.key, uploadId })).status).toBe(200);
    expect(
      (await sign(who, { method: 'PUT', key: started.key, uploadId, partNumber: 1 })).status,
    ).toBe(403);
    expect(await t.db.fileUpload.findUniqueOrThrow({ where: { key: started.key } })).toMatchObject({
      status: 'aborted',
    });
  });

  it('refuses to complete a file that has not arrived, and deletes one that is not the announced size', async () => {
    const who = users['patient1'] as Who;
    const announced = {
      fileName: 'c.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 5000,
      caseId: ids.case1,
    };
    const started = signedUploadSchema.parse(
      (
        await call(who, 'POST', '/documents/uploads/sign', {
          request: { method: 'POST', key: 'files/p' },
          file: announced,
        })
      ).body,
    );
    expect(
      (await call(who, 'POST', '/documents/uploads/complete', { key: started.key })).status,
    ).toBe(409);
    // The bucket holds more than was announced.
    t.s3.put(t.bucket, started.key, randomBytes(9000));
    const refused = await call(who, 'POST', '/documents/uploads/complete', { key: started.key });
    expect(refused.status).toBe(422);
    expect(t.s3.get(t.bucket, started.key)).toBeUndefined();
    expect(await t.db.document.count({ where: { storageKey: started.key } })).toBe(0);
    // Someone else cannot complete it either.
    expect(
      (
        await call(users['patient2'] as Who, 'POST', '/documents/uploads/complete', {
          key: started.key,
        })
      ).status,
    ).toBe(403);
  });
});

describe('seeing documents', () => {
  it('lists each person only the documents they may see, newest first', async () => {
    const mine = await seedDocument({ owner: 'patient1' });
    const theirs = await seedDocument({ owner: 'patient2', caseKey: 'case2' });
    const internal = await seedDocument({ owner: 'patient1', visibility: 'internal' });
    const idsOf = async (who: Who, query = '') =>
      documentPageSchema
        .parse((await call(who, 'GET', `/documents${query}`)).body)
        .items.map((d) => d.id);

    const patient = await idsOf(users['patient1'] as Who);
    expect(patient).toContain(mine.id);
    expect(patient).not.toContain(theirs.id);
    expect(patient).not.toContain(internal.id);
    const other = await idsOf(users['patient2'] as Who);
    expect(other).toContain(theirs.id);
    expect(other).not.toContain(mine.id);

    const owner = await idsOf(users['cm1'] as Who);
    expect(owner).toEqual(expect.arrayContaining([mine.id, internal.id]));
    expect(owner).not.toContain(theirs.id);
    expect(await idsOf(users['cm2'] as Who)).toContain(theirs.id);
    expect(await idsOf(users['admin'] as Who)).toEqual(
      expect.arrayContaining([mine.id, theirs.id, internal.id]),
    );
    expect(await idsOf(users['patient1'] as Who, `?caseId=${ids.case1}&kind=report`)).toContain(
      mine.id,
    );
    expect(await idsOf(users['patient1'] as Who, '?kind=passport')).not.toContain(mine.id);

    expect((await call(users['patient2'] as Who, 'GET', `/documents/${mine.id}`)).status).toBe(404);
    expect((await call(users['patient1'] as Who, 'GET', `/documents/${internal.id}`)).status).toBe(
      404,
    );
    expect(
      asDocument((await call(users['cm1'] as Who, 'GET', `/documents/${internal.id}`)).body)
        .visibility,
    ).toBe('internal');
  });

  it('pages with a cursor', async () => {
    for (let i = 0; i < 3; i += 1) await seedDocument({ owner: 'patient2', caseKey: 'case2' });
    const first = documentPageSchema.parse(
      (await call(users['patient2'] as Who, 'GET', '/documents?limit=2')).body,
    );
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = documentPageSchema.parse(
      (await call(users['patient2'] as Who, 'GET', `/documents?limit=2&cursor=${first.nextCursor}`))
        .body,
    );
    expect(second.items.map((d) => d.id)).not.toEqual(
      expect.arrayContaining(first.items.map((d) => d.id)),
    );
  });
});

describe('downloading', () => {
  it('gives a patient a five-minute, watermarked link, and records who asked', async () => {
    const doc = await seedDocument({ owner: 'patient1', fileName: 'My report.pdf' });
    const res = await call(users['patient1'] as Who, 'POST', `/documents/${doc.id}/download`);
    expect(res.status).toBe(200);
    const link = fileLinkSchema.parse(res.body);
    expect(link).toMatchObject({ watermarked: true, fileName: 'My report.pdf' });
    expect(new URL(link.url).searchParams.get('X-Amz-Expires')).toBe('300');
    expect(new Date(link.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(300_000);

    const file = await fetch(link.url);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-disposition')).toContain('attachment');
    const stamped = Buffer.from(await file.arrayBuffer());
    expect(stamped.equals(doc.body)).toBe(false);
    expect((await PDFDocument.load(stamped)).getPageCount()).toBe(2);
    // The stamped copy is a separate object; the original is untouched.
    expect(t.s3.get(t.bucket, doc.key)?.body.equals(doc.body)).toBe(true);
    expect([...t.s3.objects.keys()].some((k) => k.includes(`watermarked/${doc.id}/`))).toBe(true);

    const audit = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'document.downloaded', entityId: doc.id },
    });
    expect(audit).toMatchObject({
      actorId: users['patient1']?.id,
      patientId: ids.patient1,
      after: { watermarked: true },
    });
    expect(JSON.stringify(audit)).not.toContain('My report');

    // Six minutes later the bucket refuses the same link.
    t.s3.now = () => new Date(Date.now() + 6 * 60_000);
    expect((await fetch(link.url)).status).toBe(403);
    t.s3.now = () => new Date();
  });

  it('shows a document in the browser as a view, stamps images too, and delivers other types as they are', async () => {
    const png = await seedDocument({
      owner: 'patient1',
      mimeType: 'image/png',
      fileName: 'scan.png',
    });
    const preview = fileLinkSchema.parse(
      (await call(users['patient1'] as Who, 'POST', `/documents/${png.id}/preview`)).body,
    );
    expect(preview.watermarked).toBe(true);
    const shown = await fetch(preview.url);
    expect(shown.headers.get('content-disposition')).toContain('inline');
    expect(Buffer.from(await shown.arrayBuffer()).equals(png.body)).toBe(false);
    expect(
      await t.db.auditEvent.count({ where: { action: 'document.viewed', entityId: png.id } }),
    ).toBe(1);

    const zip = await seedDocument({
      owner: 'patient1',
      mimeType: 'application/zip',
      fileName: 'dicom.zip',
    });
    const link = fileLinkSchema.parse(
      (await call(users['patient1'] as Who, 'POST', `/documents/${zip.id}/download`)).body,
    );
    expect(link.watermarked).toBe(false);
    expect(Buffer.from(await (await fetch(link.url)).arrayBuffer()).equals(zip.body)).toBe(true);
    expect(
      await t.db.auditEvent.findFirstOrThrow({
        where: { action: 'document.downloaded', entityId: zip.id },
      }),
    ).toMatchObject({ after: { watermarked: false } });
  });

  it('refuses a file that is still being scanned, or did not pass', async () => {
    for (const scanStatus of ['pending', 'infected', 'failed'] as const) {
      const doc = await seedDocument({ owner: 'patient1', scanStatus });
      const res = await call(users['patient1'] as Who, 'POST', `/documents/${doc.id}/download`);
      expect(res.status, scanStatus).toBe(409);
      expect(res.body).toMatchObject({ code: 'not_clean' });
      expect(
        await t.db.auditEvent.count({ where: { action: 'document.downloaded', entityId: doc.id } }),
      ).toBe(0);
    }
  });

  it('refuses everyone who may not see the document, and records nothing for them', async () => {
    const doc = await seedDocument({ owner: 'patient1' });
    const refused: [string, number][] = [
      ['agent', 403],
      ['finance', 403],
      ['gc', 403],
      ['interpreter', 403],
      ['patient2', 404],
      ['cm2', 404],
      ['deskB', 404],
      ['deskA', 404],
    ];
    for (const [who, status] of refused) {
      expect(
        (await call(users[who] as Who, 'POST', `/documents/${doc.id}/download`)).status,
        who,
      ).toBe(status);
      expect(
        (await call(users[who] as Who, 'POST', `/documents/${doc.id}/preview`)).status,
        who,
      ).toBe(status);
    }
    expect(
      await t.db.auditEvent.count({
        where: { entityId: doc.id, action: { startsWith: 'document.' } },
      }),
    ).toBe(0);
    for (const who of ['cm1', 'reviewer', 'admin', 'patient1'])
      expect(
        (await call(users[who] as Who, 'POST', `/documents/${doc.id}/download`)).status,
        who,
      ).toBe(200);
    const attendantDoc = await seedDocument({
      owner: 'patient1',
      uploadedBy: users['attendant']?.id as string,
    });
    expect(
      (await call(users['attendant'] as Who, 'POST', `/documents/${attendantDoc.id}/download`))
        .status,
    ).toBe(200);
    expect(
      (await call(users['attendant'] as Who, 'POST', `/documents/${doc.id}/download`)).status,
    ).toBe(404);
  });

  it('serves a preview image once the worker has made one, and counts it as a view', async () => {
    const doc = await seedDocument({ owner: 'patient1' });
    expect(
      (await call(users['patient1'] as Who, 'GET', `/documents/${doc.id}/thumbnail`)).status,
    ).toBe(409);
    const key = `thumbs/${doc.id}.webp`;
    t.s3.put(t.bucket, key, Buffer.from('webp'), 'image/webp');
    await t.db.document.update({
      where: { id: doc.id },
      data: { thumbnailKey: key, pageCount: 2 },
    });
    const res = await call(users['patient1'] as Who, 'GET', `/documents/${doc.id}/thumbnail`);
    expect(res.status).toBe(200);
    expect(new URL((res.body as { url: string }).url).searchParams.get('X-Amz-Expires')).toBe(
      '300',
    );
    expect(
      await t.db.auditEvent.findFirstOrThrow({
        where: { action: 'document.viewed', entityId: doc.id },
      }),
    ).toMatchObject({ after: { variant: 'thumbnail' } });
    expect(
      (await call(users['patient2'] as Who, 'GET', `/documents/${doc.id}/thumbnail`)).status,
    ).toBe(404);
  });
});

describe('sharing with a hospital', () => {
  it("is the patient's choice: turning it on records consent and lets that hospital in, turning it off closes it again", async () => {
    const doc = await seedDocument({ owner: 'patient1' });
    const patient = users['patient1'] as Who;
    const listed = shareTargetsSchema.parse(
      (await call(patient, 'GET', `/documents/${doc.id}/shares`)).body,
    );
    expect(listed.targets).toEqual([
      { hospitalId: ids.hospitalA, hospitalName: 'Hospital A', shared: false },
    ]);
    // Not shared yet: the hospital does not see it.
    expect((await call(users['deskA'] as Who, 'GET', `/documents/${doc.id}`)).status).toBe(404);

    expect(
      (await call(patient, 'PUT', `/documents/${doc.id}/shares/${ids.hospitalA}`, { shared: true }))
        .status,
    ).toBe(204);
    expect(
      await t.db.consent.count({
        where: {
          patientId: ids.patient1,
          hospitalId: ids.hospitalA,
          type: 'share_medical_with_hospital',
          withdrawnAt: null,
        },
      }),
    ).toBeGreaterThanOrEqual(1);
    expect(asDocument((await call(patient, 'GET', `/documents/${doc.id}`)).body).shares).toEqual([
      { hospitalId: ids.hospitalA, hospitalName: 'Hospital A' },
    ]);
    // The hospital can now see and download it, but is not told about other hospitals.
    const seen = asDocument(
      (await call(users['deskA'] as Who, 'GET', `/documents/${doc.id}`)).body,
    );
    expect(seen.shares).toEqual([]);
    expect(
      (await call(users['deskA'] as Who, 'POST', `/documents/${doc.id}/download`)).status,
    ).toBe(200);
    expect((await call(users['deskB'] as Who, 'GET', `/documents/${doc.id}`)).status).toBe(404);
    expect(
      await t.db.auditEvent.count({ where: { action: 'document.shared', entityId: doc.id } }),
    ).toBe(1);

    expect(
      (
        await call(patient, 'PUT', `/documents/${doc.id}/shares/${ids.hospitalA}`, {
          shared: false,
        })
      ).status,
    ).toBe(204);
    expect((await call(users['deskA'] as Who, 'GET', `/documents/${doc.id}`)).status).toBe(404);
    expect(
      (await call(users['deskA'] as Who, 'POST', `/documents/${doc.id}/download`)).status,
    ).toBe(404);
    expect(
      await t.db.auditEvent.count({ where: { action: 'document.unshared', entityId: doc.id } }),
    ).toBe(1);

    // Turning it on again revives the same share, and a withdrawn consent closes the door whatever the share row says.
    expect(
      (await call(patient, 'PUT', `/documents/${doc.id}/shares/${ids.hospitalA}`, { shared: true }))
        .status,
    ).toBe(204);
    expect(await t.db.documentShare.count({ where: { documentId: doc.id } })).toBe(1);
    expect((await call(users['deskA'] as Who, 'GET', `/documents/${doc.id}`)).status).toBe(200);
    await t.db.consent.updateMany({
      where: { patientId: ids.patient1, hospitalId: ids.hospitalA },
      data: { withdrawnAt: new Date(Date.now() + 1000) },
    });
    expect((await call(users['deskA'] as Who, 'GET', `/documents/${doc.id}`)).status).toBe(404);
  });

  it("is only the patient's to change, only for a hospital the case was sent to, and only for a document of a case", async () => {
    const doc = await seedDocument({ owner: 'patient1' });
    const put = (who: Who, hospitalId: string, id = doc.id) =>
      call(who, 'PUT', `/documents/${id}/shares/${hospitalId}`, { shared: true });
    expect((await put(users['cm1'] as Who, ids.hospitalA)).status).toBe(403);
    expect((await put(users['admin'] as Who, ids.hospitalA)).status).toBe(403);
    expect((await put(users['deskA'] as Who, ids.hospitalA)).status).toBe(403);
    expect((await put(users['patient1'] as Who, ids.hospitalB)).status).toBe(404);
    expect((await put(users['patient2'] as Who, ids.hospitalA)).status).toBe(404);
    const noCase = await seedDocument({ owner: 'patient1', caseKey: null });
    expect((await put(users['patient1'] as Who, ids.hospitalA, noCase.id)).status).toBe(409);
    expect(
      shareTargetsSchema.parse(
        (await call(users['patient1'] as Who, 'GET', `/documents/${noCase.id}/shares`)).body,
      ).targets,
    ).toEqual([]);
  });
});

describe('changing and deleting', () => {
  it("lets the patient set a document's kind, type and notes, and nothing else", async () => {
    const doc = await seedDocument({ owner: 'patient1' });
    const patient = users['patient1'] as Who;
    const res = await call(patient, 'PATCH', `/documents/${doc.id}`, {
      kind: 'scan',
      typeId: ids.docType,
      notes: 'Left knee',
    });
    expect(res.status).toBe(200);
    expect(asDocument(res.body)).toMatchObject({
      kind: 'scan',
      typeId: ids.docType,
      typeName: 'Medical report',
      notes: 'Left knee',
    });
    const audit = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'document.updated', entityId: doc.id },
    });
    expect(JSON.stringify(audit)).not.toContain('Left knee');
    for (const bad of [
      { scanStatus: 'clean' },
      { storageKey: 'x' },
      { typeId: '3f0c6f1e-9b1a-4c55-8a53-0d2f5c0a1b11' },
    ])
      expect(
        (await call(patient, 'PATCH', `/documents/${doc.id}`, bad)).status,
      ).toBeGreaterThanOrEqual(400);
    expect(
      (await call(users['patient2'] as Who, 'PATCH', `/documents/${doc.id}`, { notes: 'x' }))
        .status,
    ).toBe(404);
  });

  it('removes a document from every list when it is deleted, and only roles that may delete can', async () => {
    const doc = await seedDocument({ owner: 'patient1' });
    expect((await call(users['cm1'] as Who, 'DELETE', `/documents/${doc.id}`)).status).toBe(403);
    expect((await call(users['patient2'] as Who, 'DELETE', `/documents/${doc.id}`)).status).toBe(
      404,
    );
    expect((await call(users['patient1'] as Who, 'DELETE', `/documents/${doc.id}`)).status).toBe(
      204,
    );
    expect((await call(users['patient1'] as Who, 'GET', `/documents/${doc.id}`)).status).toBe(404);
    expect((await call(users['admin'] as Who, 'GET', `/documents/${doc.id}`)).status).toBe(404);
    expect(
      (await call(users['patient1'] as Who, 'POST', `/documents/${doc.id}/download`)).status,
    ).toBe(404);
    const row = await t.db.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(row.deletedAt).not.toBeNull();
    // Soft: the object stays for the retention job.
    expect(t.s3.get(t.bucket, doc.key)).toBeDefined();
    expect(
      await t.db.auditEvent.count({ where: { action: 'document.deleted', entityId: doc.id } }),
    ).toBe(1);
  });
});

describe('who may use the document routes at all', () => {
  it.each(['agent', 'finance', 'gc', 'interpreter'] as const)(
    '%s gets 403 on every one',
    async (key) => {
      const who = users[key] as Who;
      const id = '3f0c6f1e-9b1a-4c55-8a53-0d2f5c0a1b11';
      const hit = (
        method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
        url: string,
        body?: unknown,
      ) => call(who, method, url, body);
      const results = await Promise.all([
        hit('GET', '/documents'),
        hit('GET', `/documents/${id}`),
        hit('POST', `/documents/${id}/download`),
        hit('POST', `/documents/${id}/preview`),
        hit('GET', `/documents/${id}/thumbnail`),
        hit('GET', `/documents/${id}/shares`),
        hit('PUT', `/documents/${id}/shares/${ids.hospitalA}`, { shared: true }),
        hit('PATCH', `/documents/${id}`, { notes: 'x' }),
        hit('DELETE', `/documents/${id}`),
        hit('POST', '/documents/uploads/sign', {
          request: { method: 'POST', key: 'files/x' },
          file: { fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 5, caseId: ids.case1 },
        }),
        hit('POST', '/documents/uploads/complete', {
          key: 'files/00000000-0000-4000-8000-000000000000',
        }),
      ]);
      expect(results.map((r) => r.status)).toEqual(Array(11).fill(403));
    },
  );

  it('answers 401 with no sign-in', async () => {
    expect((await t.raw('GET', '/documents')).status).toBe(401);
    expect((await t.raw('POST', '/documents/uploads/sign', { body: {} })).status).toBe(401);
  });
});
