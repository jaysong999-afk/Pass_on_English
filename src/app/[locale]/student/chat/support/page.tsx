"use client";

import { useTranslations } from "next-intl";
import { AdminDirectChatPanel } from "@/components/shared/AdminDirectChatPanel";

export default function StudentAdminSupportPage() {
  const t = useTranslations("studentPortal.chat");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">{t("adminSupportTitle")}</h2>
        <p className="text-sm text-gray-500 mt-1">{t("adminSupportSubtitle")}</p>
      </div>
      <AdminDirectChatPanel role="student" placeholder={t("messagePlaceholder")} />
    </div>
  );
}
