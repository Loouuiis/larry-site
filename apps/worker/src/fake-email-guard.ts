const FAKE_TLDS = [".local", ".test", ".invalid", ".example"] as const;
const FAKE_DOMAINS = new Set(["example.com", "example.org", "example.net"]);

/**
 * Returns true for addresses on non-routable / reserved TLDs and second-level
 * domains (RFC 2606 — `.test`, `.invalid`, `.example`, `example.com`, etc.) plus
 * the `.local` TLD commonly used in seed/fixture data (e.g. `sarah@larry.local`).
 *
 * The worker escalation cron iterates over whatever user records the DB holds,
 * including demo/seed rows, so without this guard a freshly-enabled RESEND_API_KEY
 * would fire a backlog of sends against these fake addresses. Every such send is
 * a hard bounce in AWS SES, which damages domain reputation on larry-pm.com.
 */
export function isLikelyFakeEmail(email: string): boolean {
  const lower = email.toLowerCase().trim();
  const atIdx = lower.lastIndexOf("@");
  if (atIdx < 0) return true;
  const domain = lower.slice(atIdx + 1);
  if (!domain) return true;
  if (FAKE_DOMAINS.has(domain)) return true;
  return FAKE_TLDS.some((tld) => domain.endsWith(tld));
}
