export function HeroHead() {
  return (
    <div className="mx-auto w-full max-w-[900px] text-center">
      <span
        className="inline-flex items-center gap-2.5 rounded-full border bg-white px-4 py-1.5 font-mono uppercase"
        style={{
          borderColor: "var(--border)",
          fontSize: "10px",
          fontWeight: 500,
          letterSpacing: "0.18em",
          color: "var(--text-2)",
        }}
      >
        <span className="hero-eyebrow-dot" />
        Larry · Execution live
      </span>

      <h1
        className="mx-auto mt-5 max-w-[16ch] font-extrabold"
        style={{
          fontSize: "clamp(2.75rem, 7.2vw, 5.75rem)",
          lineHeight: 0.98,
          letterSpacing: "-0.045em",
          color: "var(--text-1)",
        }}
      >
        Making projects <span className="hero-italic">run themselves.</span>
      </h1>

      <p
        className="mx-auto mt-6 max-w-[580px]"
        style={{
          fontSize: "17px",
          lineHeight: 1.55,
          color: "var(--text-2)",
          letterSpacing: "-0.005em",
        }}
      >
        Larry listens across your stack, decides what needs to happen, drafts
        it in your voice, and ships it. Watch a live minute of execution below
        — or drop in a signal and see Larry act in real time.
      </p>
    </div>
  );
}
