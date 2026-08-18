"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PortalNavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  matchPath: string;
  hideMobile?: boolean;
}

interface PortalNavigationProps {
  items: PortalNavItem[];
  pathname: string;
  rootPath: string;
  mobileLayout?: "grid" | "spread";
  mobileAriaLabel?: string;
  mobileSafeArea?: boolean;
}

function isActive(pathname: string, item: PortalNavItem, rootPath: string) {
  if (item.matchPath === rootPath) return pathname === rootPath;
  return pathname === item.matchPath || pathname.startsWith(`${item.matchPath}/`);
}

export function PortalNavigation({
  items,
  pathname,
  rootPath,
  mobileLayout = "grid",
  mobileAriaLabel,
  mobileSafeArea = true,
}: PortalNavigationProps) {
  const mobileItems = items.filter((item) => !item.hideMobile);

  return (
    <>
      <aside className="hidden w-56 shrink-0 md:block">
        <nav className="sticky top-6 space-y-1 rounded-2xl border bg-white p-3 shadow-sm">
          {items.map((item) => {
            const active = isActive(pathname, item, rootPath);
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

      <nav
        className={cn("fixed bottom-0 left-0 right-0 z-50 border-t bg-white md:hidden", mobileSafeArea && "pb-[env(safe-area-inset-bottom)]")}
        aria-label={mobileAriaLabel}
      >
        <div
          className={cn(
            "px-1",
            mobileLayout === "spread" ? "flex justify-around py-1.5" : "grid py-2"
          )}
          style={mobileLayout === "grid" ? { gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` } : undefined}
        >
          {mobileItems.map((item) => {
            const active = isActive(pathname, item, rootPath);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-0.5 rounded-lg font-medium",
                  mobileLayout === "spread" ? "min-w-14 px-2 py-1.5 text-[10px]" : "px-1 py-2 text-[11px]",
                  active ? "text-brand-600" : "text-gray-500"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className={cn("truncate leading-tight", mobileLayout === "spread" ? "max-w-[4.5rem]" : "max-w-16")}>
                  {item.shortLabel ?? item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
