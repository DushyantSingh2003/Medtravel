'use client';

import { useCallback, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/**
 * A true/false preference remembered in this browser (the collapsed sidebar). The server and the first
 * client render both see `false`, so there is no hydration mismatch; the stored value applies right after.
 * When storage is blocked the choice still works until the page is reloaded.
 */
export function useStoredFlag(key: string): [boolean, (value: boolean) => void] {
  const memory = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => false,
  );
  const set = useCallback(
    (value: boolean) => {
      try {
        window.localStorage.setItem(key, value ? '1' : '0');
      } catch {
        // Blocked storage: nothing to remember the choice in.
      }
      notify();
    },
    [key],
  );
  return [memory, set];
}
