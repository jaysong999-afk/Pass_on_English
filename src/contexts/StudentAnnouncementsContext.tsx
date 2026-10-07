"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocale } from "next-intl";
import type { StudentAnnouncement } from "@/lib/announcements/types";
import type { Locale } from "@/lib/i18n/config";

const FOCUS_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

interface StudentAnnouncementsContextValue {
  announcements: StudentAnnouncement[];
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
}

const StudentAnnouncementsContext = createContext<StudentAnnouncementsContextValue | null>(null);

export function StudentAnnouncementsProvider({ children }: { children: ReactNode }) {
  const locale = useLocale() as Locale;
  const [announcements, setAnnouncements] = useState<StudentAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const etagRef = useRef("");
  const lastFetchedAtRef = useRef(0);
  const requestInFlightRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (requestInFlightRef.current) return requestInFlightRef.current;

    const request = (async () => {
      try {
        const headers: HeadersInit = {};
        if (etagRef.current) headers["If-None-Match"] = etagRef.current;
        const response = await fetch(
          `/api/student/announcements?locale=${encodeURIComponent(locale)}`,
          { headers, cache: "no-store" }
        );

        if (response.status === 304) {
          lastFetchedAtRef.current = Date.now();
          setError(false);
          return;
        }
        if (!response.ok) throw new Error("announcements_fetch_failed");

        const data = (await response.json()) as { announcements?: StudentAnnouncement[] };
        etagRef.current = response.headers.get("etag") ?? "";
        lastFetchedAtRef.current = Date.now();
        setAnnouncements(data.announcements ?? []);
        setError(false);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
        requestInFlightRef.current = null;
      }
    })();

    requestInFlightRef.current = request;
    return request;
  }, [locale]);

  useEffect(() => {
    etagRef.current = "";
    lastFetchedAtRef.current = 0;
    setLoading(true);
    void refresh();

    const revalidateAfterBackground = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastFetchedAtRef.current >= FOCUS_REFRESH_INTERVAL_MS
      ) {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", revalidateAfterBackground);
    return () => document.removeEventListener("visibilitychange", revalidateAfterBackground);
  }, [locale, refresh]);

  const value = useMemo(
    () => ({ announcements, loading, error, refresh }),
    [announcements, error, loading, refresh]
  );

  return (
    <StudentAnnouncementsContext.Provider value={value}>
      {children}
    </StudentAnnouncementsContext.Provider>
  );
}

export function useStudentAnnouncements() {
  const context = useContext(StudentAnnouncementsContext);
  if (!context) {
    throw new Error("useStudentAnnouncements must be used within StudentAnnouncementsProvider");
  }
  return context;
}
