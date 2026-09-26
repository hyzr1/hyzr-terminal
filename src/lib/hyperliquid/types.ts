/** Hyperliquid perpetuals — shared types */

export interface PerpMeta {
  name: string;
  maxLeverage: number;
  szDecimals: number;
  onlyIsolated?: boolean;
  marginTableId?: number;
  isDelisted?: boolean;
  /** builder dex ("xyz", "flx", ...) — null/undefined for the main universe */
  dex?: string | null;
}

/** strip the "dex:" prefix → display symbol ("xyz:GOLD" → "GOLD") */
export function baseName(coin: string): string {
  const i = coin.indexOf(":");
  return i >= 0 ? coin.slice(i + 1) : coin;
}

/** "xyz:GOLD" → "xyz" ; "BTC" → null */
export function dexOf(coin: string): string | null {
  const i = coin.indexOf(":");
  return i >= 0 ? coin.slice(0, i) : null;
}

export interface AssetCtx {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  oraclePx: string;
  markPx: string;
  midPx: string;
  impactPxs: [string, string];
  dayBaseVlm: string;
}

export interface BookLevel {
  px: number;
  sz: number;
  n: number;
}

export interface Book {
  coin: string;
  time: number;
  bids: BookLevel[]; // descending, best (highest) first
  asks: BookLevel[]; // ascending, best (lowest) first
}

export interface Trade {
  coin: string;
  side: "B" | "A"; // B = buy taker (green), A = sell taker (red)
  px: number;
  sz: number;
  time: number;
  tid: number;
}

export interface Candle {
  time: number; // seconds (bar open)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Interval =
  | "1m" | "3m" | "5m" | "15m" | "30m"
  | "1h" | "2h" | "4h" | "8h" | "12h"
  | "1d" | "3d" | "1w" | "1M";

export interface PerpMarket {
  meta: PerpMeta;
  ctx: AssetCtx | null;
  /** live mid price (from allMids), falls back to ctx.midPx */
  mid: number | null;
}

export const INTERVAL_MS: Record<Interval, number> = {
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "8h": 28_800_000,
  "12h": 43_200_000,
  "1d": 86_400_000,
  "3d": 259_200_000,
  "1w": 604_800_000,
  "1M": 2_592_000_000,
};
