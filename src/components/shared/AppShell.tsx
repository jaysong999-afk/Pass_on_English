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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatNotificationBell } from "@/components/shared/ChatNotificationBell";
import { StudentAppShell } from "@/components/shared/StudentAppShell";

type AppRole = "student" | "teacher";

interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  matchPath: string;
}

interface AppShellProps {
  role: AppRole;
  children: React.ReactNode;
}

const TEACHER_CONFIG = {
  title: "Teacher Portal",
  subtitle: "Welcome, Sarah!",
  accent: "bg-emerald-600",
  items: [
    { href: "/teacher", matchPath: "/teacher", label: "My Lessons", shortLabel: "Lessons", icon: LayoutDashboard },
    { href: "/teacher/availability", matchPath: "/teacher/availability", label: "Availability", icon: Clock },
    { href: "/teacher/schedule", matchPath: "/teacher/schedule", label: "Schedule", icon: Calendar },
    { href: "/teacher/feedback", matchPath: "/teacher/feedback", label: "Lesson Feedback", shortLabel: "Feedback", icon: ClipboardList },
    { href: "/teacher/reports", matchPath: "/teacher/reports", label: "Growth Reports", icon: TrendingUp },
    { href: "/teacher/salary", matchPath: "/teacher/salary", label: "Salary", icon: Wallet },
    { href: "/teacher/chat", matchPath: "/teacher/chat", label: "Chat", icon: MessageCircle },
  ] as NavItem[],
};

export function AppShell({ role, children }: AppShellProps) {
  const pathname = usePathname();

  if (role === "student") {
    return <StudentAppShell>{children}</StudentAppShell>;
  }

  const config = TEACHER_CONFIG;

  function isActive(item: NavItem) {
    if (item.matchPath === "/teacher") {
      return pathname === item.matchPath;
    }
    return pathname === item.matchPath || pathname.startsWith(item.matchPath + "/");
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className={cn("text-white", config.accent)}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-white/80">Pass on English</p>
            <h1 className="text-lg font-bold">{config.title}</h1>
            {config.subtitle && (
              <p className="truncate text-sm text-white/80">{config.subtitle}</p>
            )}
          </div>
          <ChatNotificationBell
            role="teacher"
            copy={{
              title: "Messages",
              viewAll: "View all chats",
              empty: "No new messages",
              unreadLabel: (count) => `${count} unread`,
            }}
          />
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="sticky top-6 space-y-1 rounded-2xl border bg-white p-3 shadow-sm">
            {config.items.map((item) => {
              const active = isActive(item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    active ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 pb-24 md:pb-6">{children}</main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white md:hidden">
        <div className="flex justify-around px-2 py-2">
          {config.items.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-w-16 flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-xs font-medium",
                  active ? "text-brand-600" : "text-gray-500"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="max-w-16 truncate">{item.shortLabel ?? item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
