export function HeroMarquee() {
  const phrase = "Making projects run themselves";
  // 6 copies so the marquee scrolls without visible seams.
  const copies = Array.from({ length: 6 });

  return (
    <div className="hero__marquee" aria-label="Making projects run themselves.">
      <div className="hero__marquee-track">
        {copies.map((_, i) => (
          <span key={i}>
            {phrase} <span className="hero__marquee-dot" />
          </span>
        ))}
      </div>
    </div>
  );
}
