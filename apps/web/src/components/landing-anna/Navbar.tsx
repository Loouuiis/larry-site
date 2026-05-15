"use client";

import Image from "next/image";
import Link from "next/link";
import { openWaitlist } from "./waitlist-bus";

type Props = {
  /** Anchor links on the landing page are in-page (#solution); on sub-pages
   *  they need to point back to "/#solution". */
  basePath?: "" | "/";
};

export function Navbar({ basePath = "" }: Props) {
  const link = (hash: string) => `${basePath}${hash}`;

  return (
    <div className="nav-wrap">
      <nav className="nav" data-screen-label="00 Nav" data-comment-anchor="nav">
        <Link href={basePath === "/" ? "/" : "#top"} className="nav__logo" aria-label="Larry — home">
          <Image
            src="/Larryfulllogo.png"
            alt="Larry"
            width={144}
            height={38}
            priority
            style={{ height: 38, width: "auto", display: "block" }}
          />
        </Link>
        <div className="nav__links">
          <Link href={link("#solution")} className="nav__link">
            Solution
          </Link>
          <Link href={link("#pricing")} className="nav__link">
            Pricing
          </Link>
          <Link href={link("#career")} className="nav__link">
            Career
          </Link>
        </div>
        <div className="nav__right">
          <Link href="/login" className="nav__signin">
            Sign in
          </Link>
          <Link href="/book-a-demo" className="nav__bookdemo">
            Book a demo
          </Link>
          <button type="button" className="nav__cta" onClick={() => openWaitlist()}>
            Join Waitlist
          </button>
        </div>
      </nav>
    </div>
  );
}
