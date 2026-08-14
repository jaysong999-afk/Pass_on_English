import type { UserRole } from "@/lib/auth/types";

export class AuthError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.code = code;
    this.status = status;
    this.name = "AuthError";
  }
}

export function unauthorized(message = "unauthorized"): AuthError {
  return new AuthError("unauthorized", 401, message);
}

export function forbidden(code = "forbidden"): AuthError {
  return new AuthError(code, 403);
}

export function wrongRole(expected: UserRole, actual: UserRole): AuthError {
  return new AuthError("wrong_role", 403, `Expected role ${expected}, got ${actual}`);
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}
