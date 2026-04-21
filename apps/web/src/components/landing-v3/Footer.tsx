import Image from "next/image";

export function LandingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="lv3-footer">
      <div className="lv3-footer__brand">
        <Image src="/Larryfulllogo.png" alt="Larry" width={88} height={20} />
        <span>© {year} Larry. Making projects run themselves.</span>
      </div>
      <nav className="lv3-footer__nav">
        <a href="mailto:hello@larry-pm.com">hello@larry-pm.com</a>
      </nav>
    </footer>
  );
}
