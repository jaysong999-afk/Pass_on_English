"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TeacherAvatarUpload, type TeacherAvatarUploadResult } from "@/components/teacher/TeacherAvatarUpload";
import { TEACHER_SPECIALTY_OPTIONS } from "@/lib/teacher-specialties";
import { cn } from "@/lib/utils";
import type { TeacherSelfSettings } from "@/lib/teachers/repository";
import type { TeacherSpecialty } from "@/types";
import type { VideoPlatform } from "@/types";
import { VideoPlatformSelector } from "@/components/shared/VideoPlatformSelector";

type Notice = { type: "success" | "error"; message: string } | null;

function ReadonlyField({ id, label, value, hint }: { id: string; label: string; value: string; hint?: string }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><div className="relative">
    <Input id={id} value={value || "—"} readOnly aria-readonly="true" className="border-muted bg-muted/25 pr-10 text-foreground" />
    <LockKeyhole className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
  </div>{hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}</div>;
}

function PasswordInput({ id, label, value, onChange, autoComplete }: {
  id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><div className="relative">
    <Input id={id} type={visible ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)}
      autoComplete={autoComplete} className="pr-11" required />
    <button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Hide password" : "Show password"}
      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground">
      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  </div></div>;
}

export default function TeacherProfilePage() {
  const [initial, setInitial] = useState<TeacherSelfSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [specialties, setSpecialties] = useState<TeacherSpecialty[]>([]);
  const [experienceYears, setExperienceYears] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [messengerId, setMessengerId] = useState("");
  const [videoPlatforms, setVideoPlatforms] = useState<VideoPlatform[]>(["ZOOM"]);
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const hydrate = useCallback((settings: TeacherSelfSettings) => {
    setInitial(settings); setDisplayName(settings.teacher.displayName); setBio(settings.teacher.bio);
    setSpecialties(settings.teacher.specialties); setExperienceYears(String(settings.teacher.experienceYears));
    setAvatarUrl(settings.teacher.avatarUrl ?? ""); setPhone(settings.phone); setAddress(settings.address); setMessengerId(settings.messengerId);
    setVideoPlatforms(settings.teacher.videoPlatforms);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/teacher/settings");
      if (!response.ok) throw new Error();
      const body = await response.json() as { settings: TeacherSelfSettings };
      hydrate(body.settings);
    } catch { setNotice({ type: "error", message: "Could not load your profile. Please try again." }); }
    finally { setLoading(false); }
  }, [hydrate]);

  useEffect(() => { void load(); }, [load]);

  const hasChanges = useMemo(() => initial ? [
    displayName !== initial.teacher.displayName, bio !== initial.teacher.bio,
    JSON.stringify([...specialties].sort()) !== JSON.stringify([...initial.teacher.specialties].sort()),
    Number(experienceYears) !== initial.teacher.experienceYears, avatarUrl !== (initial.teacher.avatarUrl ?? ""),
    phone !== initial.phone, address !== initial.address, messengerId !== initial.messengerId,
    JSON.stringify([...videoPlatforms].sort()) !== JSON.stringify([...initial.teacher.videoPlatforms].sort()),
  ].some(Boolean) : false, [initial, displayName, bio, specialties, experienceYears, avatarUrl, phone, address, messengerId, videoPlatforms]);

  function toggleSpecialty(value: TeacherSpecialty) {
    setSpecialties((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setNotice(null);
    const years = Number(experienceYears);
    if (!displayName.trim() || !bio.trim() || !phone.trim() || !address.trim() || !messengerId.trim() || specialties.length === 0) {
      setNotice({ type: "error", message: "Please complete all editable fields." }); return;
    }
    if (!Number.isFinite(years) || years < 0 || years > 80) {
      setNotice({ type: "error", message: "Enter valid years of experience." }); return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/teacher/settings", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, bio, specialties, experienceYears: years, avatarUrl, phone, address, messengerId, videoPlatforms }) });
      if (!response.ok) throw new Error();
      const body = await response.json() as { settings: TeacherSelfSettings };
      hydrate(body.settings); setNotice({ type: "success", message: "Your information has been saved." });
    } catch { setNotice({ type: "error", message: "Could not save your information. Please try again." }); }
    finally { setSaving(false); }
  }

  function resetPassword() { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setPasswordNotice(null); }
  async function changePassword(event: FormEvent) {
    event.preventDefault(); setPasswordNotice(null);
    if (newPassword.length < 8) { setPasswordNotice({ type: "error", message: "New password must be at least 8 characters." }); return; }
    if (newPassword !== confirmPassword) { setPasswordNotice({ type: "error", message: "New passwords do not match." }); return; }
    setPasswordSaving(true);
    try {
      const response = await fetch("/api/teacher/settings/password", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setPasswordNotice({ type: "error", message: body.error === "invalid_current_password" ? "Current password is incorrect." : "Could not change your password." }); return;
      }
      resetPassword(); setPasswordOpen(false); setNotice({ type: "success", message: "Your password has been changed." });
    } catch { setPasswordNotice({ type: "error", message: "Could not change your password." }); }
    finally { setPasswordSaving(false); }
  }

  const renderNotice = (value: Notice) => value && <div role={value.type === "error" ? "alert" : "status"}
    className={`flex gap-2 rounded-lg px-3 py-2.5 text-sm ${value.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
    {value.type === "success" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}<span>{value.message}</span></div>;

  if (loading) return <div className="py-16 text-center text-sm text-muted-foreground">Loading your profile…</div>;
  if (!initial) return <div className="space-y-4">{renderNotice(notice)}<Button onClick={() => void load()}>Try again</Button></div>;

  return <form onSubmit={save} className="mx-auto max-w-4xl space-y-6 pb-16">
    <div><h2 className="text-2xl font-bold text-ink">My Profile</h2><p className="mt-1 text-sm text-ink-muted">Manage your public teaching profile, contact details, and account security.</p></div>

    <Card><CardHeader className="border-b bg-muted/30"><div className="flex gap-3"><div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><UserRound className="h-5 w-5" /></div>
      <div><CardTitle>Teaching profile</CardTitle><CardDescription>Students see this information when choosing a teacher.</CardDescription></div></div></CardHeader>
      <CardContent className="space-y-5 pt-6">
        <TeacherAvatarUpload value={avatarUrl || undefined} displayName={displayName} onChange={(result: TeacherAvatarUploadResult | null) => setAvatarUrl(result?.dataUrl ?? result?.previewUrl ?? "")} />
        <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="displayName">Display name</Label><Input id="displayName" value={displayName} maxLength={80} onChange={(e) => setDisplayName(e.target.value)} required /><p className="text-xs text-muted-foreground">Shown to students in enrollment and lessons.</p></div>
          <div className="space-y-2"><Label htmlFor="experienceYears">Years of teaching experience</Label><Input id="experienceYears" type="number" min={0} max={80} value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} required /></div></div>
        <div className="space-y-2"><Label htmlFor="bio">Introduction</Label><Textarea id="bio" value={bio} maxLength={2000} rows={5} onChange={(e) => setBio(e.target.value)} required /></div>
        <div className="space-y-2"><Label>Specialties</Label><div className="flex flex-wrap gap-2">{TEACHER_SPECIALTY_OPTIONS.map((option) => <button key={option} type="button" onClick={() => toggleSpecialty(option)}
          className={cn("rounded-full border px-3 py-1.5 text-sm font-medium transition-colors", specialties.includes(option) ? "border-emerald-600 bg-emerald-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-emerald-300")}>{option}</button>)}</div>
          <div className="flex flex-wrap gap-1">{specialties.map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}</div></div>
        <VideoPlatformSelector value={videoPlatforms} onChange={setVideoPlatforms} language="en" />
      </CardContent></Card>

    <Card><CardHeader className="border-b bg-muted/30"><CardTitle>Personal & contact information</CardTitle><CardDescription>Legal identity fields are locked. Contact details can be updated.</CardDescription></CardHeader>
      <CardContent className="grid gap-5 pt-6 sm:grid-cols-2"><ReadonlyField id="email" label="Login email" value={initial.email} hint="Contact an administrator if your login email must change." />
        <ReadonlyField id="legalName" label="Legal name" value={initial.legalName} /><ReadonlyField id="dateOfBirth" label="Date of birth" value={initial.dateOfBirth} />
        <div className="space-y-2"><Label htmlFor="phone">Mobile number</Label><Input id="phone" type="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} required /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="address">Address</Label><Input id="address" value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} required /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="messengerId">Facebook Messenger ID or link</Label><Input id="messengerId" value={messengerId} maxLength={200} onChange={(e) => setMessengerId(e.target.value)} required /></div>
        <div className="sm:col-span-2"><ReadonlyField id="bankAccount" label="Registered payout account" value={initial.bankAccount} hint="For payment security, request payout-account changes through the administrator." /></div>
      </CardContent></Card>

    <Card><CardHeader className="border-b bg-muted/30"><div className="flex gap-3"><div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><ShieldCheck className="h-5 w-5" /></div>
      <div><CardTitle>Account security</CardTitle><CardDescription>Your current password is never displayed.</CardDescription></div></div></CardHeader><CardContent className="pt-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Password</p><p className="text-sm text-muted-foreground">Use at least 8 characters.</p></div>
      <Button type="button" variant="outline" onClick={() => setPasswordOpen(true)}>Change password<ChevronRight className="ml-1 h-4 w-4" /></Button></div></CardContent></Card>

    {renderNotice(notice)}<div className="flex justify-end"><Button type="submit" className="w-full sm:w-auto" disabled={saving || !hasChanges}>{saving ? "Saving…" : "Save changes"}</Button></div>

    <Dialog open={passwordOpen} onOpenChange={(open) => { setPasswordOpen(open); if (!open) resetPassword(); }}><DialogContent><DialogHeader><DialogTitle>Change password</DialogTitle><DialogDescription>Confirm your current password before choosing a new one.</DialogDescription></DialogHeader>
      <form onSubmit={changePassword} className="space-y-5 pt-2"><PasswordInput id="currentPassword" label="Current password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
        <PasswordInput id="newPassword" label="New password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" /><PasswordInput id="confirmPassword" label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
        {renderNotice(passwordNotice)}<div className="flex justify-end"><Button type="submit" disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}>{passwordSaving ? "Changing…" : "Change password"}</Button></div></form>
    </DialogContent></Dialog>
  </form>;
}
