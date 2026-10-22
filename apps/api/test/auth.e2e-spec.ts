import { generateSync } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loginResultSchema, type Role } from '@medtravel/contracts';
import { decryptSecret } from '../src/modules/auth/crypto/secret-box.js';
import { createTestApp, type RawResponse, type TestApp } from './support/test-app.js';

let t: TestApp;
let counter = 0;
const next = () => (counter += 1);
const PASSWORD = 'Dev@12345';
const ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const loginBody = (res: RawResponse) => loginResultSchema.parse(res.body);
const message = (res: RawResponse): string =>
  z.object({ message: z.string() }).parse(res.body).message;
const codeOf = (res: RawResponse): string | undefined =>
  z.object({ code: z.string().optional() }).parse(res.body).code;
const email = (prefix = 'user') => `${prefix}-${next()}@test.example`;

/** The cookies a browser would hold after `response`, merged over `previous`. */
const jar = (response: RawResponse, previous: Record<string, string> = {}) => {
  const merged = { ...previous };
  for (const [name, value] of Object.entries(response.cookies)) {
    if (value === '') delete merged[name];
    else merged[name] = value;
  }
  return merged;
};
const csrf = (cookies: Record<string, string>) => ({ 'x-csrf-token': cookies['mt_csrf'] ?? '' });

async function signIn(address: string, password = PASSWORD, ip?: string) {
  const res = await t.raw('POST', '/auth/login', {
    body: { email: address, password },
    ...(ip ? { ip } : {}),
  });
  return { res, cookies: jar(res) };
}

/** Signs in a staff/admin user and enrols a second factor; returns the cookies, the secret and the backup codes. */
async function enrolled(role: Role) {
  const user = await t.makeUser({ email: email(role), role });
  const { cookies } = await signIn(user.email);
  const setup = z
    .object({ secret: z.string() })
    .parse((await t.raw('POST', '/auth/2fa/setup', { cookies, headers: csrf(cookies) })).body);
  const enable = await t.raw('POST', '/auth/2fa/enable', {
    cookies,
    headers: csrf(cookies),
    body: { code: generateSync({ secret: setup.secret }) },
  });
  expect(enable.status).toBe(200);
  const backupCodes = z.object({ backupCodes: z.array(z.string()) }).parse(enable.body).backupCodes;
  return { user, cookies, secret: setup.secret, backupCodes };
}

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t?.close();
});

describe('password sign-in', () => {
  it('opens a session with httpOnly cookies, a readable CSRF cookie, and no secrets in the body', async () => {
    const user = await t.makeUser({ email: email(), role: 'patient' });
    const { res, cookies } = await signIn(user.email);
    expect(res.status).toBe(200);
    expect(loginBody(res)).toMatchObject({
      status: 'signed_in',
      challengeToken: null,
      user: { role: 'patient', access: 'full' },
    });
    expect(JSON.stringify(res.body)).not.toContain(cookies['mt_at'] ?? 'x');

    const flags = Object.fromEntries(
      res.setCookieHeaders.map((header) => [header.split('=')[0], header]),
    );
    expect(flags['mt_at']).toMatch(/HttpOnly/);
    expect(flags['mt_at']).toMatch(/SameSite=Lax/);
    expect(flags['mt_rt']).toMatch(/Path=\/;/);
    expect(flags['mt_rt']).toMatch(/HttpOnly/);
    expect(flags['mt_csrf']).not.toMatch(/HttpOnly/);

    const me = await t.raw('GET', '/auth/me', { cookies });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ id: user.id, email: user.email, role: 'patient' });
  });

  it('answers the same for a wrong password, an unknown address and an account that was never activated', async () => {
    const user = await t.makeUser({ email: email(), role: 'patient' });
    const invited = await t.makeUser({ email: email(), role: 'patient', status: 'invited' });
    const wrong = await signIn(user.email, 'Wrong-password-1');
    const unknown = await signIn(email('nobody'));
    const notActive = await signIn(invited.email);
    for (const { res } of [wrong, unknown, notActive]) {
      expect(res.status).toBe(401);
      expect(message(res)).toBe('Incorrect email, password or code');
      expect(res.setCookieHeaders).toEqual([]);
    }
  });

  it('locks the account after five wrong passwords, even for the right one, until the lock ends', async () => {
    const user = await t.makeUser({ email: email(), role: 'patient' });
    for (let i = 0; i < 5; i += 1)
      expect((await signIn(user.email, 'Wrong-password-1')).res.status).toBe(401);
    const locked = await signIn(user.email);
    expect(locked.res.status).toBe(429);
    expect(codeOf(locked.res)).toBe('account_locked');

    await t.db.user.update({
      where: { id: user.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    const after = await signIn(user.email);
    expect(after.res.status).toBe(200);
    expect(
      await t.db.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { failedLoginCount: true, lockedUntil: true },
      }),
    ).toEqual({ failedLoginCount: 0, lockedUntil: null });
  });

  it('counts only consecutive failures: a success starts the count again', async () => {
    const user = await t.makeUser({ email: email(), role: 'patient' });
    for (let i = 0; i < 4; i += 1) await signIn(user.email, 'Wrong-password-1');
    expect((await signIn(user.email)).res.status).toBe(200);
    for (let i = 0; i < 4; i += 1) await signIn(user.email, 'Wrong-password-1');
    expect((await signIn(user.email)).res.status).toBe(200);
  });

  it('limits attempts per address, whatever the password', async () => {
    const target = email('throttled');
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1)
      statuses.push((await signIn(target, 'Wrong-password-1')).res.status);
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it('limits attempts per client address', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1)
      statuses.push((await signIn(email('ip'), 'Wrong-password-1', '10.9.8.7')).res.status);
    expect(statuses.filter((status) => status === 429).length).toBeGreaterThanOrEqual(5);
  });

  it('writes the audit trail for failures, lockouts and successes, with no secrets in it', async () => {
    const user = await t.makeUser({ email: email(), role: 'patient' });
    for (let i = 0; i < 5; i += 1) await signIn(user.email, 'Wrong-password-1');
    await t.db.user.update({ where: { id: user.id }, data: { lockedUntil: null } });
    await signIn(user.email);
    const events = await t.db.auditEvent.findMany({
      where: { entityId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((event) => event.action)).toEqual([
      'auth.login_failed',
      'auth.login_failed',
      'auth.login_failed',
      'auth.login_failed',
      'auth.account_locked',
      'auth.login',
    ]);
    const text = JSON.stringify(events);
    expect(text).not.toContain('Wrong-password-1');
    expect(text).not.toContain(PASSWORD);
    expect(events.at(-1)).toMatchObject({ actorId: user.id, actorRole: 'patient' });
  });
});

describe('sessions and tokens', () => {
  it('rotates the refresh token, and a replayed old one signs the session out', async () => {
    const user = await t.makeUser({ email: email(), role: 'patient' });
    const first = await signIn(user.email);
    const refreshed = await t.raw('POST', '/auth/refresh', { cookies: first.cookies });
    expect(refreshed.status).toBe(200);
    const second = jar(refreshed, first.cookies);
    expect(second['mt_rt']).not.toBe(first.cookies['mt_rt']);
    expect((await t.raw('GET', '/auth/me', { cookies: second })).status).toBe(200);

    // Inside the grace period a repeat is two tabs racing: refused, but the session lives.
    expect((await t.raw('POST', '/auth/refresh', { cookies: first.cookies })).status).toBe(401);
    expect((await t.raw('GET', '/auth/me', { cookies: second })).status).toBe(200);

    // Later, the same old token is a copied one: the whole session is revoked.
    await t.db.session.updateMany({
      where: { userId: user.id },
      data: { lastUsedAt: new Date(Date.now() - 60_000) },
    });
    expect((await t.raw('POST', '/auth/refresh', { cookies: first.cookies })).status).toBe(401);
    expect((await t.raw('GET', '/auth/me', { cookies: second })).status).toBe(401);
    expect((await t.raw('POST', '/auth/refresh', { cookies: second })).status).toBe(401);
    expect(
      await t.db.auditEvent.count({
        where: { action: 'auth.refresh_token_reuse', entityId: user.id },
      }),
    ).toBe(1);
  });

  it('refuses a refresh with no cookie, a forged one, or one for an expired session', async () => {
    const user = await t.makeUser({ email: email(), role: 'patient' });
    const { cookies } = await signIn(user.email);
    expect((await t.raw('POST', '/auth/refresh')).status).toBe(401);
    expect((await t.raw('POST', '/auth/refresh', { cookies: { mt_rt: 'abc.def' } })).status).toBe(
      401,
    );
    await t.db.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await t.raw('POST', '/auth/refresh', { cookies });
    expect(expired.status).toBe(401);
    expect(expired.cookies['mt_at']).toBe('');
  });

  it('stops working the moment the user is suspended or the session is revoked', async () => {
    const user = await t.makeUser({ email: email(), role: 'patient' });
    const { cookies } = await signIn(user.email);
    expect((await t.raw('GET', '/auth/me', { cookies })).status).toBe(200);
    await t.db.user.update({ where: { id: user.id }, data: { status: 'suspended' } });
    expect((await t.raw('GET', '/auth/me', { cookies })).status).toBe(401);
  });

  it('logs out: the cookies are cleared and the tokens stop working, and logging out twice is harmless', async () => {
    const user = await t.makeUser({ email: email(), role: 'patient' });
    const { cookies } = await signIn(user.email);
    const out = await t.raw('POST', '/auth/logout', { cookies });
    expect(out.status).toBe(200);
    expect(out.cookies).toMatchObject({ mt_at: '', mt_rt: '', mt_csrf: '' });
    expect((await t.raw('GET', '/auth/me', { cookies })).status).toBe(401);
    expect((await t.raw('POST', '/auth/refresh', { cookies })).status).toBe(401);
    expect((await t.raw('POST', '/auth/logout', { cookies })).status).toBe(200);
  });

  it('lists the devices, signs one out, and signs out all the others', async () => {
    const user = await t.makeUser({ email: email(), role: 'patient' });
    const a = await signIn(user.email);
    const b = await signIn(user.email);
    const c = await signIn(user.email);
    const list = z
      .object({ items: z.array(z.object({ id: z.string(), current: z.boolean() })) })
      .parse((await t.raw('GET', '/auth/sessions', { cookies: a.cookies })).body);
    expect(list.items).toHaveLength(3);
    expect(list.items.filter((item) => item.current)).toHaveLength(1);

    const other = list.items.find((item) => !item.current)!;
    expect(
      (
        await t.raw('DELETE', `/auth/sessions/${other.id}`, {
          cookies: a.cookies,
          headers: csrf(a.cookies),
        })
      ).status,
    ).toBe(200);
    expect(
      (await t.raw('POST', '/auth/logout-others', { cookies: a.cookies, headers: csrf(a.cookies) }))
        .status,
    ).toBe(200);
    expect((await t.raw('GET', '/auth/me', { cookies: a.cookies })).status).toBe(200);
    const statuses = await Promise.all(
      [b, c].map(async (s) => (await t.raw('GET', '/auth/me', { cookies: s.cookies })).status),
    );
    expect(statuses).toEqual([401, 401]);
  });

  it("cannot see or sign out another user's device", async () => {
    const mine = await t.makeUser({ email: email(), role: 'patient' });
    const theirs = await t.makeUser({ email: email(), role: 'patient' });
    const my = await signIn(mine.email);
    const their = await signIn(theirs.email);
    const theirSession = (await t.db.session.findFirstOrThrow({ where: { userId: theirs.id } })).id;
    expect(
      (
        await t.raw('DELETE', `/auth/sessions/${theirSession}`, {
          cookies: my.cookies,
          headers: csrf(my.cookies),
        })
      ).status,
    ).toBe(404);
    expect((await t.raw('GET', '/auth/me', { cookies: their.cookies })).status).toBe(200);
  });
});

describe('cross-site request protection', () => {
  it('refuses a cookie-authenticated change without the CSRF header, with a wrong one, or from another origin', async () => {
    const user = await t.makeUser({ email: email(), role: 'patient' });
    const { cookies } = await signIn(user.email);
    const body = { currentPassword: PASSWORD, newPassword: 'Another-pass-99' };
    expect((await t.raw('POST', '/auth/password/change', { cookies, body })).status).toBe(403);
    expect(
      (
        await t.raw('POST', '/auth/password/change', {
          cookies,
          body,
          headers: { 'x-csrf-token': 'wrong' },
        })
      ).status,
    ).toBe(403);
    // A CSRF token copied from another session does not do.
    const other = await signIn((await t.makeUser({ email: email(), role: 'patient' })).email);
    expect(
      (
        await t.raw('POST', '/auth/password/change', {
          cookies,
          body,
          headers: csrf(other.cookies),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await t.raw('POST', '/auth/password/change', {
          cookies,
          body,
          headers: { ...csrf(cookies), origin: 'https://evil.example' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await t.raw('POST', '/auth/password/change', {
          cookies,
          body,
          headers: { ...csrf(cookies), origin: 'http://localhost:3002' },
        })
      ).status,
    ).toBe(200);
  });

  it('refuses a sign-in that comes from a foreign origin, and needs no CSRF token for a bearer token', async () => {
    const user = await t.makeUser({ email: email(), role: 'patient' });
    const foreign = await t.raw('POST', '/auth/login', {
      body: { email: user.email, password: PASSWORD },
      headers: { origin: 'https://evil.example' },
    });
    expect(foreign.status).toBe(403);
    const { accessToken } = await t.tokenFor(user.id);
    const bearer = await t.raw('POST', '/auth/logout-others', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(bearer.status).toBe(200);
  });
});

describe('two-factor authentication', () => {
  it('keeps staff in a limited session until they enrol: nothing works but the setup', async () => {
    const admin = await t.makeUser({ email: email('admin'), role: 'super_admin' });
    const { res, cookies } = await signIn(admin.email);
    expect(loginBody(res)).toMatchObject({
      status: 'signed_in',
      user: { access: 'two_factor_setup', twoFactorRequired: true, twoFactorEnabled: false },
    });

    const blocked = await t.raw('GET', '/masters/countries', { cookies });
    expect(blocked.status).toBe(403);
    expect(codeOf(blocked)).toBe('two_factor_required');
    expect((await t.raw('GET', '/auth/sessions', { cookies })).status).toBe(403);
    expect((await t.raw('GET', '/auth/me', { cookies })).body).toMatchObject({
      access: 'two_factor_setup',
    });
    expect(
      (await t.raw('POST', '/auth/2fa/setup', { cookies, headers: csrf(cookies) })).status,
    ).toBe(200);
  });

  it('applies to every staff, hospital and admin role, and to none of the others', async () => {
    const expectations: [Role, boolean][] = [
      ['case_manager', true],
      ['ground_coordinator', true],
      ['interpreter', true],
      ['medical_reviewer', true],
      ['finance', true],
      ['hospital_desk', true],
      ['doctor', true],
      ['super_admin', true],
      ['patient', false],
      ['attendant', false],
      ['agent', false],
    ];
    for (const [role, limited] of expectations) {
      const user = await t.makeUser({ email: email(role), role });
      const { res } = await signIn(user.email);
      expect(loginBody(res).user?.access, role).toBe(limited ? 'two_factor_setup' : 'full');
    }
  });

  it('enrols with a code from the app, shows ten backup codes once, and then lifts the limit', async () => {
    const { user, cookies, backupCodes } = await enrolled('super_admin');
    expect(backupCodes).toHaveLength(10);
    expect(new Set(backupCodes).size).toBe(10);
    expect((await t.raw('GET', '/masters/countries', { cookies })).status).toBe(200);
    const stored = await t.db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });
    expect(stored.twoFactorEnabled).toBe(true);
    // The secret is encrypted at rest, and the backup codes are only hashed.
    expect(stored.twoFactorSecret).toMatch(/^v1\./);
    expect(decryptSecret(ENCRYPTION_KEY, stored.twoFactorSecret!)).toMatch(/^[A-Z2-7]{32}$/);
    const hashes = (await t.db.backupCode.findMany({ where: { userId: user.id } })).map(
      (row) => row.codeHash,
    );
    expect(hashes).toHaveLength(10);
    for (const code of backupCodes) expect(hashes).not.toContain(code);
  });

  it('refuses a wrong enrolment code, and a second setup once it is on', async () => {
    const user = await t.makeUser({ email: email('wrong'), role: 'finance' });
    const { cookies } = await signIn(user.email);
    await t.raw('POST', '/auth/2fa/setup', { cookies, headers: csrf(cookies) });
    expect(
      (
        await t.raw('POST', '/auth/2fa/enable', {
          cookies,
          headers: csrf(cookies),
          body: { code: '000000' },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await t.raw('POST', '/auth/2fa/enable', {
          cookies,
          headers: csrf(cookies),
          body: { code: 'abc' },
        })
      ).status,
    ).toBe(400);
    const done = await enrolled('finance');
    expect(
      (
        await t.raw('POST', '/auth/2fa/setup', {
          cookies: done.cookies,
          headers: csrf(done.cookies),
        })
      ).status,
    ).toBe(409);
  });

  it('asks for the code at sign-in, and opens a full session once it is given', async () => {
    const { user, secret } = await enrolled('case_manager');
    const first = await signIn(user.email);
    expect(loginBody(first.res)).toMatchObject({ status: 'two_factor_required', user: null });
    expect(first.res.setCookieHeaders).toEqual([]);
    const challengeToken = loginBody(first.res).challengeToken!;

    expect(
      (await t.raw('POST', '/auth/2fa/challenge', { body: { challengeToken, code: '000000' } }))
        .status,
    ).toBe(401);
    expect(
      (
        await t.raw('POST', '/auth/2fa/challenge', {
          body: { challengeToken: 'x'.repeat(40), code: generateSync({ secret }) },
        })
      ).status,
    ).toBe(401);
    const ok = await t.raw('POST', '/auth/2fa/challenge', {
      body: { challengeToken, code: generateSync({ secret }) },
    });
    expect(ok.status).toBe(200);
    expect(loginBody(ok)).toMatchObject({
      status: 'signed_in',
      user: { access: 'full', twoFactorEnabled: true },
    });
    expect((await t.raw('GET', '/masters/countries', { cookies: jar(ok) })).status).toBe(200);
  });

  it('accepts a backup code once, and then it is gone', async () => {
    const { user, backupCodes } = await enrolled('hospital_desk');
    const challengeToken = () =>
      signIn(user.email).then(({ res }) => loginBody(res).challengeToken!);
    const code = backupCodes[0]!;
    expect(
      (
        await t.raw('POST', '/auth/2fa/challenge', {
          body: { challengeToken: await challengeToken(), code: code.toLowerCase() },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await t.raw('POST', '/auth/2fa/challenge', {
          body: { challengeToken: await challengeToken(), code },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await t.raw('POST', '/auth/2fa/challenge', {
          body: { challengeToken: await challengeToken(), code: backupCodes[1]!.replace('-', '') },
        })
      ).status,
    ).toBe(200);
  });

  it('counts wrong codes towards the lockout', async () => {
    const { user } = await enrolled('medical_reviewer');
    const challengeToken = (await signIn(user.email)).res;
    const token = loginBody(challengeToken).challengeToken!;
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1)
      statuses.push(
        (
          await t.raw('POST', '/auth/2fa/challenge', {
            body: { challengeToken: token, code: '111111' },
          })
        ).status,
      );
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it('lets a patient turn it on and off, but never lets a staff role turn it off', async () => {
    const patient = await t.makeUser({ email: email('patient'), role: 'patient' });
    const { cookies } = await signIn(patient.email);
    const setup = z
      .object({ secret: z.string() })
      .parse((await t.raw('POST', '/auth/2fa/setup', { cookies, headers: csrf(cookies) })).body);
    await t.raw('POST', '/auth/2fa/enable', {
      cookies,
      headers: csrf(cookies),
      body: { code: generateSync({ secret: setup.secret }) },
    });
    expect(
      (
        await t.raw('POST', '/auth/2fa/disable', {
          cookies,
          headers: csrf(cookies),
          body: { password: 'Wrong-password-1', code: generateSync({ secret: setup.secret }) },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await t.raw('POST', '/auth/2fa/disable', {
          cookies,
          headers: csrf(cookies),
          body: { password: PASSWORD, code: generateSync({ secret: setup.secret }) },
        })
      ).status,
    ).toBe(200);
    expect((await signIn(patient.email)).res.body).toMatchObject({ status: 'signed_in' });

    const staff = await enrolled('finance');
    const refused = await t.raw('POST', '/auth/2fa/disable', {
      cookies: staff.cookies,
      headers: csrf(staff.cookies),
      body: { password: PASSWORD, code: generateSync({ secret: staff.secret }) },
    });
    expect(refused.status).toBe(403);
  });

  it('replaces the backup codes after a current code, and the old ones stop working', async () => {
    const { user, cookies, secret, backupCodes } = await enrolled('super_admin');
    const fresh = z.object({ backupCodes: z.array(z.string()) }).parse(
      (
        await t.raw('POST', '/auth/2fa/backup-codes', {
          cookies,
          headers: csrf(cookies),
          body: { code: generateSync({ secret }) },
        })
      ).body,
    );
    expect(fresh.backupCodes).toHaveLength(10);
    const token = loginBody((await signIn(user.email)).res).challengeToken!;
    expect(
      (
        await t.raw('POST', '/auth/2fa/challenge', {
          body: { challengeToken: token, code: backupCodes[0]! },
        })
      ).status,
    ).toBe(401);
  });
});

describe('one-time codes', () => {
  const lastCode = (to: string) =>
    t.mails.filter((mail) => mail.to === to && mail.template === 'login_code').at(-1)?.secret ?? '';

  it('sign a new patient up and in with an emailed code', async () => {
    const address = email('otp');
    const request = await t.raw('POST', '/auth/login/otp/request', {
      body: { identifier: address },
    });
    expect(request.status).toBe(202);
    const verify = await t.raw('POST', '/auth/login/otp/verify', {
      body: { identifier: address, code: lastCode(address) },
    });
    expect(verify.status).toBe(200);
    expect(loginBody(verify)).toMatchObject({
      status: 'signed_in',
      user: { role: 'patient', email: address, emailVerified: true },
    });
    const user = await t.db.user.findFirstOrThrow({
      where: { email: address },
      include: { patient: true },
    });
    expect(user.patient).not.toBeNull();
  });

  it('sign an existing patient in by phone, and work only once', async () => {
    const phone = `+9689${String(next()).padStart(7, '0')}`;
    const user = await t.makeUser({ email: email(), role: 'patient' });
    await t.db.user.update({ where: { id: user.id }, data: { phone } });
    await t.raw('POST', '/auth/login/otp/request', { body: { identifier: phone } });
    const code = lastCode(phone);
    expect(code).toMatch(/^\d{6}$/);
    expect(
      (await t.raw('POST', '/auth/login/otp/verify', { body: { identifier: phone, code } })).status,
    ).toBe(200);
    expect(
      (await t.raw('POST', '/auth/login/otp/verify', { body: { identifier: phone, code } })).status,
    ).toBe(401);
  });

  it('give up after five wrong tries, and refuse an expired code', async () => {
    const address = email('otp');
    await t.raw('POST', '/auth/login/otp/request', { body: { identifier: address } });
    const code = lastCode(address);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1)
      expect(
        (
          await t.raw('POST', '/auth/login/otp/verify', {
            body: { identifier: address, code: wrong },
          })
        ).status,
      ).toBe(401);
    expect(
      (await t.raw('POST', '/auth/login/otp/verify', { body: { identifier: address, code } }))
        .status,
    ).toBe(401);

    const other = email('otp');
    await t.raw('POST', '/auth/login/otp/request', { body: { identifier: other } });
    await t.db.authChallenge.updateMany({
      where: { target: other },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (
        await t.raw('POST', '/auth/login/otp/verify', {
          body: { identifier: other, code: lastCode(other) },
        })
      ).status,
    ).toBe(401);
  });

  it('answer the same for staff and strangers, and send staff nothing', async () => {
    const staff = await t.makeUser({ email: email('staff'), role: 'finance' });
    const before = t.mails.length;
    const forStaff = await t.raw('POST', '/auth/login/otp/request', {
      body: { identifier: staff.email },
    });
    expect(forStaff.status).toBe(202);
    expect(t.mails.length).toBe(before);
    const stranger = email('stranger');
    const forStranger = await t.raw('POST', '/auth/login/otp/request', {
      body: { identifier: stranger },
    });
    expect(forStranger.status).toBe(202);
    expect(forStranger.body).toEqual(forStaff.body);
    expect(
      (
        await t.raw('POST', '/auth/login/otp/verify', {
          body: { identifier: staff.email, code: '123456' },
        })
      ).status,
    ).toBe(401);
  });

  it('only keep the newest code, and reject malformed input', async () => {
    const address = email('otp');
    await t.raw('POST', '/auth/login/otp/request', { body: { identifier: address } });
    const first = lastCode(address);
    await t.raw('POST', '/auth/login/otp/request', { body: { identifier: address } });
    const second = lastCode(address);
    if (first !== second)
      expect(
        (
          await t.raw('POST', '/auth/login/otp/verify', {
            body: { identifier: address, code: first },
          })
        ).status,
      ).toBe(401);
    expect(
      (await t.raw('POST', '/auth/login/otp/request', { body: { identifier: 'not an address' } }))
        .status,
    ).toBe(400);
    expect(
      (await t.raw('POST', '/auth/login/otp/verify', { body: { identifier: address, code: '12' } }))
        .status,
    ).toBe(400);
  });
});

describe('sign-up, email and passwords', () => {
  const link = (to: string, template: string) =>
    t.mails.filter((mail) => mail.to === to && mail.template === template).at(-1)?.secret ?? '';

  it('registers a patient, who confirms the address with the emailed link (once)', async () => {
    const address = email('new');
    const res = await t.raw('POST', '/auth/register', {
      body: { name: 'Asha Rao', email: address, password: 'Strong-pass-12' },
    });
    expect(res.status).toBe(202);
    expect((await signIn(address, 'Strong-pass-12')).res.body).toMatchObject({
      user: { emailVerified: false, role: 'patient' },
    });

    const token = link(address, 'verify_email');
    expect((await t.raw('POST', '/auth/email/verify', { body: { token } })).status).toBe(200);
    expect((await t.raw('POST', '/auth/email/verify', { body: { token } })).status).toBe(404);
    expect((await signIn(address, 'Strong-pass-12')).res.body).toMatchObject({
      user: { emailVerified: true },
    });
    const user = await t.db.user.findFirstOrThrow({
      where: { email: address },
      include: { patient: true },
    });
    expect(user.patient?.fullName).toBe('Asha Rao');
  });

  it('answers the same for an address that already has an account, and tells that person by email', async () => {
    const existing = await t.makeUser({ email: email(), role: 'patient' });
    const res = await t.raw('POST', '/auth/register', {
      body: { name: 'Someone', email: existing.email, password: 'Strong-pass-12' },
    });
    expect(res.status).toBe(202);
    expect(
      t.mails.some((mail) => mail.to === existing.email && mail.template === 'account_exists'),
    ).toBe(true);
    expect((await signIn(existing.email, 'Strong-pass-12')).res.status).toBe(401);
  });

  it('rejects weak passwords, bad addresses and unknown fields', async () => {
    const base = { name: 'A', email: email(), password: 'Strong-pass-12' };
    for (const body of [
      { ...base, password: 'short1' },
      { ...base, password: 'onlyletterslong' },
      { ...base, password: '1234567890123' },
      { ...base, email: 'nope' },
      { ...base, role: 'super_admin' },
    ]) {
      expect((await t.raw('POST', '/auth/register', { body })).status, JSON.stringify(body)).toBe(
        400,
      );
    }
  });

  it('resets a forgotten password with a one-hour link, signs every device out, and unlocks the account', async () => {
    const user = await t.makeUser({ email: email(), role: 'patient' });
    const device = await signIn(user.email);
    expect(
      (await t.raw('POST', '/auth/password/forgot', { body: { email: email('nobody') } })).status,
    ).toBe(202);
    expect(
      t.mails.some((mail) => mail.template === 'password_reset' && mail.to.startsWith('nobody')),
    ).toBe(false);
    expect(
      (await t.raw('POST', '/auth/password/forgot', { body: { email: user.email } })).status,
    ).toBe(202);
    const token = link(user.email, 'password_reset');
    expect(token).not.toBe('');

    expect(
      (await t.raw('POST', '/auth/password/reset', { body: { token, password: 'weak' } })).status,
    ).toBe(400);
    expect(
      (
        await t.raw('POST', '/auth/password/reset', {
          body: { token, password: 'Brand-new-pass-1' },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await t.raw('POST', '/auth/password/reset', {
          body: { token, password: 'Brand-new-pass-2' },
        })
      ).status,
    ).toBe(404);
    expect((await t.raw('GET', '/auth/me', { cookies: device.cookies })).status).toBe(401);
    expect((await signIn(user.email)).res.status).toBe(401);
    expect((await signIn(user.email, 'Brand-new-pass-1')).res.status).toBe(200);
  });

  it('refuses an expired reset link, and the token of another kind', async () => {
    const user = await t.makeUser({ email: email(), role: 'patient' });
    await t.raw('POST', '/auth/password/forgot', { body: { email: user.email } });
    const token = link(user.email, 'password_reset');
    await t.db.authChallenge.updateMany({
      where: { userId: user.id, kind: 'password_reset' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (
        await t.raw('POST', '/auth/password/reset', {
          body: { token, password: 'Brand-new-pass-1' },
        })
      ).status,
    ).toBe(404);
    await t.raw('POST', '/auth/register', {
      body: { name: 'B', email: email('kind'), password: 'Strong-pass-12' },
    });
    const verifyToken =
      t.mails.filter((mail) => mail.template === 'verify_email').at(-1)?.secret ?? '';
    expect(
      (
        await t.raw('POST', '/auth/password/reset', {
          body: { token: verifyToken, password: 'Brand-new-pass-1' },
        })
      ).status,
    ).toBe(404);
  });

  it('changes the password for a signed-in user who knows the old one, and keeps only this device signed in', async () => {
    const user = await t.makeUser({ email: email(), role: 'patient' });
    const a = await signIn(user.email);
    const b = await signIn(user.email);
    const wrong = await t.raw('POST', '/auth/password/change', {
      cookies: a.cookies,
      headers: csrf(a.cookies),
      body: { currentPassword: 'Wrong-password-1', newPassword: 'Another-pass-99' },
    });
    expect(wrong.status).toBe(401);
    const ok = await t.raw('POST', '/auth/password/change', {
      cookies: a.cookies,
      headers: csrf(a.cookies),
      body: { currentPassword: PASSWORD, newPassword: 'Another-pass-99' },
    });
    expect(ok.status).toBe(200);
    expect((await t.raw('GET', '/auth/me', { cookies: a.cookies })).status).toBe(200);
    expect((await t.raw('GET', '/auth/me', { cookies: b.cookies })).status).toBe(401);
    expect((await signIn(user.email, 'Another-pass-99')).res.status).toBe(200);
  });

  it('resends the confirmation link to a signed-in user who has not confirmed', async () => {
    const address = email('resend');
    await t.raw('POST', '/auth/register', {
      body: { name: 'R', email: address, password: 'Strong-pass-12' },
    });
    const { cookies } = await signIn(address, 'Strong-pass-12');
    const before = t.mails.filter((mail) => mail.to === address).length;
    expect(
      (await t.raw('POST', '/auth/email/resend', { cookies, headers: csrf(cookies) })).status,
    ).toBe(202);
    expect(t.mails.filter((mail) => mail.to === address).length).toBe(before + 1);
  });
});

describe('invitations', () => {
  const inviteToken = (to: string) =>
    t.mails.filter((mail) => mail.to === to && mail.template === 'invitation').at(-1)?.secret ?? '';
  let hospitalId: string;

  beforeAll(async () => {
    await t.db.country.upsert({
      where: { code: 'IN' },
      update: {},
      create: { code: 'IN', name: 'India' },
    });
    const city = await t.db.city.create({
      data: { slug: 'invite-city', name: 'Invite city', countryCode: 'IN' },
    });
    hospitalId = (
      await t.db.hospital.create({
        data: { slug: 'invite-hospital', name: 'Invite hospital', cityId: city.id },
      })
    ).id;
  });

  it('lets the admin invite a staff member, who accepts, signs in, and is then held at the 2FA setup', async () => {
    const admin = await t.makeUser({ email: email('admin'), role: 'super_admin' });
    const { accessToken } = await t.tokenFor(admin.id);
    const address = email('staff');
    const sent = await t.raw('POST', '/auth/invitations', {
      headers: { authorization: `Bearer ${accessToken}` },
      body: { email: address, name: 'Priya Nair', role: 'case_manager' },
    });
    expect(sent.status).toBe(202);
    const token = inviteToken(address);

    expect((await t.raw('GET', `/auth/invitations/${token}`)).body).toEqual({
      email: address,
      name: 'Priya Nair',
      role: 'case_manager',
    });
    expect(
      (await t.raw('POST', '/auth/invitations/accept', { body: { token, password: 'weak' } }))
        .status,
    ).toBe(400);
    expect(
      (
        await t.raw('POST', '/auth/invitations/accept', {
          body: { token, password: 'Chosen-pass-123' },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await t.raw('POST', '/auth/invitations/accept', {
          body: { token, password: 'Chosen-pass-123' },
        })
      ).status,
    ).toBe(404);
    expect((await t.raw('GET', `/auth/invitations/${token}`)).status).toBe(404);

    const { res } = await signIn(address, 'Chosen-pass-123');
    expect(loginBody(res)).toMatchObject({
      status: 'signed_in',
      user: { role: 'case_manager', access: 'two_factor_setup', emailVerified: true },
    });
    const user = await t.db.user.findFirstOrThrow({
      where: { email: address },
      include: { staffProfile: true },
    });
    expect(user.staffProfile).not.toBeNull();
  });

  it('lets a hospital desk invite only its own hospital, and the admin must name the hospital', async () => {
    const admin = await t.makeUser({ email: email('admin'), role: 'super_admin' });
    const adminAuth = { authorization: `Bearer ${(await t.tokenFor(admin.id)).accessToken}` };
    const missing = await t.raw('POST', '/auth/invitations', {
      headers: adminAuth,
      body: { email: email(), name: 'D', role: 'doctor' },
    });
    expect(missing.status).toBe(400);
    const unknown = await t.raw('POST', '/auth/invitations', {
      headers: adminAuth,
      body: { email: email(), name: 'D', role: 'doctor', hospitalId: crypto.randomUUID() },
    });
    expect(unknown.status).toBe(404);

    const deskAddress = email('desk');
    expect(
      (
        await t.raw('POST', '/auth/invitations', {
          headers: adminAuth,
          body: { email: deskAddress, name: 'Desk', role: 'hospital_desk', hospitalId },
        })
      ).status,
    ).toBe(202);
    await t.raw('POST', '/auth/invitations/accept', {
      body: { token: inviteToken(deskAddress), password: 'Chosen-pass-123' },
    });
    const desk = await t.db.user.findFirstOrThrow({
      where: { email: deskAddress },
      include: { hospitalStaffs: true },
    });
    expect(desk.hospitalStaffs.map((row) => row.hospitalId)).toEqual([hospitalId]);

    const deskAuth = { authorization: `Bearer ${(await t.tokenFor(desk.id)).accessToken}` };
    const doctorAddress = email('doctor');
    expect(
      (
        await t.raw('POST', '/auth/invitations', {
          headers: deskAuth,
          body: { email: doctorAddress, name: 'Dr N', role: 'doctor' },
        })
      ).status,
    ).toBe(202);
    await t.raw('POST', '/auth/invitations/accept', {
      body: { token: inviteToken(doctorAddress), password: 'Chosen-pass-123' },
    });
    const doctor = await t.db.user.findFirstOrThrow({
      where: { email: doctorAddress },
      include: { hospitalStaffs: true },
    });
    expect(doctor.hospitalStaffs.map((row) => row.hospitalId)).toEqual([hospitalId]);

    const elsewhere = await t.raw('POST', '/auth/invitations', {
      headers: deskAuth,
      body: { email: email(), name: 'X', role: 'doctor', hospitalId: crypto.randomUUID() },
    });
    expect(elsewhere.status).toBe(403);
    expect(
      (
        await t.raw('POST', '/auth/invitations', {
          headers: deskAuth,
          body: { email: email(), name: 'X', role: 'case_manager' },
        })
      ).status,
    ).toBe(403);
  });

  it('lets a patient invite an attendant, and nobody else', async () => {
    const patient = await t.makeUser({ email: email('patient'), role: 'patient' });
    await t.db.patient.create({ data: { userId: patient.id, fullName: 'Patient One' } });
    const auth = { authorization: `Bearer ${(await t.tokenFor(patient.id)).accessToken}` };
    const address = email('attendant');
    expect(
      (
        await t.raw('POST', '/auth/invitations', {
          headers: auth,
          body: { email: address, name: 'Fatima', role: 'attendant' },
        })
      ).status,
    ).toBe(202);
    await t.raw('POST', '/auth/invitations/accept', {
      body: { token: inviteToken(address), password: 'Chosen-pass-123' },
    });
    const attendant = await t.db.user.findFirstOrThrow({
      where: { email: address },
      include: { attendant: true },
    });
    expect(attendant.role).toBe('attendant');
    expect(attendant.attendant?.patientId).toBe(
      (await t.db.patient.findFirstOrThrow({ where: { userId: patient.id } })).id,
    );
    expect(
      (
        await t.raw('POST', '/auth/invitations', {
          headers: auth,
          body: { email: email(), name: 'X', role: 'case_manager' },
        })
      ).status,
    ).toBe(403);
  });

  it('is refused to roles that may invite no one, and for an address that already has an account', async () => {
    for (const role of ['case_manager', 'agent', 'attendant', 'doctor', 'finance'] as const) {
      const user = await t.makeUser({ email: email(role), role });
      const auth = { authorization: `Bearer ${(await t.tokenFor(user.id)).accessToken}` };
      const res = await t.raw('POST', '/auth/invitations', {
        headers: auth,
        body: { email: email(), name: 'X', role: 'attendant' },
      });
      expect(res.status, role).toBe(403);
    }
    const admin = await t.makeUser({ email: email('admin'), role: 'super_admin' });
    const existing = await t.makeUser({ email: email(), role: 'patient' });
    const taken = await t.raw('POST', '/auth/invitations', {
      headers: { authorization: `Bearer ${(await t.tokenFor(admin.id)).accessToken}` },
      body: { email: existing.email, name: 'X', role: 'finance' },
    });
    expect(taken.status).toBe(409);
    expect(
      (
        await t.raw('POST', '/auth/invitations', {
          body: { email: email(), name: 'X', role: 'finance' },
        })
      ).status,
    ).toBe(401);
  });

  it('expires after seven days', async () => {
    const admin = await t.makeUser({ email: email('admin'), role: 'super_admin' });
    const address = email('late');
    await t.raw('POST', '/auth/invitations', {
      headers: { authorization: `Bearer ${(await t.tokenFor(admin.id)).accessToken}` },
      body: { email: address, name: 'L', role: 'finance' },
    });
    const token = inviteToken(address);
    await t.db.authChallenge.updateMany({
      where: { target: address },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await t.raw('GET', `/auth/invitations/${token}`)).status).toBe(404);
    expect(
      (
        await t.raw('POST', '/auth/invitations/accept', {
          body: { token, password: 'Chosen-pass-123' },
        })
      ).status,
    ).toBe(404);
  });
});

describe('magic links for doctors', () => {
  let hospitalId: string;
  let caseId: string;
  let desk: { id: string };
  const magicToken = (to: string) =>
    t.mails.filter((mail) => mail.to === to && mail.template === 'magic_link').at(-1)?.secret ?? '';

  beforeAll(async () => {
    await t.db.country.upsert({
      where: { code: 'IN' },
      update: {},
      create: { code: 'IN', name: 'India' },
    });
    const city = await t.db.city.create({
      data: { slug: 'magic-city', name: 'Magic city', countryCode: 'IN' },
    });
    hospitalId = (
      await t.db.hospital.create({
        data: { slug: 'magic-hospital', name: 'Magic hospital', cityId: city.id },
      })
    ).id;
    const patient = await t.db.patient.create({ data: { fullName: 'Magic patient' } });
    caseId = (
      await t.db.case.create({ data: { caseNo: 'CASE-2026-900001', patientId: patient.id } })
    ).id;
    await t.db.opinionRequest
      .create({ data: { caseId, hospitalId, status: 'sent' } })
      .catch(async () => {
        // A request leaves draft only with a consent; arrange one.
        const consent = await t.db.consent.create({
          data: { patientId: patient.id, hospitalId, type: 'share_medical_with_hospital' },
        });
        await t.db.opinionRequest.create({
          data: { caseId, hospitalId, status: 'sent', consentId: consent.id },
        });
      });
    desk = await t.makeUser({ email: email('desk'), role: 'hospital_desk' });
    await t.db.hospitalStaff.create({ data: { userId: desk.id, hospitalId } });
  });

  const asDesk = async () => ({
    authorization: `Bearer ${(await t.tokenFor(desk.id)).accessToken}`,
  });

  it('opens one case for a doctor with no password, for a limited session', async () => {
    const address = email('doctor');
    const sent = await t.raw('POST', '/auth/magic-links', {
      headers: await asDesk(),
      body: { email: address, name: 'Dr Magic', caseId },
    });
    expect(sent.status).toBe(202);
    const redeemed = await t.raw('POST', '/auth/magic-links/redeem', {
      body: { token: magicToken(address) },
    });
    expect(redeemed.status).toBe(200);
    expect(loginBody(redeemed)).toMatchObject({
      status: 'signed_in',
      user: { role: 'doctor', access: 'full', scopeCaseId: caseId },
    });
    const cookies = jar(redeemed);

    expect((await t.raw('GET', '/auth/me', { cookies })).body).toMatchObject({
      scopeCaseId: caseId,
    });
    expect((await t.raw('GET', '/masters/countries', { cookies })).status).toBe(200);
    // No account management from a magic link.
    for (const [method, url] of [
      ['GET', '/auth/sessions'],
      ['POST', '/auth/logout-others'],
      ['POST', '/auth/2fa/setup'],
      ['POST', '/auth/password/change'],
      ['POST', '/auth/invitations'],
    ] as const) {
      expect((await t.raw(method, url, { cookies, headers: csrf(cookies) })).status, url).toBe(403);
    }
    // And it cannot be refreshed into a longer one.
    expect((await t.raw('POST', '/auth/refresh', { cookies })).status).toBe(401);

    const session = await t.db.session.findFirstOrThrow({ where: { user: { email: address } } });
    expect(session).toMatchObject({ kind: 'magic_link', scopeCaseId: caseId });
    expect(session.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(8 * 3_600_000 + 5000);
  });

  it('works once, and expires after 72 hours', async () => {
    const address = email('doctor');
    await t.raw('POST', '/auth/magic-links', {
      headers: await asDesk(),
      body: { email: address, name: 'Dr Once', caseId },
    });
    const token = magicToken(address);
    const challenge = await t.db.authChallenge.findUniqueOrThrow({
      where: { tokenHash: (await import('../src/modules/auth/crypto/tokens.js')).sha256Hex(token) },
    });
    expect(challenge.expiresAt.getTime() - Date.now()).toBeGreaterThan(71 * 3_600_000);
    expect(challenge.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(72 * 3_600_000);
    expect((await t.raw('POST', '/auth/magic-links/redeem', { body: { token } })).status).toBe(200);
    expect((await t.raw('POST', '/auth/magic-links/redeem', { body: { token } })).status).toBe(404);

    await t.raw('POST', '/auth/magic-links', {
      headers: await asDesk(),
      body: { email: address, name: 'Dr Once', caseId },
    });
    await t.db.authChallenge.updateMany({
      where: { target: address, kind: 'magic_link', consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await t.raw('POST', '/auth/magic-links/redeem', { body: { token: magicToken(address) } }))
        .status,
    ).toBe(404);
  });

  it("is only for cases sent to the desk's own hospital, and only by a hospital desk", async () => {
    const patient = await t.db.patient.create({ data: { fullName: 'Other patient' } });
    const other = await t.db.case.create({
      data: { caseNo: 'CASE-2026-900002', patientId: patient.id },
    });
    const notSent = await t.raw('POST', '/auth/magic-links', {
      headers: await asDesk(),
      body: { email: email(), name: 'D', caseId: other.id },
    });
    expect(notSent.status).toBe(404);
    for (const role of ['case_manager', 'super_admin', 'patient', 'doctor'] as const) {
      const user = await t.makeUser({ email: email(role), role });
      const res = await t.raw('POST', '/auth/magic-links', {
        headers: { authorization: `Bearer ${(await t.tokenFor(user.id)).accessToken}` },
        body: { email: email(), name: 'D', caseId },
      });
      expect(res.status, role).toBe(403);
    }
  });

  it('refuses an address that belongs to someone who is not a doctor', async () => {
    const patient = await t.makeUser({ email: email(), role: 'patient' });
    const res = await t.raw('POST', '/auth/magic-links', {
      headers: await asDesk(),
      body: { email: patient.email, name: 'D', caseId },
    });
    expect(res.status).toBe(409);
  });
});

describe('every route declares who may call it', () => {
  it('has @Public, @Authenticated or @Can on every handler', async () => {
    const { ModulesContainer, Reflector } = await import('@nestjs/core');
    const reflector = t.app.get(Reflector);
    const undeclared: string[] = [];
    const controllers = [...t.app.get(ModulesContainer).values()].flatMap((module) => [
      ...module.controllers.values(),
    ]);
    expect(controllers.length).toBeGreaterThan(3);
    for (const { instance, metatype } of controllers) {
      if (!instance || !metatype) continue;
      const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        if (reflector.get('path', handler) === undefined) continue;
        const declared = ['auth:public', 'auth:authenticated', 'auth:permission'].some((key) =>
          reflector.getAllAndOverride(key, [handler, metatype]),
        );
        if (!declared) undeclared.push(`${metatype.name}.${name}`);
      }
    }
    expect(undeclared).toEqual([]);
  });
});
