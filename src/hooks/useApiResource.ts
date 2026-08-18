"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ApiResourceState<T> {
  data: T;
  error: unknown;
  loading: boolean;
}

/** Shared lifecycle for idempotent API reads. Mutations retain local pending state. */
export function useApiResource<T>(load: () => Promise<T>, initialData: T, enabled = true) {
  const requestId = useRef(0);
  const [state, setState] = useState<ApiResourceState<T>>({
    data: initialData,
    error: null,
    loading: enabled,
  });

  const reload = useCallback(async () => {
    if (!enabled) return;

    const currentRequest = ++requestId.current;
    setState((current) => ({ ...current, error: null, loading: true }));
    try {
      const data = await load();
      if (requestId.current === currentRequest) {
        setState({ data, error: null, loading: false });
      }
    } catch (error) {
      if (requestId.current === currentRequest) {
        setState((current) => ({ ...current, error, loading: false }));
      }
    }
  }, [enabled, load]);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload]);

  return { ...state, reload };
}
