"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingSections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { studentBasePath } from "@/lib/student-paths";

export default function LoginPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "ko";
  const t = useTranslations("studentPortal.auth");

  return (
    <div className={`min-h-screen locale-${locale}`}>
      <LandingHeader locale={locale} />
      <main className="mx-auto max-w-md px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>{t("loginTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t("email")}</Label>
              <Input type="email" placeholder="student@email.com" autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label>{t("password")}</Label>
              <Input type="password" autoComplete="current-password" />
            </div>
            <Button asChild className="w-full h-11">
              <Link href={studentBasePath(locale)}>{t("login")}</Link>
            </Button>
            <p className="text-center text-sm text-gray-500">
              {t("noAccount")}{" "}
              <Link href={`/${locale}/signup`} className="font-semibold text-brand-600 hover:underline">
                {t("signup")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
      <LandingFooter />
    </div>
  );
}
