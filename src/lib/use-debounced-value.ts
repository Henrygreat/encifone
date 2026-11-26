"use client";

import { useEffect, useState } from "react";

/** Delays propagating a fast-changing value (typically search input) by
 * `delayMs`, so a query keyed on it doesn't re-fetch on every keystroke. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
