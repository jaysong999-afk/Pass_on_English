import { getRequestConfig } from "next-intl/server";
import { isValidLocale } from "./config";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !isValidLocale(locale)) {
    locale = "ko";
  }

  const base = (await import(`../../../messages/${locale}.json`)).default;
  const portalFile =
    locale === "zh-CN" ? "student-portal.zh-CN.json" : "student-portal.ko.json";
  const portal = (await import(`../../../messages/${portalFile}`)).default;

  return {
    locale,
    messages: { ...base, ...portal },
  };
});
