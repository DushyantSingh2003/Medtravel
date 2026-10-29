import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  joinRequestSchema,
  realtimeMessageSchema,
  roomOf,
  syncRequestSchema,
  typingRequestSchema,
  type JoinRequest,
  type RealtimeMessage,
} from '@medtravel/contracts';
import { randomUUID } from 'node:crypto';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import type { Actor } from '../auth/actor.js';
import { ACCESS_COOKIE, readCookie } from '../auth/cookies.js';
import { WsGateway } from '../auth/decorators.js';
import { secondFactorOwed } from '../auth/auth.guard.js';
import { SessionService } from '../auth/session.service.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import { ScopeService } from '../rbac/scope.service.js';
import { RealtimeService } from './realtime.service.js';

interface SocketData {
  actor: Actor;
  token: string;
  /** Typing messages in the current window, to keep one socket from flooding a room. */
  typing: { count: number; resetsAt: number };
  /** All messages together, so join, leave and sync cannot be used to hammer the database. */
  messages: { count: number; resetsAt: number };
}
type RealtimeSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

const MAX_ROOMS = 50;
const MAX_SOCKETS_PER_USER = 10;
const MESSAGES_PER_WINDOW = 60;
const TYPING_PER_WINDOW = 30;
const TYPING_WINDOW_MS = 10_000;
/** How often a connected session is checked to still be valid. */
const RECHECK_MS = 60_000;

/**
 * The Socket.IO endpoint. A connection is let in only with a valid session (the same check as every API request); it joins its
 * own room at once and may join case and hospital rooms the permission rules allow. Events are pushed to rooms by
 * `RealtimeService`/the worker; the one thing a client sends is `typing`.
 */
@WsGateway()
@WebSocketGateway({ path: '/realtime' })
export class RealtimeGateway implements OnGatewayInit {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() private server!: Server;
  private timer: NodeJS.Timeout | undefined;
  private rechecking = false;

  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(ScopeService) private readonly scope: ScopeService,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      void this.authenticate(socket as unknown as RealtimeSocket).then(
        (ok) => next(ok ? undefined : new Error('unauthorized')),
        () => next(new Error('unauthorized')),
      );
    });
    server.on('connection', (socket: RealtimeSocket) => {
      void socket.join(roomOf.user(socket.data.actor.userId));
    });
    this.timer = setInterval(() => void this.recheck(), RECHECK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** The token comes from the cookie the browser sends, or (for non-browser clients) an `auth.token` or bearer header. */
  private async authenticate(socket: RealtimeSocket): Promise<boolean> {
    const { headers, auth } = socket.handshake;
    const bearer = headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
    const fromAuth = typeof auth?.['token'] === 'string' ? (auth['token'] as string) : undefined;
    const token = bearer ?? fromAuth ?? readCookie(headers.cookie, ACCESS_COOKIE);
    if (!token) return false;
    const session = await this.sessions.authenticate(token);
    if (!session) return false;
    // A session that still owes its second factor can use nothing but the set-up page, which does not need a live connection.
    if (secondFactorOwed(session, this.env)) return false;
    // One person may hold only so many connections (a script opening thousands multiplies every cost below).
    const open = await this.server.in(roomOf.user(session.actor.userId)).fetchSockets();
    if (open.length >= MAX_SOCKETS_PER_USER) return false;
    socket.data = {
      actor: session.actor,
      token,
      typing: { count: 0, resetsAt: 0 },
      messages: { count: 0, resetsAt: 0 },
    };
    return true;
  }

  /**
   * Runs every minute: disconnects sockets whose session is no longer valid, and takes each remaining socket out of the case
   * and hospital rooms it no longer has access to (consent withdrawn, case reassigned, staff link removed).
   */
  async recheck(): Promise<void> {
    if (this.rechecking) return;
    this.rechecking = true;
    try {
      const sessions = new Map<string, boolean>();
      for (const socket of this.server.sockets.sockets.values() as Iterable<RealtimeSocket>) {
        let valid = sessions.get(socket.data.token);
        if (valid === undefined) {
          valid = (await this.sessions.authenticate(socket.data.token).catch(() => null)) !== null;
          sessions.set(socket.data.token, valid);
        }
        if (!valid) {
          socket.emit('session_expired');
          socket.disconnect(true);
          continue;
        }
        await this.revalidateRooms(socket);
      }
    } finally {
      this.rechecking = false;
    }
  }

  /** Leaves every case and hospital room the socket's owner may no longer join. */
  private async revalidateRooms(socket: RealtimeSocket): Promise<void> {
    for (const room of [...socket.rooms]) {
      const match = /^(case|hospital):([0-9a-f-]{36})$/.exec(room);
      if (!match) continue;
      const request = { kind: match[1] as 'case' | 'hospital', id: match[2] as string };
      if (!(await this.mayJoin(socket.data.actor, request))) await socket.leave(room);
    }
  }

  /** False once a socket has sent more than its share of messages in the window. */
  private allow(socket: RealtimeSocket): boolean {
    const now = Date.now();
    const window = socket.data.messages;
    if (window.resetsAt <= now)
      Object.assign(window, { count: 0, resetsAt: now + TYPING_WINDOW_MS });
    window.count += 1;
    return window.count <= MESSAGES_PER_WINDOW;
  }

  private async mayJoin(actor: Actor, request: JoinRequest): Promise<boolean> {
    if (request.kind === 'case') {
      // A one-case (magic link) session sees that case and nothing else.
      if (actor.scopeCaseId) return actor.scopeCaseId === request.id;
      return this.scope.assertCaseAccess(actor, request.id, 'Case').then(
        () => true,
        () => false,
      );
    }
    if (actor.scopeCaseId) return false;
    // A database error is a refusal, not a missing answer.
    return this.scope.isHospitalStaff(actor, request.id).catch(() => false);
  }

  @SubscribeMessage('join')
  async join(@ConnectedSocket() socket: RealtimeSocket, @MessageBody() body: unknown) {
    if (!this.allow(socket)) return { ok: false };
    const request = joinRequestSchema.safeParse(body);
    if (!request.success) return { ok: false };
    if (socket.rooms.size >= MAX_ROOMS) return { ok: false };
    // One answer for "no such room" and "not yours".
    if (!(await this.mayJoin(socket.data.actor, request.data))) return { ok: false };
    // Checked again after the wait: several joins in flight at once must not pass the cap together.
    if (socket.rooms.size >= MAX_ROOMS) return { ok: false };
    await socket.join(roomOf[request.data.kind](request.data.id));
    return { ok: true };
  }

  @SubscribeMessage('leave')
  async leave(@ConnectedSocket() socket: RealtimeSocket, @MessageBody() body: unknown) {
    if (!this.allow(socket)) return { ok: false };
    const request = joinRequestSchema.safeParse(body);
    if (!request.success) return { ok: false };
    await socket.leave(roomOf[request.data.kind](request.data.id));
    return { ok: true };
  }

  /** Relays "is typing" to the others in a case room the sender is in. Not logged: it is of no use a minute later. */
  @SubscribeMessage('typing')
  typing(@ConnectedSocket() socket: RealtimeSocket, @MessageBody() body: unknown) {
    const request = typingRequestSchema.safeParse(body);
    if (!request.success) return { ok: false };
    const now = Date.now();
    const window = socket.data.typing;
    if (window.resetsAt <= now)
      Object.assign(window, { count: 0, resetsAt: now + TYPING_WINDOW_MS });
    window.count += 1;
    if (window.count > TYPING_PER_WINDOW) return { ok: false };
    const room = roomOf.case(request.data.caseId);
    // Only from inside the room: a socket that was never let in cannot speak to it.
    if (!socket.rooms.has(room)) return { ok: false };
    const message: RealtimeMessage = realtimeMessageSchema.parse({
      id: randomUUID(),
      room,
      event: 'typing',
      at: new Date().toISOString(),
      payload: {
        caseId: request.data.caseId,
        userId: socket.data.actor.userId,
        typing: request.data.typing,
      },
    });
    socket.to(room).emit('event', message);
    return { ok: true };
  }

  /** After a reconnect: replay what happened in the rooms this socket is in since the time of the last event it saw. */
  @SubscribeMessage('sync')
  async sync(@ConnectedSocket() socket: RealtimeSocket, @MessageBody() body: unknown) {
    if (!this.allow(socket)) return { ok: false, replayed: 0 };
    const request = syncRequestSchema.safeParse(body);
    if (!request.success) return { ok: false, replayed: 0 };
    // Only what the person may still see is replayed.
    await this.revalidateRooms(socket);
    const rooms = [...socket.rooms].filter((room) => room !== socket.id);
    const { events, truncated } = await this.realtime.publisher
      .missed(rooms, new Date(request.data.since))
      .catch((error: unknown) => {
        this.logger.warn(`catch-up failed: ${error instanceof Error ? error.message : 'unknown'}`);
        return { events: [], truncated: true };
      });
    for (const event of events) socket.emit('event', event);
    // The log did not reach back far enough: the client refetches what it shows instead.
    if (truncated) socket.emit('resync');
    return { ok: true, replayed: events.length, truncated };
  }
}
