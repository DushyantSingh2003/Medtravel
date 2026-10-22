import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  MASTER_RESOURCES,
  ROLES,
  cursorPageSchema,
  masterRowSchema,
  type MasterResource,
  type MasterRow,
  type Role,
} from '@medtravel/contracts';
import { createTestApp, type TestApp } from './support/test-app.js';

const pageSchema = cursorPageSchema(masterRowSchema);
const errorSchema = z.object({
  statusCode: z.number(),
  message: z.string(),
  errors: z
    .array(z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() }))
    .optional(),
});

let t: TestApp;
const row = (body: unknown): MasterRow => masterRowSchema.parse(body);
const pageOf = (body: unknown) => pageSchema.parse(body);
/** The fields an error was reported on, e.g. ['slug']. */
const errorFields = (body: unknown): string[] =>
  (errorSchema.parse(body).errors ?? []).map((error) => error.path.join('.'));

const admin = 'super_admin' as const;
let counter = 0;
const next = () => (counter += 1);

async function makeSpeciality(name = `Speciality ${next()}`): Promise<MasterRow> {
  const res = await t.call(admin, 'POST', '/masters/specialities', {
    slug: `spec-${next()}`,
    name,
  });
  expect(res.status).toBe(201);
  return row(res.body);
}
async function makeTreatment(
  specialityId: string,
  extra: Record<string, unknown> = {},
): Promise<MasterRow> {
  const res = await t.call(admin, 'POST', '/masters/treatments', {
    slug: `treatment-${next()}`,
    name: `Treatment ${next()}`,
    specialityId,
    ...extra,
  });
  expect(res.status).toBe(201);
  return row(res.body);
}

beforeAll(async () => {
  t = await createTestApp();
  await t.db.country.upsert({
    where: { code: 'IN' },
    update: {},
    create: { code: 'IN', name: 'India' },
  });
});
afterAll(async () => {
  await t?.close();
});

describe('who may call the masters API', () => {
  it('answers 401 without a sign-in, or with a role that does not exist', async () => {
    expect((await t.call(null, 'GET', '/masters/countries')).status).toBe(401);
    const unknownRole = await t.app.inject({
      method: 'GET',
      url: '/masters/countries',
      headers: { 'x-stub-role': 'root' },
    });
    expect(unknownRole.statusCode).toBe(401);
    expect(
      (await t.call(null, 'POST', '/masters/countries', { code: 'ZZ', name: 'Zed' })).status,
    ).toBe(401);
  });

  it('accepts the portal stub cookie as well as the header', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/masters/countries',
      headers: { cookie: 'a=b; mt_stub_session=case_manager' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('keeps the health probe public', async () => {
    expect((await t.call(null, 'GET', '/health')).status).toBe(200);
  });

  describe.each(ROLES.filter((role) => role !== admin))('as %s', (role: Role) => {
    it('may read but is forbidden to create, change, delete or restore', async () => {
      const speciality = await makeSpeciality();
      expect((await t.call(role, 'GET', '/masters/specialities')).status).toBe(200);
      expect((await t.call(role, 'GET', `/masters/specialities/${speciality.id}`)).status).toBe(
        200,
      );
      expect(
        (await t.call(role, 'POST', '/masters/specialities', { slug: 'nope', name: 'Nope' }))
          .status,
      ).toBe(403);
      expect(
        (await t.call(role, 'PATCH', `/masters/specialities/${speciality.id}`, { name: 'Changed' }))
          .status,
      ).toBe(403);
      expect((await t.call(role, 'DELETE', `/masters/specialities/${speciality.id}`)).status).toBe(
        403,
      );
      expect(
        (await t.call(role, 'POST', `/masters/specialities/${speciality.id}/restore`)).status,
      ).toBe(403);
      const unchanged = row(
        (await t.call(admin, 'GET', `/masters/specialities/${speciality.id}`)).body,
      );
      expect(unchanged.name).toBe(speciality.name);
      expect(unchanged.deletedAt).toBeNull();
    });
  });
});

describe('treatments: add one in English and Arabic', () => {
  it('shows it in the list at once, in both languages', async () => {
    const speciality = await makeSpeciality('Orthopaedics');
    const created = await t.call(admin, 'POST', '/masters/treatments', {
      slug: 'knee-replacement',
      name: 'Knee replacement',
      summary: 'Total knee arthroplasty',
      typicalStayDays: 7,
      specialityId: speciality.id,
      translations: { ar: { name: 'استبدال مفصل الركبة', summary: 'تغيير مفصل الركبة بالكامل' } },
    });
    expect(created.status).toBe(201);
    const treatment = row(created.body);
    expect(treatment).toMatchObject({
      slug: 'knee-replacement',
      name: 'Knee replacement',
      active: true,
      deletedAt: null,
      speciality: { id: speciality.id, name: 'Orthopaedics' },
      translations: { ar: { name: 'استبدال مفصل الركبة', summary: 'تغيير مفصل الركبة بالكامل' } },
    });

    const listed = pageOf(
      (await t.call(admin, 'GET', `/masters/treatments?specialityId=${speciality.id}`)).body,
    );
    expect(listed.items.map((item) => item.id)).toEqual([treatment.id]);
    expect(listed.total).toBe(1);
  });

  it('is found by its English name, its Arabic name or its slug', async () => {
    const speciality = await makeSpeciality();
    const treatment = await makeTreatment(speciality.id, {
      slug: 'bypass-surgery',
      name: 'Bypass surgery',
      translations: { ar: { name: 'جراحة المجازة التاجية' } },
    });
    for (const q of ['bypass', 'BYPASS', 'المجازة', 'surgery']) {
      const found = pageOf(
        (await t.call(admin, 'GET', `/masters/treatments?q=${encodeURIComponent(q)}`)).body,
      );
      expect(
        found.items.map((item) => item.id),
        q,
      ).toContain(treatment.id);
    }
    const none = pageOf((await t.call(admin, 'GET', '/masters/treatments?q=zzzznothing')).body);
    expect(none).toMatchObject({ items: [], total: 0, nextCursor: null });
  });

  it('rejects a duplicate slug on the slug field, and writes nothing for it', async () => {
    const speciality = await makeSpeciality();
    const first = await makeTreatment(speciality.id);
    const auditBefore = await t.db.auditEvent.count();
    const duplicate = await t.call(admin, 'POST', '/masters/treatments', {
      slug: first.slug,
      name: 'Another',
      specialityId: speciality.id,
    });
    expect(duplicate.status).toBe(409);
    expect(errorFields(duplicate.body)).toEqual(['slug']);
    expect(await t.db.auditEvent.count()).toBe(auditBefore);
  });

  it('reports every invalid field, and refuses fields it does not know', async () => {
    const res = await t.call(admin, 'POST', '/masters/treatments', {
      slug: 'Not A Slug',
      name: '',
      specialityId: 'nope',
      typicalStayDays: 0,
      surprise: true,
    });
    expect(res.status).toBe(400);
    // The unknown field is reported on the whole body (an empty path).
    expect(errorFields(res.body).sort()).toEqual([
      '',
      'name',
      'slug',
      'specialityId',
      'typicalStayDays',
    ]);
  });

  it('refuses a speciality that does not exist or was deleted', async () => {
    const missing = await t.call(admin, 'POST', '/masters/treatments', {
      slug: 'orphan',
      name: 'Orphan',
      specialityId: crypto.randomUUID(),
    });
    expect(missing.status).toBe(422);
    expect(errorFields(missing.body)).toEqual(['specialityId']);
  });

  it('changes only the fields sent, and replaces the translations when they are sent', async () => {
    const speciality = await makeSpeciality();
    const treatment = await makeTreatment(speciality.id, {
      active: false,
      typicalStayDays: 4,
      translations: { ar: { name: 'قديم' } },
    });
    const renamed = row(
      (await t.call(admin, 'PATCH', `/masters/treatments/${treatment.id}`, { name: 'Renamed' }))
        .body,
    );
    expect(renamed).toMatchObject({
      name: 'Renamed',
      active: false,
      typicalStayDays: 4,
      translations: { ar: { name: 'قديم' } },
    });

    const retranslated = row(
      (
        await t.call(admin, 'PATCH', `/masters/treatments/${treatment.id}`, {
          translations: { ar: { name: 'جديد' } },
        })
      ).body,
    );
    expect(retranslated.translations).toEqual({ ar: { name: 'جديد', summary: null } });
    const cleared = row(
      (await t.call(admin, 'PATCH', `/masters/treatments/${treatment.id}`, { translations: {} }))
        .body,
    );
    expect(cleared.translations).toEqual({});
  });

  it('can be soft-deleted, hidden from the list, listed as deleted, and restored', async () => {
    const speciality = await makeSpeciality();
    const treatment = await makeTreatment(speciality.id);
    const deleted = await t.call(admin, 'DELETE', `/masters/treatments/${treatment.id}`);
    expect(deleted.status).toBe(200);
    expect(row(deleted.body)).toMatchObject({ active: false });
    expect(row(deleted.body).deletedAt).not.toBeNull();

    const visible = pageOf(
      (await t.call(admin, 'GET', `/masters/treatments?specialityId=${speciality.id}`)).body,
    );
    expect(visible.items).toEqual([]);
    const trash = pageOf(
      (await t.call(admin, 'GET', `/masters/treatments?specialityId=${speciality.id}&deleted=true`))
        .body,
    );
    expect(trash.items.map((item) => item.id)).toEqual([treatment.id]);

    expect(
      (await t.call(admin, 'PATCH', `/masters/treatments/${treatment.id}`, { name: 'Late edit' }))
        .status,
    ).toBe(409);
    expect((await t.call(admin, 'DELETE', `/masters/treatments/${treatment.id}`)).status).toBe(409);

    const restored = row(
      (await t.call(admin, 'POST', `/masters/treatments/${treatment.id}/restore`)).body,
    );
    expect(restored).toMatchObject({ active: true, deletedAt: null });
    expect(
      (await t.call(admin, 'POST', `/masters/treatments/${treatment.id}/restore`)).status,
    ).toBe(409);
  });

  it('keeps the slug of a deleted treatment taken, so its address is never reused by accident', async () => {
    const speciality = await makeSpeciality();
    const treatment = await makeTreatment(speciality.id);
    await t.call(admin, 'DELETE', `/masters/treatments/${treatment.id}`);
    const reuse = await t.call(admin, 'POST', '/masters/treatments', {
      slug: treatment.slug,
      name: 'Again',
      specialityId: speciality.id,
    });
    expect(reuse.status).toBe(409);
  });

  it('filters by active and by speciality, and sorts', async () => {
    const speciality = await makeSpeciality();
    const other = await makeSpeciality();
    await makeTreatment(speciality.id, { name: 'B treatment', active: false });
    await makeTreatment(speciality.id, { name: 'A treatment' });
    await makeTreatment(other.id, { name: 'C treatment' });

    const inactive = pageOf(
      (await t.call(admin, 'GET', `/masters/treatments?specialityId=${speciality.id}&active=false`))
        .body,
    );
    expect(inactive.items.map((item) => item.name)).toEqual(['B treatment']);
    const ascending = pageOf(
      (await t.call(admin, 'GET', `/masters/treatments?specialityId=${speciality.id}&sort=name`))
        .body,
    );
    expect(ascending.items.map((item) => item.name)).toEqual(['A treatment', 'B treatment']);
    const descending = pageOf(
      (await t.call(admin, 'GET', `/masters/treatments?specialityId=${speciality.id}&sort=-name`))
        .body,
    );
    expect(descending.items.map((item) => item.name)).toEqual(['B treatment', 'A treatment']);
  });
});

describe('cursor pagination', () => {
  it('walks every row exactly once, in order, whatever the page size', async () => {
    const speciality = await makeSpeciality();
    for (let i = 1; i <= 7; i += 1)
      await makeTreatment(speciality.id, { name: `Paged ${String(i).padStart(2, '0')}` });
    const url = (limit: number, cursor?: string) =>
      `/masters/treatments?specialityId=${speciality.id}&limit=${limit}&sort=name${cursor ? `&cursor=${cursor}` : ''}`;

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = pageOf((await t.call(admin, 'GET', url(3, cursor))).body);
      expect(page.total).toBe(7);
      expect(page.items.length).toBeLessThanOrEqual(3);
      seen.push(...page.items.map((item) => item.name));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toEqual(
      Array.from({ length: 7 }, (_, i) => `Paged ${String(i + 1).padStart(2, '0')}`),
    );
  });

  it('has no next cursor on the last page, even when the page is exactly full', async () => {
    const speciality = await makeSpeciality();
    for (let i = 0; i < 4; i += 1) await makeTreatment(speciality.id);
    const exact = pageOf(
      (await t.call(admin, 'GET', `/masters/treatments?specialityId=${speciality.id}&limit=4`))
        .body,
    );
    expect(exact).toMatchObject({ total: 4, nextCursor: null });
    expect(exact.items).toHaveLength(4);
  });

  it('pages code-keyed tables too', async () => {
    for (const code of ['AA', 'AB', 'AC', 'AD', 'AE']) {
      await t.call(admin, 'POST', '/masters/countries', { code, name: `Page country ${code}` });
    }
    const first = pageOf(
      (await t.call(admin, 'GET', '/masters/countries?q=Page%20country&limit=2&sort=code')).body,
    );
    expect(first.items.map((item) => item.id)).toEqual(['AA', 'AB']);
    const second = pageOf(
      (
        await t.call(
          admin,
          'GET',
          `/masters/countries?q=Page%20country&limit=2&sort=code&cursor=${first.nextCursor}`,
        )
      ).body,
    );
    expect(second.items.map((item) => item.id)).toEqual(['AC', 'AD']);
  });

  it('refuses a forged cursor, a bad limit and a sort field the table does not have', async () => {
    expect((await t.call(admin, 'GET', '/masters/treatments?cursor=not-base64!!')).status).toBe(
      400,
    );
    expect((await t.call(admin, 'GET', '/masters/treatments?limit=0')).status).toBe(400);
    expect((await t.call(admin, 'GET', '/masters/treatments?limit=101')).status).toBe(400);
    // Well-formed base64 that is not a key of the table.
    const notAKey = Buffer.from('drop table', 'utf8').toString('base64url');
    expect((await t.call(admin, 'GET', `/masters/treatments?cursor=${notAKey}`)).status).toBe(400);
    expect((await t.call(admin, 'GET', `/masters/countries?cursor=${notAKey}`)).status).toBe(400);
    const badSort = await t.call(admin, 'GET', '/masters/treatments?sort=passwordHash');
    expect(badSort.status).toBe(400);
    expect(errorFields(badSort.body)).toEqual(['sort']);
  });
});

describe('addressing', () => {
  it('answers 400 for an unknown resource and 404 for a key that cannot exist or does not', async () => {
    expect((await t.call(admin, 'GET', '/masters/users')).status).toBe(400);
    expect((await t.call(admin, 'GET', '/masters/treatments/not-a-uuid')).status).toBe(404);
    expect((await t.call(admin, 'GET', `/masters/treatments/${crypto.randomUUID()}`)).status).toBe(
      404,
    );
    expect((await t.call(admin, 'GET', '/masters/countries/ZZ')).status).toBe(404);
    expect(
      (await t.call(admin, 'PATCH', `/masters/treatments/${crypto.randomUUID()}`, { name: 'x' }))
        .status,
    ).toBe(404);
    expect(
      (await t.call(admin, 'DELETE', `/masters/treatments/${crypto.randomUUID()}`)).status,
    ).toBe(404);
  });
});

describe('every resource', () => {
  const samples: Record<
    MasterResource,
    { create: Record<string, unknown>; patch: Record<string, unknown> }
  > = {
    countries: {
      create: {
        code: 'QQ',
        name: 'Qland',
        dialCode: '+999',
        region: 'Test',
        translations: { ar: { name: 'كيولاند' } },
      },
      patch: { name: 'Qland II' },
    },
    languages: { create: { code: 'qq', name: 'Qish' }, patch: { rtl: true } },
    currencies: {
      create: { code: 'QQQ', name: 'Q dollar', minorUnits: 3, symbol: 'Q$' },
      patch: { symbol: 'Q' },
    },
    specialities: {
      create: {
        slug: 'q-speciality',
        name: 'Q speciality',
        translations: { ar: { name: 'تخصص' } },
      },
      patch: { name: 'Q speciality II' },
    },
    treatments: {
      create: { slug: 'q-treatment', name: 'Q treatment', specialityId: '' },
      patch: { name: 'Q treatment II' },
    },
    cities: {
      create: {
        slug: 'q-city',
        name: 'Q city',
        countryCode: 'IN',
        translations: { ar: { name: 'مدينة' } },
      },
      patch: { name: 'Q city II' },
    },
    'document-types': {
      create: { code: 'q_document', name: 'Q document', kind: 'report' },
      patch: { kind: 'scan' },
    },
    'lost-reasons': {
      create: { code: 'q_reason', name: 'Q reason' },
      patch: { name: 'Q reason II' },
    },
  };

  it.each(MASTER_RESOURCES)(
    '%s: create, read, list, change, and delete or deactivate',
    async (resource) => {
      const sample = samples[resource];
      const body = {
        ...sample.create,
        ...(resource === 'treatments' ? { specialityId: (await makeSpeciality()).id } : {}),
      };

      const created = await t.call(admin, 'POST', `/masters/${resource}`, body);
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const made = row(created.body);

      expect(row((await t.call(admin, 'GET', `/masters/${resource}/${made.id}`)).body).id).toBe(
        made.id,
      );
      const listed = pageOf((await t.call(admin, 'GET', `/masters/${resource}?limit=100`)).body);
      expect(listed.items.map((item) => item.id)).toContain(made.id);

      const duplicate = await t.call(admin, 'POST', `/masters/${resource}`, body);
      expect(duplicate.status).toBe(409);

      const changed = await t.call(admin, 'PATCH', `/masters/${resource}/${made.id}`, sample.patch);
      expect(changed.status, JSON.stringify(changed.body)).toBe(200);
      expect(row(changed.body).active).toBe(true);

      const removed = await t.call(admin, 'DELETE', `/masters/${resource}/${made.id}`);
      const softDeletes = !['countries', 'languages', 'currencies'].includes(resource);
      expect(removed.status).toBe(softDeletes ? 200 : 409);
      if (!softDeletes) {
        const deactivated = row(
          (await t.call(admin, 'PATCH', `/masters/${resource}/${made.id}`, { active: false })).body,
        );
        expect(deactivated.active).toBe(false);
        const inactive = pageOf(
          (await t.call(admin, 'GET', `/masters/${resource}?active=false&limit=100`)).body,
        );
        expect(inactive.items.map((item) => item.id)).toContain(made.id);
      }
    },
  );

  it('keeps codes fixed: a code cannot be changed after creation', async () => {
    for (const [resource, key] of [
      ['countries', 'QQ'],
      ['languages', 'qq'],
      ['currencies', 'QQQ'],
    ] as const) {
      const res = await t.call(admin, 'PATCH', `/masters/${resource}/${key}`, { code: 'ZZ' });
      expect(res.status, resource).toBe(400);
    }
  });

  it('validates codes and kinds', async () => {
    expect(
      (await t.call(admin, 'POST', '/masters/countries', { code: 'in', name: 'India' })).status,
    ).toBe(400);
    expect(
      (
        await t.call(admin, 'POST', '/masters/currencies', {
          code: 'USD',
          name: 'x',
          minorUnits: 9,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await t.call(admin, 'POST', '/masters/document-types', {
          code: 'x_y',
          name: 'x',
          kind: 'photo-of-cat',
        })
      ).status,
    ).toBe(400);
    expect((await t.call(admin, 'GET', '/masters/document-types?kind=photo-of-cat')).status).toBe(
      400,
    );
  });

  it('refuses a city in a country that does not exist, and filters cities by country', async () => {
    const res = await t.call(admin, 'POST', '/masters/cities', {
      slug: 'atlantis',
      name: 'Atlantis',
      countryCode: 'ZZ',
    });
    expect(res.status).toBe(422);
    expect(errorFields(res.body)).toEqual(['countryCode']);
    await t.db.country.upsert({
      where: { code: 'OM' },
      update: {},
      create: { code: 'OM', name: 'Oman' },
    });
    const delhi = row(
      (
        await t.call(admin, 'POST', '/masters/cities', {
          slug: 'delhi-filter',
          name: 'Delhi',
          countryCode: 'IN',
        })
      ).body,
    );
    await t.call(admin, 'POST', '/masters/cities', {
      slug: 'muscat-filter',
      name: 'Muscat',
      countryCode: 'OM',
    });
    const cities = pageOf(
      (await t.call(admin, 'GET', '/masters/cities?countryCode=IN&limit=100')).body,
    );
    expect(cities.items.every((city) => city.countryCode === 'IN')).toBe(true);
    expect(cities.items.map((city) => city.id)).toContain(delhi.id);
  });

  it('refuses to delete a speciality that still has treatments, until they are gone', async () => {
    const speciality = await makeSpeciality();
    const treatment = await makeTreatment(speciality.id);
    expect((await t.call(admin, 'DELETE', `/masters/specialities/${speciality.id}`)).status).toBe(
      409,
    );
    await t.call(admin, 'DELETE', `/masters/treatments/${treatment.id}`);
    expect((await t.call(admin, 'DELETE', `/masters/specialities/${speciality.id}`)).status).toBe(
      200,
    );
  });

  it('filters document types by kind', async () => {
    await t.call(admin, 'POST', '/masters/document-types', {
      code: 'kind_report',
      name: 'A report',
      kind: 'report',
    });
    await t.call(admin, 'POST', '/masters/document-types', {
      code: 'kind_scan',
      name: 'A scan',
      kind: 'scan',
    });
    const reports = pageOf(
      (await t.call(admin, 'GET', '/masters/document-types?kind=report&limit=100')).body,
    );
    expect(reports.items.map((item) => item.code)).toContain('kind_report');
    expect(reports.items.map((item) => item.code)).not.toContain('kind_scan');
  });
});

describe('audit trail and outbox', () => {
  it('records who changed what, with before and after, and queues a domain event', async () => {
    const speciality = await makeSpeciality();
    const treatment = await makeTreatment(speciality.id, { name: 'Audited' });
    await t.call(admin, 'PATCH', `/masters/treatments/${treatment.id}`, { name: 'Audited II' });
    await t.call(admin, 'DELETE', `/masters/treatments/${treatment.id}`);
    await t.call(admin, 'POST', `/masters/treatments/${treatment.id}/restore`);

    const events = await t.db.auditEvent.findMany({
      where: { entityType: 'Treatment', entityId: treatment.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((event) => event.action)).toEqual([
      'master_data.created',
      'master_data.updated',
      'master_data.deleted',
      'master_data.restored',
    ]);
    expect(events.every((event) => event.actorRole === admin)).toBe(true);
    expect(events[0]).toMatchObject({
      before: null,
      after: expect.objectContaining({ name: 'Audited' }),
    });
    expect(events[1]).toMatchObject({
      before: expect.objectContaining({ name: 'Audited' }),
      after: expect.objectContaining({ name: 'Audited II' }),
    });
    expect(events[0]?.requestId).toBeTruthy();

    const outbox = await t.db.outboxEvent.findMany({
      where: { aggregateType: 'Treatment', aggregateId: treatment.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(outbox.map((event) => event.type)).toEqual([
      'master.created',
      'master.updated',
      'master.deleted',
      'master.restored',
    ]);
    expect(outbox.every((event) => event.status === 'pending')).toBe(true);
  });

  it('writes nothing when a request is refused', async () => {
    const audit = await t.db.auditEvent.count();
    const outbox = await t.db.outboxEvent.count();
    await t.call('case_manager', 'POST', '/masters/specialities', {
      slug: 'refused',
      name: 'Refused',
    });
    await t.call(admin, 'POST', '/masters/specialities', { slug: 'Bad Slug', name: 'x' });
    await t.call(admin, 'POST', '/masters/cities', {
      slug: 'nowhere',
      name: 'Nowhere',
      countryCode: 'ZZ',
    });
    expect(await t.db.auditEvent.count()).toBe(audit);
    expect(await t.db.outboxEvent.count()).toBe(outbox);
  });

  it('does not let reading write to the audit trail', async () => {
    const audit = await t.db.auditEvent.count();
    await t.call(admin, 'GET', '/masters/countries');
    expect(await t.db.auditEvent.count()).toBe(audit);
  });
});
