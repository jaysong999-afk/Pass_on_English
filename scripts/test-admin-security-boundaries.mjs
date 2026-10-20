import fs from "node:fs";

let passed = 0;

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function expect(label, condition) {
  if (!condition) throw new Error(`FAIL ${label}`);
  passed += 1;
  console.log(`PASS ${label}`);
}

const middleware = read("src/middleware.ts");
const adminGuard = read("src/lib/auth/admin-api-guard.ts");
const loginRoute = read("src/app/api/auth/login/route.ts");
const passwordRoute = read("src/app/api/admin/change-password/route.ts");
const logoutRoute = read("src/app/api/auth/logout/route.ts");
const securityPage = read("src/app/admin/security/page.tsx");
const mfaCookie = read("src/lib/auth/admin-mfa-cookie.ts");
const migration = read("supabase/migrations/057_admin_security_audit.sql");
const nginx = read("deploy/tencent-lighthouse/nginx-https.conf");

expect("admin pages use central MFA enforcement", middleware.includes("enforceAdminMfa"));
expect("admin API guard rejects non-AAL2 sessions", adminGuard.includes('currentLevel !== "aal2"'));
expect("MFA enrollment path stays available at AAL1", adminGuard.includes("allowAal1"));
expect("administrator mutations enforce same-origin requests", middleware.includes("isTrustedAdminMutation"));
expect(
  "login limiter cannot be bypassed with a client-controlled role",
  loginRoute.includes("const rate = checkLoginRateLimit(request, email)") &&
    !loginRoute.includes('expectedRole === "admin" && failure.code === "invalid_credentials"')
);
expect("administrator password minimum is fourteen characters", passwordRoute.includes("password.length < 14"));
expect(
  "password change preserves the current MFA session",
  !passwordRoute.includes("signInWithPassword") && passwordRoute.includes("current_password: currentPassword")
);
expect(
  "password change reports insufficient assurance as MFA required",
  passwordRoute.includes('case "insufficient_aal"') && passwordRoute.includes('{ error: "mfa_required" }')
);
expect("password change revokes other sessions", passwordRoute.includes('scope: "others"'));
expect("administrator logout is audited", logoutRoute.includes('eventType: "admin_logout"'));
expect("administrator can enroll a TOTP factor", securityPage.includes('factorType: "totp"'));
expect("MFA verification is performed by a protected server route", securityPage.includes("/api/admin/security/verify"));
expect("recent MFA proof is signed and expires", mfaCookie.includes('name: "HMAC"') && mfaCookie.includes("expiresAt"));
expect("audit table has RLS enabled", migration.includes("ENABLE ROW LEVEL SECURITY"));
expect("authenticated clients cannot insert audit rows", !migration.includes("GRANT INSERT ON TABLE public.admin_security_events TO authenticated"));
expect("raw IP address column is absent", !migration.includes("ip_address"));
expect("clickjacking protection is configured", nginx.includes('X-Frame-Options "DENY"'));

console.log(`Admin security boundary checks passed: ${passed}`);
