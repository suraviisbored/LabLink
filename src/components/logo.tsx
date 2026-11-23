/**
 * Logo mark: three linked nodes in beige with a dark grey connection, plus the
 * wordmark. `alt="LabLink"` on the SVG, and a one-colour variant for beige
 * backgrounds (docs/DESIGN.md 3.1). The same mark ships as app/icon.svg.
 */
export function LogoMark({
  className = "",
  tone = "duo",
  width = 40,
  height = 40,
}: {
  className?: string;
  tone?: "duo" | "mono";
  width?: number;
  height?: number;
}) {
  const node = tone === "duo" ? "#DDD0C8" : "#323232";
  const stroke = "#323232";
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="LabLink"
      className={className}
      width={width}
      height={height}
    >
      <g fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round">
        <path d="M15 32 24 15l9 17" />
        <path d="M15 32h18" />
      </g>
      <circle cx="15" cy="32" r="5.2" fill={node} stroke={stroke} strokeWidth="2.2" />
      <circle cx="33" cy="32" r="5.2" fill={node} stroke={stroke} strokeWidth="2.2" />
      <circle cx="24" cy="15" r="5.2" fill={node} stroke={stroke} strokeWidth="2.2" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-[0.18em] ${className}`}>
      LAB<span className="tracking-[0.1em]">LINK</span>
    </span>
  );
}
