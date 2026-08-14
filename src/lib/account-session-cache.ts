import type { AccountSession } from "@/types";

let cachedSession: AccountSession | null = null;

export function getAccountSessionCache(): AccountSession | null {
  return cachedSession;
}

export function setAccountSessionCache(session: AccountSession | null) {
  cachedSession = session;
}

export function patchAccountSessionCache(session: AccountSession) {
  cachedSession = session;
}
