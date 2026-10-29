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
        before: { note: '=HYPERLINK("http://evil")' },
        after: { note: 'has "quotes", commas\nand lines' },
      },
    );
    const res = await t.raw('GET', `/audit/export?entityId=${entityId}`, {
      headers: admin.headers,
    });
    expect(res.status).toBe(200);
    const text = typeof res.body === 'string' ? res.body : '';
    const lines = text.split('\r\n');
    expect(lines[0]).toBe(
      'time,actor,email,role,action,entityType,entityId,patientId,ip,requestId,before,after',
    );
    expect(text).toContain(`thing.updated,Thing,${entityId}`);
    expect(text).toContain('"{""note"":""=HYPERLINK');
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
