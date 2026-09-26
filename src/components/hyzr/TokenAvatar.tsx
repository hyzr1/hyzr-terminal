"use client";

import { useState } from "react";
import { iconBacking, localIcon } from "@/lib/token-icons";
import { unpxImg } from "@/lib/hyzr-live-types";

/**
 * Token avatar for the Markets board.
 * Renders the REAL market logo (local /icons/hl first, then the provided
 * image, then upstream-through-proxy, then a letter tile) — never a generic
 * placeholder. Backing is meta-driven per icon (icons-meta.json):
 *   raw   -> bare logo (full-bleed art / solid discs like BTC)
 *   dark  -> white circle behind dark-ink logos (ETH, XRP, SOL) so they read
 *   light -> dark circle behind light-ink logos (HYPE mint squiggle)
 * No black tiles, no borders — dark backings that blend into the UI are gone.
 * The bonding-curve ring + dex badge only apply to legacy launchpad rows.
 */
export default function TokenAvatar({
  image,
  name,
  symbol,
  dexBadge,
  ringOffset,
}: {
  image: string;
  name: string;
  symbol?: string;
  dexBadge?: "amm" | "pump";
  ringOffset: number | null;
}) {
  const local = localIcon(symbol);
  const [broken, setBroken] = useState(0);
  const [prevKey, setPrevKey] = useState("");
  const key = `${local}|${image}|${symbol}`;
  if (prevKey !== key) {
    // adjust-state-during-render (React-sanctioned) resets the error chain
    setPrevKey(key);
    setBroken(0);
  }

  const candidates: string[] = [];
  if (local) candidates.push(local);
  if (image && !candidates.includes(image)) candidates.push(image);
  if (broken >= candidates.length) {
    const raw = unpxImg(image);
    if (raw && !candidates.includes(raw)) candidates.push(raw);
  }

  const ticker = (symbol ?? name ?? "?").toUpperCase();

  // exhausted every candidate -> deterministic letter tile
  if (broken >= candidates.length || candidates.length === 0) {
    return (
      <div className="flex h-[40px] w-[40px] flex-shrink-0 items-center justify-center rounded-[10px] border border-white/10 bg-[linear-gradient(145deg,#2b3138,#101317)]">
        <span className="text-[14px] font-black tracking-[-.02em] text-[#dce1e6]">
          {ticker.slice(0, 3)}
        </span>
      </div>
    );
  }

  const src = candidates[broken];
  /* backing only applies to the pre-analyzed local SVG; remote fallbacks
     (exchange/CDN art) render bare with cover like before */
  const backing: "raw" | "dark" | "light" =
    broken === 0 && local ? iconBacking(symbol) : "raw";

  if (backing === "dark") {
    return (
      <span
        className="relative flex h-[40px] w-[40px] flex-shrink-0 items-center justify-center rounded-full bg-white"
        style={{ padding: 5 }}
      >
        <img
          src={src}
          alt={ticker}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken((b) => b + 1)}
          className="h-full w-full object-contain"
        />
        {ringOffset != null ? (
          <svg
            className="pointer-events-none absolute inset-0"
            width="40"
            height="40"
            viewBox="0 0 46 46"
          >
            <path
              className="text-pump"
              stroke="currentColor"
              fill="transparent"
              strokeWidth="1"
              strokeLinecap="round"
              strokeDasharray="168"
              strokeDashoffset={ringOffset}
              d="M 44 44 L 6 44 Q 2 44 2 40 L 2 6 Q 2 2 6 2 L 40 2 Q 44 2 44 6 L 44 40 Q 44 44 44 44"
            />
          </svg>
        ) : null}
      </span>
    );
  }

  if (backing === "light") {
    return (
      <span
        className="relative flex h-[40px] w-[40px] flex-shrink-0 items-center justify-center rounded-full bg-[#1c2230]"
        style={{ padding: 7 }}
      >
        <img
          src={src}
          alt={ticker}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken((b) => b + 1)}
          className="h-full w-full object-contain"
        />
        {ringOffset != null ? (
          <svg
            className="pointer-events-none absolute inset-0"
            width="40"
            height="40"
            viewBox="0 0 46 46"
          >
            <path
              className="text-pump"
              stroke="currentColor"
              fill="transparent"
              strokeWidth="1"
              strokeLinecap="round"
              strokeDasharray="168"
              strokeDashoffset={ringOffset}
              d="M 44 44 L 6 44 Q 2 44 2 40 L 2 6 Q 2 2 6 2 L 40 2 Q 44 2 44 6 L 44 40 Q 44 44 44 44"
            />
          </svg>
        ) : null}
      </span>
    );
  }

  return (
    <span className="relative flex h-[40px] w-[40px] flex-shrink-0 items-center justify-center overflow-hidden rounded-[10px]">
      <img
        src={src}
        alt={ticker}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken((b) => b + 1)}
        className="h-full w-full object-cover"
      />
      {ringOffset != null ? (
        <svg
          className="pointer-events-none absolute inset-0"
          width="40"
          height="40"
          viewBox="0 0 46 46"
        >
          <path
            className="text-pump"
            stroke="currentColor"
            fill="transparent"
            strokeWidth="1"
            strokeLinecap="round"
            strokeDasharray="168"
            strokeDashoffset={ringOffset}
            d="M 44 44 L 6 44 Q 2 44 2 40 L 2 6 Q 2 2 6 2 L 40 2 Q 44 2 44 6 L 44 40 Q 44 44 44 44"
          />
        </svg>
      ) : null}
    </span>
  );
}
