import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function loadEnvLocal(envPath = resolve(PROJECT_ROOT, ".env.local")) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

export function loadSeedManifest(
  manifestPath = resolve(PROJECT_ROOT, "scripts", "seed-manifest.json")
) {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export async function signInWithPassword({ email, password }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required");
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`sign-in failed for ${email}: HTTP ${response.status}`);
  }

  return payload.access_token;
}

export function createApiClient(baseUrl = "http://localhost:3000") {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  async function request(path, token, options = {}) {
    const headers = { ...options.headers };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers["Content-Type"] ??= "application/json";

    const response = await fetch(`${normalizedBaseUrl}${path}`, {
      ...options,
      headers,
      body:
        options.body === undefined || typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body),
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  }

  async function requestJson(path, token, options = {}) {
    const result = await request(path, token, options);
    if (!result.response.ok) {
      throw new Error(
        `${options.method ?? "GET"} ${path}: ${result.response.status} ${JSON.stringify(result.payload)}`
      );
    }
    return result.payload;
  }

  return { request, requestJson };
}
