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

export const emailSchema = z
  .string()
  .email("Invalid email address")
  .transform((v) => v.trim().toLowerCase());
