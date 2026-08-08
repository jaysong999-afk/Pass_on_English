"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function TeacherLoginPage() {
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
              <GraduationCap className="h-7 w-7" />
            </div>
            <CardTitle className="text-2xl">Teacher Sign In</CardTitle>
            <CardDescription className="text-base leading-relaxed">
              Access your schedule, students, and salary dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="teacher-email">Email</Label>
              <Input id="teacher-email" type="email" placeholder="teacher@passonenglish.com" autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="teacher-password">Password</Label>
              <Input id="teacher-password" type="password" autoComplete="current-password" />
            </div>
            <Button asChild className="h-12 w-full rounded-xl bg-emerald-600 text-base hover:bg-emerald-700">
              <Link href="/teacher">Sign In</Link>
            </Button>
            <p className="pt-2 text-center text-sm text-gray-500">
              New teacher?{" "}
              <Link href="/teacher/signup" className="font-semibold text-emerald-700 hover:underline">
                Apply to join
              </Link>
            </p>
            <p className="text-center text-xs leading-relaxed text-gray-500">
              For teachers only. Students please use the{" "}
              <Link href="/ko/login" className="font-semibold text-emerald-700 hover:underline">
                student login
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
