"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  MessageCircle,
  Clock,
  Wallet,
  TrendingUp,
  ClipboardList,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatNotificationBell } from "@/components/shared/ChatNotificationBell";
import { LogoutButton } from "@/components/shared/LogoutButton";
import { StudentAppShell } from "@/components/shared/StudentAppShell";
import { useTeacherSession } from "@/contexts/TeacherSessionContext";
import { PortalNavigation, type PortalNavItem } from "@/components/shared/PortalNavigation";

type AppRole = "student" | "teacher";

interface AppShellProps {
  role: AppRole;
  children: React.ReactNode;
}

const TEACHER_CONFIG = {
  title: "Teacher Portal",
  accent: "bg-emerald-600",
  items: [
    { href: "/teacher", matchPath: "/teacher", label: "My Lessons", shortLabel: "Lessons", icon: LayoutDashboard },
    { href: "/teacher/availability", matchPath: "/teacher/availability", label: "Availability", icon: Clock },
    { href: "/teacher/schedule", matchPath: "/teacher/schedule", label: "Schedule", icon: Calendar },
    { href: "/teacher/feedback", matchPath: "/teacher/feedback", label: "Lesson Feedback", shortLabel: "Feedback", icon: ClipboardList },
    { href: "/teacher/reports", matchPath: "/teacher/reports", label: "Growth Reports", icon: TrendingUp },
    { href: "/teacher/salary", matchPath: "/teacher/salary", label: "Salary", icon: Wallet },
    { href: "/teacher/chat", matchPath: "/teacher/chat", label: "Chat", icon: MessageCircle },
    { href: "/teacher/profile", matchPath: "/teacher/profile", label: "My Profile", shortLabel: "Profile", icon: UserCog, hideMobile: true },
  ] as PortalNavItem[],
};

export function AppShell({ role, children }: AppShellProps) {
  const pathname = usePathname();
  const { teacherId, teacherName, loading: sessionLoading } = useTeacherSession();

  if (role === "student") {
    return <StudentAppShell>{children}</StudentAppShell>;
  }

  const config = TEACHER_CONFIG;
  const subtitle = teacherName ? `Welcome, ${teacherName.split(" ")[0]}!` : undefined;

  return (
    <div className="min-h-screen bg-surface">
      <header className={cn("text-white", config.accent)}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-white/80">Pass on English</p>
            <h1 className="text-lg font-bold">{config.title}</h1>
            {subtitle && (
              <p className="truncate text-sm text-white/80">{subtitle}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/teacher/profile" aria-label="My profile"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white/90 hover:bg-white/10 hover:text-white md:hidden">
              <UserCog className="h-5 w-5" />
            </Link>
            <LogoutButton
              redirectTo="/teacher/login"
              label="Sign out"
              className="hidden text-white/90 hover:bg-white/10 hover:text-white sm:inline-flex"
            />
            <ChatNotificationBell
              role="teacher"
              teacherId={teacherId ?? undefined}
              enabled={!sessionLoading && Boolean(teacherId)}
              copy={{
                title: "Messages",
                viewAll: "View all chats",
                empty: "No new messages",
                unreadLabel: (count) => `${count} unread`,
              }}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        <PortalNavigation items={config.items} pathname={pathname} rootPath="/teacher" mobileSafeArea={false} />

        <main className="min-w-0 flex-1 pb-24 md:pb-6">{children}</main>
      </div>

    </div>
  );
}
