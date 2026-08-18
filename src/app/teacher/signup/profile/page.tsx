"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TeacherProfileForm } from "@/components/teacher/TeacherProfileForm";
import { fetchTeacherApplicationById } from "@/lib/teacher-applications";
import type { TeacherApplication, TeacherProfileInput } from "@/types";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; application: TeacherApplication }
  | { kind: "unauthorized" }
  | { kind: "invalid" };

function SignupProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get("applicationId");

  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!applicationId) {
      setLoadState({ kind: "invalid" });
      return;
    }

    fetchTeacherApplicationById(applicationId).then((result) => {
      if (result.ok) {
        setLoadState({ kind: "ready", application: result.application });
        return;
      }
      if (result.error === "unauthorized") {
        setLoadState({ kind: "unauthorized" });
        return;
      }
      setLoadState({ kind: "invalid" });
    });
  }, [applicationId]);

  async function handleSubmit(data: TeacherProfileInput) {
    if (!applicationId || loadState.kind !== "ready") {
      throw new Error("missing application");
    }

    setSubmitError("");
    const res = await fetch("/api/teachers/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        applicationId,
      }),
    });

    if (res.status === 401) {
      setLoadState({ kind: "unauthorized" });
      return;
    }

    if (!res.ok) {
      setSubmitError("Could not save your profile. Please try again.");
      throw new Error("save failed");
    }

    router.push("/teacher/signup/complete");
  }

  if (loadState.kind === "loading") {
    return <p className="py-12 text-center text-sm text-gray-500">Loading…</p>;
  }

  if (loadState.kind === "unauthorized") {
    return (
      <Card className="w-full max-w-lg border-0 shadow-2xl shadow-black/20">
        <CardContent className="py-10 text-center space-y-4">
          <p className="text-sm text-gray-600">
            Please complete step 1 first while signed in, then return to this page.
          </p>
          <Link
            href="/teacher/signup"
            className="inline-block text-sm font-semibold text-emerald-700 hover:underline"
          >
            Back to registration
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (loadState.kind === "invalid" || !applicationId) {
    return (
      <Card className="w-full max-w-lg border-0 shadow-2xl shadow-black/20">
        <CardContent className="py-10 text-center">
          <p className="text-sm text-gray-600">Invalid or expired application link.</p>
          <Link
            href="/teacher/signup"
            className="mt-4 inline-block text-sm font-semibold text-emerald-700"
          >
            Start registration again
          </Link>
        </CardContent>
      </Card>
    );
  }

  const { application } = loadState;
  const initial: TeacherProfileInput = {
    displayName: application.fullName,
    bio: "",
    specialties: [],
    experienceYears: 0,
    videoPlatforms: application.videoPlatforms,
  };

  return (
    <Card className="w-full max-w-lg border-0 shadow-2xl shadow-black/20">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
          <GraduationCap className="h-7 w-7" />
        </div>
        <CardTitle className="text-2xl">Your teaching profile</CardTitle>
        <CardDescription className="text-base leading-relaxed">
          Step 2 of 2 — This profile appears on our website and when students choose a teacher.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {submitError && <p className="mb-4 text-sm text-red-600">{submitError}</p>}
        <TeacherProfileForm
          initial={initial}
          onSubmit={handleSubmit}
          submitLabel="Submit profile & finish"
        />
      </CardContent>
    </Card>
  );
}

export default function TeacherSignupProfilePage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700">
      <header className="px-6 py-5">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-sm font-black text-white ring-1 ring-white/20">
            PE
          </div>
          <div>
            <p className="text-sm font-bold text-white">Pass on English</p>
            <p className="text-xs text-emerald-100/80">Teacher Portal</p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-10 pb-16">
        <Suspense fallback={<p className="text-white/80">Loading…</p>}>
          <SignupProfileContent />
        </Suspense>
      </main>
    </div>
  );
}
