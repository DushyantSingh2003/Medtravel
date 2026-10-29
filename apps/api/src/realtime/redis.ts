import { Redis } from 'ioredis';

/** A Redis connection that reports problems once instead of crashing the process or filling the log. */
export function connectRedis(url: string, onProblem: (message: string) => void): Redis {
  const client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
  let reported = false;
  client.on('error', (error: Error) => {
    if (reported) return;
    reported = true;
    onProblem(`Redis: ${error.message}`);
  });
  client.on('ready', () => {
    reported = false;
  });
  return client;
}
