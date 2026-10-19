const SVG_DATA_URI_PATTERN = /^data:image\/svg\+xml(?:;[^,]*)?,/i;

export function normalizeTotpQrCode(qrCode: string): string {
  const value = qrCode.trim();

  if (SVG_DATA_URI_PATTERN.test(value)) return value;

  const isRawSvg = value.startsWith("<svg") || (value.startsWith("<?xml") && value.includes("<svg"));
  if (isRawSvg) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
  }

  throw new Error("invalid_totp_qr_code");
}
