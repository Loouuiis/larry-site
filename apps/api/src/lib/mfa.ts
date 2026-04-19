import { createHash, randomBytes } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import type { Db } from "@larry/db";

// RFC 6238: SHA1, 30s, 6 digits — the values Google Authenticator / 1Password
// / Authy default to. Don't change without a migration — enrolled secrets
// encode these parameters.
const TOTP_PERIOD = 30;
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = "SHA1" as const;
const TOTP_ISSUER = "Larry";
// Allow ±1 step (30s) for clock drift between server and authenticator.
const TOTP_WINDOW = 1;

const SCRATCH_CODE_COUNT = 10;

export interface EnrolmentSecret {
  secret: string; // base32
  otpauthUrl: string;
}

/**
 * Generate a fresh TOTP shared secret + otpauth:// URL. The URL is what
 * authenticator apps scan (rendered as a QR code by the client).
 */
export function generateEnrolmentSecret(accountLabel: string): EnrolmentSecret {
  const secret = new Secret({ size: 20 }); // 160-bit, per RFC 6238 §5.1
  const totp = new TOTP({
    issuer: TOTP_ISSUER,
    label: accountLabel,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret,
  });
  return {
    secret: secret.base32,
    otpauthUrl: totp.toString(),
  };
}

/**
 * Verify a user-supplied 6-digit code against a stored base32 secret.
 * Returns true if the code matches the current step or the adjacent steps
 * (tolerating 30s of drift in either direction).
 */
export function verifyTotpCode(secretBase32: string, code: string): boolean {
  const normalised = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalised)) return false;
  try {
    const secret = Secret.fromBase32(secretBase32);
    const totp = new TOTP({
      issuer: TOTP_ISSUER,
      algorithm: TOTP_ALGORITHM,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD,
      secret,
    });
    const delta = totp.validate({ token: normalised, window: TOTP_WINDOW });
    return delta !== null;
  } catch {
    return false;
  }
}

/**
 * Generate N human-readable backup codes ("AB12-CD34-EF56"). Returned
 * raw for one-time display to the user; only the hashes should be persisted.
 */
export function generateScratchCodes(count = SCRATCH_CODE_COUNT): string[] {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(9);
    let raw = "";
    for (let b = 0; b < bytes.length; b++) {
      raw += alphabet[bytes[b] % alphabet.length];
    }
    codes.push(`${raw.slice(0, 3)}-${raw.slice(3, 6)}-${raw.slice(6, 9)}`);
  }
  return codes;
}

export function hashScratchCode(code: string): string {
  // Strip whitespace and uppercase so "ab12-cd34-ef56" and "AB12CD34EF56"
  // match the same hash. Dashes are decorative.
  const normalised = code.replace(/[\s-]+/g, "").toUpperCase();
  return createHash("sha256").update(normalised).digest("hex");
}

/**
 * Atomically consume a scratch code for a user. Returns true if the code
 * existed and was unused; false otherwise. Uses UPDATE … WHERE used_at IS NULL
 * so two concurrent verify calls can't both win.
 */
export async function consumeScratchCode(
  db: Db,
  userId: string,
  code: string,
): Promise<boolean> {
  const hash = hashScratchCode(code);
  const rows = await db.query<{ id: string }>(
    `UPDATE user_mfa_scratch_codes
        SET used_at = NOW()
      WHERE user_id = $1
        AND code_hash = $2
        AND used_at IS NULL
      RETURNING id`,
    [userId, hash],
  );
  return rows.length > 0;
}

export const MFA_CONSTANTS = {
  SCRATCH_CODE_COUNT,
  TOTP_PERIOD,
  TOTP_DIGITS,
  TOTP_ALGORITHM,
  TOTP_ISSUER,
};
