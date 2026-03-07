"use client";

type LogoItem = {
  name: string;
  className: string;
};

const logos: LogoItem[] = [
  {
    name: "BCG",
    className: "font-bold tracking-[0.14em] text-sm",
  },
  {
    name: "zeb",
    className: "font-medium tracking-wider text-base lowercase",
  },
  {
    name: "Deloitte",
    className: "font-light tracking-wide text-sm",
  },
  {
    name: "Allianz",
    className: "font-semibold tracking-tight text-sm",
  },
  {
    name: "Amazon",
    className: "font-medium tracking-tight text-sm lowercase",
  },
  {
    name: "ABB",
    className: "font-bold tracking-[0.2em] text-sm",
  },
  {
    name: "Körber",
    className: "font-medium tracking-normal text-sm",
  },
  {
    name: "Accenture",
    className: "font-light tracking-widest text-xs uppercase",
  },
  {
    name: "PwC",
    className: "font-bold tracking-tight text-sm",
  },
  {
    name: "EY",
    className: "font-bold tracking-[0.22em] text-sm",
  },
  {
    name: "Simon-Kucher",
    className: "font-light tracking-wide text-xs",
  },
];

export function LogoCarousel() {
  const maskStyle: React.CSSProperties = {
    maskImage:
      "linear-gradient(to right, transparent 0%, #000 10%, #000 90%, transparent 100%)",
    WebkitMaskImage:
      "linear-gradient(to right, transparent 0%, #000 10%, #000 90%, transparent 100%)",
  };

  return (
    <div className="group overflow-hidden" style={maskStyle}>
      <div
        className="flex items-center whitespace-nowrap group-hover:[animation-play-state:paused]"
        style={{
          animation: "marquee 34s linear infinite",
          willChange: "transform",
        }}
      >
        {/* First pass */}
        {logos.map((logo) => (
          <span
            key={`a-${logo.name}`}
            className={`px-10 text-neutral-400 opacity-60 transition-opacity duration-300 hover:opacity-90 ${logo.className}`}
          >
            {logo.name}
          </span>
        ))}
        {/* Duplicate pass — required for seamless loop */}
        {logos.map((logo) => (
          <span
            key={`b-${logo.name}`}
            className={`px-10 text-neutral-400 opacity-60 transition-opacity duration-300 hover:opacity-90 ${logo.className}`}
            aria-hidden="true"
          >
            {logo.name}
          </span>
        ))}
      </div>
    </div>
  );
}
