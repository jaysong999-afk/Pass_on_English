import { useCallback } from "react";
import { useApiResource } from "@/hooks/useApiResource";
import { apiRequest } from "@/lib/api/client";
import type { PricingPlan } from "@/types";

export function usePricingPlans(activeOnly = true) {
  const load = useCallback(async () => {
    const data = await apiRequest<{ plans?: PricingPlan[] }>(
      `/api/pricing-plans${activeOnly ? "?active=true" : ""}`
    );
    return data.plans ?? [];
  }, [activeOnly]);

  const { data: plans, loading, error: loadError, reload } = useApiResource(load, []);
  const error = loadError ? "요금제를 불러오지 못했습니다." : null;

  return { plans, loading, error, reload };
}
