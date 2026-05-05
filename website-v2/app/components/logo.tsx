/**
 * TypeBridge brand bridge-arch mark.
 * Uses `currentColor` for the stroke so it inherits text color;
 * pass a className setting `text-[...]` or use `gradientId` for a linear gradient.
 */
export function BrandMark({
  size = 24,
  className = "",
  gradient = false,
  gradientId = "tb-brand-grad",
}: {
  size?: number;
  className?: string;
  gradient?: boolean;
  gradientId?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      fill="none"
      aria-hidden
    >
      {gradient && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="55%" stopColor="var(--accent-2)" />
            <stop offset="100%" stopColor="var(--accent-3)" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M 16 46 L 16 22 A 16 16 0 0 1 48 22 L 48 46"
        stroke={gradient ? `url(#${gradientId})` : "currentColor"}
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function BrandWordmark({
  className = "",
  showMark = true,
  markSize = 22,
  gradient = false,
  textClassName = "text-[17px] font-bold tracking-tight",
  gapClassName = "gap-2",
  gradientId,
}: {
  className?: string;
  showMark?: boolean;
  markSize?: number;
  gradient?: boolean;
  textClassName?: string;
  gapClassName?: string;
  gradientId?: string;
}) {
  return (
    <span
      className={`inline-flex items-center ${gapClassName} select-none ${className}`}
    >
      {showMark && (
        <BrandMark
          size={markSize}
          gradient={gradient}
          gradientId={gradientId}
          className={gradient ? "" : "text-[var(--accent)]"}
        />
      )}
      <span className={`${textClassName} text-[var(--text)]`}>TypeBridge</span>
    </span>
  );
}
