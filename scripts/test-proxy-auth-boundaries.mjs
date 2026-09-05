import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const middleware = readFileSync(resolve(root, "src/middleware.ts"), "utf8");
const nginx = readFileSync(
  resolve(root, "deploy/tencent-lighthouse/nginx-https.conf"),
  "utf8"
);

const publicPageGuard = middleware.indexOf(
  'if (!pathname.startsWith("/api/") && (!pageRole || isPublicPagePath(pathname)))'
);
const rootAuthLookup = middleware.indexOf(
  "const auth = await getMiddlewareAuthUser(request, authResponse);"
);
const protectedAuthLookup = middleware.indexOf(
  "const auth = await getMiddlewareAuthUser(request, response);"
);

if (
  rootAuthLookup < 0 ||
  publicPageGuard < 0 ||
  protectedAuthLookup < 0 ||
  rootAuthLookup > publicPageGuard ||
  publicPageGuard > protectedAuthLookup
) {
  throw new Error("public pages must return before Supabase middleware auth lookup");
}

for (const directive of [
  "proxy_buffer_size 32k;",
  "proxy_buffers 8 32k;",
  "proxy_busy_buffers_size 64k;",
]) {
  if (!nginx.includes(directive)) {
    throw new Error(`missing Nginx response-header safety boundary: ${directive}`);
  }
}

console.log("PASS only the PWA root launch checks auth before public pages bypass refresh");
console.log("PASS Nginx accepts chunked Supabase session response headers");
