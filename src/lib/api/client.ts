export interface ApiErrorPayload {
  error?: string;
  message?: string;
  [key: string]: unknown;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly payload: unknown;

  constructor(response: Response, payload: unknown) {
    const errorPayload = isApiErrorPayload(payload) ? payload : null;
    const message =
      errorPayload?.message ?? errorPayload?.error ?? `Request failed with status ${response.status}`;

    super(message);
    this.name = "ApiClientError";
    this.status = response.status;
    this.code = errorPayload?.error ?? null;
    this.payload = payload;
  }
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  return typeof value === "object" && value !== null;
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  const text = await response.text();
  if (!text) return undefined;

  if (response.headers.get("content-type")?.includes("application/json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  return text;
}

/** Central response and error handling for the application's JSON routes. */
export async function apiRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await parseResponse(response);

  if (!response.ok) throw new ApiClientError(response, payload);
  return payload as T;
}

export function getApiErrorCode(error: unknown): string | null {
  return error instanceof ApiClientError ? error.code : null;
}
