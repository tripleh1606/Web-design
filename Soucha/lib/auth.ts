import crypto from "crypto";

const ADMIN_PIN = process.env.ADMIN_PIN || "";

/** Create a simple HMAC token from the PIN. */
export function createToken(): string {
  const payload = `admin:${Date.now()}`;
  const hmac = crypto.createHmac("sha256", ADMIN_PIN).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64")}.${hmac}`;
}

/** Validate an admin session token. */
export function validateAdminToken(token: string): boolean {
  if (!ADMIN_PIN || !token) return false;
  try {
    const [payloadB64, hmac] = token.split(".");
    if (!payloadB64 || !hmac) return false;
    const payload = Buffer.from(payloadB64, "base64").toString();
    const expected = crypto.createHmac("sha256", ADMIN_PIN).update(payload).digest("hex");
    if (hmac !== expected) return false;

    // Check if token is less than 24 hours old
    const parts = payload.split(":");
    const ts = parseInt(parts[1], 10);
    if (isNaN(ts)) return false;
    const age = Date.now() - ts;
    return age < 24 * 60 * 60 * 1000; // 24h
  } catch {
    return false;
  }
}
