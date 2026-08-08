"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calcVatFromSupply, convertToKrw } from "@/lib/finance/accounting";
import type { ExchangeRates, FinanceTransaction, TaxTreatment, TransactionType } from "@/types";

interface ManualTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rates: ExchangeRates;
  onSubmit: (tx: FinanceTransaction) => void;
}

export function ManualTransactionModal({
  open,
  onOpenChange,
  rates,
  onSubmit,
}: ManualTransactionModalProps) {
  const [type, setType] = useState<TransactionType>("expense");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState<"KRW" | "CNY" | "PHP">("KRW");
  const [supplyAmount, setSupplyAmount] = useState("");
  const [autoVat, setAutoVat] = useState(true);
  const [taxTreatment, setTaxTreatment] = useState<TaxTreatment>("taxable");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supply = Number(supplyAmount);
    if (!supply || !description) return;

    const vat = autoVat && taxTreatment === "taxable" ? calcVatFromSupply(supply) : 0;
    const total = supply + vat;
    const amountKrw = convertToKrw(total, currency, rates);

    onSubmit({
      id: `manual-${Date.now()}`,
      date,
      type,
      category: type === "income" ? "manual_income" : "manual_expense",
      description,
      currency,
      amount: total,
      amountKrw,
      supplyAmount: supply,
      vatAmount: vat,
      taxTreatment,
      source: "manual",
    });

    setDescription("");
    setSupplyAmount("");
    onOpenChange(false);
  }

  const previewVat =
    autoVat && taxTreatment === "taxable" && supplyAmount
      ? calcVatFromSupply(Number(supplyAmount))
      : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>수기 거래 등록</DialogTitle>
          <DialogDescription>
            추가 수익 또는 기타 비용을 입력합니다. 공급가액 기준 부가세 10% 자동 계산을 선택할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>유형</Label>
              <select
                className="flex h-11 w-full rounded-xl border px-3 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as TransactionType)}
              >
                <option value="income">수익</option>
                <option value="expense">비용</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>통화</Label>
              <select
                className="flex h-11 w-full rounded-xl border px-3 text-sm"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "KRW" | "CNY" | "PHP")}
              >
                <option value="KRW">KRW (원)</option>
                <option value="CNY">CNY (위안)</option>
                <option value="PHP">PHP (페소)</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>거래일</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label>설명</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="거래 내용"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>공급가액</Label>
            <Input
              type="number"
              min={0}
              value={supplyAmount}
              onChange={(e) => setSupplyAmount(e.target.value)}
              placeholder="0"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>세무 구분</Label>
            <select
              className="flex h-11 w-full rounded-xl border px-3 text-sm"
              value={taxTreatment}
              onChange={(e) => setTaxTreatment(e.target.value as TaxTreatment)}
            >
              <option value="taxable">과세 (국내 10%)</option>
              <option value="zero_rated">영세율 (해외 인건비 등)</option>
              <option value="exempt">면세</option>
              <option value="non_taxable">비과세 (국외 용역)</option>
            </select>
          </div>

          {taxTreatment === "taxable" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoVat}
                onChange={(e) => setAutoVat(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              공급가액 × 10% 부가세 자동 계산
            </label>
          )}

          {previewVat > 0 && (
            <div className="rounded-xl bg-violet-50 px-4 py-3 text-sm">
              <p className="text-violet-800">
                부가세: <strong>{previewVat.toLocaleString()}</strong>
                {currency === "KRW" ? "원" : currency === "CNY" ? "元" : " PHP"}
              </p>
              <p className="text-violet-600 mt-1">
                합계: {(Number(supplyAmount) + previewVat).toLocaleString()}
              </p>
            </div>
          )}

          <Button type="submit" className="w-full h-11 bg-violet-600 hover:bg-violet-700">
            등록하기
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
