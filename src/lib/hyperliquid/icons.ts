/**
 * Coin icon URLs — Hyzr sources perp logos from Hyperliquid's own CDN:
 *   https://app.hyperliquid.xyz/coins/SPX.svg      (main universe)
 *   https://app.hyperliquid.xyz/coins/xyz:GOLD.svg (builder-dex markets, prefixed)
 * The /icons/ path serves the SPA HTML for many markets — never use it.
 * NOTE: dex coins MUST use the prefixed form; the bare name returns HTML.
 */
import { baseName } from "./types";

export function hlIconUrlFull(coin: string): string {
  return `https://app.hyperliquid.xyz/coins/${encodeURIComponent(coin)}.svg`;
}

export function hlIconUrl(coin: string): string {
  return `https://app.hyperliquid.xyz/coins/${encodeURIComponent(baseName(coin))}.svg`;
}
