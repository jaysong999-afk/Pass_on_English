import type { CountryCode } from "@/types";

export const ACCOUNT_COUNTRIES: CountryCode[] = ["KR", "CN", "PH", "OTHER"];

export function countryToTimezone(country: CountryCode): string {
  if (country === "CN") return "Asia/Shanghai";
  if (country === "PH") return "Asia/Manila";
  return "Asia/Seoul";
}
