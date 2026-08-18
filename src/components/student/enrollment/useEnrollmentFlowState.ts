"use client";

import { useEffect, useMemo, useState } from "react";
import { useActiveLearner } from "@/contexts/ActiveLearnerContext";
import { usePricingPlans } from "@/hooks/usePricingPlans";
import { useTeacherOpenSlots } from "@/hooks/useTeacherOpenSlots";
import { isUpcomingTrial, resolveEnrollmentPath } from "@/lib/enrollments/trial-path";
import type { SlotStartTime } from "@/lib/availability/types";
import type { StudentEnrollment, Teacher } from "@/types";
import { areVideoPlatformsCompatible } from "@/lib/video-platforms";

export type EnrollmentFlowMode = "new" | "renew";

interface StudentProfileSummary {
  fullName: string;
  englishName: string;
  trialUsed: boolean;
}

interface EnrollmentFlowStateInput {
  mode: EnrollmentFlowMode;
  teachers: Teacher[];
  enrollment?: StudentEnrollment;
  studentFallback: string;
}

export function useEnrollmentFlowState({
  mode,
  teachers,
  enrollment,
  studentFallback,
}: EnrollmentFlowStateInput) {
  const { activeLearner, account } = useActiveLearner();
  const [profile, setProfile] = useState<StudentProfileSummary | null>(null);
  const [trialScheduledAt, setTrialScheduledAt] = useState<string | null>(null);
  const [trialDurationMinutes, setTrialDurationMinutes] = useState(20);
  const [profileLoading, setProfileLoading] = useState(mode === "new");
  const { plans, loading: plansLoading } = usePricingPlans(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
    enrollment?.planId ?? null
  );
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(
    enrollment?.teacherId ?? null
  );
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "new") return;

    fetch("/api/student/account")
      .then((res) => res.json())
      .then((data) => {
        if (data.activeLearner) {
          const pendingAt = data.activeLearner.trialScheduledAt as string | undefined;
          if (isUpcomingTrial(pendingAt) && pendingAt) {
            setTrialScheduledAt(pendingAt);
            setTrialDurationMinutes(data.activeLearner.trialDurationMinutes ?? 20);
          }
          setProfile({
            fullName: data.activeLearner.fullName,
            englishName: data.activeLearner.englishName,
            trialUsed: Boolean(data.activeLearner.trialUsed),
          });
        } else {
          setProfile({ fullName: "", englishName: "", trialUsed: true });
        }
      })
      .catch(() => setProfile({ fullName: "", englishName: "", trialUsed: true }))
      .finally(() => setProfileLoading(false));
  }, [mode]);

  useEffect(() => {
    if (plans.length === 0 || selectedPlanId) return;
    setSelectedPlanId(plans[0].id);
  }, [plans, selectedPlanId]);

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);
  const learnerVideoPlatforms = activeLearner?.videoPlatforms;
  const compatibleTeachers = useMemo(
    () =>
      teachers.filter(
        (teacher) =>
          !learnerVideoPlatforms ||
          areVideoPlatformsCompatible(learnerVideoPlatforms, teacher.videoPlatforms)
      ),
    [teachers, learnerVideoPlatforms]
  );
  const selectedTeacher = compatibleTeachers.find((teacher) => teacher.id === selectedTeacherId);
  const depositorName = account?.fullName ?? profile?.fullName ?? studentFallback;
  const availability = useTeacherOpenSlots(
    compatibleTeachers,
    selectedPlan?.scheduleDays,
    selectedPlan?.sessionMinutes ?? 20,
    selectedTeacher?.id ?? null
  );
  const selectedSlot =
    availability.openSlots.find((slot) => slot.id === selectedSlotId) ?? null;
  const enrollmentPath = resolveEnrollmentPath({
    mode,
    trialUsed: profile?.trialUsed ?? true,
    pendingTrialScheduledAt: trialScheduledAt,
  });
  const renewPlan =
    mode === "renew" && enrollment
      ? plans.find((plan) => plan.id === enrollment.planId)
      : null;
  const renewTeacher =
    mode === "renew" && enrollment
      ? compatibleTeachers.find((teacher) => teacher.id === enrollment.teacherId)
      : null;
  const renewSlotTime = (enrollment?.preferredSlotTime ?? "10:00") as SlotStartTime;

  return {
    activeLearner,
    profile,
    profileLoading,
    trialScheduledAt,
    setTrialScheduledAt,
    trialDurationMinutes,
    setTrialDurationMinutes,
    plans,
    plansLoading,
    selectedPlanId,
    setSelectedPlanId,
    selectedTeacherId,
    setSelectedTeacherId,
    selectedSlotId,
    setSelectedSlotId,
    selectedPlan,
    selectedTeacher,
    selectedSlot,
    depositorName,
    enrollmentPath,
    renewPlan,
    renewTeacher,
    renewSlotTime,
    ...availability,
  };
}
