import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Teacher } from "@/types";

interface TeacherCardProps {
  teacher: Teacher;
  href?: string;
  showSelect?: boolean;
  locale?: "ko" | "en" | "zh";
}

export function TeacherCard({ teacher, href, showSelect = false, locale = "ko" }: TeacherCardProps) {
  const initials = teacher.displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  const selectLabel = locale === "en" ? "Select" : locale === "zh" ? "选择" : "선택하기";
  const yearsLabel = locale === "en" ? "yrs exp" : locale === "zh" ? "年经验" : "년 경력";

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-gray-900">{teacher.displayName}</h3>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {teacher.experienceYears} {yearsLabel}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {teacher.specialties.map((s) => (
                <Badge key={s} variant="secondary">
                  {s}
                </Badge>
              ))}
            </div>
            <p className="mt-3 line-clamp-2 text-sm text-gray-600">{teacher.bio}</p>
            {showSelect && href && (
              <Button asChild className="mt-4 w-full sm:w-auto">
                <Link href={href}>{selectLabel}</Link>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
