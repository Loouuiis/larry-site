import Link from "next/link";

const FOOTER_LINKS: Record<string, string[]> = {
  Product: ["How It Works", "Why Larry", "Pricing", "Roadmap"],
  Company: ["About", "Blog", "Careers", "Press"],
  Resources: ["Documentation", "Help Center", "Contact"],
  Legal: ["Privacy Policy", "Terms of Service", "Cookie Policy"],
};

// TODO: Add actual social platform URLs
const SOCIAL_LINKS = [
  { label: "Twitter", href: "#" },
  { label: "LinkedIn", href: "#" },
  { label: "GitHub", href: "#" },
];

export function Footer() {
  // suppressHydrationWarning on the year span handles the edge case where
  // the server and client disagree (e.g., rendering across a year boundary).
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4 sm:gap-8 lg:grid-cols-5">
          {/* Brand column */}
          <div className="col-span-2 sm:col-span-4 lg:col-span-1">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-white mb-4"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded bg-[#2e7d4f] text-white text-xs font-bold select-none">
                L
              </span>
              Larry
            </Link>
            <p className="text-xs leading-relaxed text-neutral-500 max-w-[200px]">
              The AI project manager that actually runs execution.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([category, links]) => (
            <div key={category}>
              <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 sm:mb-4 sm:tracking-widest sm:text-xs">
                {category}
              </h3>
              <ul className="space-y-2.5" role="list">
                {links.map((link) => (
                  <li key={link}>
                    <Link
                      href={`/${link.toLowerCase().replace(/[\s&]+/g, "-")}`}
                      className="inline-block min-h-[36px] py-1 text-xs text-neutral-600 transition-colors duration-200 hover:text-neutral-200"
                    >
                      {link}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-neutral-800 pt-6 sm:mt-14 sm:flex-row sm:pt-8">
          <p className="text-xs text-neutral-600" suppressHydrationWarning>
            &copy; {year} Larry. All rights reserved.
          </p>
          <ul className="flex items-center gap-5" role="list">
            {SOCIAL_LINKS.map(({ label, href }) => (
              <li key={label}>
                <Link
                  href={href}
                  className="text-xs text-neutral-600 transition-colors duration-200 hover:text-neutral-300"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
