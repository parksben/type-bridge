/**
 * TypeBridge brand mark — directly reuses the desktop app's icon (typebridge.png).
 * No more rainbow / generated SVG; the image already has the official gradient + bridge "n" baked in.
 */
export function BrandMark({
  size = 24,
  className = "",
}: {
  size?: number;
  className?: string;
  // Legacy props kept for API compat — no-ops now.
  gradient?: boolean;
  gradientId?: string;
}) {
  return (
    <img
      src="/typebridge.png"
      alt=""
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "inline-block",
      }}
      aria-hidden
    />
  );
}

export function BrandWordmark({
  className = "",
  showMark = true,
  markSize = 22,
  markClassName = "",
  textClassName = "text-[17px] font-bold tracking-tight",
  gapClassName = "gap-2",
}: {
  className?: string;
  showMark?: boolean;
  markSize?: number;
  markClassName?: string;
  textClassName?: string;
  gapClassName?: string;
  // Legacy props kept for API compat — no-ops now.
  gradient?: boolean;
  gradientId?: string;
}) {
  return (
    <span
      className={`inline-flex items-center ${gapClassName} select-none ${className}`}
    >
      {showMark && (markClassName ? (
        <img
          src="/typebridge.png"
          alt=""
          className={`${markClassName} object-contain inline-block`}
          aria-hidden
        />
      ) : (
        <BrandMark size={markSize} />
      ))}
      <span className={`${textClassName} text-[var(--text)]`}>TypeBridge</span>
    </span>
  );
}
