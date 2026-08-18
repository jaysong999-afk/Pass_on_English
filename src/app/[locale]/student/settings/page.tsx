"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Baby, CheckCircle2, ChevronRight, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { useActiveLearner } from "@/contexts/ActiveLearnerContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CountryCode, VideoPlatform } from "@/types";
import { VideoPlatformSelector } from "@/components/shared/VideoPlatformSelector";

type Notice = { type: "success" | "error"; message: string } | null;

const COUNTRIES: CountryCode[] = ["KR", "CN", "PH", "OTHER"];
const errorKeyMap: Record<string, string> = {
  missing_fields: "missingFields", invalid_length: "invalidLength",
  invalid_learner: "invalidLearner", profile_update_failed: "profileUpdateFailed",
  password_too_short: "passwordTooShort", password_mismatch: "passwordMismatch",
  password_unchanged: "passwordUnchanged", invalid_current_password: "invalidCurrentPassword",
  password_update_failed: "passwordUpdateFailed",
};

async function readErrorKey(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ? errorKeyMap[body.error] ?? fallback : fallback;
}

function ReadonlyField({ id, label, value, hint }: { id: string; label: string; value: string; hint?: string }) {
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <div className="relative">
      <Input id={id} value={value} readOnly aria-readonly="true" className="border-muted bg-muted/25 pr-10 text-foreground" />
      <LockKeyhole aria-hidden="true" className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
    {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
  </div>;
}

function PasswordInput({ id, label, value, onChange, autoComplete, showLabel, hideLabel }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  autoComplete: string; showLabel: string; hideLabel: string;
}) {
  const [visible, setVisible] = useState(false);
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <div className="relative">
      <Input id={id} type={visible ? "text" : "password"} value={value} autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)} className="pr-11" required />
      <button type="button" onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={visible ? hideLabel : showLabel}>
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  </div>;
}

export default function StudentSettingsPage() {
  const t = useTranslations("studentPortal.settings");
  const locale = useLocale();
  const { account, learners, loading, refresh } = useActiveLearner();
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<CountryCode>("KR");
  const [learnerNames, setLearnerNames] = useState<Record<string, string>>({});
  const [learnerPlatforms, setLearnerPlatforms] = useState<Record<string, VideoPlatform[]>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    if (!account) return;
    setPhone(account.phone);
    setCountry(account.country);
    setLearnerNames(Object.fromEntries(learners.map((learner) => [learner.id, learner.englishName])));
    setLearnerPlatforms(Object.fromEntries(learners.map((learner) => [learner.id, learner.videoPlatforms])));
  }, [account, learners]);

  const learnerChanges = useMemo(() => learners
    .filter((learner) => (learnerNames[learner.id] ?? "").trim() !== learner.englishName || JSON.stringify([...(learnerPlatforms[learner.id] ?? [])].sort()) !== JSON.stringify([...learner.videoPlatforms].sort()))
    .map((learner) => ({ id: learner.id, englishName: (learnerNames[learner.id] ?? "").trim(), videoPlatforms: learnerPlatforms[learner.id] ?? [] })),
  [learnerNames, learnerPlatforms, learners]);
  const hasChanges = account
    ? phone.trim() !== account.phone || country !== account.country || learnerChanges.length > 0
    : false;

  if (loading || !account) return <div className="py-16 text-center text-sm text-muted-foreground">{t("loading")}</div>;

  const renderNotice = (value: Notice) => value && <div role={value.type === "error" ? "alert" : "status"}
    className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${value.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-destructive/10 text-destructive"}`}>
    {value.type === "success" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}<span>{value.message}</span>
  </div>;

  async function saveSettings(event: FormEvent) {
    event.preventDefault(); setNotice(null);
    if (!phone.trim() || learnerChanges.some((learner) => !learner.englishName)) {
      setNotice({ type: "error", message: t("missingFields") }); return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/student/settings/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), country, learners: learnerChanges }),
      });
      if (!response.ok) {
        setNotice({ type: "error", message: t(await readErrorKey(response, "profileUpdateFailed")) }); return;
      }
      await refresh(); setNotice({ type: "success", message: t("saved") });
    } catch { setNotice({ type: "error", message: t("profileUpdateFailed") }); }
    finally { setSaving(false); }
  }

  function resetPasswordForm() {
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setPasswordNotice(null);
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault(); setPasswordNotice(null);
    if (newPassword.length < 8) { setPasswordNotice({ type: "error", message: t("passwordTooShort") }); return; }
    if (newPassword !== confirmPassword) { setPasswordNotice({ type: "error", message: t("passwordMismatch") }); return; }
    setPasswordSaving(true);
    try {
      const response = await fetch("/api/student/settings/password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      if (!response.ok) {
        setPasswordNotice({ type: "error", message: t(await readErrorKey(response, "passwordUpdateFailed")) }); return;
      }
      resetPasswordForm(); setPasswordOpen(false); setNotice({ type: "success", message: t("passwordChanged") });
    } catch { setPasswordNotice({ type: "error", message: t("passwordUpdateFailed") }); }
    finally { setPasswordSaving(false); }
  }

  return <form onSubmit={saveSettings} className="mx-auto max-w-4xl space-y-6 pb-24">
    <div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground sm:text-base">{t("subtitle")}</p></div>

    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/30"><div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><UserRound className="h-5 w-5" /></div>
        <div><CardTitle>{t("profileTitle")}</CardTitle><CardDescription className="mt-1">{t("profileDescription")}</CardDescription></div>
      </div></CardHeader>
      <CardContent className="grid gap-5 pt-6 sm:grid-cols-2">
        <ReadonlyField id="email" label={t("email")} value={account.email} hint={t("emailHint")} />
        <ReadonlyField id="fullName" label={t("fullName")} value={account.fullName} hint={t("nameHint")} />
        <div className="space-y-2"><Label htmlFor="phone">{t("phone")}</Label>
          <Input id="phone" type="tel" inputMode="tel" value={phone} maxLength={30} placeholder={t("phonePlaceholder")}
            onChange={(event) => setPhone(event.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="country">{t("country")}</Label>
          <select id="country" value={country} onChange={(event) => setCountry(event.target.value as CountryCode)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {COUNTRIES.map((code) => <option key={code} value={code}>{t(`country${code}`)}</option>)}
          </select><p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">{t("timezoneHint")}</p></div>
        {account.accountType === "self" && learners[0] && <div className="sm:col-span-2"><VideoPlatformSelector value={learnerPlatforms[learners[0].id] ?? []} onChange={(value) => setLearnerPlatforms((current) => ({ ...current, [learners[0].id]: value }))} language={locale === "zh-CN" ? "zh-CN" : "ko"} /></div>}
      </CardContent>
    </Card>

    {account.accountType === "guardian" && learners.length > 0 && <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/30"><div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Baby className="h-5 w-5" /></div>
        <div><CardTitle>{t("childrenTitle")}</CardTitle><CardDescription className="mt-1">{t("childrenDescription")}</CardDescription></div>
      </div></CardHeader>
      <CardContent className="space-y-4 pt-6">{learners.map((learner, index) => <section key={learner.id} className="rounded-xl border p-4 sm:p-5">
        <h3 className="mb-4 font-semibold">{t("childHeading", { number: index + 1, name: learner.fullName, englishName: learnerNames[learner.id] || learner.englishName })}</h3>
        <div className="grid gap-5 sm:grid-cols-2">
          <ReadonlyField id={`child-name-${learner.id}`} label={t("childName")} value={learner.fullName} />
          <div className="space-y-2"><Label htmlFor={`english-name-${learner.id}`}>{t("englishName")}</Label>
            <Input id={`english-name-${learner.id}`} value={learnerNames[learner.id] ?? ""} maxLength={80}
              onChange={(event) => setLearnerNames((current) => ({ ...current, [learner.id]: event.target.value }))} required /></div>
          <ReadonlyField id={`birth-date-${learner.id}`} label={t("dateOfBirth")} value={learner.dateOfBirth.replaceAll("-", ".")} />
          <div className="sm:col-span-2"><VideoPlatformSelector value={learnerPlatforms[learner.id] ?? []} onChange={(value) => setLearnerPlatforms((current) => ({ ...current, [learner.id]: value }))} language={locale === "zh-CN" ? "zh-CN" : "ko"} /></div>
        </div>
      </section>)}</CardContent>
    </Card>}

    <Card className="overflow-hidden"><CardHeader className="border-b bg-muted/30"><div className="flex items-start gap-3">
      <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><ShieldCheck className="h-5 w-5" /></div>
      <div><CardTitle>{t("securitySectionTitle")}</CardTitle><CardDescription className="mt-1">{t("securitySectionDescription")}</CardDescription></div>
    </div></CardHeader><CardContent className="pt-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="font-medium">{t("password")}</p><p className="mt-1 text-sm text-muted-foreground">{t("passwordMasked")}</p></div>
      <Button type="button" variant="outline" onClick={() => setPasswordOpen(true)}>{t("changePassword")}<ChevronRight className="ml-1 h-4 w-4" /></Button>
    </div></CardContent></Card>

    {renderNotice(notice)}
    <div className="flex justify-end"><Button type="submit" className="w-full sm:w-auto" disabled={saving || !hasChanges || !phone.trim()}>
      {saving ? t("saving") : t("saveProfile")}</Button></div>

    <Dialog open={passwordOpen} onOpenChange={(open) => { setPasswordOpen(open); if (!open) resetPasswordForm(); }}>
      <DialogContent><DialogHeader><DialogTitle>{t("securityTitle")}</DialogTitle><DialogDescription>{t("securityDescription")}</DialogDescription></DialogHeader>
        <form onSubmit={changePassword} className="space-y-5 pt-2">
          <PasswordInput id="currentPassword" label={t("currentPassword")} value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" showLabel={t("showPassword")} hideLabel={t("hidePassword")} />
          <PasswordInput id="newPassword" label={t("newPassword")} value={newPassword} onChange={setNewPassword} autoComplete="new-password" showLabel={t("showPassword")} hideLabel={t("hidePassword")} />
          <PasswordInput id="confirmPassword" label={t("confirmPassword")} value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" showLabel={t("showPassword")} hideLabel={t("hidePassword")} />
          <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>{renderNotice(passwordNotice)}
          <div className="flex justify-end"><Button type="submit" disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}>{passwordSaving ? t("changing") : t("changePassword")}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </form>;
}
