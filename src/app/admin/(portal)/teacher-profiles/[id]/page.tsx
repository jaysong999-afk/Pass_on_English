"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeacherProfileForm } from "@/components/teacher/TeacherProfileForm";
import type { Teacher, TeacherProfileInput } from "@/types";

export default function AdminTeacherProfileEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/teachers/profile/${id}`);
      if (!res.ok) {
        setTeacher(null);
        return;
      }
      const data = await res.json();
      setTeacher(data.teacher);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(data: TeacherProfileInput) {
    const res = await fetch(`/api/teachers/profile/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error("save failed");
    }
    router.push("/admin/teacher-profiles");
  }

  if (loading) {
    return <p className="py-12 text-center text-sm text-gray-500">불러오는 중…</p>;
  }

  if (!teacher) {
    return <p className="text-gray-500">선생님 프로필을 찾을 수 없습니다.</p>;
  }

  const initial: TeacherProfileInput = {
    displayName: teacher.displayName,
    bio: teacher.bio,
    specialties: teacher.specialties,
    experienceYears: teacher.experienceYears,
    avatarUrl: teacher.avatarUrl,
    hourlyRatePhp: teacher.hourlyRatePhp,
    status: teacher.status,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1">
        <Link href="/admin/teacher-profiles">
          <ArrowLeft className="h-4 w-4" />
          프로필 목록
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{teacher.displayName} — 프로필 수정</CardTitle>
        </CardHeader>
        <CardContent>
          <TeacherProfileForm
            initial={initial}
            onSubmit={handleSubmit}
            submitLabel="저장"
            showAdminFields
          />
        </CardContent>
      </Card>
    </div>
  );
}
