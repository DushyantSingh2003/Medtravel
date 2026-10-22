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

/** Choices made while storage is blocked: they last until the page is reloaded. */
const memory = new Map<string, boolean>();

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    // Storage blocked: fall back to what was chosen in this page.
  }
  return memory.get(key) ?? false;
}

/**
 * A true/false preference remembered in this browser (the collapsed sidebar). The server and the first
 * client render both see `false`, so there is no hydration mismatch; the stored value applies right after.
 * When storage is blocked the choice still works (kept in memory) until the page is reloaded.
 */
export function useStoredFlag(key: string): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => false,
  );
  const set = useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, next ? '1' : '0');
        memory.delete(key);
      } catch {
        memory.set(key, next);
        // Blocked storage: the in-memory choice still applies until reload.
      }
      notify();
    },
    [key],
  );
  return [value, set];
}
