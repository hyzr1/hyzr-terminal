/** Formatting helpers matching Hyzr perps conventions. */
import type { PerpMeta } from "./types";

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(fractionDigits: number, grouping = true) {
  const key = `${fractionDigits}-${grouping}`;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      useGrouping: grouping,
    });
    nfCache.set(key, f);
  }
  return f;
}

/**
 * Hyperliquid price rule: max 5 significant figures, max (6 - szDecimals) decimals.
 */
export function priceDecimals(meta: PerpMeta | undefined, px: number): number {
  const maxDec = meta ? Math.max(0, 6 - meta.szDecimals) : 6;
  if (!px || !isFinite(px)) return Math.min(2, maxDec);
  // significant figure constraint
  const intDigits = Math.max(1, Math.floor(Math.log10(Math.abs(px))) + 1);
  const sigDec = Math.max(0, 5 - intDigits);
  return Math.max(0, Math.min(maxDec, sigDec));
}

export function fmtPrice(meta: PerpMeta | undefined, px: number | null | undefined): string {
  if (px == null || !isFinite(px)) return "--";
  return nf(priceDecimals(meta, px)).format(px);
}

export function fmtPxQuote(px: number, meta: PerpMeta | undefined): string {
  // order-quantity string sent to HL
  const d = priceDecimals(meta, px);
  return px.toFixed(d);
}

export function fmtSz(meta: PerpMeta | undefined, sz: number): string {
  if (!meta) return nf(2, false).format(sz);
  const d = Math.min(meta.szDecimals, 8);
  const f = nf(d);
  let s = f.format(sz);
  if (d > 0) {
    s = s.replace(/\.?0+$/, "");
    if (s.endsWith(".")) s = s.slice(0, -1);
  }
  return s;
}

export function fmtSzQuote(sz: number, meta: PerpMeta | undefined): string {
  const d = meta ? meta.szDecimals : 4;
  return sz.toFixed(d);
}

export function fmtUsd(v: number | null | undefined, opts?: { signed?: boolean; decimals?: number }): string {
  if (v == null || !isFinite(v)) return "--";
  const sign = v < 0 ? "-" : opts?.signed ? "+" : "";
  const a = Math.abs(v);
  let s: string;
  if (opts?.decimals != null) s = nf(opts.decimals).format(a);
  else if (a >= 1_000_000_000) s = `${nf(2).format(a / 1_000_000_000)}B`;
  else if (a >= 1_000_000) s = `${nf(2).format(a / 1_000_000)}M`;
  else if (a >= 10_000) s = `${nf(1).format(a / 1_000)}K`;
  else if (a >= 1_000) s = nf(0).format(a);
  else if (a >= 1) s = nf(2).format(a);
  else s = nf(Math.min(6, Math.max(2, 2 - Math.floor(Math.log10(a || 1)) + 2))).format(a);
  return `${sign}$${s}`;
}

export function fmtUsdFull(v: number | null | undefined, decimals = 2): string {
  if (v == null || !isFinite(v)) return "--";
  const sign = v < 0 ? "-" : "";
  return `${sign}${nf(decimals).format(Math.abs(v))}`;
}

export function fmtPct(v: number | null | undefined, decimals = 2, signed = true): string {
  if (v == null || !isFinite(v)) return "--";
  const sign = signed && v > 0 ? "+" : "";
  return `${sign}${nf(decimals).format(v)}%`;
}

/** funding 1h rate (e.g. 0.0000265) → "0.00265%" */
export function fmtFunding(funding: string | number | null | undefined): string {
  if (funding == null) return "--";
  const v = typeof funding === "string" ? +funding : funding;
  if (!isFinite(v)) return "--";
  const p = v * 100;
  const abs = Math.abs(p);
  const dec = abs >= 0.01 ? 4 : 5;
  return `${nf(dec).format(p)}%`;
}

export function fmtCountdown(msLeft: number): string {
  if (msLeft < 0) msLeft = 0;
  const s = Math.floor(msLeft / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${String(h).padStart(2, "0")}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false });
}

export function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${d.toLocaleTimeString("en-US", { hour12: false })}`;
}

export function nextFundingTime(now = Date.now()): number {
  return Math.ceil(now / 3_600_000) * 3_600_000;
}
