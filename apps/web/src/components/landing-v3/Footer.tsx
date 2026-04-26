import Image from "next/image";
import Link from "next/link";

export function LandingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="lv3-footer">
      <div className="lv3-footer__brand">
        <Image src="/Larryfulllogo.png" alt="Larry" width={88} height={20} />
        <span>© {year} Larry. Making projects run themselves.</span>
      </div>
      <nav className="lv3-footer__nav">
        <div className="lv3-footer__col">
          <span className="lv3-footer__col-label">Product</span>
          <a href="#what">Mission</a>
          <Link href="/pricing">Pricing</Link>
          <Link href="/careers">Careers</Link>
        </div>
        <div className="lv3-footer__col">
          <span className="lv3-footer__col-label">Contact</span>
          <a href="mailto:hello@larry-pm.com">hello@larry-pm.com</a>
        </div>
      </nav>
    </footer>
  );
}
