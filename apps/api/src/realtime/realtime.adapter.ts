import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { REALTIME_PATH } from '@medtravel/contracts';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server, ServerOptions } from 'socket.io';
import type { Env } from '../config/env.schema.js';
import { connectRedis } from './redis.js';

/**
 * The Socket.IO server's settings: its path, which sites may connect, and the Redis adapter that lets several API instances
 * deliver to each other's sockets. If Redis is unreachable the server still works for the sockets of this instance.
 */
export class RealtimeAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly env: Pick<Env, 'CORS_ORIGINS' | 'REDIS_URL'>,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      path: REALTIME_PATH,
      serveClient: false,
      // A browser always sends its Origin on a WebSocket handshake: refuse any site that is not one of ours (a page on another
      // site must not be able to open a connection with the visitor's cookies). Clients without an Origin (servers, tests)
      // still need a valid token.
      allowRequest: (request, callback) => {
        const origin = request.headers.origin;
        callback(null, origin === undefined || this.env.CORS_ORIGINS.includes(origin));
      },
      cors: { origin: this.env.CORS_ORIGINS, credentials: true },
    } as ServerOptions) as Server;
    const publisher = connectRedis(this.env.REDIS_URL, (message) => this.logger.warn(message));
    const subscriber = publisher.duplicate();
    subscriber.on('error', () => undefined);
    server.adapter(createAdapter(publisher, subscriber) as never);
    return server;
  }
}
