"use client";

import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div
      className={cn(
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl",
        className
      )}
    >
      {eyebrow && (
        <p className="mb-3 text-sm font-bold uppercase tracking-widest text-brand-600">
          {eyebrow}
        </p>
      )}
      <h2 className="landing-display text-3xl sm:text-4xl lg:text-[2.75rem]">{title}</h2>
      {subtitle && (
        <p className={cn("landing-prose mt-4", align === "center" && "mx-auto")}>{subtitle}</p>
      )}
    </div>
  );
}
