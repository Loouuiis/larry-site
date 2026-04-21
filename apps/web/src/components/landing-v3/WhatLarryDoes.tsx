export function WhatLarryDoes() {
  const tiles = [
    {
      num: "01 / Listen",
      title: "Every channel, parsed in context",
      blurb:
        "Larry watches Slack, email, calendar, meeting transcripts and scheduled scans — with full memory of who's on what and what's due when.",
      demo: (
        <>
          <span className="lv3-demo__k">08:14</span> slack.#eng-q3 → &quot;vendor SLA gap flagged&quot;
          <br />
          <span className="lv3-demo__k">08:14</span> match → project &quot;Platform migration&quot;
          <br />
          <span className="lv3-demo__k">08:14</span> risk surface → production cutover
        </>
      ),
    },
    {
      num: "02 / Decide",
      title: "Drafts the action, states the why",
      blurb:
        "19 action types — from reminders and status updates to email and Slack drafts, timeline re-cuts, and blocker escalations. Nothing fires without reasoning.",
      demo: (
        <>
          <span className="lv3-demo__k">action</span> risk_flag
          <br />
          <span className="lv3-demo__k">reason</span> SLA confirm 3d overdue
          <br />
          <span className="lv3-demo__k">impact</span> cutover +2d if unresolved by Wed
        </>
      ),
    },
    {
      num: "03 / Execute",
      title: "Sends, assigns, updates — in your voice",
      blurb:
        "Drafts route to you for one-tap accept when stakes are high; low-stakes updates auto-execute and show up in the ledger. Always reversible.",
      demo: (
        <>
          <span className="lv3-demo__k">sent</span> @priya — nudge on 4-screen collapse
          <br />
          <span className="lv3-demo__k">moved</span> Staging cutover → Completed
          <br />
          <span className="lv3-demo__k">queued</span> exec summary for Fri 16:00
        </>
      ),
    },
  ];

  return (
    <section className="lv3-page lv3-does" id="what">
      <span className="lv3-sec-label">What Larry actually does</span>
      <h2 className="lv3-does__title">
        Not a chat. Not a gantt. An <em>operations engine</em> that runs
        between your tools.
      </h2>
      <p className="lv3-does__sub">
        Three responsibilities. Always on. Always in your voice.
      </p>
      <div className="lv3-does__grid">
        {tiles.map((t) => (
          <div key={t.num} className="lv3-tile">
            <span className="lv3-tile__num">{t.num}</span>
            <h3 className="lv3-tile__h">{t.title}</h3>
            <p className="lv3-tile__p">{t.blurb}</p>
            <div className="lv3-demo">{t.demo}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
