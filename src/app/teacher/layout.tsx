"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/shared/AppShell";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage =
    pathname === "/teacher/login" || pathname.startsWith("/teacher/signup");

  if (isAuthPage) {
    return <>{children}</>;
  }

  return <AppShell role="teacher">{children}</AppShell>;
}
