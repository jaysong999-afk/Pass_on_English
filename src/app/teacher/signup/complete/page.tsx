"use client";

import Link from "next/link";
import { CheckCircle2, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function TeacherSignupCompletePage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700">
      <header className="px-6 py-5">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-sm font-black text-white ring-1 ring-white/20">
            PE
          </div>
          <div>
            <p className="text-sm font-bold text-white">Pass on English</p>
            <p className="text-xs text-emerald-100/80">Teacher Portal</p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <Card className="w-full max-w-md border-0 shadow-2xl shadow-black/20">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <CardTitle className="text-2xl">Registration complete</CardTitle>
            <CardDescription className="text-base leading-relaxed">
              Your registration and teaching profile have been submitted. Our admin team will
              review your information and activate your account within 1–2 business days.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <p className="font-semibold">What happens next?</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-emerald-800/90">
                <li>Admin reviews your profile and documents</li>
                <li>You will receive an email when approved</li>
                <li>Then you can sign in and set up your teaching schedule</li>
              </ul>
            </div>

            <Button asChild className="h-12 w-full rounded-xl bg-emerald-600 text-base hover:bg-emerald-700">
              <Link href="/teacher/login">
                <GraduationCap className="mr-2 h-4 w-4" />
                Back to sign in
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
