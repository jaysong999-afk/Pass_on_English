import {
  loadEnvLocal,
  loadSeedManifest,
  signInWithPassword,
} from "./test-fixtures/auth-fixtures.mjs";

loadEnvLocal();
const baseUrl = process.argv[2] ?? "http://localhost:3000";
const manifest = loadSeedManifest();

async function page(path, token) {
  return fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const anonymous = await page("/admin");
if (anonymous.status < 300 || anonymous.status >= 400) {
  throw new Error(`anonymous /admin expected redirect, got ${anonymous.status}`);
}
const anonymousLocation = anonymous.headers.get("location") ?? "";
if (!anonymousLocation.includes("/admin/login") || !anonymousLocation.includes("next=%2Fadmin")) {
  throw new Error(`anonymous /admin redirected incorrectly: ${anonymousLocation}`);
}
console.log("PASS anonymous /admin redirects to admin login");

const studentToken = await signInWithPassword({
  email: manifest.student.email,
  password: manifest.password,
});
const student = await page("/admin", studentToken);
if (student.status < 300 || student.status >= 400 || !(student.headers.get("location") ?? "").includes("/admin/login")) {
  throw new Error(`student /admin was not denied: ${student.status} ${student.headers.get("location")}`);
}
console.log("PASS student session cannot open /admin");

const adminToken = await signInWithPassword({
  email: manifest.admin.email,
  password: manifest.password,
});
const admin = await page("/admin", adminToken);
if (admin.status !== 200) {
  throw new Error(`admin /admin expected 200, got ${admin.status}`);
}
console.log("PASS valid admin session can open /admin");

const login = await page("/admin/login");
if (login.status !== 200) throw new Error(`admin login page expected 200, got ${login.status}`);
console.log("PASS admin login page remains public");
