const PARTNERS = [
  "Nordic Capital",
  "Northvolt",
  "Stark Group",
  "Coordinaire",
  "Ramboll",
  "TCS",
  "Hyperion",
  "Atlas Copco",
  "Mercell",
  "Polestar",
];

export function LogosStrip() {
  // Two copies for a seamless loop.
  const doubled = [...PARTNERS, ...PARTNERS];
  return (
    <div className="logos-strip">
      <div className="logos-strip__label">Developed in cooperation with teams from</div>
      <div className="logos-track-wrap">
        <div className="logos-track">
          {doubled.map((name, i) => (
            <span key={`${name}-${i}`} className="logo-item">
              <span className="dot" />
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
