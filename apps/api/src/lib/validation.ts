import { z } from "zod";

// Password policy: 12 chars + uppercase + digit + symbol. Matches the
// minLength=12 constraint the signup/accept/redeem UIs already enforce;
// previously the server allowed 8 which would have let a future API-only
// client create accounts the UI could never log back into without a
// "password is too short for our rules" surprise.
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character");

// Trim + lowercase BEFORE running the RFC-ish email check. Reversing
// the order means pasted addresses with stray whitespace ("  x@y.com ",
// the iOS clipboard-with-trailing-newline bite) fail validation instead
// of silently succeeding after normalisation.
export const emailSchema = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.string().email("Invalid email address"));
