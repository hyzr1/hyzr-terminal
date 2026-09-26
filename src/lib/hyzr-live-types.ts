/* ---------------------------------------------------------------------------
 * Shared types for the live Hyzr data feed (server -> SSE -> client).
 *
 * The feed reverse-engineers what hyzr.trade's Trending board shows:
 * young pump.fun-style launches ranked by short-timeframe activity, with
 * per-second market-cap updates, bonding-curve progress and real icons.
 * ------------------------------------------------------------------------- */

export type LiveTxns = { b: number; s: number };

/** One token (keyed by mint) as delivered over the wire. Field names kept
 *  short — the full snapshot is pushed to every client every second. */
export type LiveToken = {
  /** mint address (stable key) */
  id: string;
  /** base token mint address (== id) */
  mint: string;
  symbol: string;
  name: string;
  /** token image url ("" until hydrated — client renders a letter avatar) */
  image: string;
  /** dex id, e.g. "pumpfun", "raydium", "pumpswap" */
  dex: string;
  /** token creation time (epoch ms) — from pump.fun v3 or first-seen */
  createdAt: number;
  /** server receive time — used for entrance animations */
  fs: number;
  /** market cap usd (live, refreshed every ~1-2s for on-screen tokens) */
  mc: number;
  /** market cap in SOL (native pump.fun quote) */
  mcSol: number;
  liq: number;
  price: number;
  /** price change % per timeframe (1m computed server-side from MC history) */
  ch1m: number;
  ch5: number;
  ch30: number;
  ch1h: number;
  ch24h: number;
  /** volume usd per timeframe */
  v1m?: number;
  v5: number;
  v30: number;
  v1h: number;
  v24h: number;
  /** transactions per timeframe */
  t5: LiveTxns;
  t30: LiveTxns;
  t1h: LiveTxns;
  t24h: LiveTxns;
  /** unique buyers last 5m */
  b5: number;
  /** GeckoTerminal trending rank (DEX Screener mode), null when absent */
  tr: number | null;
  /** bonding-curve progress 0..1 (mcUsd / 69k, clamped) — null when N/A */
  bonding: number | null;
  /** pump.fun graduation complete (on AMM) */
  complete: boolean;
  /** all-time-high market cap usd (from pump.fun v3, live-tracked) */
  ath: number;
  /** real socials from metadata (drive the row icon strip) */
  twitter: string;
  website: string;
  telegram: string;
  /** pump.fun reply/comment count (proxy for community activity) */
  replies: number;
  /** nsfw / banned on pump.fun — excluded from every board */
  nsfw?: boolean;

  /* ---- cross-asset market-board extras (Hyperliquid perps) ---- */
  /** oracle price usd */
  oraclePx?: number;
  /** live funding rate per hour (fraction, e.g. 0.0000125) */
  funding?: number;
  /** mark vs oracle premium % */
  premium?: number;
  /** max leverage from HL meta (e.g. 40) */
  maxLev?: number;
  /** open interest in contracts (coins) */
  oiCoins?: number;
  /** previous day close (24h change base) */
  prevDayPx?: number;
  /** HL coin identifier for the Trade page ("BTC" / "xyz:SP500") */
  tradeCoin?: string;
  /** server-side price history for sparklines (≤40 real points, oldest first).
   *  Backfilled from real 1m candle closes + live ticks — never synthesized. */
  spark?: number[];
};

/** Route token images through our own caching proxy (/api/hyzr/img) so the
 *  browser never depends on flaky upstream gateways like ipfs.io. This is
 *  what the real site does with hyzr-cdn.io — icons that always render.
 *  `mint` (when known) is passed through so the proxy can hit the hyzr-cdn
 *  <mint>.webp fast path before falling back to ipfs gateways. */
export function pxImg(url: string, mint?: string): string {
  const u = (url ?? "").trim();
  if (!u) return "";
  if (u.startsWith("data:") || u.startsWith("/")) return u;
  const m = mint && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint) ? mint : "";
  return `/api/hyzr/img?u=${encodeURIComponent(u)}${m ? `&m=${m}` : ""}`;
}

/** Original upstream url from a proxied one (used by the avatar fallback). */
export function unpxImg(url: string): string {
  const m = /[?&]u=([^&]+)/.exec(url ?? "");
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return "";
  }
}

export type LiveSnapshot = {
  /** server epoch ms */
  t: number;
  /** live SOL price in usd */
  sol: number;
  /** SOL 24h change % (Jupiter) */
  solCh: number;
  pools: LiveToken[];
  /** which upstream feeds answered for this snapshot */
  src: string;
};

export const PUMP_DEXES = new Set([
  "pumpfun",
  "pump-fun",
  "pump_swap",
  "pumpswap",
  "pump-fun-amm",
  "moonshot",
  "launchlab",
  "launch-lab",
  "believe",
]);

/** pump.fun graduation market cap (≈85 SOL raised ≈ $69k). */
export const GRADUATION_MC = 69_000;

export function isPumpFun(t: LiveToken): boolean {
  return PUMP_DEXES.has(t.dex);
}

/** true while the token is still on its bonding curve */
export function isBonding(t: LiveToken): boolean {
  return !t.complete && (isPumpFun(t) || t.bonding != null);
}
