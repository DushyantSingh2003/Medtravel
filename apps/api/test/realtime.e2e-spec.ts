import { randomUUID } from 'node:crypto';
import { io as connect, type Socket } from 'socket.io-client';
import { Redis } from 'ioredis';
import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { REALTIME_PATH, roomOf, type RealtimeMessage, type Role } from '@medtravel/contracts';
import { RealtimePublisher } from '@medtravel/realtime';
import { SessionService } from '../src/auth/session.service.js';
import { createTestApp, type TestApp } from './support/test-app.js';

let t: TestApp;
let n = 0;
const next = () => (n += 1);
let publisher: RealtimePublisher;
let redis: Redis;
const open: Socket[] = [];

interface Person {
  id: string;
  token: string;
}
const people: Record<string, Person> = {};
const ids: Record<string, string> = {};

async function person(key: string, role: Role): Promise<Person> {
  const user = await t.makeUser({ email: `${key.toLowerCase()}-${next()}@rt.test`, role });
  const { accessToken } = await t.tokenFor(user.id);
  people[key] = { id: user.id, token: accessToken };
  return people[key];
}

/** Opens a connection as a person (cookie, like a browser) and resolves once it is connected, or rejects with the refusal. */
function connectAs(
  token: string | null,
  options: { origin?: string; viaAuth?: boolean } = {},
): Promise<Socket> {
  const socket = connect(t.url, {
    path: REALTIME_PATH,
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: {
      ...(options.origin ? { origin: options.origin } : {}),
      ...(token && !options.viaAuth ? { cookie: `mt_at=${token}` } : {}),
    },
    ...(token && options.viaAuth ? { auth: { token } } : {}),
  });
  open.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => reject(error));
  });
}

const join = (socket: Socket, kind: 'case' | 'hospital', id: string): Promise<{ ok: boolean }> =>
  socket.timeout(3000).emitWithAck('join', { kind, id });

/** Collects what a socket receives on 'event' from now on. */
function listen(socket: Socket): RealtimeMessage[] {
  const received: RealtimeMessage[] = [];
  socket.on('event', (message: RealtimeMessage) => received.push(message));
  return received;
}
const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await settle(25);
  expect(check()).toBe(true);
};

beforeAll(async () => {
  t = await createTestApp({ listen: true });
  redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
  publisher = new RealtimePublisher(redis);

  const city = await t.db.city.create({
    data: {
      slug: `rt-city-${next()}`,
      name: 'Delhi',
      country: {
        connectOrCreate: { where: { code: 'IN' }, create: { code: 'IN', name: 'India' } },
      },
    },
  });
  const [a, b] = await Promise.all(
    ['a', 'b'].map((slug) =>
      t.db.hospital.create({
        data: { slug: `rt-h-${slug}-${next()}`, name: `Hospital ${slug}`, cityId: city.id },
      }),
    ),
  );
  ids['hospitalA'] = a?.id as string;
  ids['hospitalB'] = b?.id as string;

  const patient1 = await person('patient1', 'patient');
  const patient2 = await person('patient2', 'patient');
  await person('cm1', 'case_manager');
  await person('cm2', 'case_manager');
  await person('agent', 'agent');
  const deskA = await person('deskA', 'hospital_desk');
  const deskB = await person('deskB', 'hospital_desk');
  await person('admin', 'super_admin');
  await t.db.staffProfile.createMany({
    data: [{ userId: people['cm1']?.id as string }, { userId: people['cm2']?.id as string }],
  });
  ids['patient1'] = (
    await t.db.patient.create({ data: { fullName: 'Asha', userId: patient1.id } })
  ).id;
  ids['patient2'] = (
    await t.db.patient.create({ data: { fullName: 'Omar', userId: patient2.id } })
  ).id;
  ids['case1'] = (
    await t.db.case.create({
      data: {
        caseNo: 'CASE-2026-800001',
        patientId: ids['patient1'] as string,
        ownerId: people['cm1']?.id as string,
      },
    })
  ).id;
  ids['case2'] = (
    await t.db.case.create({
      data: {
        caseNo: 'CASE-2026-800002',
        patientId: ids['patient2'] as string,
        ownerId: people['cm2']?.id as string,
      },
    })
  ).id;
  await t.db.hospitalStaff.createMany({
    data: [
      { userId: deskA.id, hospitalId: ids['hospitalA'] as string },
      { userId: deskB.id, hospitalId: ids['hospitalB'] as string },
    ],
  });
  const consent = await t.db.consent.create({
    data: {
      patientId: ids['patient1'] as string,
      caseId: ids['case1'] as string,
      hospitalId: ids['hospitalA'] as string,
      type: 'share_medical_with_hospital',
    },
  });
  await t.db.opinionRequest.create({
    data: {
      caseId: ids['case1'] as string,
      hospitalId: ids['hospitalA'] as string,
      status: 'sent',
      consentId: consent.id,
    },
  });
}, 180_000);

afterEach(() => {
  for (const socket of open.splice(0)) socket.disconnect();
});

afterAll(async () => {
  await t?.close();
  redis?.disconnect();
});

describe('connecting', () => {
  it('lets in a valid session by cookie, bearer-style auth token, and puts it in its own room', async () => {
    const byCookie = await connectAs(people['patient1']?.token as string);
    const received = listen(byCookie);
    await publisher.publish(roomOf.user(people['patient1']?.id as string), 'notification.created', {
      notificationId: randomUUID(),
    });
    await waitFor(() => received.length === 1);
    expect(received[0]).toMatchObject({
      event: 'notification.created',
      room: `user:${people['patient1']?.id}`,
    });
    const byAuth = await connectAs(people['cm1']?.token as string, { viaAuth: true });
    expect(byAuth.connected).toBe(true);
  });

  it('refuses no token, a forged token, a revoked session, and a site that is not ours', async () => {
    await expect(connectAs(null)).rejects.toThrow('unauthorized');
    await expect(connectAs('forged.token')).rejects.toThrow('unauthorized');
    const doomed = await t.makeUser({ email: `doomed-${next()}@rt.test`, role: 'patient' });
    const { accessToken, sessionId } = await t.tokenFor(doomed.id);
    await t.db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    await expect(connectAs(accessToken)).rejects.toThrow('unauthorized');
    await expect(
      connectAs(people['patient1']?.token as string, { origin: 'https://evil.example' }),
    ).rejects.toThrow();
    const allowed = await connectAs(people['patient1']?.token as string, {
      origin: 'http://localhost:3002',
    });
    expect(allowed.connected).toBe(true);
  });

  it('refuses a session that still owes its second factor', async () => {
    const staff = await t.makeUser({ email: `limited-${next()}@rt.test`, role: 'case_manager' });
    const { accessToken } = await t.tokenFor(staff.id, { twoFactorVerified: false });
    await expect(connectAs(accessToken)).rejects.toThrow('unauthorized');
  });

  it('disconnects a session that is revoked while connected', async () => {
    const victim = await t.makeUser({ email: `victim-${next()}@rt.test`, role: 'patient' });
    const { accessToken, sessionId } = await t.tokenFor(victim.id);
    const socket = await connectAs(accessToken);
    await t.db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    // The gateway re-checks sessions every minute; the check is exercised directly here.
    const gateway = (t.app as unknown as { get: (token: unknown) => unknown }).get;
    expect(typeof gateway).toBe('function');
    const server = (await import('../src/realtime/realtime.gateway.js')).RealtimeGateway;
    const instance = t.app.get(server) as unknown as { recheck: () => Promise<void> };
    const closed = new Promise<string>((resolve) => socket.once('disconnect', resolve));
    await instance.recheck();
    expect(await closed).toBe('io server disconnect');
  });
});

describe('joining rooms', () => {
  it('lets each person into the case rooms their permissions allow, and no others', async () => {
    const cases: [string, string, boolean][] = [
      ['patient1', 'case1', true],
      ['patient1', 'case2', false],
      ['patient2', 'case1', false],
      ['cm1', 'case1', true],
      ['cm1', 'case2', false],
      ['cm2', 'case1', false],
      ['admin', 'case1', true],
      // An agent never gets a case room: they must not see anything medical.
      ['agent', 'case1', false],
      // A hospital sees only cases sent to it, with the patient's consent.
      ['deskA', 'case1', true],
      ['deskB', 'case1', false],
      ['deskA', 'case2', false],
    ];
    for (const [who, which, allowed] of cases) {
      const socket = await connectAs(people[who]?.token as string);
      expect((await join(socket, 'case', ids[which] as string)).ok, `${who} → ${which}`).toBe(
        allowed,
      );
      socket.disconnect();
    }
  });

  it('lets hospital staff into their own hospital room and nobody else’s', async () => {
    const desk = await connectAs(people['deskA']?.token as string);
    expect((await join(desk, 'hospital', ids['hospitalA'] as string)).ok).toBe(true);
    expect((await join(desk, 'hospital', ids['hospitalB'] as string)).ok).toBe(false);
    const patient = await connectAs(people['patient1']?.token as string);
    expect((await join(patient, 'hospital', ids['hospitalA'] as string)).ok).toBe(false);
  });

  it('answers the same for a room that does not exist as for one that is not yours', async () => {
    const socket = await connectAs(people['patient1']?.token as string);
    expect(await join(socket, 'case', randomUUID())).toEqual({ ok: false });
    expect(await join(socket, 'case', ids['case2'] as string)).toEqual({ ok: false });
  });

  it('ignores a join for a user room, a malformed id, or extra fields', async () => {
    const socket = await connectAs(people['patient1']?.token as string);
    for (const bad of [
      { kind: 'user', id: people['patient2']?.id },
      { kind: 'case', id: 'nope' },
      { kind: 'case', id: ids['case1'], extra: true },
      null,
      'case:1',
    ])
      expect(await socket.timeout(3000).emitWithAck('join', bad)).toEqual({ ok: false });
  });

  it('keeps a one-case (magic link) session to its case', async () => {
    const doctor = await t.makeUser({ email: `doctor-${next()}@rt.test`, role: 'doctor' });
    const { tokens } = await t.app.get(SessionService).create(t.db, {
      user: { id: doctor.id, role: 'doctor' },
      kind: 'magic_link',
      twoFactorVerified: false,
      scopeCaseId: ids['case1'] as string,
      context: { actor: null, ip: '127.0.0.1', userAgent: 'vitest', requestId: null },
    });
    const socket = await connectAs(tokens.accessToken);
    expect((await join(socket, 'case', ids['case1'] as string)).ok).toBe(true);
    expect((await join(socket, 'case', ids['case2'] as string)).ok).toBe(false);
    expect((await join(socket, 'hospital', ids['hospitalA'] as string)).ok).toBe(false);
  });
});

describe('two browsers on the same case', () => {
  it('sees each other typing, but not their own, and only inside the room', async () => {
    const asha = await connectAs(people['patient1']?.token as string);
    const manager = await connectAs(people['cm1']?.token as string);
    const outsider = await connectAs(people['cm2']?.token as string);
    for (const socket of [asha, manager]) await join(socket, 'case', ids['case1'] as string);
    const ashaSees = listen(asha);
    const managerSees = listen(manager);
    const outsiderSees = listen(outsider);

    expect(
      await asha.timeout(3000).emitWithAck('typing', { caseId: ids['case1'], typing: true }),
    ).toEqual({ ok: true });
    await waitFor(() => managerSees.length === 1);
    expect(managerSees[0]).toMatchObject({
      event: 'typing',
      room: `case:${ids['case1']}`,
      payload: { caseId: ids['case1'], userId: people['patient1']?.id, typing: true },
    });
    await settle();
    expect(ashaSees).toEqual([]);
    expect(outsiderSees).toEqual([]);
  });

  it('refuses typing into a room the sender never joined, malformed typing, and a flood', async () => {
    const outsider = await connectAs(people['cm2']?.token as string);
    expect(
      await outsider.timeout(3000).emitWithAck('typing', { caseId: ids['case1'], typing: true }),
    ).toEqual({ ok: false });
    const manager = await connectAs(people['cm1']?.token as string);
    await join(manager, 'case', ids['case1'] as string);
    expect(await manager.timeout(3000).emitWithAck('typing', { caseId: ids['case1'] })).toEqual({
      ok: false,
    });
    let refused = 0;
    for (let i = 0; i < 40; i += 1) {
      const answer = await manager
        .timeout(3000)
        .emitWithAck('typing', { caseId: ids['case1'], typing: i % 2 === 0 });
      if (!answer.ok) refused += 1;
    }
    expect(refused).toBeGreaterThanOrEqual(10);
  });

  it('shows both browsers a change published from outside (what the worker does)', async () => {
    const asha = await connectAs(people['patient1']?.token as string);
    const manager = await connectAs(people['cm1']?.token as string);
    for (const socket of [asha, manager]) await join(socket, 'case', ids['case1'] as string);
    const ashaSees = listen(asha);
    const managerSees = listen(manager);
    const messageId = randomUUID();
    await publisher.publish(roomOf.case(ids['case1'] as string), 'message.created', {
      caseId: ids['case1'] as string,
      messageId,
    });
    await waitFor(() => ashaSees.length === 1 && managerSees.length === 1);
    expect(ashaSees[0]?.payload).toEqual({ caseId: ids['case1'], messageId });
    expect(managerSees[0]?.id).toBe(ashaSees[0]?.id);
  });

  it('never delivers a case’s events to someone who is not in its room', async () => {
    const other = await connectAs(people['patient2']?.token as string);
    const sees = listen(other);
    await publisher.publish(roomOf.case(ids['case1'] as string), 'case.updated', {
      caseId: ids['case1'] as string,
    });
    await settle();
    expect(sees).toEqual([]);
  });

  it('refuses a payload that carries more than ids', async () => {
    await expect(
      publisher.publish(roomOf.case(ids['case1'] as string), 'case.updated', {
        caseId: 'not-a-uuid',
        note: 'diagnosis',
      } as never),
    ).rejects.toThrow();
  });
});

describe('access that is withdrawn while connected', () => {
  it('takes a socket out of a case room when its access goes, and stops replaying that room to it', async () => {
    const desk = await t.makeUser({ email: `deskx-${next()}@rt.test`, role: 'hospital_desk' });
    const { accessToken } = await t.tokenFor(desk.id);
    const link = await t.db.hospitalStaff.create({
      data: { userId: desk.id, hospitalId: ids['hospitalA'] as string },
    });
    const socket = await connectAs(accessToken);
    expect((await join(socket, 'case', ids['case1'] as string)).ok).toBe(true);
    expect((await join(socket, 'hospital', ids['hospitalA'] as string)).ok).toBe(true);
    const seen = listen(socket);

    // The hospital's staff link is removed: neither room is theirs any more.
    await t.db.hospitalStaff.update({ where: { id: link.id }, data: { deletedAt: new Date() } });
    const gateway = t.app.get(
      (await import('../src/realtime/realtime.gateway.js')).RealtimeGateway,
    ) as unknown as {
      recheck: () => Promise<void>;
    };
    await gateway.recheck();

    await publisher.publish(roomOf.case(ids['case1'] as string), 'case.updated', {
      caseId: ids['case1'] as string,
    });
    await publisher.publish(roomOf.hospital(ids['hospitalA'] as string), 'case.updated', {
      caseId: ids['case1'] as string,
    });
    await settle();
    expect(seen).toEqual([]);
    const answer = await socket
      .timeout(3000)
      .emitWithAck('sync', { since: new Date(Date.now() - 60_000).toISOString() });
    expect(answer.ok).toBe(true);
    await settle();
    expect(
      seen.filter((m) => m.room.startsWith('case:') || m.room.startsWith('hospital:')),
    ).toEqual([]);
  });

  it('keeps a socket in the rooms it may still join', async () => {
    const socket = await connectAs(people['cm1']?.token as string);
    await join(socket, 'case', ids['case1'] as string);
    const gateway = t.app.get(
      (await import('../src/realtime/realtime.gateway.js')).RealtimeGateway,
    ) as unknown as {
      recheck: () => Promise<void>;
    };
    await gateway.recheck();
    const seen = listen(socket);
    await publisher.publish(roomOf.case(ids['case1'] as string), 'case.updated', {
      caseId: ids['case1'] as string,
    });
    await waitFor(() => seen.length === 1);
  });
});

describe('limits', () => {
  it('stops answering a socket that floods join, leave and sync', async () => {
    const socket = await connectAs(people['patient1']?.token as string);
    let refused = 0;
    for (let i = 0; i < 80; i += 1) {
      const answer = await socket
        .timeout(3000)
        .emitWithAck('join', { kind: 'case', id: ids['case1'] });
      if (!answer.ok) refused += 1;
    }
    expect(refused).toBeGreaterThanOrEqual(15);
  });

  it('allows only so many connections per person', async () => {
    const holder = await t.makeUser({ email: `many-${next()}@rt.test`, role: 'patient' });
    const { accessToken } = await t.tokenFor(holder.id);
    const sockets: Socket[] = [];
    for (let i = 0; i < 10; i += 1) sockets.push(await connectAs(accessToken));
    await expect(connectAs(accessToken)).rejects.toThrow('unauthorized');
    sockets[0]?.disconnect();
    await settle(200);
    expect((await connectAs(accessToken)).connected).toBe(true);
  });

  it('refuses a message bigger than a few kilobytes', async () => {
    const socket = await connectAs(people['patient1']?.token as string);
    const closed = new Promise<string>((resolve) => socket.once('disconnect', resolve));
    socket.emit('join', { kind: 'case', id: ids['case1'], padding: 'x'.repeat(20_000) });
    expect(await closed).toBeTruthy();
  });
});

describe('the publisher', () => {
  it('replays an event stamped exactly at the time asked for, and ignores log lines that are not events', async () => {
    const room = roomOf.user(randomUUID());
    const first = await publisher.publish(room, 'notification.created', {
      notificationId: randomUUID(),
    });
    await redis.lpush(
      `rt:log:${room}`,
      'not json',
      JSON.stringify({
        id: 'x',
        room: 'user:other',
        event: 'typing',
        at: new Date().toISOString(),
        payload: {},
      }),
    );
    const { events } = await publisher.missed([room], new Date(first.at));
    expect(events.map((e) => e.id)).toEqual([first.id]);
  });

  it('logs an event with a given id once however many times it is sent', async () => {
    const room = roomOf.user(randomUUID());
    const id = randomUUID();
    const notificationId = randomUUID();
    await publisher.publish(room, 'notification.created', { notificationId }, { id });
    await publisher.publish(room, 'notification.created', { notificationId }, { id });
    const { events } = await publisher.missed([room], new Date(Date.now() - 60_000));
    expect(events.map((e) => e.id)).toEqual([id]);
  });

  it('rejects when Redis cannot take the event, so the outbox retries', async () => {
    const down = new Redis('redis://127.0.0.1:1', {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: true,
    });
    down.on('error', () => undefined);
    await expect(
      new RealtimePublisher(down).publish(roomOf.user(randomUUID()), 'notification.created', {
        notificationId: randomUUID(),
      }),
    ).rejects.toThrow();
    down.disconnect();
  });
});

describe('several API instances', () => {
  it('delivers an event published through Redis to a browser connected to another instance', async () => {
    const room = `user:${randomUUID()}`;
    const http = createServer();
    const other = new SocketServer(http, { path: REALTIME_PATH, serveClient: false });
    const pub = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
    const sub = pub.duplicate();
    other.adapter(createAdapter(pub, sub) as never);
    other.on('connection', (socket) => void socket.join(room));
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const { port } = http.address() as { port: number };
    const client = connect(`http://127.0.0.1:${port}`, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      reconnection: false,
    });
    open.push(client);
    await new Promise<void>((resolve) => client.once('connect', () => resolve()));
    const seen = listen(client);
    await settle(100);
    await publisher.publish(room, 'notification.created', { notificationId: randomUUID() });
    await waitFor(() => seen.length === 1);
    client.disconnect();
    await other.close();
    pub.disconnect();
    sub.disconnect();
  });
});

describe('catching up after a reconnect', () => {
  it('replays what happened in the rooms while the browser was away, oldest first', async () => {
    const room = roomOf.case(ids['case1'] as string);
    const asha = await connectAs(people['patient1']?.token as string);
    await join(asha, 'case', ids['case1'] as string);
    const seen = listen(asha);
    const first = await publisher.publish(room, 'case.updated', { caseId: ids['case1'] as string });
    await waitFor(() => seen.length === 1);
    const lastSeen = seen[0]?.at as string;
    await settle(30);
    asha.disconnect();

    // While she was away:
    await settle(10);
    const second = await publisher.publish(room, 'case.updated', {
      caseId: ids['case1'] as string,
      fields: ['stage'],
    });
    const third = await publisher.publish(
      roomOf.user(people['patient1']?.id as string),
      'notification.created',
      { notificationId: randomUUID() },
    );

    const back = await connectAs(people['patient1']?.token as string);
    await join(back, 'case', ids['case1'] as string);
    const caught = listen(back);
    const answer = await back.timeout(3000).emitWithAck('sync', { since: lastSeen });
    // The event stamped exactly at the time asked for comes again (two events can share a millisecond); the browser drops
    // it by id.
    expect(answer).toMatchObject({ ok: true, replayed: 3, truncated: false });
    await waitFor(() => caught.length === 3);
    expect(caught.map((m) => m.id)).toEqual([first.id, second.id, third.id]);
  });

  it('does not replay another room’s events, and refuses a bad time', async () => {
    const socket = await connectAs(people['patient2']?.token as string);
    const caught = listen(socket);
    await publisher.publish(roomOf.case(ids['case1'] as string), 'case.updated', {
      caseId: ids['case1'] as string,
    });
    const answer = await socket
      .timeout(3000)
      .emitWithAck('sync', { since: new Date(Date.now() - 60_000).toISOString() });
    expect(answer.ok).toBe(true);
    await settle();
    expect(caught.filter((m) => m.room.startsWith('case:'))).toEqual([]);
    expect(await socket.timeout(3000).emitWithAck('sync', { since: 'yesterday' })).toMatchObject({
      ok: false,
    });
  });

  it('tells the browser to refetch everything when the log cannot reach back far enough', async () => {
    const socket = await connectAs(people['patient1']?.token as string);
    const resync = new Promise<void>((resolve) => socket.once('resync', () => resolve()));
    const answer = await socket
      .timeout(3000)
      .emitWithAck('sync', { since: new Date(Date.now() - 3 * 3600_000).toISOString() });
    expect(answer).toMatchObject({ ok: true, truncated: true });
    await resync;
  });
});
