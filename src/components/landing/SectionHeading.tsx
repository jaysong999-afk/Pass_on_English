import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
  className,
  level = "h2",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  className?: string;
  level?: "h1" | "h2";
}) {
  const Heading = level;
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
      <Heading className="landing-display text-3xl sm:text-4xl lg:text-[2.75rem]">{title}</Heading>
      {subtitle && (
        <p className={cn("landing-prose mt-4", align === "center" && "mx-auto")}>{subtitle}</p>
      )}
    </div>
  );
}
