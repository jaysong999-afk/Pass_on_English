"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  CalendarClock,
  RefreshCw,
  GraduationCap,
  Users,
  Contact,
  Wallet,
  Tag,
  PieChart,
  Send,
  HelpCircle,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatNotificationBell } from "@/components/shared/ChatNotificationBell";
import { LogoutButton } from "@/components/shared/LogoutButton";

interface NavItem {
  href: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  matchPath: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "홈",
    items: [
      {
        href: "/admin",
        matchPath: "/admin",
        label: "대시보드",
        description: "운영 현황 한눈에 보기",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: "수업",
    items: [
      {
        href: "/admin/operations",
        matchPath: "/admin/operations",
        label: "수업 운영 센터",
        description: "대체·노쇼·일정·무급 취소·일괄 이관",
        icon: CalendarClock,
      },
      {
        href: "/admin/reschedule",
        matchPath: "/admin/reschedule",
        label: "운영 요청 센터",
        description: "요청 모니터링·가입·입금 처리",
        icon: RefreshCw,
      },
    ],
  },
  {
    title: "학생",
    items: [
      {
        href: "/admin/students",
        matchPath: "/admin/students",
        label: "학생 현황",
        description: "수강·입금·세션 관리",
        icon: GraduationCap,
      },
      {
        href: "/admin/faq",
        matchPath: "/admin/faq",
        label: "FAQ 관리",
        description: "학생 포털 자주 묻는 질문",
        icon: HelpCircle,
      },
    ],
  },
  {
    title: "선생님",
    items: [
      {
        href: "/admin/teachers",
        matchPath: "/admin/teachers",
        label: "선생님 현황",
        description: "활성·지원·배정 현황",
        icon: Users,
      },
      {
        href: "/admin/teacher-profiles",
        matchPath: "/admin/teacher-profiles",
        label: "프로필 관리",
        description: "공개 프로필·사진·소개",
        icon: Contact,
      },
      {
        href: "/admin/teacher-salary",
        matchPath: "/admin/teacher-salary",
        label: "급여 관리",
        description: "월별 명세·지급 상태",
        icon: Wallet,
      },
    ],
  },
  {
    title: "경영",
    items: [
      {
        href: "/admin/pricing",
        matchPath: "/admin/pricing",
        label: "요금제",
        description: "플랜·가격 설정",
        icon: Tag,
      },
      {
        href: "/admin/finance",
        matchPath: "/admin/finance",
        label: "재무",
        description: "수입·지출·손익",
        icon: PieChart,
      },
    ],
  },
  {
    title: "소통",
    items: [
      {
        href: "/admin/messages",
        matchPath: "/admin/messages",
        label: "메시지",
        description: "학생·선생님 채팅",
        icon: Send,
      },
    ],
  },
  {
    title: "계정",
    items: [
      {
        href: "/admin/settings",
        matchPath: "/admin/settings",
        label: "설정",
        description: "비밀번호 변경",
        icon: Settings,
      },
    ],
  },
];

const PAGE_TITLES: { prefix: string; title: string; subtitle?: string }[] = [
  { prefix: "/admin/operations", title: "수업 운영 센터", subtitle: "스케줄 조회 및 수업 예외 처리" },
  { prefix: "/admin/reschedule", title: "운영 요청 센터", subtitle: "학생·선생님 요청과 관리자 처리 업무를 한곳에서 확인합니다." },
  { prefix: "/admin/students", title: "학생 현황", subtitle: "수강 중 및 과거 수강자" },
  { prefix: "/admin/faq", title: "FAQ 관리", subtitle: "학생 포털 질의응답 편집" },
  { prefix: "/admin/teachers/applications", title: "선생님 지원서", subtitle: "신규 지원 검토" },
  { prefix: "/admin/teachers", title: "선생님 현황", subtitle: "활성 강사 및 배정" },
  { prefix: "/admin/teacher-profiles", title: "프로필 관리", subtitle: "공개 프로필 편집" },
  { prefix: "/admin/teacher-salary", title: "급여 관리", subtitle: "월별 급여 명세" },
  { prefix: "/admin/pricing", title: "요금제", subtitle: "수강 플랜 설정" },
  { prefix: "/admin/finance", title: "재무", subtitle: "수입·지출 대시보드" },
  { prefix: "/admin/messages", title: "메시지", subtitle: "채팅함" },
  { prefix: "/admin/chat", title: "채팅", subtitle: "대화" },
  { prefix: "/admin/settings", title: "설정", subtitle: "계정 보안" },
  { prefix: "/admin", title: "대시보드", subtitle: "Pass on English 관리자" },
];

function isActive(pathname: string, item: NavItem) {
  if (item.matchPath === "/admin") {
    return pathname === "/admin";
  }
  return pathname === item.matchPath || pathname.startsWith(item.matchPath + "/");
}

function resolvePageHeader(pathname: string) {
  if (/^\/admin\/students\/[^/]+/.test(pathname)) {
    return { prefix: "", title: "학생 상세", subtitle: "학습·수강·결제 통합 조회" };
  }
  if (/^\/admin\/teachers\/[^/]+/.test(pathname) && !pathname.includes("/applications/")) {
    return { prefix: "", title: "선생님 상세", subtitle: "프로필·수업·급여 통합 조회" };
  }
  const match = PAGE_TITLES.find(
    (p) => pathname === p.prefix || (p.prefix !== "/admin" && pathname.startsWith(p.prefix + "/"))
  );
  return match ?? { prefix: "", title: "관리자 포털", subtitle: "Pass on English Admin" };
}

interface AdminAppShellProps {
  children: React.ReactNode;
}

export function AdminAppShell({ children }: AdminAppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const header = resolvePageHeader(pathname);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/session")
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{ profile?: { role?: string } }>;
      })
      .then((data) => {
        if (cancelled) return;
        if (data?.profile?.role !== "admin") {
          const next = encodeURIComponent(pathname);
          router.replace(`/admin/login?next=${next}`);
          return;
        }
        setSessionReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          router.replace("/admin/login");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f5f7] text-sm text-gray-500">
        세션 확인 중…
      </div>
    );
  }

  return (
    <div className="min-h-screen min-w-[1280px] bg-[#f4f5f7]">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600">
            Pass on English
          </p>
          <h1 className="mt-0.5 text-lg font-bold text-ink">관리자 포털</h1>
          <p className="mt-1 text-xs text-gray-500">데스크탑 운영 전용</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="mb-5 last:mb-0">
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={item.description}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                          active
                            ? "bg-violet-50 text-violet-800 ring-1 ring-violet-100"
                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            active ? "text-violet-600" : "text-gray-400"
                          )}
                        />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-gray-100 px-5 py-4 text-xs text-gray-400">
          © Pass on English
        </div>
      </aside>

      <div className="flex min-h-screen flex-col pl-[260px]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-8">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ink">{header.title}</h2>
            {header.subtitle && (
              <p className="text-sm text-gray-500">{header.subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <LogoutButton redirectTo="/admin/login" label="로그아웃" variant="outline" />
            <ChatNotificationBell
              role="admin"
              variant="onLight"
              copy={{
                title: "CS 메시지",
                viewAll: "CS 1:1 전체 보기",
                empty: "학생·선생님 메시지가 없습니다",
                unreadLabel: (count) => `${count}건 미읽음`,
              }}
            />
          </div>
        </header>

        <main className="flex-1 px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
