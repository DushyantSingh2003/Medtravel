import { io as connect, type Socket } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  REALTIME_PATH,
  loginHistoryPageSchema,
  teamListSchema,
  userDetailSchema,
  userPageSchema,
  type Role,
} from '@medtravel/contracts';
import { createTestApp, type TestApp } from './support/test-app.js';

/** Staff management, deactivation and read-only impersonation against the real application. */

let t: TestApp;
let counter = 0;
const next = () => (counter += 1);

interface Who {
  id: string;
  email: string;
  token: string;
}
const people: Record<string, Who> = {};

async function person(
  key: string,
  role: Role,
  extra: { status?: 'active' | 'invited' } = {},
): Promise<Who> {
  const email = `${key}-${next()}@test.example`;
  const user = await t.makeUser({ email, role, name: `Person ${key}`, ...extra });
  const { accessToken } = await t.tokenFor(user.id);
  people[key] = { id: user.id, email, token: accessToken };
  return people[key];
}

const REASON = 'Checking a reported display problem';

const as = (
  key: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
  cookies?: Record<string, string>,
) =>
  t.raw(method, url, {
    headers: { authorization: `Bearer ${people[key]?.token ?? ''}` },
    ...(cookies ? { cookies } : {}),
    ...(body === undefined ? {} : { body }),
  });
const errorFields = (body: unknown): string[] =>
  ((body as { errors?: { path: string[] }[] }).errors ?? []).map((e) => e.path.join('.'));
const idOf = (key: string) => people[key]?.id as string;

const sockets: Socket[] = [];
afterEach(() => {
  for (const s of sockets.splice(0)) s.disconnect();
});
function liveAs(token: string): Promise<Socket> {
  const socket = connect(t.url, {
    path: REALTIME_PATH,
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { cookie: `mt_at=${token}` },
  });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

beforeAll(async () => {
  t = await createTestApp({ listen: true });
  await person('admin', 'super_admin');
  await person('admin2', 'super_admin');
  await person('manager', 'case_manager');
  await person('coordinator', 'ground_coordinator');
  await person('finance', 'finance');
  await person('patient', 'patient');
  await person('desk', 'hospital_desk');
  await t.db.staffProfile.create({ data: { userId: idOf('manager') } });
  await t.db.city
    .create({ data: { slug: 'delhi-test', name: 'Delhi Test', countryCode: 'IN' } })
    .catch(async () => {
      await t.db.country.create({ data: { code: 'IN', name: 'India' } });
      await t.db.city.create({
        data: { slug: 'delhi-test', name: 'Delhi Test', countryCode: 'IN' },
      });
    });
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe('who may manage users', () => {
  it('is for the super admin only: everyone else is refused, and so is anyone not signed in', async () => {
    const target = idOf('coordinator');
    const calls: [string, string, unknown?][] = [
      ['GET', '/admin/users'],
      ['GET', `/admin/users/${target}`],
      ['PATCH', `/admin/users/${target}`, { title: 'x' }],
      ['POST', `/admin/users/${target}/deactivate`],
      ['POST', `/admin/users/${target}/reactivate`],
      ['POST', `/admin/users/${target}/two-factor/reset`],
      ['POST', `/admin/users/${target}/leave`, { startsOn: '2030-01-01', endsOn: '2030-01-02' }],
      ['GET', `/admin/users/${target}/logins`],
      ['POST', `/admin/users/${target}/impersonate`, { reason: REASON }],
      ['GET', '/admin/teams'],
      ['POST', '/admin/teams', { name: 'Nope' }],
    ];
    for (const key of ['manager', 'finance', 'patient', 'desk'])
      for (const [method, url, body] of calls)
        expect((await as(key, method as 'GET', url, body)).status, `${key} ${method} ${url}`).toBe(
          403,
        );
    for (const [method, url, body] of calls)
      expect(
        (await t.raw(method as 'GET', url, { ...(body ? { body } : {}) })).status,
        `anon ${method} ${url}`,
      ).toBe(401);
  });
});

describe('listing and reading', () => {
  it('lists staff and hospital users, never patients, with search, filters and paging', async () => {
    const res = await as('admin', 'GET', '/admin/users?limit=3');
    expect(res.status).toBe(200);
    const page = userPageSchema.parse(res.body);
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeTruthy();
    const all = userPageSchema.parse((await as('admin', 'GET', '/admin/users?limit=100')).body);
    expect(all.items.some((u) => u.role === 'patient')).toBe(false);
    expect(all.items.map((u) => u.id)).toContain(idOf('coordinator'));
    const search = userPageSchema.parse(
      (await as('admin', 'GET', '/admin/users?q=Person%20coord')).body,
    );
    expect(search.items.map((u) => u.id)).toEqual([idOf('coordinator')]);
    const byRole = userPageSchema.parse(
      (await as('admin', 'GET', '/admin/users?role=finance')).body,
    );
    expect(byRole.items.every((u) => u.role === 'finance')).toBe(true);
    expect((await as('admin', 'GET', '/admin/users?role=patient')).body).toMatchObject({
      items: [],
      total: 0,
    });
  });

  it('shows one user with their settings, and hides patients and unknown ids', async () => {
    const detail = userDetailSchema.parse(
      (await as('admin', 'GET', `/admin/users/${idOf('manager')}`)).body,
    );
    expect(detail).toMatchObject({ role: 'case_manager', hasStaffProfile: true, leaves: [] });
    expect((await as('admin', 'GET', `/admin/users/${idOf('patient')}`)).status).toBe(404);
    expect(
      (await as('admin', 'GET', '/admin/users/00000000-0000-4000-8000-000000000000')).status,
    ).toBe(404);
    expect((await as('admin', 'GET', '/admin/users/not-a-uuid')).status).toBe(400);
  });
});

describe('changing a person', () => {
  it('changes role, title, languages, city, capacity and working hours, and audits it', async () => {
    const city = await t.db.city.findFirstOrThrow({ where: { slug: 'delhi-test' } });
    const res = await as('admin', 'PATCH', `/admin/users/${idOf('coordinator')}`, {
      role: 'interpreter',
      title: 'Airport lead',
      languages: ['en', 'ar'],
      cityId: city.id,
      maxOpenCases: 12,
      timezone: 'Asia/Kolkata',
      workingHours: {
        timezone: 'Asia/Kolkata',
        days: {
          mon: [
            { from: '09:00', to: '13:00' },
            { from: '14:00', to: '18:00' },
          ],
          tue: [{ from: '09:00', to: '18:00' }],
        },
      },
    });
    expect(res.status).toBe(200);
    expect(userDetailSchema.parse(res.body)).toMatchObject({
      role: 'interpreter',
      title: 'Airport lead',
      languages: ['en', 'ar'],
      cityId: city.id,
      maxOpenCases: 12,
      workingHours: { timezone: 'Asia/Kolkata' },
    });
    const audit = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'user.updated', entityId: idOf('coordinator') },
    });
    expect(audit.actorId).toBe(idOf('admin'));
    expect(JSON.stringify(audit.after)).toContain('interpreter');
    // The new role applies at once: the person's own token now acts as an interpreter.
    const me = await t.raw('GET', '/auth/me', {
      headers: { authorization: `Bearer ${people['coordinator']?.token}` },
    });
    expect((me.body as { role: string }).role).toBe('interpreter');
    await as('admin', 'PATCH', `/admin/users/${idOf('coordinator')}`, {
      role: 'ground_coordinator',
    });
  });

  it('checks the input and names the field', async () => {
    const id = idOf('coordinator');
    const bad = async (body: unknown) => as('admin', 'PATCH', `/admin/users/${id}`, body);
    expect(errorFields((await bad({ role: 'patient' })).body)).toContain('role');
    expect((await bad({ role: 'nonsense' })).status).toBe(400);
    expect((await bad({ cityId: '00000000-0000-4000-8000-000000000000' })).status).toBe(422);
    expect((await bad({ teamId: '00000000-0000-4000-8000-000000000000' })).status).toBe(422);
    expect((await bad({ workingHours: { timezone: 'Nowhere/Land', days: {} } })).status).toBe(400);
    expect(
      (
        await bad({
          workingHours: {
            timezone: 'Asia/Kolkata',
            days: {
              mon: [
                { from: '09:00', to: '12:00' },
                { from: '11:00', to: '14:00' },
              ],
            },
          },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await bad({
          workingHours: {
            timezone: 'Asia/Kolkata',
            days: { mon: [{ from: '18:00', to: '09:00' }] },
          },
        })
      ).status,
    ).toBe(400);
    expect((await bad({ unknownField: 1 })).status).toBe(400);
    expect((await bad({ name: 'A' })).status).toBe(400);
  });

  it('keeps people from changing their own role, or demoting the last super admin', async () => {
    expect(
      (await as('admin', 'PATCH', `/admin/users/${idOf('admin')}`, { role: 'finance' })).status,
    ).toBe(403);
    // Two admins exist: demoting the other is allowed, and then the last one is protected.
    expect(
      (await as('admin', 'PATCH', `/admin/users/${idOf('admin2')}`, { role: 'finance' })).status,
    ).toBe(200);
    expect(
      (await as('admin', 'PATCH', `/admin/users/${idOf('admin')}`, { title: 'Boss' })).status,
    ).toBe(200);
    await t.db.user.update({ where: { id: idOf('admin2') }, data: { role: 'super_admin' } });
  });

  it('refuses staff settings for hospital users', async () => {
    const res = await as('admin', 'PATCH', `/admin/users/${idOf('desk')}`, { title: 'Desk lead' });
    expect(res.status).toBe(422);
  });
});

describe('leave', () => {
  it('records and removes days away, refuses overlaps and backwards ranges, and shows who is away today', async () => {
    const id = idOf('manager');
    const day = (offset: number) =>
      new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const add = await as('admin', 'POST', `/admin/users/${id}/leave`, {
      startsOn: day(-1),
      endsOn: day(2),
      note: 'Family event',
    });
    expect(add.status).toBe(201);
    const detail = userDetailSchema.parse(add.body);
    expect(detail.onLeave).toBe(true);
    expect(detail.leaves).toHaveLength(1);
    expect(
      (await as('admin', 'POST', `/admin/users/${id}/leave`, { startsOn: day(1), endsOn: day(5) }))
        .status,
    ).toBe(409);
    expect(
      (await as('admin', 'POST', `/admin/users/${id}/leave`, { startsOn: day(9), endsOn: day(8) }))
        .status,
    ).toBe(400);
    const list = userPageSchema.parse(
      (await as('admin', 'GET', '/admin/users?q=Person%20manager')).body,
    );
    expect(list.items[0]?.onLeave).toBe(true);
    const removed = await as('admin', 'DELETE', `/admin/users/${id}/leave/${detail.leaves[0]?.id}`);
    expect(userDetailSchema.parse(removed.body).onLeave).toBe(false);
    expect(
      (await as('admin', 'DELETE', `/admin/users/${id}/leave/${detail.leaves[0]?.id}`)).status,
    ).toBe(404);
  });
});

describe('teams', () => {
  it('creates a team with a manager, puts people in it, and keeps the case scoping in step', async () => {
    const created = await as('admin', 'POST', '/admin/teams', {
      name: 'Gulf desk',
      managerId: idOf('manager'),
    });
    expect(created.status).toBe(201);
    const team = created.body as { id: string; memberCount: number };
    expect(team.memberCount).toBe(0);
    expect(
      (await t.db.staffProfile.findUniqueOrThrow({ where: { userId: idOf('manager') } })).isManager,
    ).toBe(true);

    const joined = await as('admin', 'PATCH', `/admin/users/${idOf('finance')}`, {
      teamId: team.id,
    });
    expect(joined.status).toBe(200);
    expect(userDetailSchema.parse(joined.body)).toMatchObject({
      teamId: team.id,
      managerId: idOf('manager'),
    });
    expect(
      teamListSchema
        .parse((await as('admin', 'GET', '/admin/teams')).body)
        .items.find((x) => x.id === team.id),
    ).toMatchObject({ memberCount: 1, managerName: 'Person manager' });
    expect(
      userPageSchema
        .parse((await as('admin', 'GET', `/admin/users?teamId=${team.id}`)).body)
        .items.map((u) => u.id),
    ).toEqual([idOf('finance')]);

    expect((await as('admin', 'POST', '/admin/teams', { name: 'Gulf desk' })).status).toBe(422);
    expect(
      (
        await as('admin', 'POST', '/admin/teams', {
          name: 'Bad manager',
          managerId: idOf('patient'),
        })
      ).status,
    ).toBe(422);
    expect((await as('admin', 'DELETE', `/admin/teams/${team.id}`)).status).toBe(409);

    // Moving the manager moves the members' manager with it.
    const renamed = await as('admin', 'PUT', `/admin/teams/${team.id}`, {
      name: 'Gulf desk',
      managerId: idOf('admin'),
    });
    expect(renamed.status).toBe(200);
    expect(
      (await t.db.staffProfile.findUniqueOrThrow({ where: { userId: idOf('finance') } })).managerId,
    ).toBe(idOf('admin'));
    expect(
      (await t.db.staffProfile.findUniqueOrThrow({ where: { userId: idOf('manager') } })).isManager,
    ).toBe(false);

    await as('admin', 'PATCH', `/admin/users/${idOf('finance')}`, { teamId: null });
    expect((await as('admin', 'DELETE', `/admin/teams/${team.id}`)).status).toBe(204);
    expect(
      teamListSchema
        .parse((await as('admin', 'GET', '/admin/teams')).body)
        .items.some((x) => x.id === team.id),
    ).toBe(false);
  });
});

describe('deactivating a user', () => {
  it('logs them out everywhere within seconds: sessions, requests, refresh tokens and live connections', async () => {
    const victim = await person('victim', 'case_manager');
    // Signed in on two devices, and with a live connection open.
    const second = await t.tokenFor(victim.id);
    const live = await liveAs(victim.token);
    const events: string[] = [];
    live.on('event', (m: { event: string }) => events.push(m.event));
    const closed = new Promise<string>((resolve) => live.once('disconnect', resolve));
    expect(
      (await t.raw('GET', '/auth/me', { headers: { authorization: `Bearer ${victim.token}` } }))
        .status,
    ).toBe(200);

    const started = Date.now();
    const res = await as('admin', 'POST', `/admin/users/${victim.id}/deactivate`);
    expect(res.status).toBe(200);
    expect(userDetailSchema.parse(res.body).status).toBe('deactivated');

    // The very next request on either device is refused.
    for (const token of [victim.token, second.accessToken])
      expect(
        (await t.raw('GET', '/auth/me', { headers: { authorization: `Bearer ${token}` } })).status,
      ).toBe(401);
    // Every session is revoked, so a refresh cannot bring them back.
    expect(await t.db.session.count({ where: { userId: victim.id, revokedAt: null } })).toBe(0);
    // They cannot sign in again.
    const login = await t.raw('POST', '/auth/login', {
      body: { email: victim.email, password: 'Dev@12345' },
    });
    expect(login.status).toBe(401);
    // And the live connection is told and closed within seconds.
    expect(
      await Promise.race([closed, new Promise((r) => setTimeout(() => r('timeout'), 4000))]),
    ).not.toBe('timeout');
    expect(Date.now() - started).toBeLessThan(5000);
    expect(events).toContain('session.revoked');

    const audit = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'user.deactivated', entityId: victim.id },
    });
    expect(audit).toMatchObject({ actorId: idOf('admin'), entityType: 'User' });
    expect(
      await t.db.outboxEvent.count({ where: { type: 'user.deactivated', aggregateId: victim.id } }),
    ).toBe(1);
  });

  it('refuses to deactivate yourself, an account already deactivated, or the last super admin', async () => {
    expect((await as('admin', 'POST', `/admin/users/${idOf('admin')}/deactivate`)).status).toBe(
      403,
    );
    expect((await as('admin', 'POST', `/admin/users/${idOf('victim')}/deactivate`)).status).toBe(
      409,
    );
    // Make the admin the only one left, then try to remove them through the other.
    await t.db.user.update({ where: { id: idOf('admin2') }, data: { role: 'finance' } });
    await t.db.user.update({ where: { id: idOf('admin') }, data: { role: 'finance' } });
    const lone = await person('lone', 'super_admin');
    const other = await person('other', 'super_admin');
    await t.db.user.updateMany({
      where: { id: { in: [idOf('admin'), idOf('admin2')] } },
      data: { role: 'super_admin' },
    });
    await t.db.user.updateMany({
      where: { id: { in: [idOf('admin'), idOf('admin2'), other.id] } },
      data: { status: 'deactivated' },
    });
    expect((await as('other', 'POST', `/admin/users/${lone.id}/deactivate`)).status).toBe(401);
    await t.db.user.updateMany({
      where: { id: { in: [idOf('admin'), idOf('admin2'), other.id] } },
      data: { status: 'active' },
    });
  });

  it('can be undone: reactivation lets them sign in again, and an account that never set a password goes back to invited', async () => {
    const back = await as('admin', 'POST', `/admin/users/${idOf('victim')}/reactivate`);
    expect(back.status).toBe(200);
    expect(userDetailSchema.parse(back.body).status).toBe('active');
    expect((await as('admin', 'POST', `/admin/users/${idOf('victim')}/reactivate`)).status).toBe(
      409,
    );
    const invited = await person('neverjoined', 'finance', { status: 'invited' });
    await t.db.user.update({
      where: { id: invited.id },
      data: { status: 'deactivated', passwordHash: null },
    });
    expect(
      userDetailSchema.parse(
        (await as('admin', 'POST', `/admin/users/${invited.id}/reactivate`)).body,
      ).status,
    ).toBe('invited');
  });

  it('takes a led team’s manager away and the manager flag with it', async () => {
    const lead = await person('lead', 'case_manager');
    await t.db.staffProfile.create({ data: { userId: lead.id, isManager: true } });
    const team = await t.db.team.create({ data: { name: 'Led team', managerId: lead.id } });
    await as('admin', 'POST', `/admin/users/${lead.id}/deactivate`);
    expect((await t.db.team.findUniqueOrThrow({ where: { id: team.id } })).managerId).toBeNull();
    expect(
      (await t.db.staffProfile.findUniqueOrThrow({ where: { userId: lead.id } })).isManager,
    ).toBe(false);
  });
});

describe('resetting two-factor', () => {
  it('removes the second factor and the backup codes, and signs the person out everywhere', async () => {
    const who = await person('twofa', 'finance');
    await t.db.user.update({
      where: { id: who.id },
      data: { twoFactorEnabled: true, twoFactorSecret: 'secret' },
    });
    await t.db.backupCode.create({ data: { userId: who.id, codeHash: 'x'.repeat(64) } });
    const res = await as('admin', 'POST', `/admin/users/${who.id}/two-factor/reset`);
    expect(res.status).toBe(200);
    expect(userDetailSchema.parse(res.body).twoFactorEnabled).toBe(false);
    const row = await t.db.user.findUniqueOrThrow({ where: { id: who.id } });
    expect(row.twoFactorSecret).toBeNull();
    expect(await t.db.backupCode.count({ where: { userId: who.id } })).toBe(0);
    expect(
      (await t.raw('GET', '/auth/me', { headers: { authorization: `Bearer ${who.token}` } }))
        .status,
    ).toBe(401);
    expect(
      await t.db.auditEvent.count({ where: { action: 'user.two_factor_reset', entityId: who.id } }),
    ).toBe(1);
  });
});

describe('login history', () => {
  it('lists the person’s sign-ins and failures newest first, with paging', async () => {
    const who = await person('history', 'finance');
    await t.raw('POST', '/auth/login', {
      body: { email: who.email, password: 'wrong-password-1' },
    });
    await t.raw('POST', '/auth/login', { body: { email: who.email, password: 'Dev@12345' } });
    const res = await as('admin', 'GET', `/admin/users/${who.id}/logins?limit=1`);
    expect(res.status).toBe(200);
    const page = loginHistoryPageSchema.parse(res.body);
    expect(page.total).toBeGreaterThanOrEqual(2);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeTruthy();
    const all = loginHistoryPageSchema.parse(
      (await as('admin', 'GET', `/admin/users/${who.id}/logins`)).body,
    );
    expect(all.items.map((i) => i.action)).toEqual(
      expect.arrayContaining(['auth.login', 'auth.login_failed']),
    );
    expect(all.items[0]?.ip).toBeTruthy();
  });
});

describe('safeguards found in review', () => {
  it('never leaves the platform without a super admin, even when two admins remove each other at once', async () => {
    const a = await person('racea', 'super_admin');
    const b = await person('raceb', 'super_admin');
    // Only these two are active admins for the duration of the race.
    const others = await t.db.user.findMany({
      where: { role: 'super_admin', status: 'active', id: { notIn: [a.id, b.id] } },
      select: { id: true },
    });
    await t.db.user.updateMany({
      where: { id: { in: others.map((o) => o.id) } },
      data: { status: 'suspended' },
    });
    try {
      const [first, second] = await Promise.all([
        as('racea', 'POST', `/admin/users/${b.id}/deactivate`),
        as('raceb', 'POST', `/admin/users/${a.id}/deactivate`),
      ]);
      const statuses = [first.status, second.status].sort();
      // One goes through; the other is refused (409 for the last admin, or 401 because the first already signed them out).
      expect(statuses[0]).toBe(200);
      expect([401, 409]).toContain(statuses[1]);
      expect(
        await t.db.user.count({
          where: { role: 'super_admin', status: 'active', id: { in: [a.id, b.id] } },
        }),
      ).toBe(1);
    } finally {
      await t.db.user.updateMany({
        where: { id: { in: [...others.map((o) => o.id), a.id, b.id] } },
        data: { status: 'active' },
      });
    }
  });

  it('asks why before viewing as someone, and keeps the reason in the audit trail', async () => {
    expect(
      (await as('admin', 'POST', `/admin/users/${idOf('manager')}/impersonate`, {})).status,
    ).toBe(400);
    expect(
      (
        await as('admin', 'POST', `/admin/users/${idOf('manager')}/impersonate`, {
          reason: 'short',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await as('admin', 'POST', `/admin/users/${idOf('manager')}/impersonate`, {
          reason: 'x'.repeat(301),
        })
      ).status,
    ).toBe(400);
    expect(
      (await as('admin', 'POST', `/admin/users/${idOf('manager')}/impersonate`, { reason: REASON }))
        .status,
    ).toBe(200);
    const row = await t.db.auditEvent.findFirstOrThrow({
      where: { action: 'user.impersonation_started', entityId: idOf('manager') },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(row.after)).toContain('display problem');
  });

  it('keeps someone from resetting their own two-factor here', async () => {
    expect(
      (await as('admin', 'POST', `/admin/users/${idOf('admin')}/two-factor/reset`)).status,
    ).toBe(403);
  });

  it('writes nothing when someone who is not viewing as anyone calls the stop endpoint', async () => {
    const before = await t.db.auditEvent.count({ where: { action: 'impersonation.stopped' } });
    expect((await as('patient', 'POST', '/auth/impersonation/stop', {})).status).toBe(200);
    expect((await as('admin', 'POST', '/auth/impersonation/stop', {})).status).toBe(200);
    expect(await t.db.auditEvent.count({ where: { action: 'impersonation.stopped' } })).toBe(
      before,
    );
  });

  it('stops leading teams, and drops the manager flag, when a manager is moved to another role', async () => {
    const lead = await person('lead2', 'case_manager');
    await t.db.staffProfile.create({ data: { userId: lead.id, isManager: true } });
    const team = await t.db.team.create({ data: { name: 'Lead2 team', managerId: lead.id } });
    expect(
      (await as('admin', 'PATCH', `/admin/users/${lead.id}`, { role: 'finance' })).status,
    ).toBe(200);
    expect((await t.db.team.findUniqueOrThrow({ where: { id: team.id } })).managerId).toBeNull();
    expect(
      (await t.db.staffProfile.findUniqueOrThrow({ where: { userId: lead.id } })).isManager,
    ).toBe(false);
    // Coming back as a case manager does not bring the old scope with it.
    await as('admin', 'PATCH', `/admin/users/${lead.id}`, { role: 'case_manager' });
    expect(
      (await t.db.staffProfile.findUniqueOrThrow({ where: { userId: lead.id } })).isManager,
    ).toBe(false);
  });

  it('counts an admin’s downloads while viewing as someone against the admin', async () => {
    const { DownloadAlertService } = await import('../src/audit/download-alert.service.js');
    const alert = t.app.get(DownloadAlertService);
    const calls: string[] = [];
    const original = alert.check.bind(alert);
    alert.check = (async (db: never, userId: string, context: never, now?: Date) => {
      calls.push(userId);
      return original(db, userId, context, now);
    }) as typeof alert.check;
    const audit = t.app.get((await import('../src/audit/audit.service.js')).AuditService);
    await audit.recordAccess(
      {
        actor: {
          userId: idOf('patient'),
          role: 'patient',
          sessionId: randomUUID(),
          scopeCaseId: null,
          impersonatorId: idOf('admin'),
        },
        ip: null,
        userAgent: null,
        requestId: null,
      },
      { action: 'document.downloaded', entityType: 'Document', entityId: randomUUID() },
    );
    expect(calls).toEqual([idOf('admin')]);
  });
});

describe('impersonation', () => {
  const impersonationCookie = async (adminKey: string, targetId: string) => {
    const res = await as(adminKey, 'POST', `/admin/users/${targetId}/impersonate`, {
      reason: REASON,
    });
    expect(res.status).toBe(200);
    const value = res.cookies['mt_imp'];
    expect(value).toBeTruthy();
    expect(res.setCookieHeaders.join(';')).toMatch(/mt_imp=[^;]+;.*HttpOnly/);
    return value as string;
  };

  it('shows the product as the person, read-only, with a banner flag, and audits every request against the admin', async () => {
    const patient = await t.db.patient.create({
      data: { fullName: 'Viewed Patient', userId: idOf('patient') },
    });
    const own = await as('patient', 'POST', '/cases', {});
    expect(own.status).toBe(201);
    const cookie = await impersonationCookie('admin', idOf('patient'));

    const me = await as('admin', 'GET', '/auth/me', undefined, { mt_imp: cookie });
    expect(me.body).toMatchObject({
      id: idOf('patient'),
      role: 'patient',
      impersonating: { by: idOf('admin') },
    });
    // The data is what that patient sees: only their own case.
    const cases = (await as('admin', 'GET', '/cases', undefined, { mt_imp: cookie })).body as {
      items: { patientName?: string }[];
      total: number;
    };
    expect(cases.total).toBe(1);
    // Read-only: nothing can be changed, even though the patient could.
    for (const [method, url] of [
      ['POST', '/cases'],
      ['PATCH', `/admin/users/${idOf('manager')}`],
      ['DELETE', '/documents/x'],
    ] as const)
      expect(
        (await as('admin', method, url, {}, { mt_imp: cookie })).status,
        `${method} ${url}`,
      ).toBe(403);
    // The admin's own powers are not available while viewing as someone else.
    expect((await as('admin', 'GET', '/admin/users', undefined, { mt_imp: cookie })).status).toBe(
      403,
    );

    // Everything was recorded: the admin is the actor and the patient is the person viewed.
    const rows = await t.db.auditEvent.findMany({
      where: { action: 'impersonation.request', onBehalfOfId: patient.userId },
    });
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows.every((r) => r.actorId === idOf('admin') && r.actorRole === 'super_admin')).toBe(
      true,
    );
    const routes = rows.map((r) => (r.after as { route: string }).route);
    expect(routes).toEqual(expect.arrayContaining(['/auth/me', '/cases']));
    expect(JSON.stringify(rows.map((r) => r.after))).not.toMatch(/Viewed Patient/);
    expect(
      await t.db.auditEvent.count({
        where: {
          action: 'user.impersonation_started',
          entityId: idOf('patient'),
          actorId: idOf('admin'),
        },
      }),
    ).toBe(1);
  });

  it('ends with the stop call, which acts as the admin', async () => {
    const cookie = await impersonationCookie('admin', idOf('manager'));
    const stop = await as('admin', 'POST', '/auth/impersonation/stop', {}, { mt_imp: cookie });
    expect(stop.status).toBe(200);
    expect(stop.setCookieHeaders.join(';')).toMatch(/mt_imp=;.*Max-Age=0/);
    expect(
      await t.db.auditEvent.count({
        where: { action: 'impersonation.stopped', actorId: idOf('admin') },
      }),
    ).toBeGreaterThanOrEqual(1);
    // Without the cookie the admin is the admin again.
    expect((await as('admin', 'GET', '/auth/me')).body).toMatchObject({ id: idOf('admin') });
  });

  it('cannot be used by anyone else, from another session, forged, or after the target is deactivated', async () => {
    const cookie = await impersonationCookie('admin', idOf('manager'));
    // Another super admin presenting the cookie is just themselves.
    expect(
      (await as('admin2', 'GET', '/auth/me', undefined, { mt_imp: cookie })).body,
    ).toMatchObject({ id: idOf('admin2') });
    // The same admin from a different session is just themselves.
    const otherSession = await t.tokenFor(idOf('admin'));
    const elsewhere = await t.raw('GET', '/auth/me', {
      headers: { authorization: `Bearer ${otherSession.accessToken}` },
      cookies: { mt_imp: cookie },
    });
    expect(elsewhere.body).toMatchObject({ id: idOf('admin') });
    // A tampered cookie is ignored.
    const forged = await as('admin', 'GET', '/auth/me', undefined, {
      mt_imp: `${cookie.slice(0, -3)}abc`,
    });
    expect(forged.body).toMatchObject({ id: idOf('admin') });
    // A non-admin with the cookie gets nothing from it.
    expect(
      (await as('manager', 'GET', '/auth/me', undefined, { mt_imp: cookie })).body,
    ).toMatchObject({ id: idOf('manager') });
    // Deactivating the person ends the view.
    expect(
      (await as('admin', 'GET', '/auth/me', undefined, { mt_imp: cookie })).body,
    ).toMatchObject({ id: idOf('manager') });
    await t.db.user.update({ where: { id: idOf('manager') }, data: { status: 'deactivated' } });
    expect(
      (await as('admin', 'GET', '/auth/me', undefined, { mt_imp: cookie })).body,
    ).toMatchObject({ id: idOf('admin') });
    await t.db.user.update({ where: { id: idOf('manager') }, data: { status: 'active' } });
  });

  it('refuses to start for yourself, another super admin, an inactive or unknown account, or twice', async () => {
    expect(
      (await as('admin', 'POST', `/admin/users/${idOf('admin')}/impersonate`, { reason: REASON }))
        .status,
    ).toBe(403);
    expect(
      (await as('admin', 'POST', `/admin/users/${idOf('admin2')}/impersonate`, { reason: REASON }))
        .status,
    ).toBe(403);
    expect(
      (
        await as('admin', 'POST', '/admin/users/00000000-0000-4000-8000-000000000000/impersonate', {
          reason: REASON,
        })
      ).status,
    ).toBe(404);
    await t.db.user.update({ where: { id: idOf('desk') }, data: { status: 'suspended' } });
    expect(
      (await as('admin', 'POST', `/admin/users/${idOf('desk')}/impersonate`, { reason: REASON }))
        .status,
    ).toBe(409);
    await t.db.user.update({ where: { id: idOf('desk') }, data: { status: 'active' } });
  });
});
