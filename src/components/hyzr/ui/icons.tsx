/* Small shared SVG icons used inside dropdowns (no CDN asset available). */

/** pUSD balance icon — violet circle with a $ glyph (drawn, CDN 403s). */
export function PusdIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="9" fill="#6E7BFF" />
      <circle cx="9" cy="9" r="9" fill="url(#pusd-g)" />
      <path
        d="M9 3.6v10.8M11.6 6.2c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.7.9-2.7 2.2 0 2.9 5.5 1.5 5.5 4.3 0 1.3-1.3 2.3-2.8 2.3-1.2 0-2.3-.6-2.8-1.6"
        stroke="#fff"
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
      />
      <defs>
        <linearGradient
          id="pusd-g"
          x1="0"
          y1="0"
          x2="18"
          y2="18"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#8A93FF" />
          <stop offset="1" stopColor="#5A66F0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Colored capsule (pill) icon for the protocol chips (Pump / Mayhem). */
export function CapsuleIcon({
  size = 16,
  color = "#3FCF8E",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect
        x="2.2"
        y="6"
        width="11.6"
        height="4.4"
        rx="2.2"
        transform="rotate(-38 2.2 6)"
        fill={color}
      />
      <path
        d="M6.1 3.4 4 5a1.6 1.6 0 0 0-.2 2.2l1.6 1.9L9.5 5 7.9 3.2a1.6 1.6 0 0 0-1.8.2Z"
        fill="#fff"
        fillOpacity="0.28"
      />
    </svg>
  );
}

/** Line-chart type icon (first icon button in the SOL price popover header). */
export function ChartTypeIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1.2" y="2.2" width="13.6" height="11.6" rx="2.4" />
      <path d="M3.6 9.6 6 7.2l2.2 2.2 4-4" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Real wallet brand logos (fx23) — drawn to match each official mark. */
/* ------------------------------------------------------------------ */

/** Phantom — #AB9FF2 rounded square with the white ghost + oval eyes. */
export function PhantomIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      <rect width="40" height="40" rx="10.5" fill="#AB9FF2" />
      <path
        d="M20 8.2c-6.6 0-12 5.4-12 12v9.4c0 1.6 1.9 2.4 3 1.3l1.9-1.9 2.1 1.9a1.9 1.9 0 0 0 2.6 0l2.4-2.2 2.4 2.2a1.9 1.9 0 0 0 2.6 0l2.1-1.9 1.9 1.9c1.1 1.1 3 .3 3-1.3v-9.4c0-6.6-5.4-12-12-12z"
        fill="#fff"
      />
      <ellipse cx="16" cy="20.6" rx="1.85" ry="2.7" fill="#AB9FF2" />
      <ellipse cx="24" cy="20.6" rx="1.85" ry="2.7" fill="#AB9FF2" />
    </svg>
  );
}

/** Solflare — gold→orange sun: core disc + 12 rounded rays. */
export function SolflareIcon({ size = 20 }: { size?: number }) {
  const rays = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      <defs>
        <linearGradient id="solflare-g" x1="12" y1="8" x2="30" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD05A" />
          <stop offset="1" stopColor="#FC9012" />
        </linearGradient>
      </defs>
      {rays.map((deg) => (
        <rect
          key={deg}
          x="18.9"
          y="2.6"
          width="2.2"
          height="6.4"
          rx="1.1"
          fill="url(#solflare-g)"
          transform={`rotate(${deg} 20 20)`}
        />
      ))}
      <circle cx="20" cy="20" r="7.6" fill="url(#solflare-g)" />
    </svg>
  );
}

/** MetaMask — the low-poly fox: orange face, dark-brown ear tips + snout. */
export function MetaMaskIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      {/* ears */}
      <path d="M4.4 3.4 16.3 9.6l-5.7 10.6z" fill="#E2761B" />
      <path d="M35.6 3.4 23.7 9.6l5.7 10.6z" fill="#E2761B" />
      <path d="M4.4 3.4 16.3 9.6l-3.2 4.3z" fill="#763D16" />
      <path d="M35.6 3.4 23.7 9.6l3.2 4.3z" fill="#763D16" />
      {/* face */}
      <path
        d="M4.4 3.4 10.6 20.2 8 27.8 20 36.6l12-8.8-2.6-7.6 6.2-16.8-11.9 6.2h-7.4z"
        fill="#E2761B"
      />
      {/* cheek facets */}
      <path d="M10.6 20.2 20 22.4 17.1 27.7 8 27.8z" fill="#F6851B" />
      <path d="M29.4 20.2 20 22.4l2.9 5.3 9.1.1z" fill="#F6851B" />
      {/* snout */}
      <path d="M13.4 30.4 20 32.6l6.6-2.2-2-4.2H15.4z" fill="#763D16" />
      <path d="M20 22.4l-2.6 3.8L20 28.5l2.6-2.3z" fill="#D7C1B3" />
      {/* brow shading */}
      <path d="M16.3 9.6 20 15.7l3.7-6.1z" fill="#763D16" opacity=".55" />
    </svg>
  );
}

/** Coinbase Wallet — #0052FF rounded square with the white C-ring. */
export function CoinbaseIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      <rect width="40" height="40" rx="10.5" fill="#0052FF" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M20 33c-7.2 0-13-5.8-13-13S12.8 7 20 7s13 5.8 13 13-5.8 13-13 13zm0-6.6a6.4 6.4 0 1 0 0-12.8 6.4 6.4 0 0 0 0 12.8z"
        fill="#fff"
      />
      <rect x="20" y="16.8" width="14" height="6.4" fill="#0052FF" />
    </svg>
  );
}

/** Renders the real brand mark for a connected-wallet kind. */
export function WalletLogo({ kind, size = 20 }: { kind: string; size?: number }) {
  switch (kind) {
    case "Phantom":
      return <PhantomIcon size={size} />;
    case "Solflare":
      return <SolflareIcon size={size} />;
    case "MetaMask":
      return <MetaMaskIcon size={size} />;
    case "Coinbase":
      return <CoinbaseIcon size={size} />;
    default:
      return <i className="ri-wallet-line text-[18px]" />;
  }
}
