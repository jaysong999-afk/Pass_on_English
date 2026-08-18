import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const messages = ["messages/ko.json", "messages/zh-CN.json"].map((path) => JSON.parse(read(path)));
for (const message of messages) {
  for (const page of ["home", "about", "pricing", "teachers", "terms", "privacy", "refund"]) {
    if (!message.metadata?.[page]?.title || !message.metadata?.[page]?.description) {
      throw new Error(`metadata translations are incomplete for ${page}`);
    }
  }
}
console.log("PASS public metadata is complete for both locales");

const metadata = read("src/lib/i18n/metadata.ts");
for (const requirement of ["canonical", "languages", '"x-default"', "openGraph"]) {
  if (!metadata.includes(requirement)) throw new Error(`localized metadata is missing ${requirement}`);
}
console.log("PASS localized metadata includes canonical, language alternates, and Open Graph");

for (const path of [
  "src/components/landing/AboutPageContent.tsx",
  "src/components/landing/CtaBand.tsx",
  "src/components/landing/CurriculumSection.tsx",
  "src/components/landing/FeaturesSection.tsx",
  "src/components/landing/HeroSection.tsx",
  "src/components/landing/HeroVisual.tsx",
  "src/components/landing/HowItWorksSection.tsx",
  "src/components/landing/LessonFlowSection.tsx",
  "src/components/landing/SectionHeading.tsx",
  "src/components/landing/StatsBar.tsx",
  "src/components/landing/TeacherTrustSection.tsx",
]) {
  if (read(path).startsWith('"use client"')) {
    throw new Error(`${path} remains an unnecessary client boundary`);
  }
}
console.log("PASS static landing sections remain server components");

for (const path of [
  "src/app/[locale]/about/page.tsx",
  "src/app/[locale]/login/page.tsx",
  "src/app/[locale]/signup/page.tsx",
]) {
  if (read(path).includes("<LandingFooter />")) {
    throw new Error(`${path} does not preserve the active locale in footer links`);
  }
}
console.log("PASS localized footer links preserve the active locale");

const signup = read("src/app/[locale]/signup/page.tsx");
const platformSelector = read("src/components/shared/VideoPlatformSelector.tsx");
const pwaBanner = read("src/components/shared/PwaInstallBanner.tsx");
if (!signup.includes('language={locale === "zh-CN" ? "zh-CN" : "ko"}')) {
  throw new Error("localized signup does not pass its locale to the platform selector");
}
for (const text of ["可使用的上课平台", "在中国也能稳定连接", "请至少选择一个平台"]) {
  if (!platformSelector.includes(text)) {
    throw new Error(`Chinese platform selector copy is missing: ${text}`);
  }
}
if (pwaBanner.includes("홈 화면에 추가") || pwaBanner.includes("설치 안내 닫기")) {
  throw new Error("PWA install banner still contains hard-coded Korean copy");
}
console.log("PASS Chinese signup platform and PWA copy are localized");

const middleware = read("src/middleware.ts");
if (!middleware.includes('if (pathname.startsWith("/api/")) {\n    const apiRoles = requiredRolesForApi')) {
  throw new Error("API default-deny policy is not isolated from localized public pages");
}
console.log("PASS API authorization policy does not intercept localized public pages");
