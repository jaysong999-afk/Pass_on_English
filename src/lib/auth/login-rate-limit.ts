const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const PAIR_LIMIT = 5;
const IP_LIMIT = 30;
const MAX_ENTRIES = 5_000;

interface AttemptBucket {
  attempts: number[];
  blockedUntil: number;
}

interface LoginRateState {
  buckets: Map<string, AttemptBucket>;
}

const globalRateState = globalThis as typeof globalThis & {
  __poeAdminLoginRateState?: LoginRateState;
};

const state = globalRateState.__poeAdminLoginRateState ?? { buckets: new Map() };
globalRateState.__poeAdminLoginRateState = state;

function clientAddress(request: Request): string {
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function keysFor(request: Request, email: string) {
  const ip = clientAddress(request);
  return {
    pair: `pair:${ip}:${email.trim().toLowerCase()}`,
    ip: `ip:${ip}`,
  };
}

function pruneBucket(bucket: AttemptBucket, now: number): AttemptBucket {
  bucket.attempts = bucket.attempts.filter((timestamp) => timestamp > now - WINDOW_MS);
  if (bucket.blockedUntil <= now) bucket.blockedUntil = 0;
  return bucket;
}

function getBucket(key: string, now: number): AttemptBucket {
  const bucket = pruneBucket(state.buckets.get(key) ?? { attempts: [], blockedUntil: 0 }, now);
  state.buckets.set(key, bucket);
  return bucket;
}

function trimState(now: number) {
  if (state.buckets.size <= MAX_ENTRIES) return;
  for (const [key, bucket] of state.buckets) {
    pruneBucket(bucket, now);
    if (bucket.attempts.length === 0 && bucket.blockedUntil === 0) state.buckets.delete(key);
    if (state.buckets.size <= MAX_ENTRIES) break;
  }
  while (state.buckets.size > MAX_ENTRIES) {
    const oldestKey = state.buckets.keys().next().value as string | undefined;
    if (!oldestKey) break;
    state.buckets.delete(oldestKey);
  }
}

export function checkLoginRateLimit(request: Request, email: string) {
  const now = Date.now();
  trimState(now);
  const keys = keysFor(request, email);
  const pair = getBucket(keys.pair, now);
  const ip = getBucket(keys.ip, now);
  const blockedUntil = Math.max(pair.blockedUntil, ip.blockedUntil);

  return {
    allowed: blockedUntil <= now,
    retryAfterSeconds: blockedUntil > now ? Math.max(1, Math.ceil((blockedUntil - now) / 1000)) : 0,
  };
}

export function recordLoginFailure(request: Request, email: string) {
  const now = Date.now();
  const keys = keysFor(request, email);
  for (const [key, limit] of [
    [keys.pair, PAIR_LIMIT],
    [keys.ip, IP_LIMIT],
  ] as const) {
    const bucket = getBucket(key, now);
    bucket.attempts.push(now);
    if (bucket.attempts.length >= limit) bucket.blockedUntil = now + BLOCK_MS;
  }
}

export function clearLoginFailures(request: Request, email: string) {
  const { pair } = keysFor(request, email);
  state.buckets.delete(pair);
}
