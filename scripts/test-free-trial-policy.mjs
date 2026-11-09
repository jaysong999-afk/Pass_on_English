import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isFreeTrialEligible,
  parseFreeTrialPolicy,
} from "../src/lib/free-trial-policy.ts";
import { applyFreeTrialAvailabilityToFaq } from "../src/lib/faq/free-trial-availability.ts";

const paused = parseFreeTrialPolicy({ mode: "paused" });
const enabled = parseFreeTrialPolicy({
  mode: "enabled",
  eligibleFrom: "2027-03-01T00:00:00+09:00",
});
const invalid = parseFreeTrialPolicy({ mode: "enabled", eligibleFrom: "not-a-date" });

const candidate = {
  trialUsed: false,
  createdAt: "2027-03-01T00:00:00+09:00",
};

if (isFreeTrialEligible(candidate, paused)) {
  throw new Error("paused policy must reject new free trials");
}
if (invalid.acceptsNewTrials) {
  throw new Error("enabled policy without a valid cutoff must fail closed");
}
if (!isFreeTrialEligible(candidate, enabled)) {
  throw new Error("learner created at the cutoff must be eligible");
}
if (
  isFreeTrialEligible(
    { ...candidate, createdAt: "2027-02-28T23:59:59+09:00" },
    enabled
  )
) {
  throw new Error("pre-cutoff learner must remain ineligible");
}
if (isFreeTrialEligible({ ...candidate, trialUsed: true }, enabled)) {
  throw new Error("learner with a used trial must remain ineligible");
}

const trialFaq = {
  id: "00000000-0000-0000-0001-000000000001",
  categoryKo: "무료 체험",
  categoryZh: "免费体验",
  questionKo: "무료 체험은 어떻게 신청하나요?",
  questionZh: "如何申请免费体验？",
  answerKo: "무료체험 안내",
  answerZh: "免费试听说明",
  sortOrder: 10,
  published: true,
  updatedAt: "2026-08-01T00:00:00.000Z",
};
const [pausedFaq] = applyFreeTrialAvailabilityToFaq([trialFaq], false);
if (pausedFaq.answerKo.includes("무료체험 안내") || !pausedFaq.answerKo.includes("일시 중단")) {
  throw new Error("student FAQ must disclose the temporary free-trial pause");
}
if (applyFreeTrialAvailabilityToFaq([trialFaq], true)[0] !== trialFaq) {
  throw new Error("enabled policy must preserve the configured FAQ item");
}

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const confirmRoute = read("src/app/api/enrollments/confirm/route.ts");
const accountRoute = read("src/app/api/student/account/route.ts");
const profileRoute = read("src/app/api/student/profile/route.ts");
const dockerfile = read("Dockerfile");
const compose = read("deploy/tencent-lighthouse/docker-compose.yml");

if (!confirmRoute.includes("bookTrial: isFreeTrialEligible(activeLearner)")) {
  throw new Error("enrollment confirmation does not enforce the central trial policy");
}
for (const [name, source] of [
  ["student account", accountRoute],
  ["legacy student profile", profileRoute],
]) {
  const guardIndex = source.indexOf("isFreeTrialEligible(learner)");
  const createIndex = source.indexOf("createTrialLessonInDb({", guardIndex);
  if (guardIndex < 0 || createIndex < 0 || guardIndex > createIndex) {
    throw new Error(`${name} trial route is not guarded before lesson creation`);
  }
}

for (const variable of [
  "NEXT_PUBLIC_FREE_TRIAL_MODE",
  "NEXT_PUBLIC_FREE_TRIAL_ELIGIBLE_FROM",
]) {
  if (!dockerfile.includes(`ARG ${variable}`) || !compose.includes(`${variable}:`)) {
    throw new Error(`${variable} is not wired into the production image build`);
  }
}

console.log("PASS free-trial pause, cutoff eligibility, and server creation guards");
