import { useCallback, useEffect, useState } from "react";
import type { PricingPlan } from "@/types";

export function usePricingPlans(activeOnly = true) {
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pricing-plans${activeOnly ? "?active=true" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "load_failed");
      setPlans(data.plans ?? []);
    } catch {
      setError("요금제를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { plans, loading, error, reload };
}
