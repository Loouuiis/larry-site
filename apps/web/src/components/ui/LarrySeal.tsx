interface LarrySealProps {
  size?: number;
  color?: string;
  className?: string;
}

export function LarrySeal({ size = 80, color = "#6c44f6", className }: LarrySealProps) {
  const uid = "larry-seal-arc";
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <path id={`${uid}-top`} d="M 20 50 A 30 30 0 0 1 80 50" />
        <path id={`${uid}-bottom`} d="M 80 50 A 30 30 0 0 1 20 50" />
      </defs>
      <circle cx="50" cy="50" r="42" />
      <circle cx="50" cy="50" r="36" strokeOpacity="0.6" />
      <text fontSize="7" fontWeight="700" letterSpacing="2" fill={color} stroke="none">
        <textPath href={`#${uid}-top`} startOffset="50%" textAnchor="middle">
          LARRY
        </textPath>
      </text>
      <text fontSize="5" fontWeight="600" letterSpacing="1.5" fill={color} stroke="none">
        <textPath href={`#${uid}-bottom`} startOffset="50%" textAnchor="middle">
          EST. 2024
        </textPath>
      </text>
      <g transform="translate(50, 50)">
        <circle r="2.5" fill={color} stroke="none" />
        <line x1="-10" y1="0" x2="-5" y2="0" strokeWidth="1" />
        <line x1="5" y1="0" x2="10" y2="0" strokeWidth="1" />
      </g>
    </svg>
  );
}
