"use client";
/**
 * Market icon — the official perp logo, served from the PRE-SEEDED same-origin
 * copy (public/icons/hl, populated by scripts/seed-icons.ts) so icons appear
 * instantly; falls back to the proxy, then direct HL, then a letter badge.
 *
 * Backing is meta-driven per icon (icons-meta.json, see scripts/analyze-icons.py):
 *   raw   -> bare logo (full-bleed art / solid discs like BTC)
 *   dark  -> white circle behind dark-ink logos (ETH, XRP, SOL) so they read
 *   light -> dark circle behind light-ink logos (HYPE mint squiggle)
 * The img is always visible (no opacity gate — that race used to leave the
 * dark placeholder circle stuck behind "loaded" icons).
 */
import { useState } from "react";
import { iconBacking, localIcon } from "@/lib/token-icons";
import { hlIconUrl } from "@/lib/hyperliquid/icons";
import { baseName } from "@/lib/hyperliquid/types";

export default function HlIcon({
  coin,
  size = 20,
  className = "",
}: {
  coin: string;
  size?: number;
  className?: string;
}) {
  return <IconInner key={coin} coin={coin} size={size} className={className} />;
}

function IconInner({
  coin,
  size,
  className,
}: {
  coin: string;
  size: number;
  className: string;
}) {
  const local = localIcon(baseName(coin));
  /* HL spot-pair ids ("@107") have no published CDN logo — the proxy 404s and
     the direct URL is ORB-blocked, so skip both and go straight to the badge. */
  const isSpotId = coin.startsWith("@");
  const candidates = isSpotId
    ? []
    : [
        ...(local ? [local] : []),
        `/api/hl/icon?c=${encodeURIComponent(coin)}`, // same-origin proxy (disk-cached)
        hlIconUrl(coin),                              // direct HL fallback
      ];
  const [idx, setIdx] = useState(0);

  if (idx >= candidates.length) {
    const raw = baseName(coin);
    const ch = (isSpotId ? raw.replace("@", "") : raw).slice(0, 1).toUpperCase() || "?";
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-[#1c2230] font-medium text-[#8c93ab] ${className}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
      >
        {ch}
      </span>
    );
  }

  const backing = idx === 0 && local ? iconBacking(baseName(coin)) : "raw";
  const pad = Math.max(1, Math.round(size * (backing === "dark" ? 0.14 : 0.18)));

  if (backing === "dark") {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-white ${className}`}
        style={{ width: size, height: size, padding: pad }}
      >
        <img
          src={candidates[idx]}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setIdx((i) => i + 1)}
          className="h-full w-full object-contain"
        />
      </span>
    );
  }
  if (backing === "light") {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-[#1c2230] ${className}`}
        style={{ width: size, height: size, padding: pad }}
      >
        <img
          src={candidates[idx]}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setIdx((i) => i + 1)}
          className="h-full w-full object-contain"
        />
      </span>
    );
  }
  return (
    <span
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={candidates[idx]}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setIdx((i) => i + 1)}
        className="h-full w-full object-contain"
      />
    </span>
  );
}
