"use client";

import { useEffect, useState } from "react";
import { PAYMENT_DISPLAY_HOURS } from "@/lib/enrollment-hold/constants";

function formatRemaining(deadlineIso: string): string {
  const ms = new Date(deadlineIso).getTime() - Date.now();
  if (ms <= 0) return "0:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function PaymentDeadlineCountdown({
  deadlineAt,
  expiredLabel,
  holdStartsAt,
  waitingLabel,
}: {
  deadlineAt: string;
  expiredLabel: string;
  /** When set (trial-first), the 12h/15h clock does not run until this instant. */
  holdStartsAt?: string;
  waitingLabel?: string;
}) {
  const computeLabel = () => {
    if (new Date(deadlineAt).getTime() <= Date.now()) return expiredLabel;
    if (holdStartsAt && new Date(holdStartsAt).getTime() > Date.now()) {
      const untilStart = formatRemaining(holdStartsAt);
      return waitingLabel ? `${waitingLabel} ${untilStart}` : untilStart;
    }
    return formatRemaining(deadlineAt);
  };

  const [label, setLabel] = useState(computeLabel);

  useEffect(() => {
    const tick = () => setLabel(computeLabel());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [deadlineAt, expiredLabel, holdStartsAt, waitingLabel]);

  const expired = new Date(deadlineAt).getTime() <= Date.now();

  return (
    <p className={`text-sm font-semibold ${expired ? "text-red-600" : "text-brand-700"}`}>
      {label}
    </p>
  );
}

export { PAYMENT_DISPLAY_HOURS };
