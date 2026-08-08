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
import type { AccountType, CountryCode } from "@/types";
import { studentPath } from "@/lib/student-paths";
import { cn } from "@/lib/utils";

const selectClassName =
  "flex h-11 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

export default function SignupPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params.locale as string) ?? "ko";
  const t = useTranslations("studentPortal.auth");

  const [accountType, setAccountType] = useState<AccountType>("guardian");
  const [fullName, setFullName] = useState("");
  const [englishName, setEnglishName] = useState("");
  const [learnerFullName, setLearnerFullName] = useState("");
  const [learnerEnglishName, setLearnerEnglishName] = useState("");
  const [learnerDateOfBirth, setLearnerDateOfBirth] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<CountryCode>("KR");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isSelf = accountType === "self";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError(t("passwordMin"));
      return;
    }

    if (password !== passwordConfirm) {
      setError(t("passwordMismatch"));
      return;
    }

    const effectiveLearnerDob = isSelf ? dateOfBirth : learnerDateOfBirth;
    if (!effectiveLearnerDob) {
      setError(t("birthRequired"));
      return;
    }

    if (!isSelf && (!learnerFullName.trim() || !learnerEnglishName.trim())) {
      setError(t("learnerFieldsRequired"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/student/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountType,
          fullName,
          email,
          phone,
          country,
          learnerFullName: isSelf ? fullName : learnerFullName,
          learnerEnglishName: isSelf ? englishName : learnerEnglishName,
          learnerDateOfBirth: effectiveLearnerDob,
        }),
      });

      if (!res.ok) {
        setError(t("signupFailed"));
        return;
      }

      router.push(studentPath(locale, "onboarding"));
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
            <CardTitle>{t("signupTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>{t("accountType")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAccountType("self")}
                    className={cn(
                      "rounded-xl border p-3 text-left text-sm transition-colors",
                      isSelf
                        ? "border-brand-600 bg-brand-50 ring-2 ring-brand-600/20"
                        : "border-gray-200 hover:border-brand-200"
                    )}
                  >
                    <p className="font-semibold text-ink">{t("accountTypeSelf")}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{t("accountTypeSelfDesc")}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountType("guardian")}
                    className={cn(
                      "rounded-xl border p-3 text-left text-sm transition-colors",
                      !isSelf
                        ? "border-brand-600 bg-brand-50 ring-2 ring-brand-600/20"
                        : "border-gray-200 hover:border-brand-200"
                    )}
                  >
                    <p className="font-semibold text-ink">{t("accountTypeGuardian")}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{t("accountTypeGuardianDesc")}</p>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">
                  {isSelf ? t("fullName") : t("guardianFullName")}
                </Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t("fullNamePlaceholder")}
                  required
                />
              </div>

              {isSelf && (
                <div className="space-y-2">
                  <Label htmlFor="englishName">{t("englishName")}</Label>
                  <Input
                    id="englishName"
                    value={englishName}
                    onChange={(e) => setEnglishName(e.target.value)}
                    placeholder="Minjun Kim"
                    required
                  />
                </div>
              )}

              {!isSelf && (
                <>
                  <div className="rounded-xl border border-brand-100 bg-brand-50/30 p-3 text-xs text-ink-muted">
                    {t("learnerSectionHint")}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="learnerFullName">{t("learnerFullName")}</Label>
                    <Input
                      id="learnerFullName"
                      value={learnerFullName}
                      onChange={(e) => setLearnerFullName(e.target.value)}
                      placeholder={t("fullNamePlaceholder")}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="learnerEnglishName">{t("learnerEnglishName")}</Label>
                    <Input
                      id="learnerEnglishName"
                      value={learnerEnglishName}
                      onChange={(e) => setLearnerEnglishName(e.target.value)}
                      placeholder="Minjun Kim"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="learnerDateOfBirth">{t("learnerBirthDate")}</Label>
                    <Input
                      id="learnerDateOfBirth"
                      type="date"
                      value={learnerDateOfBirth}
                      onChange={(e) => setLearnerDateOfBirth(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">{t("email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@email.com"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("password")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="passwordConfirm">{t("passwordConfirm")}</Label>
                <Input
                  id="passwordConfirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>

              {isSelf && (
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">{t("birthDate")}</Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="phone">{t("phone")}</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={locale === "zh-CN" ? "138-0000-0000" : "010-1234-5678"}
                  autoComplete="tel"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">{t("country")}</Label>
                <select
                  id="country"
                  className={selectClassName}
                  value={country}
                  onChange={(e) => setCountry(e.target.value as CountryCode)}
                  required
                >
                  <option value="KR">{t("countryKr")}</option>
                  <option value="CN">{t("countryCn")}</option>
                  <option value="OTHER">{t("countryOther")}</option>
                </select>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button type="submit" className="w-full h-11" disabled={submitting}>
                {submitting ? t("signingUp") : t("signup")}
              </Button>

              <p className="text-center text-sm text-gray-500">
                {t("hasAccount")}{" "}
                <Link href={`/${locale}/login`} className="font-semibold text-brand-600 hover:underline">
                  {t("login")}
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </main>
      <LandingFooter />
    </div>
  );
}
