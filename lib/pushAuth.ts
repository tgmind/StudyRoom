import crypto from "crypto";

/**
 * Generates an HMAC SHA-256 signature for push notification interactive actions.
 * Allows service workers in background mode to authorize server actions (e.g. stopping a session)
 * even if session cookies are absent.
 */
export function signPushAction(userId: string): string {
  const secret =
    process.env.VAPID_PRIVATE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "studyroom-push-action-secret";
  return crypto.createHmac("sha256", secret).update(`stop:${userId}`).digest("hex");
}

/**
 * Validates the HMAC signature for a given user action.
 */
export function verifyPushAction(userId: string, token: string | undefined): boolean {
  if (!token || !userId) return false;
  try {
    const expected = signPushAction(userId);
    const tokenBuf = Buffer.from(token);
    const expectedBuf = Buffer.from(expected);
    if (tokenBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(tokenBuf, expectedBuf);
  } catch {
    return false;
  }
}
