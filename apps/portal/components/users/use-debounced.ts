import { useEffect, useState } from 'react';

/** A value that follows `value` after it has stopped changing for a moment, so typing does not send a request per key. */
export function useDebounced(value: string, ms = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim()), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
