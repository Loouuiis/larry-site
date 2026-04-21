export function BeforeAfter() {
  return (
    <section className="lv3-page">
      <div className="lv3-contrast">
        <div>
          <span className="lv3-sec-label">Before / After</span>
          <h3 className="lv3-contrast__kill">
            One hour on Monday morning, <em>without Larry</em> and with.
          </h3>
        </div>
        <div className="lv3-ba">
          <div className="lv3-ba__row">
            <div className="lv3-ba__lbl">Before</div>
            <div className="lv3-ba__txt">
              <span className="lv3-ba__strike">
                Scroll three Slack channels for blockers. DM four owners.
                Copy-paste into Monday.
              </span>
            </div>
          </div>
          <div className="lv3-ba__row">
            <div className="lv3-ba__lbl">Before</div>
            <div className="lv3-ba__txt">
              <span className="lv3-ba__strike">
                Read Friday&apos;s meeting notes. Create four tasks by hand.
                Assign, date, describe.
              </span>
            </div>
          </div>
          <div className="lv3-ba__row">
            <div className="lv3-ba__lbl">Before</div>
            <div className="lv3-ba__txt">
              <span className="lv3-ba__strike">
                Draft the standup email. Redraft. Send. Field replies. Update
                the tracker.
              </span>
            </div>
          </div>
          <div className="lv3-ba__row lv3-ba__row--larry">
            <div className="lv3-ba__lbl">With Larry</div>
            <div className="lv3-ba__txt">
              Open the workspace. Six actions are already executed. Three are
              waiting for your nod. Accept.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
