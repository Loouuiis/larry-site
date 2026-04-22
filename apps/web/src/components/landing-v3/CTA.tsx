"use client";

import { useOverlayTrigger } from "@/components/ui/LiquidOverlay";

export function CTA() {
  const onWaitlist = useOverlayTrigger("waitlist");
  const onIntro = useOverlayTrigger("intro");

  return (
    <section className="lv3-cta" id="cta">
      <div className="lv3-cta__inner">
        <h2 className="lv3-cta__h">
          Stop <em>managing</em> work.
          <br />
          Start delivering it.
        </h2>
        <p className="lv3-cta__p">
          Invite-only beta, shaped around your team&apos;s first three weeks.
          Direct line to the founders.
        </p>
        <div className="lv3-cta__row">
          <button
            type="button"
            onClick={onWaitlist}
            className="lv3-cta__btn lv3-cta__btn--primary"
          >
            Request early access →
          </button>
          <button
            type="button"
            onClick={onIntro}
            className="lv3-cta__btn lv3-cta__btn--ghost"
          >
            Book an intro
          </button>
        </div>
        <div className="lv3-cta__fine">
          Priority onboarding · No migration · Reversible by default
        </div>
      </div>
    </section>
  );
}
