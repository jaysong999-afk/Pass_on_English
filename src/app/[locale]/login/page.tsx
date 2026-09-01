"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingSections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { studentBasePath } from "@/lib/student-paths";

export default function LoginPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params.locale as string) ?? "ko";
  const t = useTranslations("studentPortal.auth");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
          role: "student",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const messages: Record<string, string> = {
          invalid_credentials: t("loginFailed"),
          wrong_role: t("loginFailed"),
          email_not_confirmed: t("emailNotConfirmed"),
          auth_rate_limited: t("loginRateLimited"),
          auth_temporarily_unavailable: t("authUnavailable"),
          auth_failed: t("authUnavailable"),
        };
        setError(messages[data.error] ?? t("authUnavailable"));
        return;
      }

      router.push(studentBasePath(locale));
      router.refresh();
    } catch {
      setError(t("errorNetwork"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`min-h-screen locale-${locale}`}>
      <LandingHeader locale={locale} />
      <main className="mx-auto max-w-md px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>{t("loginTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">{t("email")}</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="student@email.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">{t("password")}</Label>
                <Input
                  id="login-password"
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
              <Button type="submit" className="h-11 w-full" disabled={submitting}>
                {submitting ? t("loggingIn") : t("login")}
              </Button>
              <p className="text-center text-sm text-gray-500">
                {t("noAccount")}{" "}
                <Link
                  href={`/${locale}/signup`}
                  className="font-semibold text-brand-600 hover:underline"
                >
                  {t("signup")}
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </main>
      <LandingFooter locale={locale} />
    </div>
  );
}
