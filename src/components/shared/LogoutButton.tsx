"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LogoutButtonProps {
  redirectTo: string;
  label?: string;
  variant?: "ghost" | "outline";
  className?: string;
}

export function LogoutButton({
  redirectTo,
  label = "Sign out",
  variant = "ghost",
  className,
}: LogoutButtonProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={className}
      onClick={() => void handleLogout()}
    >
      <LogOut className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}
