/* ---------------------------------------------------------------------------
 * Number / age formatting helpers matching hyzr.trade conventions.
 * ------------------------------------------------------------------------- */

/** $5.37K · $1.43M · $18.6M · $692 · $1.02B */
export function fmtUsd(n: number | null | undefined, dash = "—"): string {
  if (n == null || !isFinite(n)) return dash;
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${trim2(n / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `$${trim2(n / 1_000_000)}M`;
  if (abs >= 1_000) return `$${trim2(n / 1_000)}K`;
  if (abs >= 1) return `$${Math.round(n)}`;
  if (abs > 0) return `$${n.toFixed(6).replace(/0+$/, "")}`;
  return "$0";
}

function trim2(v: number): string {
  const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return s;
}

/** +22.27% · -3.4% · 0% */
export function fmtPct(n: number | null | undefined, alwaysSign = true): string {
  if (n == null || !isFinite(n)) return "0%";
  const v = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100;
  const s = v.toString();
  if (!alwaysSign) return `${s}%`;
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(v) >= 100 ? Math.abs(v).toString() : Math.abs(v).toString()}%`;
}

/** 599 · 5.2K · 1.3M */
export function fmtNum(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "0";
  if (n >= 1_000_000) return `${trim2(n / 1_000_000)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toString();
}

/** Market price formatting: $112,840.5 · $4,382.20 · $214.72 · $0.0045212 */
export function fmtPrice(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  if (n >= 10_000)
    return `$${n.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}`;
  if (n >= 1_000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n > 0) return `$${n.toPrecision(5).replace(/0+$/, "").replace(/\.$/, "")}`;
  return "$0";
}

/** 7s · 31s · 1m · 52m · 18h · 2d */
export function fmtAge(fromMs: number, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

/* ----------------------------------------------------------------------- */
/* Deterministic pseudo-random helpers (stable per token address)          */
/* ----------------------------------------------------------------------- */

export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type TokenExtras = {
  top10: number;
  dev: number;
  snipers: number;
  insiders: number;
  kol: number;
  paid: boolean;
  /** deterministic base viewers count */
  viewersBase: number;
  athHolders: number;
  hasSocials: boolean;
  hasWeb: boolean;
  hasCoin: boolean;
};

/** Stable per-token "audit" style metrics derived from the address —
 *  mirrors the seeded metrics the real UI shows (top10, snipers...). */
export function tokenExtras(id: string): TokenExtras {
  const r = rng(hashSeed(id));
  const top10 = Math.round((5 + r() * 30) * 100) / 100;
  const dev = r() < 0.55 ? 0 : Math.round(r() * 4 * 100) / 100;
  const snipers = r() < 0.4 ? 0 : Math.round(r() * 14 * 100) / 100;
  const insiders = r() < 0.45 ? 0 : Math.round(r() * 9 * 100) / 100;
  const kol = Math.round(r() * 50 * 100) / 100;
  const paid = r() < 0.55;
  const viewersBase = Math.round(3 + r() * 60);
  const athHolders = Math.round(4 + r() * 400);
  return {
    top10,
    dev,
    snipers,
    insiders,
    kol,
    paid,
    viewersBase,
    athHolders,
    hasSocials: r() < 0.5,
    hasWeb: r() < 0.75,
    hasCoin: r() < 0.65,
  };
}

/** bonding-curve accent for a card: blue (early) / gold (near migration) /
 *  green (migrated or non-pump dex) — derived from live market cap. */
export function curveAccent(t: {
  mc: number;
  dex: string;
  createdAt: number;
}): "blue" | "gold" | "green" {
  const PUMP = new Set(["pumpfun", "pump-fun"]);
  if (!PUMP.has(t.dex)) return "green";
  if (t.mc >= 69_000) return "green";
  if (t.mc >= 40_000) return "gold";
  return "blue";
}

export const ACCENT_HEX: Record<"blue" | "gold" | "green", string> = {
  blue: "#52C5FF",
  gold: "#DCC13C",
  green: "#2FE3AC",
};
