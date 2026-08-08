"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Teacher } from "@/types";

export default function AdminTeacherProfilesPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/teachers/profile");
      const data = await res.json();
      setTeachers(data.teachers ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">등록된 프로필</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-sm text-gray-500">불러오는 중…</p>}
          {!loading && teachers.length === 0 && (
            <p className="text-sm text-gray-500">등록된 선생님 프로필이 없습니다.</p>
          )}
          <div className="space-y-3">
            {teachers.map((teacher) => (
              <div
                key={teacher.id}
                className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 gap-3">
                  <Avatar className="h-14 w-14 shrink-0 rounded-xl border border-gray-100">
                    {teacher.avatarUrl ? (
                      <AvatarImage
                        src={teacher.avatarUrl}
                        alt={teacher.displayName}
                        className="object-cover"
                      />
                    ) : null}
                    <AvatarFallback className="rounded-xl text-sm">
                      {teacher.displayName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-ink">{teacher.displayName}</p>
                    <Badge variant={teacher.status === "active" ? "success" : "warning"}>
                      {teacher.status}
                    </Badge>
                    {!teacher.profileCompleted && (
                      <Badge variant="secondary">프로필 미완료</Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-gray-500">{teacher.bio}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {teacher.specialties.slice(0, 4).map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                    {teacher.specialties.length > 4 && (
                      <span className="text-xs text-gray-400">
                        +{teacher.specialties.length - 4}
                      </span>
                    )}
                  </div>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="shrink-0 gap-1" asChild>
                  <Link href={`/admin/teacher-profiles/${teacher.id}`}>
                    <Pencil className="h-3.5 w-3.5" />
                    수정
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
