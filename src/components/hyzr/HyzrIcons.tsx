/* Custom Hyzr icon-font glyphs recreated as inline SVGs (currentColor). */

type IconProps = {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

function base(className?: string, style?: React.CSSProperties) {
  return { className, style };
}

export function IconProTrader({ size = 12, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...base(className, style)}
    >
      <path d="M3 18h18l1.2-9.5-5.7 3.4L12 4.5 7.5 11.9 1.8 8.5 3 18Z" />
    </svg>
  );
}

export function IconChefHat({ size = 12, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...base(className, style)}
    >
      <path d="M6 13.5A4.5 4.5 0 1 1 8.4 5.3a4.5 4.5 0 0 1 7.2 0A4.5 4.5 0 1 1 18 13.5V19H6v-5.5Z" />
      <path d="M6 16h12" />
    </svg>
  );
}

export function IconBoxes({ size = 12, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...base(className, style)}
    >
      <path d="M7.5 4.2 12 2l4.5 2.2v4.6L12 11 7.5 8.8V4.2Z" />
      <path d="M7.5 11.2 3 13.4V18L7.5 20.2 12 18v-4.6l-4.5-2.2Z" />
      <path d="M16.5 11.2 21 13.4V18l-4.5 2.2L12 18v-4.6l4.5-2.2Z" />
    </svg>
  );
}

export function IconDexPaid({ size = 12, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...base(className, style)}
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v5h-5" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function IconCommunityHyzr({ size = 14, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      {...base(className, style)}
    >
      <path d="M4 3h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-9.6L6 22v-4H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 3.5-3.2 5.6h2.1L9.7 15.5l4.6-5.4h-2.2l1.7-3.6H12Z" />
    </svg>
  );
}

export function IconBookmarkX({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...base(className, style)}
    >
      <path d="M6 3h12v18l-6-4-6 4V3Z" />
      <path d="m9.5 7.5 5 5m0-5-5 5" />
    </svg>
  );
}

export function IconPill({ size = 14, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...base(className, style)}
    >
      <rect
        x="2.8"
        y="8.4"
        width="18.4"
        height="7.2"
        rx="3.6"
        transform="rotate(-30 12 12)"
      />
      <path d="m9.5 13.8 5-2.9" />
    </svg>
  );
}
