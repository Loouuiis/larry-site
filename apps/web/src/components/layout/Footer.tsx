import Link from "next/link";

// Only links to destinations that actually exist are rendered here.
// Broken links produce RSC prefetch 404s that spam the browser console and
// tank perceived quality. When new pages (blog, docs, legal) ship, add them
// back here one at a time alongside the corresponding route.
const PRODUCT_LINKS: { label: string; href: string }[] = [
  { label: "Mission", href: "/#mission" },
  { label: "Pricing", href: "/pricing" },
  { label: "Careers", href: "/careers" },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--text-2)] bg-[#11172c]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="grid grid-cols-1 gap-y-8 sm:grid-cols-2 sm:gap-8">
          {/* Brand column */}
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-white mb-4"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded bg-[#8b5cf6] text-white text-xs font-bold select-none">
                L
              </span>
              Larry
            </Link>
            <p className="text-xs leading-relaxed text-[var(--text-muted)] max-w-[220px]">
              The AI project manager that actually runs execution.
            </p>
          </div>

          {/* Product column */}
          <div>
            <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] sm:mb-4 sm:tracking-widest sm:text-xs">
              Product
            </h3>
            <ul className="space-y-2.5" role="list">
              {PRODUCT_LINKS.map(({ label, href }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="inline-block min-h-[36px] py-1 text-xs text-[var(--text-2)] transition-colors duration-200 hover:text-[var(--text-disabled)]"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-[var(--text-2)] pt-6 sm:mt-14 sm:flex-row sm:pt-8">
          <p className="text-xs text-[var(--text-2)]" suppressHydrationWarning>
            &copy; {year} Larry. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
