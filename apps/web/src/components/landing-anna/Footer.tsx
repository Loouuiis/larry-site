import Image from "next/image";
import Link from "next/link";

type Props = { basePath?: "" | "/" };

export function Footer({ basePath = "" }: Props) {
  const link = (hash: string) => `${basePath}${hash}`;
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__brand">
          <Image
            src="/Larryfulllogo.png"
            alt="Larry"
            width={128}
            height={32}
            style={{ height: 32, width: "auto", display: "block" }}
          />
        </div>
        <div className="footer__cols">
          <div>
            <div className="footer__col-label">Product</div>
            <ul className="footer__list">
              <li>
                <Link href={link("#solution")}>Overview</Link>
              </li>
              <li>
                <Link href={link("#solution")}>How it works</Link>
              </li>
              <li>
                <Link href={link("#pricing")}>Pricing</Link>
              </li>
            </ul>
          </div>
          <div>
            <div className="footer__col-label">Company</div>
            <ul className="footer__list">
              <li>
                <Link href="/book-a-demo">Contact</Link>
              </li>
              <li>
                <Link href="/careers">Careers</Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="footer__bottom">
        <span>© 2026 Larry. Making projects run themselves.</span>
        <span>larry-pm.com</span>
      </div>
    </footer>
  );
}
