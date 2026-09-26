/* ---------------------------------------------------------------------------
 * LiveToken -> view-model used by the table rows and surge cards.
 * All display strings are derived here so rows/cards stay dumb components.
 * ------------------------------------------------------------------------- */

import type { InfoBadgeData, TokenPair } from "@/lib/hyzr-data";
import type { LiveToken } from "@/lib/hyzr-live-types";
import {
  fmtNum,
  fmtPct,
  fmtPrice,
  fmtUsd,
  hashSeed,
  tokenExtras,
} from "@/lib/format";

export type Timeframe = "1m" | "5m" | "30m" | "1h";

/** Sparkline display series: the server's real 65-min trend (t.spark, live-
 *  regenerated every snapshot) continued by the freshest client ticks, so the
 *  drawn window never erodes into raw-tick noise no matter how long the page
 *  stays open (the client buffer alone caps at 64 pts and drops the trend). */
export function dispSeries(t: LiveToken, hist: number[]): number[] {
  const s = t.spark;
  if (s && s.length > 8) return [...s.slice(0, -1), ...hist.slice(-8)];
  return hist;
}

/** 1m change is computed server-side from the high-frequency MC history. */
export function tfCh(t: LiveToken, tf: Timeframe): number {
  if (tf === "1m") return t.ch1m;
  if (tf === "30m") return t.ch30;
  if (tf === "1h") return t.ch1h;
  return t.ch5;
}
export function tfVol(t: LiveToken, tf: Timeframe): number {
  if (tf === "1m") return t.v1m || t.v5 * 0.25;
  if (tf === "30m") return t.v30;
  if (tf === "1h") return t.v1h;
  return t.v5;
}
export function tfTx(t: LiveToken, tf: Timeframe): { b: number; s: number } {
  if (tf === "1m") return t.t5;
  if (tf === "30m") return t.t30 ?? t.t5;
  if (tf === "1h") return t.t1h;
  return t.t5;
}

export type RowModel = TokenPair & {
  id: string;
  /** "market" = cross-asset perp row (price/OI/volume), "pump" = launchpad */
  kind: "market" | "pump";
  /** HL coin id for the trade deep-link ("BTC" / "xyz:SP500") */
  tradeCoin: string;
  /** live numeric cells (drive the green/red change flash) */
  mcNum: number;
  liqNum: number;
  volNum: number;
  txNum: number;
  /** numeric change for the active timeframe (sort header) */
  chNum: number;
  /** live sparkline points */
  series?: number[];
  /** recently arrived — plays the entrance highlight */
  fresh: boolean;
  accent: "blue" | "gold" | "green";
  addressShort: string;
  holdersNum: number;
  athMc: number;
  mult: number;
  iconQuill: boolean;
  iconLink: boolean;
  iconWeb: boolean;
  iconCoin: boolean;
  /** 0..1 bonding curve progress (pump pairs) */
  curve: number;
  /** bonding-curve token (not yet graduated) */
  bonding: boolean;
  /** bonding progress 0..1 (null when N/A) */
  bondingPct: number | null;
};

/** "75pS...pump" for pump mints, "8K5X...YF8L" otherwise — as on the real site. */
export function shortMint(mint: string): string {
  if (mint.toLowerCase().endsWith("pump")) return `${mint.slice(0, 4)}...pump`;
  return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
}

export function buildRow(
  t: LiveToken,
  opts: {
    tf: Timeframe;
    now: number;
    series?: number[];
    athMc?: number;
  },
): RowModel {
  const seed = hashSeed(t.mint);
  const isMarket = t.bonding == null && t.complete !== false && !!t.tradeCoin;
  const ch = tfCh(t, opts.tf);
  const vol = tfVol(t, opts.tf);
  const tx = tfTx(t, opts.tf);

  if (isMarket) {
    /* ---------------- cross-asset perp market row ---------------- */
    const funding = t.funding ?? 0; // fraction per hour
    const fundingPct = funding * 100;
    const premium = t.premium ?? 0;
    const oi = t.liq; // notional open interest
    const turnover = oi > 0 ? (t.v24h / oi) * 100 : 0;
    const badge = (
      icon: string,
      value: string,
      tone: InfoBadgeData["tone"],
    ): InfoBadgeData => ({ icon, value, tone });
    return {
      id: t.id,
      image: t.image,
      symbol: t.symbol,
      name: t.name,
      age: t.dex.toUpperCase(), // category label: CRYPTO / EQUITY / ...
      viewers: 0,
      marketCap: fmtPrice(t.price), // "Price" column
      changePct: fmtPct(ch),
      changeUp: ch >= 0,
      chNum: ch,
      liquidity: fmtUsd(oi), // "Open Interest" column
      volume: fmtUsd(vol),
      txns: fmtNum(tx.b + tx.s),
      txnsBuy: fmtNum(tx.b),
      txnsSell: fmtNum(tx.s),
      ringOffset: null,
      dexBadge: "amm",
      infoBadges: [
        badge(
          "ri-percent-line",
          `${Math.abs(fundingPct) < 0.001 ? "0.000" : fundingPct.toFixed(4)}%`,
          fundingPct > 0.0005 ? "red" : fundingPct < -0.0005 ? "green" : "neutral",
        ),
        badge(
          "ri-arrow-left-right-line",
          `${premium >= 0 ? "+" : ""}${premium.toFixed(3)}%`,
          premium > 0.02 ? "red" : premium < -0.02 ? "green" : "neutral",
        ),
        badge("ri-key-2-line", `${t.maxLev ?? "—"}x`, "neutral"),
        badge("ri-refresh-line", `${Math.min(turnover, 9999).toFixed(1)}%`, "neutral"),
        badge("ri-line-chart-line", fmtPct(t.ch24h), t.ch24h >= 0 ? "green" : "red"),
      ],
      dexPaid: "Paid",
      holders: "",
      proTraders: "",
      sparkSeed: seed % 1000,
      refund: false,
      kind: "market",
      tradeCoin: t.tradeCoin ?? t.symbol,
      mcNum: t.price,
      liqNum: oi,
      volNum: vol,
      txNum: tx.b + tx.s,
      series: opts.series,
      fresh: opts.now - t.fs < 6_000,
      accent: "blue",
      addressShort: "",
      holdersNum: 0,
      athMc: 0,
      mult: 1,
      iconQuill: false,
      iconLink: false,
      iconWeb: false,
      iconCoin: false,
      curve: 1,
      bonding: false,
      bondingPct: null,
    };
  }

  /* ---------------- launchpad (pump) row — legacy path ---------------- */
  const ex = tokenExtras(t.mint);
  const bondingNow = t.bonding != null && t.bonding < 0.999 && !t.complete;
  const curve = bondingNow ? (t.bonding ?? 0) : 1;
  const liq =
    t.liq > 50
      ? t.liq
      : t.complete
        ? Math.max(t.mc * 0.12, t.v24h * 0.015, t.v1h * 0.1, 0)
        : t.liq;
  const holdersNum = Math.max(1, Math.round(t.t24h.b * (1.25 + (seed % 97) / 97)));
  const athMc = Math.max(opts.athMc ?? 0, t.mc, t.ath ?? 0);
  const badge2 = (
    icon: string,
    value: number,
    redOver: number,
    decimals = 2,
  ): InfoBadgeData => ({
    icon,
    value: `${value.toFixed(decimals)}%`,
    tone: value > redOver ? "red" : value > 0.01 ? "red" : "green",
  });

  return {
    id: t.id,
    image: t.image,
    symbol: t.symbol,
    name: t.name,
    age: t.dex.toUpperCase(),
    viewers: ex.viewersBase + t.b5 * 2 + Math.min(99, t.replies),
    marketCap: fmtUsd(t.mc),
    changePct: fmtPct(ch),
    changeUp: ch >= 0,
    chNum: ch,
    liquidity: fmtUsd(liq),
    volume: fmtUsd(vol),
    txns: fmtNum(tx.b + tx.s),
    txnsBuy: fmtNum(tx.b),
    txnsSell: fmtNum(tx.s),
    ringOffset: bondingNow ? 168 * (1 - curve) : null,
    dexBadge: "amm",
    infoBadges: [
      badge2("ri-user-star-line", ex.top10, 0),
      badge2("icon-chef-hat", ex.dev, 0),
      badge2("ri-crosshair-2-line", ex.snipers, 0),
      badge2("ri-ghost-line", ex.insiders, 4),
      badge2("icon-boxes", ex.kol, 15),
    ],
    dexPaid: ex.paid ? "Paid" : "Unpaid",
    holders: fmtNum(holdersNum),
    proTraders: fmtNum(ex.athHolders),
    sparkSeed: seed % 1000,
    refund: seed % 3 !== 0,
    kind: "pump",
    tradeCoin: t.symbol,
    mcNum: t.mc,
    liqNum: liq,
    volNum: vol,
    txNum: tx.b + tx.s,
    series: opts.series,
    fresh: opts.now - t.fs < 6_000,
    accent: "gold",
    addressShort: shortMint(t.mint),
    holdersNum,
    athMc,
    mult: t.mc > 0 ? athMc / t.mc : 1,
    iconQuill: !!t.twitter,
    iconLink: !!t.website || !!t.telegram,
    iconWeb: !!t.website,
    iconCoin: ex.hasCoin,
    curve,
    bonding: bondingNow,
    bondingPct: t.bonding,
  };
}
