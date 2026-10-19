"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

interface SecurityStatus {
  mode: "optional" | "required";
  currentLevel: "aal1" | "aal2" | null;
  nextLevel: "aal1" | "aal2" | null;
  hasVerifiedFactor: boolean;
  requiresVerification: boolean;
  recentMfa: boolean;
  verifiedFactors: Array<{
    id: string;
    friendlyName: string;
    createdAt: string;
    lastChallengedAt: string | null;
  }>;
}

interface Enrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/admin") || value.startsWith("/admin/login")) {
    return "/admin";
  }
  return value;
}

function MfaSecurityPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  const loadStatus = useCallback(async () => {
    const response = await fetch("/api/admin/security/status", { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as SecurityStatus & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "mfa_status_failed");
    setStatus(data);
  }, []);

  useEffect(() => {
    loadStatus().catch(() => setError("보안 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."));
  }, [loadStatus]);

  async function startEnrollment() {
    setError("");
    setMessage("");
    setWorking(true);
    try {
      const supabase = createClient();
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      for (const factor of factors.all) {
        if (factor.factor_type === "totp" && factor.status === "unverified") {
          const { error: cleanupError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
          if (cleanupError) throw cleanupError;
        }
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "PassOn English",
        friendlyName: `관리자 인증 앱 ${new Date().toLocaleDateString("ko-KR")}`,
      });
      if (enrollError) throw enrollError;
      setEnrollment({
        factorId: data.id,
        qrCode: `data:image/svg+xml;utf8,${encodeURIComponent(data.totp.qr_code)}`,
        secret: data.totp.secret,
      });
    } catch (enrollError) {
      console.error("[admin/security] enroll failed", enrollError);
      setError("인증 앱 등록을 시작하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
    } finally {
      setWorking(false);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    const factorId = enrollment?.factorId ?? status?.verifiedFactors[0]?.id;
    if (!factorId || !/^\d{6}$/.test(code.trim())) {
      setError("인증 앱에 표시된 6자리 숫자를 입력해 주세요.");
      return;
    }

    setError("");
    setMessage("");
    setWorking(true);
    try {
      const verifyResponse = await fetch("/api/admin/security/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factorId,
          code: code.trim(),
        }),
      });
      if (!verifyResponse.ok) throw new Error("mfa_verify_failed");

      setCode("");
      setEnrollment(null);
      setMessage("2단계 인증이 확인되었습니다.");
      await loadStatus();
      router.refresh();
      if (searchParams.has("next")) router.replace(nextPath);
    } catch (verifyError) {
      console.error("[admin/security] verification failed", verifyError);
      setError("인증번호가 올바르지 않거나 만료되었습니다. 새 번호로 다시 시도해 주세요.");
    } finally {
      setWorking(false);
    }
  }

  async function revokeOtherSessions() {
    setError("");
    setMessage("");
    setWorking(true);
    try {
      const response = await fetch("/api/admin/security/sessions", { method: "POST" });
      if (!response.ok) throw new Error("session_revoke_failed");
      setMessage("현재 기기를 제외한 다른 로그인 세션을 종료했습니다.");
    } catch {
      setError("다른 기기 세션을 종료하지 못했습니다.");
    } finally {
      setWorking(false);
    }
  }

  if (!status) {
    return <p className="py-16 text-center text-sm text-gray-500">보안 상태 확인 중…</p>;
  }

  const sessionVerified =
    status.currentLevel === "aal2" && (status.mode === "optional" || status.recentMfa);
  const needsCode =
    enrollment ||
    (status.hasVerifiedFactor &&
      (status.currentLevel !== "aal2" || (status.mode === "required" && !status.recentMfa)));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-violet-600" />
                관리자 2단계 인증
              </CardTitle>
              <CardDescription className="mt-2 leading-relaxed">
                Google Authenticator, Microsoft Authenticator, 2FAS 등 시간 기반 인증 앱을 사용합니다.
                중국에서도 VPN 없이 인증번호를 생성할 수 있습니다.
              </CardDescription>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
              sessionVerified
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
            }`}>
              {sessionVerified ? "인증 완료" : "추가 인증 필요"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {status.mode === "optional" ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-relaxed text-blue-900">
              현재는 등록 준비 기간입니다. 두 관리자 모두 등록·로그인 확인을 마친 뒤 운영 설정을
              <strong> required</strong>로 변경하면 전체 관리자 기능에서 의무화됩니다.
            </div>
          ) : null}

          {!status.hasVerifiedFactor && !enrollment ? (
            <div className="rounded-xl border border-gray-200 p-5">
              <div className="flex items-start gap-3">
                <Smartphone className="mt-0.5 h-5 w-5 text-violet-600" />
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">첫 인증 앱 등록</p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">
                    각 관리자가 자신의 휴대전화에 별도로 등록해야 합니다. QR과 비밀키는 이 화면을
                    벗어나면 다시 표시되지 않습니다.
                  </p>
                  <Button className="mt-4 bg-violet-600 hover:bg-violet-700" onClick={startEnrollment} disabled={working}>
                    <KeyRound className="mr-2 h-4 w-4" /> 인증 앱 등록 시작
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {enrollment ? (
            <div className="grid gap-5 rounded-xl border border-violet-200 bg-violet-50/40 p-5 md:grid-cols-[220px_1fr]">
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <Image src={enrollment.qrCode} alt="관리자 2단계 인증 QR 코드" width={196} height={196} unoptimized />
              </div>
              <div className="space-y-3">
                <p className="font-semibold">1. 인증 앱에서 QR 코드를 스캔하세요.</p>
                <p className="text-sm text-gray-600">스캔할 수 없다면 아래 키를 인증 앱에 직접 입력하세요.</p>
                <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2">
                  <code className="min-w-0 flex-1 break-all text-sm">{enrollment.secret}</code>
                  <Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(enrollment.secret)}>
                    <Copy className="h-4 w-4" />
                    <span className="sr-only">비밀키 복사</span>
                  </Button>
                </div>
                <p className="text-sm font-semibold">2. 앱에 표시된 6자리 번호로 등록을 완료하세요.</p>
              </div>
            </div>
          ) : null}

          {needsCode ? (
            <form onSubmit={verifyCode} className="max-w-sm space-y-3">
              <Label htmlFor="mfa-code">6자리 인증번호</Label>
              <Input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                required
              />
              <Button type="submit" disabled={working} className="bg-violet-600 hover:bg-violet-700">
                {working ? "확인 중…" : enrollment ? "등록 완료" : "인증하고 계속"}
              </Button>
            </form>
          ) : null}

          {sessionVerified ? (
            <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-center gap-2 font-semibold text-emerald-900">
                <CheckCircle2 className="h-5 w-5" /> 이 로그인 세션은 2단계 인증으로 보호됩니다.
              </div>
              <p className="text-sm leading-relaxed text-emerald-900/80">
                등록된 인증 앱 {status.verifiedFactors.length}개 · 계정을 공유하지 말고 각 관리자 계정을
                별도로 사용하세요.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={revokeOtherSessions} disabled={working}>
                  다른 기기에서 로그아웃
                </Button>
                <Button asChild className="bg-violet-600 hover:bg-violet-700">
                  <Link href={nextPath}>관리자 화면으로 이동</Link>
                </Button>
              </div>
            </div>
          ) : null}

          {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
          {message ? <p role="status" className="text-sm text-emerald-700">{message}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminSecurityPage() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-gray-500">보안 화면 준비 중…</p>}>
      <MfaSecurityPanel />
    </Suspense>
  );
}
