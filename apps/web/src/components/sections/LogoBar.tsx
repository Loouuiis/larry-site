import { FadeUp } from "@/components/ui/FadeUp";

// A horizontal rule frames the bar and gives it structural context.
// The previous version was 5 plain text labels centered with no visual anchor —
// a "logo bar" that contained no logos and no bar.
const INDUSTRIES = [
  "Consulting",
  "IT Services",
  "Engineering",
  "Financial Services",
  "SaaS",
] as const;

export function LogoBar() {
  return (
    <section className="border-t border-[var(--border)] py-8 sm:py-12">
      <FadeUp className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="shrink-0 text-xs font-semibold uppercase tracking-widest text-[var(--text-disabled)]">
            Built for teams in
          </p>

          {/* Industry list with thin separators */}
          <ul
            className="flex flex-wrap items-center gap-x-5 gap-y-2"
            role="list"
            aria-label="Target industries"
          >
            {INDUSTRIES.map((name, i) => (
              <li key={name} className="flex items-center gap-5">
                <span className="text-sm font-medium text-[var(--text-2)]">
                  {name}
                </span>
                {i < INDUSTRIES.length - 1 && (
                  <span
                    className="h-3 w-px bg-[var(--border)]"
                    aria-hidden="true"
                  />
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Provenance line — below a rule, at reduced weight */}
        <div className="mt-5 border-t border-[var(--border)] pt-5">
          <p className="text-xs text-[var(--text-disabled)]">
            Designed by operators with backgrounds in{" "}
            <span className="font-medium text-[var(--text-2)]">
              management consulting, venture, and high-growth tech
            </span>
            .
          </p>
        </div>
      </FadeUp>
    </section>
  );
}
