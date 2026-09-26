"use client";
/**
 * InlineTokenIcon — tiny inline token img (nav pills, ticker strip) with the
 * same meta-driven backing as TokenAvatar/HlIcon: dark-ink transparent logos
 * (SOL, ETH, XRP) get a white disc so they read on the dark UI; raw art
 * renders bare. Used for direct <img> spots that bypass HlIcon/TokenAvatar.
 */
import { iconBacking, type IconBacking } from "@/lib/token-icons";

export default function InlineTokenIcon({
  src,
  symbol,
  size = 14,
  alt = "",
  className = "",
}: {
  src: string;
  symbol?: string | null;
  size?: number;
  alt?: string;
  className?: string;
}) {
  /* Only pre-analyzed local HL icons carry a backing; foreign art renders bare */
  const backing: IconBacking = src.startsWith("/icons/hl/") && symbol
    ? iconBacking(symbol)
    : "raw";

  if (backing === "dark") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white ${className}`}
        style={{ width: size, height: size, padding: Math.max(1, size * 0.16) }}
      >
        <img src={src} alt={alt} className="h-full w-full object-contain" />
      </span>
    );
  }
  if (backing === "light") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#1c2230] ${className}`}
        style={{ width: size, height: size, padding: Math.max(1, size * 0.2) }}
      >
        <img src={src} alt={alt} className="h-full w-full object-contain" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
