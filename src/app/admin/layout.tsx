"use client";

import { usePathname } from "next/navigation";
import { AdminAppShell } from "@/components/admin/AdminAppShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/admin/login";

  if (isLogin) {
    return <>{children}</>;
  }

  return <AdminAppShell>{children}</AdminAppShell>;
}
