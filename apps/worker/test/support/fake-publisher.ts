import type { RealtimePublisher } from '@medtravel/realtime';

export interface PublishedEvent {
  room: string;
  event: string;
  payload: unknown;
}

/** A stand-in for the Redis publisher that records what would have been pushed to browsers, and can be told to fail. */
export function recordingPublisher() {
  const state = { published: [] as PublishedEvent[], failing: false };
  const publisher = {
    publish: async (room: string, event: string, payload: unknown) => {
      if (state.failing) throw new Error('redis down');
      state.published.push({ room, event, payload });
      return {} as never;
    },
  } as unknown as Pick<RealtimePublisher, 'publish'>;
  return { state, publisher };
}
