"use client";

import { Check, MonitorUp, Video } from "lucide-react";
import type { VideoPlatform } from "@/types";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ value: VideoPlatform; icon: typeof Video }> = [
  { value: "ZOOM", icon: Video },
  { value: "VOOV", icon: MonitorUp },
];

const COPY = {
  ko: {
    legend: "수업 가능한 플랫폼",
    zoom: "국제적으로 널리 사용하는 화상수업 플랫폼",
    voov: "중국에서도 안정적으로 접속 가능한 Tencent 화상수업 플랫폼",
    hint: "한 개 이상 선택하세요. 두 플랫폼을 모두 선택할 수 있습니다.",
  },
  en: {
    legend: "Available lesson platforms",
    zoom: "Widely used worldwide for reliable video lessons.",
    voov: "Tencent's video platform, accessible reliably in China.",
    hint: "Select one or both platforms.",
  },
  "zh-CN": {
    legend: "可使用的上课平台",
    zoom: "全球广泛使用、连接稳定的视频上课平台",
    voov: "在中国也能稳定连接的腾讯视频上课平台",
    hint: "请至少选择一个平台，也可以同时选择两个平台。",
  },
} as const;

export function VideoPlatformSelector({ value, onChange, language = "ko" }: {
  value: VideoPlatform[];
  onChange: (value: VideoPlatform[]) => void;
  language?: keyof typeof COPY;
}) {
  const copy = COPY[language];
  function toggle(platform: VideoPlatform) {
    onChange(value.includes(platform) ? value.filter((item) => item !== platform) : [...value, platform]);
  }
  return <fieldset className="space-y-2">
    <legend className="text-sm font-medium">{copy.legend}</legend>
    <div className="grid gap-2 sm:grid-cols-2">{OPTIONS.map((option) => {
      const selected = value.includes(option.value); const Icon = option.icon;
      return <button key={option.value} type="button" aria-pressed={selected} onClick={() => toggle(option.value)}
        className={cn("relative rounded-xl border p-3 text-left transition-colors", selected ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600" : "border-gray-200 bg-white hover:border-emerald-300")}> 
        <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-emerald-700"/><span className="font-semibold">{option.value}</span>{selected && <Check className="ml-auto h-4 w-4 text-emerald-700"/>}</div>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">{option.value === "ZOOM" ? copy.zoom : copy.voov}</p>
      </button>;
    })}</div>
    <p className="text-xs text-gray-500">{copy.hint}</p>
  </fieldset>;
}
