'use client';

import { getMe } from '@medtravel/api-client';
import { REALTIME_PATH, type RealtimeEventName, type RealtimeMessage } from '@medtravel/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { RealtimeClient, type SocketLike } from '../../lib/realtime/client';
import { applyEvent } from '../../lib/realtime/invalidate';

const RealtimeContext = createContext<RealtimeClient | null>(null);

/** Read as the literal `process.env.NEXT_PUBLIC_API_URL` so Next inlines it. */
const apiUrl = (): string => process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Gets a fresh session cookie: any API call does it when the old one has expired. False when the person is signed out. */
async function refreshSession(): Promise<boolean> {
  try {
    await getMe();
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens the portal's one realtime connection while a signed-in screen is open, and turns what arrives into cache refreshes:
 * a notification refreshes the bell, an event about a case refreshes everything loaded for that case, and "too much missed"
 * refreshes everything on screen. Screens add to this with `useRealtimeEvent`, `useCaseRoom` and `useTyping`.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // Created once per browser tab; nothing connects until the effect below starts it (and never on the server).
  const [client] = useState(
    () =>
      new RealtimeClient({
        createSocket: () =>
          io(apiUrl(), {
            path: REALTIME_PATH,
            withCredentials: true,
            // WebSocket only: long polling would need the cookie on every request and gains nothing on supported browsers.
            transports: ['websocket'],
            reconnectionDelay: 1000,
            reconnectionDelayMax: 30_000,
            randomizationFactor: 0.5,
          }) as unknown as SocketLike,
        refreshSession,
      }),
  );

  useEffect(() => {
    const stopEvents = client.subscribe((message) => void applyEvent(queryClient, message));
    const stopResync = client.onResync(() => void queryClient.invalidateQueries());
    client.start();
    return () => {
      stopEvents();
      stopResync();
      client.close();
    };
  }, [client, queryClient]);

  return <RealtimeContext.Provider value={client}>{children}</RealtimeContext.Provider>;
}

/** Calls the handler for each pushed event of this kind. */
export function useRealtimeEvent(
  event: RealtimeEventName,
  handler: (message: RealtimeMessage) => void,
): void {
  const client = useContext(RealtimeContext);
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  }, [handler]);
  useEffect(() => {
    if (!client) return;
    return client.subscribe((message) => {
      if (message.event === event) latest.current(message);
    });
  }, [client, event]);
}

/** Joins a case's room while the screen is open, so its events (and typing) reach this browser. */
export function useCaseRoom(caseId: string | undefined): void {
  const client = useContext(RealtimeContext);
  useEffect(() => {
    if (!client || !caseId) return;
    return client.join('case', caseId);
  }, [client, caseId]);
}

const TYPING_SHOWN_MS = 5000;

/**
 * Who else is typing in a case, and a function to say you are. Typing shows for five seconds after the last sign of it, and
 * your own signal is sent when you start and again when you stop.
 */
export function useTyping(caseId: string | undefined): {
  typingUserIds: string[];
  setTyping: (typing: boolean) => void;
} {
  const client = useContext(RealtimeContext);
  const [typing, setTypingState] = useState<Record<string, number>>({});
  useCaseRoom(caseId);

  useRealtimeEvent('typing', (message) => {
    if (message.payload['caseId'] !== caseId) return;
    const userId = String(message.payload['userId']);
    setTypingState((current) => {
      const next = { ...current };
      if (message.payload['typing'] === true) next[userId] = Date.now() + TYPING_SHOWN_MS;
      else delete next[userId];
      return next;
    });
  });

  // Forget people who stopped without saying so.
  useEffect(() => {
    if (Object.keys(typing).length === 0) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      setTypingState((current) =>
        Object.fromEntries(Object.entries(current).filter(([, until]) => until > now)),
      );
    }, 1000);
    return () => clearTimeout(timer);
  }, [typing]);

  const setTyping = useCallback(
    (value: boolean) => {
      if (client && caseId) client.sendTyping(caseId, value);
    },
    [client, caseId],
  );
  return { typingUserIds: Object.keys(typing), setTyping };
}
