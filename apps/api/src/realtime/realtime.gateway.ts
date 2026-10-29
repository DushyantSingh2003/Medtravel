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
import { requiresTwoFactor } from '@medtravel/contracts';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import type { Actor } from '../auth/actor.js';
import { ACCESS_COOKIE, readCookie } from '../auth/cookies.js';
import { twoFactorEnforced } from '../auth/auth.guard.js';
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
}
type RealtimeSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

const MAX_ROOMS = 50;
const TYPING_PER_WINDOW = 30;
const TYPING_WINDOW_MS = 10_000;
/** How often a connected session is checked to still be valid. */
const RECHECK_MS = 60_000;

/**
 * The Socket.IO endpoint. A connection is let in only with a valid session (the same check as every API request); it joins its
 * own room at once and may join case and hospital rooms the permission rules allow. Events are pushed to rooms by
 * `RealtimeService`/the worker; the one thing a client sends is `typing`.
 */
@WebSocketGateway({ path: '/realtime' })
export class RealtimeGateway implements OnGatewayInit {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() private server!: Server;
  private timer: NodeJS.Timeout | undefined;

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
    const owed =
      session.actor.scopeCaseId === null &&
      !session.twoFactorVerified &&
      ((requiresTwoFactor(session.user.role) && twoFactorEnforced(this.env)) ||
        session.user.twoFactorEnabled);
    if (owed) return false;
    socket.data = {
      actor: session.actor,
      token,
      typing: { count: 0, resetsAt: 0 },
    };
    return true;
  }

  /** Disconnects every socket whose session is no longer valid; runs every minute. */
  async recheck(): Promise<void> {
    for (const socket of this.server.sockets.sockets.values() as Iterable<RealtimeSocket>) {
      const valid = await this.sessions.authenticate(socket.data.token).catch(() => null);
      if (!valid) {
        socket.emit('session_expired');
        socket.disconnect(true);
      }
    }
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
    return this.scope.isHospitalStaff(actor, request.id);
  }

  @SubscribeMessage('join')
  async join(@ConnectedSocket() socket: RealtimeSocket, @MessageBody() body: unknown) {
    const request = joinRequestSchema.safeParse(body);
    if (!request.success) return { ok: false };
    if (socket.rooms.size >= MAX_ROOMS) return { ok: false };
    // One answer for "no such room" and "not yours".
    if (!(await this.mayJoin(socket.data.actor, request.data))) return { ok: false };
    await socket.join(roomOf[request.data.kind](request.data.id));
    return { ok: true };
  }

  @SubscribeMessage('leave')
  async leave(@ConnectedSocket() socket: RealtimeSocket, @MessageBody() body: unknown) {
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
    const request = syncRequestSchema.safeParse(body);
    if (!request.success) return { ok: false, replayed: 0 };
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
