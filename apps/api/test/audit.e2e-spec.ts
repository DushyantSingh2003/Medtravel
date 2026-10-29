import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DOWNLOAD_ALERT_LIMIT,
  auditPageSchema,
  type AuditEventView,
  type Role,
} from '@medtravel/contracts';
import { AuditService } from '../src/audit/audit.service.js';
import { AccessProbeModule } from './support/access-probe.js';
import { createTestApp, type TestApp } from './support/test-app.js';

let t: TestApp;
let n = 0;
const next = () => (n += 1);
const email = (prefix: string) => `${prefix}-${next()}@audit.test`;

const as = async (role: Role, name?: string) => {
  const user = await t.makeUser({
    email: email(role.replace(/_/g, '-')),
    role,
    ...(name ? { name } : {}),
  });
  const { accessToken } = await t.tokenFor(user.id);
  return { user, headers: { authorization: `Bearer ${accessToken}` } };
};

const page = (body: unknown) => auditPageSchema.parse(body);
const listed = async (headers: Record<string, string>, query = ''): Promise<AuditEventView[]> => {
  const res = await t.raw('GET', `/audit${query}`, { headers });
  expect(res.status).toBe(200);
  return page(res.body).items;
};

beforeAll(async () => {
  t = await createTestApp({ imports: [AccessProbeModule] });
}, 120_000);

afterAll(async () => {
  await t?.close();
});

describe('who may read the audit trail', () => {
  it.each(['case_manager', 'finance', 'agent', 'patient', 'hospital_desk', 'doctor'] as const)(
    '%s gets 403 on the list and the export',
    async (role) => {
      const { headers } = await as(role);
      expect((await t.raw('GET', '/audit', { headers })).status).toBe(403);
      expect((await t.raw('GET', '/audit/export', { headers })).status).toBe(403);
    },
  );

  it('answers 401 with no sign-in, and 200 for the super admin', async () => {
    expect((await t.raw('GET', '/audit')).status).toBe(401);
    const { headers } = await as('super_admin');
    expect((await t.raw('GET', '/audit', { headers })).status).toBe(200);
  });

  it('rejects a malformed filter', async () => {
    const { headers } = await as('super_admin');
    expect((await t.raw('GET', '/audit?actorId=nope', { headers })).status).toBe(400);
    expect((await t.raw('GET', '/audit?from=yesterday', { headers })).status).toBe(400);
  });
});

describe('views and downloads', () => {
  it('show up in the list the moment the request returns, with who, what, where and when', async () => {
    const admin = await as('super_admin');
    const reviewer = await as('case_manager', 'Rhea Reviewer');
    const documentId = `doc-${next()}`;
    const before = Date.now();
    const view = await t.raw('GET', `/probe/access/documents/${documentId}/view`, {
      headers: reviewer.headers,
      ip: '203.0.113.9',
    });
    expect(view.status).toBe(200);

    const rows = await listed(admin.headers, `?entityId=${documentId}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'document.viewed',
      entityType: 'Document',
      entityId: documentId,
      actorId: reviewer.user.id,
      actorName: 'Rhea Reviewer',
      actorEmail: reviewer.user.email,
      actorRole: 'case_manager',
      ip: '203.0.113.9',
    });
    expect(new Date(rows[0]?.createdAt ?? 0).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(rows[0]?.requestId).toBeTruthy();
  });

  it('records a download as its own action', async () => {
    const admin = await as('super_admin');
    const reviewer = await as('case_manager');
    const documentId = `doc-${next()}`;
    await t.raw('GET', `/probe/access/documents/${documentId}/download`, {
      headers: reviewer.headers,
    });
    expect((await listed(admin.headers, `?entityId=${documentId}`)).map((r) => r.action)).toEqual([
      'document.downloaded',
    ]);
  });

  it('refuses a role without document access before anything is recorded', async () => {
    const admin = await as('super_admin');
    const agent = await as('agent');
    const documentId = `doc-${next()}`;
    expect(
      (await t.raw('GET', `/probe/access/documents/${documentId}/view`, { headers: agent.headers }))
        .status,
    ).toBe(403);
    expect(await listed(admin.headers, `?entityId=${documentId}`)).toEqual([]);
  });
});

describe('what is stored for a change', () => {
  it('keeps only the fields that changed and masks the sensitive ones', async () => {
    const admin = await as('super_admin');
    const audit = t.app.get(AuditService);
    const entityId = `rec-${next()}`;
    await audit.recordNow(
      { actor: null, ip: null, userAgent: null, requestId: null },
      {
        action: 'patient.updated',
        entityType: 'Patient',
        entityId,
        before: { fullName: 'Asha', passportNumber: 'N1234567', password: 'old', city: 'Delhi' },
        after: { fullName: 'Asha', passportNumber: 'N7654321', password: 'new', city: 'Mumbai' },
      },
    );
    const [row] = await listed(admin.headers, `?entityId=${entityId}`);
    expect(row?.before).toEqual({
      passportNumber: '****4567',
      password: '[masked]',
      city: 'Delhi',
    });
    expect(row?.after).toEqual({
      passportNumber: '****4321',
      password: '[masked]',
      city: 'Mumbai',
    });
    expect(row?.actorId).toBeNull();
  });

  it('records a master data change with a real actor, through the existing module', async () => {
    const admin = await as('super_admin');
    await t.db.country.upsert({
      where: { code: 'IN' },
      update: {},
      create: { code: 'IN', name: 'India' },
    });
    const slug = `audit-city-${next()}`;
    const created = await t.raw('POST', '/masters/cities', {
      headers: admin.headers,
      body: { slug, name: 'Audit City', countryCode: 'IN' },
    });
    expect(created.status).toBe(201);
    const rows = await listed(admin.headers, '?entityType=City');
    const mine = rows.find((row) => (row.after as { slug?: string } | null)?.slug === slug);
    expect(mine).toMatchObject({
      action: 'master_data.created',
      actorId: admin.user.id,
      actorRole: 'super_admin',
    });
  });
});

describe('filters and paging', () => {
  it('filters by actor text, action prefix, entity type, patient and time, and combines them', async () => {
    const admin = await as('super_admin');
    const alpha = await as('case_manager', `Zelda Alpha ${next()}`);
    const beta = await as('case_manager', `Yuri Beta ${next()}`);
    const alphaName = (await t.db.user.findUniqueOrThrow({ where: { id: alpha.user.id } })).name;
    await t.raw('GET', `/probe/access/documents/f-${next()}/view`, { headers: alpha.headers });
    await t.raw('GET', `/probe/access/documents/f-${next()}/download`, { headers: alpha.headers });
    await t.raw('GET', `/probe/access/documents/f-${next()}/view`, { headers: beta.headers });

    const byActor = await listed(
      admin.headers,
      `?actor=${encodeURIComponent(alphaName.split(' ')[0] ?? '')}`,
    );
    expect(byActor.length).toBeGreaterThanOrEqual(2);
    expect(byActor.filter((r) => r.actorId === alpha.user.id)).toHaveLength(2);
    expect((await listed(admin.headers, `?actorId=${beta.user.id}`)).map((r) => r.action)).toEqual([
      'document.viewed',
    ]);
    expect(
      (await listed(admin.headers, `?actorId=${alpha.user.id}&action=document.`))
        .map((r) => r.action)
        .sort(),
    ).toEqual(['document.downloaded', 'document.viewed']);
    expect(
      (await listed(admin.headers, `?actorId=${alpha.user.id}&action=document.downloaded`)).length,
    ).toBe(1);
    expect(await listed(admin.headers, `?actorId=${alpha.user.id}&entityType=Nothing`)).toEqual([]);
    expect(await listed(admin.headers, '?actor=no-such-person-anywhere')).toEqual([]);

    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(
      await listed(admin.headers, `?actorId=${alpha.user.id}&from=${encodeURIComponent(future)}`),
    ).toEqual([]);
    expect(
      (await listed(admin.headers, `?actorId=${alpha.user.id}&to=${encodeURIComponent(future)}`))
        .length,
    ).toBe(2);
  });

  it('pages newest first with a cursor, no row twice, and reports the total', async () => {
    const admin = await as('super_admin');
    const actor = await as('case_manager');
    for (let i = 0; i < 5; i += 1)
      await t.raw('GET', `/probe/access/documents/p-${next()}/view`, { headers: actor.headers });
    const first = page(
      (await t.raw('GET', `/audit?actorId=${actor.user.id}&limit=2`, { headers: admin.headers }))
        .body,
    );
    expect(first.total).toBe(5);
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = page(
      (
        await t.raw('GET', `/audit?actorId=${actor.user.id}&limit=2&cursor=${first.nextCursor}`, {
          headers: admin.headers,
        })
      ).body,
    );
    const third = page(
      (
        await t.raw('GET', `/audit?actorId=${actor.user.id}&limit=2&cursor=${second.nextCursor}`, {
          headers: admin.headers,
        })
      ).body,
    );
    const all = [...first.items, ...second.items, ...third.items];
    expect(third.nextCursor).toBeNull();
    expect(new Set(all.map((r) => r.id)).size).toBe(5);
    expect(
      [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => r.id),
    ).toEqual(all.map((r) => r.id));
    expect((await t.raw('GET', '/audit?cursor=!!!', { headers: admin.headers })).status).toBe(400);
  });
});

describe('export', () => {
  it('returns the filtered rows as CSV, guards against formulas, and is itself audited', async () => {
    const admin = await as('super_admin');
    const audit = t.app.get(AuditService);
    const entityId = `csv-${next()}`;
    await audit.recordNow(
      { actor: null, ip: '198.51.100.7', userAgent: 'x', requestId: 'r' },
      {
        action: 'thing.updated',
        entityType: 'Thing',
        entityId,
        before: { label: '=HYPERLINK("http://evil")' },
        after: { label: 'has "quotes", commas\nand lines' },
      },
    );
    const res = await t.raw('GET', `/audit/export?entityId=${entityId}`, {
      headers: admin.headers,
    });
    expect(res.status).toBe(200);
    const text = typeof res.body === 'string' ? res.body : '';
    const lines = text.split('\r\n');
    expect(lines[0]).toBe(
      'time,actor,email,role,action,entityType,entityId,patientId,ip,userAgent,requestId,before,after',
    );
    expect(text).toContain(`thing.updated,Thing,${entityId}`);
    expect(text).toContain('"{""label"":""=HYPERLINK');
    expect(text).toContain(String.raw`has \""quotes\"", commas\nand lines`);
    const logged = await listed(admin.headers, '?action=audit.exported');
    expect(logged[0]).toMatchObject({ entityType: 'AuditLog', actorId: admin.user.id });
    expect(logged[0]?.after).toMatchObject({ rows: 1, filters: { entityId } });
  });
});

describe('too many downloads', () => {
  it('opens one incident and one admin alert when a user passes the hourly limit, and not again', async () => {
    const reviewer = await as('case_manager');
    const downloads = async (count: number) => {
      for (let i = 0; i < count; i += 1)
        await t.raw('GET', `/probe/access/documents/d-${next()}/download`, {
          headers: reviewer.headers,
        });
    };
    const incidents = () =>
      t.db.incident.count({ where: { description: { contains: reviewer.user.id } } });
    const alerts = () =>
      t.db.outboxEvent.count({
        where: {
          type: 'incident.created',
          dedupeKey: { startsWith: `download-alert:${reviewer.user.id}` },
        },
      });

    await downloads(DOWNLOAD_ALERT_LIMIT);
    expect(await incidents()).toBe(0);
    await downloads(1);
    expect(await incidents()).toBe(1);
    expect(await alerts()).toBe(1);
    const incident = await t.db.incident.findFirstOrThrow({
      where: { description: { contains: reviewer.user.id } },
    });
    expect(incident).toMatchObject({ type: 'other', severity: 'high', status: 'open' });
    const event = await t.db.outboxEvent.findFirstOrThrow({
      where: { type: 'incident.created', aggregateId: incident.id },
    });
    expect(event.status).toBe('pending');

    await downloads(3);
    expect(await incidents()).toBe(1);
    expect(await alerts()).toBe(1);

    const other = await as('case_manager');
    await t.raw('GET', `/probe/access/documents/d-${next()}/download`, { headers: other.headers });
    expect(await t.db.incident.count({ where: { description: { contains: other.user.id } } })).toBe(
      0,
    );
  }, 120_000);
});

describe('the safety net for changes that forget to audit themselves', () => {
  it('adds a plain row naming the route when a signed-in change leaves none, and stays out of the way when it does', async () => {
    const admin = await as('super_admin');
    const worker = await as('case_manager');
    const forgetfulId = `forgot-${next()}`;
    const carefulId = `careful-${next()}`;
    expect(
      (await t.raw('POST', `/probe/access/forgetful/${forgetfulId}`, { headers: worker.headers }))
        .status,
    ).toBe(201);
    expect(
      (await t.raw('POST', `/probe/access/careful/${carefulId}`, { headers: worker.headers }))
        .status,
    ).toBe(201);

    const rows = await listed(admin.headers, `?actorId=${worker.user.id}`);
    const http = rows.filter((row) => row.action === 'http.post');
    expect(http).toHaveLength(1);
    // The route pattern, never the address with its ids.
    expect(http[0]).toMatchObject({
      entityType: 'Route',
      entityId: 'POST /probe/access/forgetful/:id',
    });
    expect(JSON.stringify(rows)).not.toContain(forgetfulId);
    expect(rows.filter((row) => row.action === 'probe.created')).toHaveLength(1);
  });

  it('does not add one for a read, a refused request, or a failed change', async () => {
    const admin = await as('super_admin');
    const agent = await as('agent');
    await t.raw('POST', '/probe/access/forgetful/x', { headers: agent.headers });
    await t.raw('GET', `/probe/access/documents/r-${next()}/view`, { headers: agent.headers });
    expect(await listed(admin.headers, `?actorId=${agent.user.id}`)).toEqual([]);
  });

  it('does not record an update that changed nothing', async () => {
    const admin = await as('super_admin');
    const audit = t.app.get(AuditService);
    const entityId = `same-${next()}`;
    await audit.recordNow(
      { actor: null, ip: null, userAgent: null, requestId: null },
      { action: 'thing.updated', entityType: 'Thing', entityId, before: { a: 1 }, after: { a: 1 } },
    );
    expect(await listed(admin.headers, `?entityId=${entityId}`)).toEqual([]);
  });
});

describe('masking, through the API', () => {
  it('hides contact details, medical text and identifiers under other key names, and secrets in strings stay out of keys', async () => {
    const admin = await as('super_admin');
    const audit = t.app.get(AuditService);
    const entityId = `mask-${next()}`;
    await audit.recordNow({ actor: null, ip: null, userAgent: null, requestId: null }, {
      action: 'patient.created',
      entityType: 'Patient',
      entityId,
      after: {
        date_of_birth: '1990-01-01',
        phoneNumber: '+91',
        diagnosis: 'private text',
        medicalHistory: 'private text',
        passportNo: 'N1234567',
        stage: 'enquiry',
      },
    } as never);
    const [row] = await listed(admin.headers, `?entityId=${entityId}`);
    expect(row?.after).toEqual({
      date_of_birth: '[masked]',
      phoneNumber: '[masked]',
      diagnosis: '[masked]',
      medicalHistory: '[masked]',
      passportNo: '****4567',
      stage: 'enquiry',
    });
  });
});

describe('paging and the filters, harder cases', () => {
  it('pages rows that share the same timestamp without losing or repeating one', async () => {
    const admin = await as('super_admin');
    const actor = await as('case_manager');
    const at = new Date(Date.now() - 5 * 60_000);
    await t.db.auditEvent.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        actorId: actor.user.id,
        action: 'tie.created',
        entityType: 'Tie',
        entityId: `tie-${i}`,
        createdAt: at,
      })),
    });
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 4 && (i === 0 || cursor); i += 1) {
      const res = page(
        (
          await t.raw(
            'GET',
            `/audit?actorId=${actor.user.id}&limit=2${cursor ? `&cursor=${cursor}` : ''}`,
            {
              headers: admin.headers,
            },
          )
        ).body,
      );
      seen.push(...res.items.map((row) => row.entityId));
      cursor = res.nextCursor;
    }
    expect([...seen].sort()).toEqual(['tie-0', 'tie-1', 'tie-2', 'tie-3', 'tie-4']);
  });

  it('answers 400, not 500, for a cursor that is not a row id, and for a one-character person search', async () => {
    const admin = await as('super_admin');
    const forged = Buffer.from('not-a-uuid', 'utf8').toString('base64url');
    expect((await t.raw('GET', `/audit?cursor=${forged}`, { headers: admin.headers })).status).toBe(
      400,
    );
    expect((await t.raw('GET', '/audit?actor=a', { headers: admin.headers })).status).toBe(400);
  });

  it('exports the device and says when the file is complete, without storing the person text of the filter', async () => {
    const admin = await as('super_admin');
    const res = await t.raw('GET', '/audit/export?actor=zzz-nobody', { headers: admin.headers });
    expect(res.status).toBe(200);
    expect(res.headers['x-audit-truncated']).toBe('false');
    const logged = await listed(admin.headers, '?action=audit.exported');
    expect(JSON.stringify(logged[0]?.after)).not.toContain('zzz-nobody');
  });
});

describe('the download alert window', () => {
  it('does not count downloads from before the window, and is raised once for a burst that spans two clock hours', async () => {
    const quiet = await as('case_manager');
    await t.db.auditEvent.createMany({
      data: Array.from({ length: DOWNLOAD_ALERT_LIMIT + 5 }, (_, i) => ({
        actorId: quiet.user.id,
        action: 'document.downloaded',
        entityType: 'Document',
        entityId: `old-${i}`,
        createdAt: new Date(Date.now() - 3 * 3_600_000),
      })),
    });
    await t.raw('GET', `/probe/access/documents/new-${next()}/download`, {
      headers: quiet.headers,
    });
    expect(await t.db.incident.count({ where: { description: { contains: quiet.user.id } } })).toBe(
      0,
    );

    const burst = await as('case_manager');
    await t.db.auditEvent.createMany({
      data: Array.from({ length: DOWNLOAD_ALERT_LIMIT }, (_, i) => ({
        actorId: burst.user.id,
        action: 'document.downloaded',
        entityType: 'Document',
        entityId: `recent-${i}`,
        createdAt: new Date(Date.now() - 10 * 60_000),
      })),
    });
    // Two downloads at the same moment: counted one after the other, so exactly one alert.
    await Promise.all(
      [0, 1].map(() =>
        t.raw('GET', `/probe/access/documents/burst-${next()}/download`, {
          headers: burst.headers,
        }),
      ),
    );
    expect(await t.db.incident.count({ where: { description: { contains: burst.user.id } } })).toBe(
      1,
    );
  });
});
