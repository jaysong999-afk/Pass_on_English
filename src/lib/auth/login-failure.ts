export type LoginFailureCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "auth_rate_limited"
  | "auth_temporarily_unavailable"
  | "auth_failed";

export interface LoginFailure {
  code: LoginFailureCode;
  status: number;
  retryable: boolean;
}

interface AuthErrorLike {
  code?: unknown;
  status?: unknown;
  name?: unknown;
}

function authErrorFields(error: unknown): {
  code: string;
  status: number | null;
  name: string;
} {
  if (!error || typeof error !== "object") {
    return { code: "", status: null, name: "" };
  }

  const candidate = error as AuthErrorLike;
  return {
    code: typeof candidate.code === "string" ? candidate.code : "",
    status: typeof candidate.status === "number" ? candidate.status : null,
    name: typeof candidate.name === "string" ? candidate.name : "",
  };
}

export function classifyLoginFailure(error: unknown): LoginFailure {
  const { code, status, name } = authErrorFields(error);

  if (code === "invalid_credentials") {
    return { code: "invalid_credentials", status: 401, retryable: false };
  }

  if (code === "email_not_confirmed") {
    return { code: "email_not_confirmed", status: 403, retryable: false };
  }

  if (status === 429 || code === "over_request_rate_limit") {
    return { code: "auth_rate_limited", status: 429, retryable: false };
  }

  if (
    (status !== null && status >= 500 && status <= 599) ||
    name === "AuthRetryableFetchError" ||
    name === "AuthUnknownError" ||
    error instanceof TypeError
  ) {
    return { code: "auth_temporarily_unavailable", status: 503, retryable: true };
  }

  return { code: "auth_failed", status: 502, retryable: false };
}

export function loginErrorLogFields(error: unknown) {
  const { code, status, name } = authErrorFields(error);
  return {
    code: code || "unknown",
    status,
    name: name || "unknown",
  };
}
