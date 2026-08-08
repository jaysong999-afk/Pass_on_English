"use client";

import { Building2, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface PaymentInfoPanelProps {
  amount: number;
  currency: "KRW" | "CNY";
  bankAccount: string;
  depositorHint?: string;
}

export function PaymentInfoPanel({
  amount,
  currency,
  bankAccount,
  depositorHint,
}: PaymentInfoPanelProps) {
  const t = useTranslations("studentPortal.paymentPanel");

  return (
    <Card className="border-brand-200 bg-brand-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-brand-800">
          <Building2 className="h-5 w-5" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl bg-white p-4">
          <p className="text-sm text-gray-500">{t("amountLabel")}</p>
          <p className="text-2xl font-bold text-brand-700">{formatCurrency(amount, currency)}</p>
        </div>
        <div className="rounded-xl bg-white p-4">
          <p className="text-sm text-gray-500">{t("accountLabel")}</p>
          <p className="mt-1 font-mono text-sm font-medium">{bankAccount}</p>
          {depositorHint && (
            <p className="mt-2 text-xs text-gray-500">
              {t("depositorLabel")}: {depositorHint}
            </p>
          )}
        </div>
        <p className="text-sm text-gray-600">{t("note")}</p>
        <Button variant="secondary" className="w-full gap-2">
          <Copy className="h-4 w-4" />
          {t("copyAccount")}
        </Button>
      </CardContent>
    </Card>
  );
}
