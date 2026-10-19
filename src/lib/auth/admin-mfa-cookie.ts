export const ADMIN_MFA_COOKIE_NAME = "poe_admin_mfa_verified";

interface MfaCookiePayload {
  version: 1;
  userId: string;
  expiresAt: number;
}

function secret(): string | null {
  return (
    process.env.ADMIN_MFA_SESSION_SECRET?.trim() ||
    process.env.ADMIN_SECURITY_EVENT_HMAC_KEY?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    null
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodePayload(payload: MfaCookiePayload): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

async function importHmacKey(value: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(value),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export function adminMfaMaxAgeSeconds(): number {
  const configuredDays = Number.parseInt(process.env.ADMIN_MFA_MAX_AGE_DAYS ?? "7", 10);
  const days = Number.isFinite(configuredDays) ? Math.min(30, Math.max(1, configuredDays)) : 7;
  return days * 24 * 60 * 60;
}

export async function createAdminMfaCookie(userId: string): Promise<string | null> {
  const signingSecret = secret();
  if (!signingSecret) return null;

  const encoded = encodePayload({
    version: 1,
    userId,
    expiresAt: Math.floor(Date.now() / 1000) + adminMfaMaxAgeSeconds(),
  });
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importHmacKey(signingSecret),
    new TextEncoder().encode(encoded)
  );
  return `${encoded}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function isValidAdminMfaCookie(
  value: string | undefined,
  userId: string
): Promise<boolean> {
  const signingSecret = secret();
  if (!signingSecret || !value) return false;
  const [encoded, encodedSignature, extra] = value.split(".");
  if (!encoded || !encodedSignature || extra) return false;

  try {
    const signatureBytes = base64UrlToBytes(encodedSignature);
    const signatureBuffer = signatureBytes.buffer.slice(
      signatureBytes.byteOffset,
      signatureBytes.byteOffset + signatureBytes.byteLength
    ) as ArrayBuffer;
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      await importHmacKey(signingSecret),
      signatureBuffer,
      new TextEncoder().encode(encoded)
    );
    if (!validSignature) return false;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encoded))
    ) as Partial<MfaCookiePayload>;
    return (
      payload.version === 1 &&
      payload.userId === userId &&
      typeof payload.expiresAt === "number" &&
      payload.expiresAt > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}
