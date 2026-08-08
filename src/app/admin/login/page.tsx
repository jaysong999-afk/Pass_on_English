"use client";

import Link from "next/link";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email">관리자 이메일</Label>
              <Input id="admin-email" type="email" placeholder="admin@passonenglish.com" autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">비밀번호</Label>
              <Input id="admin-password" type="password" autoComplete="current-password" />
            </div>
            <Button asChild className="h-12 w-full rounded-xl bg-violet-600 text-base hover:bg-violet-700">
              <Link href="/admin">로그인</Link>
            </Button>
            <p className="pt-2 text-center text-xs leading-relaxed text-gray-500">
              관리자 계정만 접속 가능합니다. 일반 학생은{" "}
              <Link href="/ko/login" className="font-semibold text-violet-700 hover:underline">
                학생 로그인
              </Link>
              을 이용해 주세요.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
