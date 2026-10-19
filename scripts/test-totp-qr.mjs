import assert from "node:assert/strict";
import { normalizeTotpQrCode } from "../src/lib/auth/totp-qr.ts";

const sdkDataUri = "data:image/svg+xml;utf-8,<svg xmlns='http://www.w3.org/2000/svg'></svg>";
assert.equal(normalizeTotpQrCode(sdkDataUri), sdkDataUri, "SDK data URI must pass through unchanged");

const rawSvg = "<svg xmlns='http://www.w3.org/2000/svg'><rect width='1' height='1'/></svg>";
const normalizedRawSvg = normalizeTotpQrCode(rawSvg);
assert.match(normalizedRawSvg, /^data:image\/svg\+xml;charset=utf-8,/);
assert.equal((normalizedRawSvg.match(/data:image\/svg\+xml/g) ?? []).length, 1, "QR data URI must not be nested");

assert.throws(() => normalizeTotpQrCode("https://example.com/qr.svg"), /invalid_totp_qr_code/);
assert.throws(() => normalizeTotpQrCode("data:image/png;base64,abc"), /invalid_totp_qr_code/);

console.log("TOTP QR normalization checks passed: 4");
