import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal, loadSeedManifest } from "./test-fixtures/auth-fixtures.mjs";

process.env.NODE_ENV = "production";
const {
  AUTH_COOKIE_MAX_AGE_SECONDS,
  AUTH_COOKIE_OPTIONS,
  persistentAuthCookieOptions,
} = await import("../src/lib/supabase/cookie-options.ts");

assert.equal(AUTH_COOKIE_MAX_AGE_SECONDS, 60 * 60 * 24 * 30);
assert.deepEqual(
  { path: AUTH_COOKIE_OPTIONS.path, sameSite: AUTH_COOKIE_OPTIONS.sameSite, secure: AUTH_COOKIE_OPTIONS.secure },
  { path: "/", sameSite: "lax", secure: true }
);
assert.equal(persistentAuthCookieOptions({ maxAge: 0 }).maxAge, 0);
assert.equal(persistentAuthCookieOptions({ maxAge: 123 }).maxAge, AUTH_COOKIE_MAX_AGE_SECONDS);

const root = resolve(import.meta.dirname, "..");
const middleware = readFileSync(resolve(root, "src/middleware.ts"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(root, "public/manifest.json"), "utf8"));
assert.equal(manifest.start_url, "/?source=pwa");
assert.match(middleware, /pathname === "\/"[\s\S]+getMiddlewareAuthUser[\s\S]+portalPath/);
assert.match(middleware, /copyResponseCookies\(response, NextResponse\.redirect/);
assert.match(middleware, /copyResponseCookies\([\s\S]+NextResponse\.json/);
console.log("PASS persistent cookie policy, deletion semantics, refresh propagation and PWA launch routing boundaries");

const baseUrl = process.argv[2]?.replace(/\/$/, "");
if (!baseUrl) process.exit(0);
loadEnvLocal();
const seed = loadSeedManifest();

function authCookies(response) {
  return response.headers.getSetCookie().filter((value) => /^sb-[^=]+=/.test(value));
}

function cookieHeader(setCookies) {
  return setCookies.map((value) => value.slice(0, value.indexOf(";"))).join("; ");
}

function withExpiredAccessToken(setCookies) {
  assert.equal(setCookies.length, 1, "test session unexpectedly uses chunked cookies");
  const pair = setCookies[0].slice(0, setCookies[0].indexOf(";"));
  const separator = pair.indexOf("=");
  const name = pair.slice(0, separator);
  const encoded = decodeURIComponent(pair.slice(separator + 1));
  assert.ok(encoded.startsWith("base64-"));
  const session = JSON.parse(Buffer.from(encoded.slice(7), "base64url").toString("utf8"));
  session.expires_at = 1;
  return `${name}=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}

for (const [role, expectedPath] of [
  ["student", "/ko/student"],
  ["teacher", "/teacher"],
]) {
  const login = await fetch(baseUrl + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: seed[role].email, password: seed.password, role }),
  });
  assert.equal(login.status, 200, `${role} login failed`);
  const cookies = authCookies(login);
  assert.ok(cookies.length > 0, `${role} login did not set auth cookies`);
  for (const cookie of cookies) {
    assert.match(cookie, /Max-Age=2592000/i);
    assert.match(cookie, /Path=\//i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Secure/i);
  }

  // A fresh request with only serialized cookies represents reopening the PWA.
  // Force an expired access token while retaining its refresh token. The root
  // middleware must rotate it and carry the replacement cookie into the redirect.
  const persisted = withExpiredAccessToken(cookies);
  let sessionToClean = persisted;
  try {
    const launch = await fetch(baseUrl + "/?source=pwa", {
      redirect: "manual",
      headers: { Cookie: persisted },
    });
    assert.ok(launch.status >= 300 && launch.status < 400);
    assert.equal(new URL(launch.headers.get("location"), baseUrl).pathname, expectedPath);
    const refreshedCookies = authCookies(launch);
    assert.ok(refreshedCookies.length > 0, `${role} refresh cookie was lost on redirect`);
    assert.ok(refreshedCookies.every((cookie) => /Max-Age=2592000/i.test(cookie)));
    const refreshed = cookieHeader(refreshedCookies);
    sessionToClean = refreshed;

    const portal = await fetch(baseUrl + expectedPath, {
      redirect: "manual",
      headers: { Cookie: refreshed },
    });
    assert.equal(portal.status, 200, `${role} persisted cookie could not open portal`);
  } finally {
    await fetch(baseUrl + "/api/auth/logout", {
      method: "POST",
      headers: { Cookie: sessionToClean },
    });
  }
  console.log(`PASS ${role} login cookies survive a fresh PWA launch and route to ${expectedPath}`);
}
