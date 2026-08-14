"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "이메일 또는 비밀번호가 올바르지 않습니다.",
  wrong_role: "관리자 계정이 아닙니다.",
  profile_not_found: "프로필을 찾을 수 없습니다. 관리자에게 문의해 주세요.",
};

function sanitizeAdminNextPath(value: string | null): string {
  if (!value || !value.startsWith("/admin") || value.startsWith("/admin/login")) {
    return "/admin";
  }
  return value;
}

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = sanitizeAdminNextPath(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    fetch("/api/auth/session")
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{ profile?: { role?: string } }>;
      })
      .then((data) => {
        if (data?.profile?.role === "admin") {
          router.replace(nextPath);
        }
      })
      .finally(() => setCheckingSession(false));
  }, [router, nextPath]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          role: "admin",
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(ERROR_MESSAGES[data.error ?? ""] ?? "로그인에 실패했습니다. 다시 시도해 주세요.");
        return;
      }

      router.push(nextPath);
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingSession) {
    return (
      <Card className="w-full max-w-md border-0 shadow-2xl shadow-black/20">
        <CardContent className="py-12 text-center text-sm text-gray-500">세션 확인 중…</CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md border-0 shadow-2xl shadow-black/20">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
          <Shield className="h-7 w-7" />
        </div>
        <CardTitle className="text-2xl">관리자 로그인</CardTitle>
        <CardDescription className="text-base leading-relaxed">
          학생·선생님 현황, 입금 확인, 재무·정산 관리
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-email">관리자 이메일</Label>
            <Input
              id="admin-email"
              type="email"
              placeholder="demo-admin@example.org"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password">비밀번호</Label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            className="h-12 w-full rounded-xl bg-violet-600 text-base hover:bg-violet-700"
            disabled={submitting}
          >
            {submitting ? "로그인 중…" : "로그인"}
          </Button>
          <p className="pt-2 text-center text-xs leading-relaxed text-gray-500">
            관리자 계정만 접속 가능합니다. 일반 학생은{" "}
            <Link href="/ko/login" className="font-semibold text-violet-700 hover:underline">
              학생 로그인
            </Link>
            을 이용해 주세요.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-violet-950 via-violet-900 to-indigo-950">
      <header className="px-6 py-5">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-sm font-black text-white ring-1 ring-white/20">
            PE
          </div>
          <div>
            <p className="text-sm font-bold text-white">Pass on English</p>
            <p className="text-xs text-violet-200/80">관리자 전용</p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <Suspense
          fallback={
            <Card className="w-full max-w-md border-0 shadow-2xl shadow-black/20">
              <CardContent className="py-12 text-center text-sm text-gray-500">Loading…</CardContent>
            </Card>
          }
        >
          <AdminLoginForm />
        </Suspense>
      </main>
    </div>
  );
}
