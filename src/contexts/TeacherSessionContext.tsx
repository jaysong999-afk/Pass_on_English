"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";

interface TeacherSessionValue {
  teacherId: string | null;
  teacherName: string | null;
  authenticated: boolean;
  loading: boolean;
}

const TeacherSessionContext = createContext<TeacherSessionValue>({
  teacherId: null,
  teacherName: null,
  authenticated: false,
  loading: true,
});

export function TeacherSessionProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<TeacherSessionValue>({
    teacherId: null,
    teacherName: null,
    authenticated: false,
    loading: true,
  });

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session");
      const data = (await res.json()) as {
        authenticated?: boolean;
        user?: { id: string };
        profile?: { role?: string; fullName?: string | null };
      };

      if (data.authenticated && data.profile?.role === "teacher" && data.user?.id) {
        setValue({
          teacherId: data.user.id,
          teacherName: data.profile.fullName ?? null,
          authenticated: true,
          loading: false,
        });
        return;
      }

      setValue({
        teacherId: null,
        teacherName: null,
        authenticated: false,
        loading: false,
      });
    } catch {
      setValue({
        teacherId: null,
        teacherName: null,
        authenticated: false,
        loading: false,
      });
    }
  }, []);

  useEffect(() => {
    void refreshSession();

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refreshSession();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshSession]);

  return (
    <TeacherSessionContext.Provider value={value}>{children}</TeacherSessionContext.Provider>
  );
}

export function useTeacherSession() {
  return useContext(TeacherSessionContext);
}
