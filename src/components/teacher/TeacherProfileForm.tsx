"use client";

import { FormEvent, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TEACHER_SPECIALTY_OPTIONS } from "@/lib/teacher-specialties";
import { TeacherAvatarUpload, type TeacherAvatarUploadResult } from "@/components/teacher/TeacherAvatarUpload";
import type { TeacherProfileInput, TeacherSpecialty } from "@/types";
import { cn } from "@/lib/utils";

interface TeacherProfileFormProps {
  initial: TeacherProfileInput;
  onSubmit: (data: TeacherProfileInput) => Promise<void>;
  submitLabel?: string;
  showAdminFields?: boolean;
}

export function TeacherProfileForm({
  initial,
  onSubmit,
  submitLabel = "Save profile",
  showAdminFields = false,
}: TeacherProfileFormProps) {
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio);
  const [specialties, setSpecialties] = useState<TeacherSpecialty[]>(initial.specialties);
  const [experienceYears, setExperienceYears] = useState(String(initial.experienceYears || ""));
  const [hourlyRatePhp, setHourlyRatePhp] = useState(
    initial.hourlyRatePhp != null ? String(initial.hourlyRatePhp) : "150"
  );
  const [status, setStatus] = useState<TeacherProfileInput["status"]>(initial.status ?? "pending");
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl ?? "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function toggleSpecialty(value: TeacherSpecialty) {
    setSpecialties((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!displayName.trim()) {
      setError("Display name is required.");
      return;
    }
    if (!bio.trim()) {
      setError("Bio is required.");
      return;
    }
    if (specialties.length === 0) {
      setError("Select at least one specialty.");
      return;
    }

    const years = Number(experienceYears);
    if (!Number.isFinite(years) || years < 0) {
      setError("Enter valid years of experience.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        displayName: displayName.trim(),
        bio: bio.trim(),
        specialties,
        experienceYears: years,
        avatarUrl: avatarUrl.trim() ? avatarUrl : undefined,
        ...(showAdminFields
          ? {
              hourlyRatePhp: hourlyRatePhp ? Number(hourlyRatePhp) : undefined,
              status,
            }
          : {}),
      });
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleAvatarChange(result: TeacherAvatarUploadResult | null) {
    if (!result) {
      setAvatarUrl("");
      return;
    }
    setAvatarUrl(result.dataUrl ?? result.previewUrl);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <TeacherAvatarUpload
        value={avatarUrl || undefined}
        displayName={displayName || initial.displayName}
        onChange={handleAvatarChange}
        allowDownload={showAdminFields}
        labels={
          showAdminFields
            ? {
                profilePhoto: "프로필 사진",
                upload: "사진 업로드",
                change: "사진 변경",
                download: "다운로드",
                remove: "삭제",
                adjustCrop: "크롭 조정",
                zoom: "확대/축소",
                applyCrop: "적용",
                reset: "초기화",
                cancel: "취소",
                hint: "JPEG, PNG, WebP · 최대 5MB. Storage 연동 시 File 객체만 업로드 API로 전달하면 됩니다.",
                cropHint: "드래그로 위치 조정 · 512×512 JPEG 출력",
              }
            : undefined
        }
      />
      <div className="space-y-2">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Sarah Mitchell"
          required
        />
        <p className="text-xs text-gray-500">Shown to students on the landing page and enrollment.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">Bio / Introduction</Label>
        <Textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={5}
          placeholder="Tell students about your teaching style and experience…"
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Specialties (select all that apply)</Label>
        <div className="flex flex-wrap gap-2">
          {TEACHER_SPECIALTY_OPTIONS.map((option) => {
            const selected = specialties.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => toggleSpecialty(option)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors touch-manipulation",
                  selected
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:border-emerald-300"
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
        {specialties.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {specialties.map((s) => (
              <Badge key={s} variant="secondary">
                {s}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="experienceYears">Years of experience</Label>
        <Input
          id="experienceYears"
          type="number"
          min={0}
          value={experienceYears}
          onChange={(e) => setExperienceYears(e.target.value)}
          required
        />
      </div>

      {showAdminFields && (
        <div className="space-y-4 rounded-xl border border-violet-100 bg-violet-50/40 p-4">
          <p className="text-sm font-semibold text-violet-900">Admin settings</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hourlyRate">Hourly rate (PHP)</Label>
              <Input
                id="hourlyRate"
                type="number"
                min={0}
                value={hourlyRatePhp}
                onChange={(e) => setHourlyRatePhp(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Account status</Label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TeacherProfileInput["status"])}
              className="flex h-11 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm"
            >
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="on_leave">On leave</option>
              <option value="terminated">Terminated</option>
            </select>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" className="h-11 w-full rounded-xl" disabled={submitting}>
        {submitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
