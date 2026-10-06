"use client";

import Image from "next/image";
import { Building2, Copy, QrCode } from "lucide-react";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface PaymentInfoPanelProps {
  amount: number;
  currency: "KRW" | "CNY";
  bankAccount: string;
  depositorHint?: string;
  deadlineNotice?: string;
}

export function PaymentInfoPanel({
  amount,
  currency,
  bankAccount,
  depositorHint,
  deadlineNotice,
}: PaymentInfoPanelProps) {
  const t = useTranslations("studentPortal.paymentPanel");
  const isQrPayment = useLocale() === "zh-CN";
  const [copied, setCopied] = useState(false);

  async function copyAccount() {
    if (!bankAccount) return;
    try {
      await navigator.clipboard.writeText(bankAccount);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Card className="border-brand-200 bg-brand-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-brand-800">
          {isQrPayment ? <QrCode className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {deadlineNotice ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900">
            {deadlineNotice}
          </p>
        ) : null}
        <div className="rounded-xl bg-white p-4">
          <p className="text-sm text-gray-500">{t("amountLabel")}</p>
          <p className="text-2xl font-bold text-brand-700">{formatCurrency(amount, currency)}</p>
        </div>
        {isQrPayment ? (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-gray-600">{t("qrIntro")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <QrPaymentCard
                href="/images/payments/wechat-pay-qr.jpg"
                label={t("wechatPay")}
                alt={t("wechatQrAlt")}
                width={1118}
                height={1524}
              />
              <QrPaymentCard
                href="/images/payments/alipay-qr.jpg"
                label={t("alipay")}
                alt={t("alipayQrAlt")}
                width={1080}
                height={1620}
              />
            </div>
            <p className="text-center text-xs text-gray-500">{t("qrHint")}</p>
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-white p-4">
              <p className="text-sm text-gray-500">{t("accountLabel")}</p>
              <p className="mt-1 font-mono text-sm font-medium">{bankAccount}</p>
              {depositorHint && (
                <p className="mt-2 text-xs text-gray-500">
                  {t("depositorLabel")}: {depositorHint}
                </p>
              )}
            </div>
            <Button variant="secondary" className="w-full gap-2" type="button" onClick={copyAccount}>
              <Copy className="h-4 w-4" />
              {t("copyAccount")}
            </Button>
            {copied && <p role="status" className="text-center text-sm font-medium text-emerald-700">{t("copied")}</p>}
          </>
        )}
        {isQrPayment && depositorHint && (
          <div className="rounded-xl bg-white p-4">
            <p className="text-xs text-gray-500">
              {t("depositorLabel")}: {depositorHint}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QrPaymentCard({
  href,
  label,
  alt,
  width,
  height,
}: {
  href: string;
  label: string;
  alt: string;
  width: number;
  height: number;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-xl border border-gray-200 bg-white p-3 transition-colors hover:border-brand-300"
    >
      <p className="mb-2 text-center text-sm font-semibold text-ink">{label}</p>
      <Image
        unoptimized
        src={href}
        alt={alt}
        width={width}
        height={height}
        sizes="(max-width: 639px) 100vw, 50vw"
        className="h-auto w-full rounded-lg"
      />
    </a>
  );
}
