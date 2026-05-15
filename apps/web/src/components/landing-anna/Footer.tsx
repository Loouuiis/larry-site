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
            width={224}
            height={56}
            style={{
              height: 56,
              width: "auto",
              display: "block",
              // Invert the dark-on-transparent PNG to a white wordmark + add
              // a soft purple drop-shadow so it stays readable across the
              // footer's purple → white → purple gradient.
              filter:
                "brightness(0) invert(1) drop-shadow(0 2px 14px rgba(59,44,143,0.35))",
            }}
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
