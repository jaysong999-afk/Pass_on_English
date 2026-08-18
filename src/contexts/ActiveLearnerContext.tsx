"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AccountHolder, AccountSession, Learner } from "@/types";
import { getStudentDisplayName } from "@/lib/student-display-name";
import { apiRequest } from "@/lib/api/client";

interface AccountContextValue {
  account: AccountHolder | null;
  learners: Learner[];
  activeLearner: Learner | null;
  activeLearnerId: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  switchLearner: (learnerId: string) => Promise<boolean>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function ActiveLearnerProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountHolder | null>(null);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [activeLearner, setActiveLearner] = useState<Learner | null>(null);
  const [activeLearnerId, setActiveLearnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiRequest<AccountSession & { activeLearner: Learner }>(
        "/api/student/account"
      );
      setAccount(data.account);
      setLearners(data.learners);
      setActiveLearner(data.activeLearner);
      setActiveLearnerId(data.activeLearnerId);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const switchLearner = useCallback(
    async (learnerId: string) => {
      const res = await fetch("/api/student/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch_learner", learnerId }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      setActiveLearner(data.activeLearner);
      setActiveLearnerId(data.activeLearner.id);
      setLearners(data.session.learners);
      return true;
    },
    []
  );

  const value = useMemo(
    () => ({
      account,
      learners,
      activeLearner,
      activeLearnerId,
      loading,
      refresh,
      switchLearner,
    }),
    [account, learners, activeLearner, activeLearnerId, loading, refresh, switchLearner]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useActiveLearner() {
  const ctx = useContext(AccountContext);
  if (!ctx) {
    throw new Error("useActiveLearner must be used within ActiveLearnerProvider");
  }
  return ctx;
}

export function useActiveLearnerDisplayName(): string {
  const { activeLearner } = useActiveLearner();
  if (!activeLearner) return "";
  return getStudentDisplayName(activeLearner);
}

export function useActiveLearnerId(): string {
  const { activeLearnerId, loading } = useActiveLearner();
  if (loading) return "";
  return activeLearnerId ?? "";
}
