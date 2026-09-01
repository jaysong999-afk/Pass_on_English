import assert from "node:assert/strict";
import { classifyLoginFailure } from "../src/lib/auth/login-failure.ts";

assert.deepEqual(classifyLoginFailure({ code: "invalid_credentials", status: 400 }), {
  code: "invalid_credentials",
  status: 401,
  retryable: false,
});
assert.deepEqual(classifyLoginFailure({ code: "email_not_confirmed", status: 400 }), {
  code: "email_not_confirmed",
  status: 403,
  retryable: false,
});
assert.deepEqual(classifyLoginFailure({ code: "over_request_rate_limit", status: 429 }), {
  code: "auth_rate_limited",
  status: 429,
  retryable: false,
});
assert.deepEqual(classifyLoginFailure({ code: "unexpected_failure", status: 500 }), {
  code: "auth_temporarily_unavailable",
  status: 503,
  retryable: true,
});
assert.deepEqual(classifyLoginFailure({ name: "AuthRetryableFetchError" }), {
  code: "auth_temporarily_unavailable",
  status: 503,
  retryable: true,
});
assert.deepEqual(classifyLoginFailure({ code: "unknown_auth_error", status: 418 }), {
  code: "auth_failed",
  status: 502,
  retryable: false,
});

console.log("Authentication login failure classification passed");
