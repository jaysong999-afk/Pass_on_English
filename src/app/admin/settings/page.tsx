"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: "모든 필드를 입력해 주세요.",
  password_too_weak: "14자 이상이며 영문 대·소문자, 숫자, 기호 중 3종류 이상을 포함해 주세요.",
  password_mismatch: "새 비밀번호 확인이 일치하지 않습니다.",
  password_unchanged: "현재 비밀번호와 다른 새 비밀번호를 입력해 주세요.",
  invalid_current_password: "현재 비밀번호가 올바르지 않습니다.",
  reauthentication_required: "보안을 위해 다시 로그인한 뒤 비밀번호 변경을 시도해 주세요.",
  rate_limited: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  password_update_failed: "비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  unauthorized: "로그인이 필요합니다.",
  forbidden: "관리자 권한이 필요합니다.",
  mfa_required: "2단계 인증을 완료한 뒤 다시 시도해 주세요.",
  invalid_origin: "보안 확인에 실패했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.",
};

export default function AdminSettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };

      if (!res.ok) {
        setError(ERROR_MESSAGES[data.error ?? ""] ?? "비밀번호 변경에 실패했습니다.");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("비밀번호가 변경되었습니다.");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-violet-600" /> 2단계 인증 및 로그인 기기
          </CardTitle>
          <CardDescription>
            인증 앱 등록 상태를 확인하고, 필요하면 다른 기기의 로그인 세션을 종료할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/admin/security">로그인 보안 관리</Link>
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>계정 보안</CardTitle>
          <CardDescription>
            관리자 비밀번호를 변경합니다. 변경 후 다른 기기에서도 재로그인이 필요할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">현재 비밀번호</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">새 비밀번호</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={14}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">새 비밀번호 확인</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={14}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <p className="text-xs leading-relaxed text-gray-500">
              14자 이상으로 만들고 영문 대·소문자, 숫자, 기호 중 3종류 이상을 사용하세요.
              비밀번호 관리자에서 생성한 고유 비밀번호를 권장합니다.
            </p>

            {error ? (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="text-sm text-emerald-700" role="status">
                {success}
              </p>
            ) : null}

            <Button type="submit" disabled={submitting} className="bg-violet-600 hover:bg-violet-700">
              {submitting ? "변경 중…" : "비밀번호 변경"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
