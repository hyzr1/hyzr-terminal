"use client";
/**
 * Live perp market-data store fed by the Hyperliquid WebSocket.
 * - universe = MAIN + ALL builder dexes (xyz stocks/gold/indices, flx, vntl,
 *   hyna, km, abcd, cash, para, mkts, io) via REST (refreshed every 30s)
 * - allMids stream (every coin, ~1s ticks → ticker/header/selector)
 *
 * fx19 multi-market workspace: the terminal is a set of independent panels
 * (chart / DOM / time&sales / order panel …) that can each point at ANY
 * market (TopstepX link-color model). All reactive market data is therefore
 * keyed BY COIN:
 *   books[coin]        — latest L2 book (l2Book stream, per watched coin)
 *   tapes[coin]        — recent public trades (trades stream, per watched coin)
 *   candles[coin][iv]  — OHLC per coin+interval (charts manage their own subs)
 * A ref-counted watchlist (useCoinWatch) lets panel contents declare which
 * coins they need; usePerpsStreams subscribes l2Book/trades/ctx per entry.
 */
import { create } from "zustand";
import { useEffect } from "react";
import {
  fetchMetaAndCtxs, fetchMetaAndCtxsDex, fetchPerpDexs, fetchCandles,
} from "./api";
import { hlWs, type HLStatus } from "./ws";
import type {
  AssetCtx, Book, Candle, Interval, PerpMarket, Trade,
} from "./types";

const MAX_TAPE = 80;
const BACKFILL_BARS = 500;

interface PerpsData {
  universe: PerpMarket[];
  byName: Record<string, PerpMarket>;
  /** builder dex names currently deployed (excluding main) */
  dexes: string[];
  mids: Record<string, number>;
  /** primary market — deep-link/ticker target; panels without an explicit
   *  market (and without a link color) follow this */
  coin: string;
  /** default interval for new charts */
  interval: Interval;
  /** per-coin live L2 books */
  books: Record<string, Book>;
  /** per-coin public trade tape (newest first) */
  tapes: Record<string, Trade[]>;
  /** per-coin per-interval OHLC */
  candles: Record<string, Partial<Record<Interval, Candle[]>>>;
  /** per coin|interval series version — bumps ONLY on backfill replacement
   *  (live bar merges must not force charts to reset their zoom) */
  candleVersions: Record<string, number>;
  /** bumped every time a candle SERIES is replaced (backfill) */
  candleVersion: number;
  status: HLStatus;
  loaded: boolean;
  // actions
  setStatus: (s: HLStatus) => void;
  setUniverse: (u: PerpMarket[], dexes: string[]) => void;
  patchCtx: (name: string, ctx: AssetCtx) => void;
  setMids: (m: Record<string, number>) => void;
  setCoin: (c: string) => void;
  setInterval: (i: Interval) => void;
  setBook: (coin: string, b: Book) => void;
  pushTrade: (coin: string, t: Trade) => void;
  setCandles: (coin: string, interval: Interval, c: Candle[]) => void;
  mergeCandle: (coin: string, interval: Interval, c: Candle) => void;
}

export const usePerpsData = create<PerpsData>((set, get) => ({
  universe: [],
  byName: {},
  dexes: [],
  mids: {},
  coin: "BTC",
  interval: "5m",
  books: {},
  tapes: {},
  candles: {},
  candleVersions: {},
  candleVersion: 0,
  status: "connecting",
  loaded: false,
  setStatus: (status) => set({ status }),
  setUniverse: (universe, dexes) => {
    const byName: Record<string, PerpMarket> = {};
    for (const m of universe) byName[m.meta.name] = m;
    set({ universe, byName, dexes, loaded: true });
  },
  patchCtx: (name, ctx) => {
    const m = get().byName[name];
    if (!m) return;
    const next = { ...m, ctx };
    set((s) => ({ byName: { ...s.byName, [name]: next } }));
  },
  setMids: (mids) => set((s) => ({ mids: { ...s.mids, ...mids } })),
  setCoin: (coin) => set({ coin }),
  setInterval: (interval) => set({ interval }),
  setBook: (coin, book) => set((s) => ({ books: { ...s.books, [coin]: book } })),
  pushTrade: (coin, t) => set((s) => {
    const tape = [t, ...(s.tapes[coin] ?? [])].slice(0, MAX_TAPE);
    return { tapes: { ...s.tapes, [coin]: tape } };
  }),
  setCandles: (coin, interval, candles) => set((s) => ({
    candles: { ...s.candles, [coin]: { ...(s.candles[coin] ?? {}), [interval]: candles } },
    candleVersions: { ...s.candleVersions, [`${coin}|${interval}`]: (s.candleVersions[`${coin}|${interval}`] ?? 0) + 1 },
    candleVersion: s.candleVersion + 1,
  })),
  mergeCandle: (coin, interval, c) => set((s) => {
    const arr = s.candles[coin]?.[interval];
    if (!arr || arr.length === 0) return {};
    const last = arr[arr.length - 1];
    if (c.time === last.time) {
      const next = arr.slice();
      next[next.length - 1] = c;
      return { candles: { ...s.candles, [coin]: { ...s.candles[coin], [interval]: next } } };
    }
    if (c.time > last.time) {
      const next = arr.slice(-799);
      next.push(c);
      return { candles: { ...s.candles, [coin]: { ...s.candles[coin], [interval]: next } } };
    }
    return {};
  }),
}));

/* ---------------- coin watchlist (ref-counted panel subs) ---------------- */

interface WatchState {
  /** coin -> refcount */
  refs: Record<string, number>;
  add: (c: string) => void;
  remove: (c: string) => void;
}
export const useWatchCoins = create<WatchState>((set) => ({
  refs: {},
  add: (c) => set((s) => ({ refs: { ...s.refs, [c]: (s.refs[c] ?? 0) + 1 } })),
  remove: (c) => set((s) => {
    const refs = { ...s.refs };
    const n = (refs[c] ?? 0) - 1;
    if (n <= 0) delete refs[c]; else refs[c] = n;
    return { refs };
  }),
}));

/** Panel contents call this so usePerpsStreams keeps their coin fed. */
export function useCoinWatch(coin: string | null | undefined) {
  useEffect(() => {
    if (!coin) return;
    const { add, remove } = useWatchCoins.getState();
    add(coin);
    return () => remove(coin);
  }, [coin]);
}

/* ---------------- initial load + backstop polling ---------------- */

let metaTimer: ReturnType<typeof setInterval> | null = null;
let metaSeq = 0;
let metaFailures = 0;

export async function loadMeta(testnet = false) {
  const seq = ++metaSeq;
  try {
    const [main, dexList] = await Promise.all([
      fetchMetaAndCtxs(testnet),
      fetchPerpDexs(testnet),
    ]);
    const dexes = (dexList ?? []).filter((d): d is { name: string } => !!d?.name).map((d) => d.name);
    const dexResults = await Promise.all(
      dexes.map((d) => fetchMetaAndCtxsDex(d, testnet).catch(() => null)),
    );
    if (seq !== metaSeq) return; // a newer load superseded us

    const universe: PerpMarket[] = [];
    const mainRefs: Array<{ name: string; maxLeverage: number; szDecimals: number; index: number }> = [];

    // main universe first (BTC/ETH/… + SPX), signing indices refer to it
    main[0].universe.forEach((m, i) => {
      if (m.isDelisted) return;
      universe.push({
        meta: { name: m.name, maxLeverage: m.maxLeverage, szDecimals: m.szDecimals, onlyIsolated: m.onlyIsolated, dex: null },
        ctx: main[1][i] ?? null,
        mid: null,
      });
      mainRefs.push({ name: m.name, maxLeverage: m.maxLeverage, szDecimals: m.szDecimals, index: i });
    });

    // builder dexes — stocks (xyz:TSLA), gold (xyz:GOLD), indices, pre-launch…
    dexes.forEach((dex, di) => {
      const r = dexResults[di];
      if (!r) return;
      r[0].universe.forEach((m, i) => {
        if (m.isDelisted) return;
        universe.push({
          meta: { name: m.name, maxLeverage: m.maxLeverage, szDecimals: m.szDecimals, onlyIsolated: m.onlyIsolated, dex },
          ctx: r[1][i] ?? null,
          mid: null,
        });
      });
    });

    usePerpsData.getState().setUniverse(universe, dexes);
    // feed the trading engine's zero-re-render refs (live-signing uses main indices;
    // builder-dex markets stay paper-tradeable)
    const { setUniverseRef, setFundingRef } = await import("./tradeStore");
    setUniverseRef(mainRefs);
    universe.forEach((m) => { if (m.ctx) setFundingRef(m.meta.name, +m.ctx.funding); });
    metaFailures = 0;
  } catch {
    // transient upstream (429 etc) — back off silently, the next tick retries;
    // console.error here would only feed the dev-overlay "Issues" badge.
    // The /api/hl/info proxy now absorbs upstream 429s (serialized retry +
    // stale-if-available), so a fast 8s×n retry is safe and shrinks the
    // cold-start "--" window from 30-60s to a few seconds.
    metaFailures++;
    if (metaTimer) {
      clearInterval(metaTimer);
      const delay = Math.min(60_000, 8_000 * metaFailures);
      metaTimer = setInterval(() => loadMeta(), delay);
    }
  }
}

export function ensureMetaLoop() {
  if (typeof window === "undefined") return;
  if (!metaTimer) {
    loadMeta();
    metaTimer = setInterval(() => loadMeta(), 30_000);
  }
}

/* ---------------- candle backfill (with retry) ---------------- */

export async function backfillCandles(coin: string, interval: Interval) {
  const ms = INTERVAL_TO_MS[interval] ?? 300_000;
  const start = Date.now() - BACKFILL_BARS * ms;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const candles = await fetchCandles(coin, interval, start);
      // keyed by coin — chart panels may backfill any market, not just the
      // primary one
      usePerpsData.getState().setCandles(coin, interval, candles);
      return;
    } catch (e) {
      if (attempt === 2) console.error("candle backfill failed", e);
      else await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
}

export const INTERVAL_TO_MS: Record<Interval, number> = {
  "1m": 60_000, "3m": 180_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
  "1h": 3_600_000, "2h": 7_200_000, "4h": 14_400_000, "8h": 28_800_000, "12h": 43_200_000,
  "1d": 86_400_000, "3d": 259_200_000, "1w": 604_800_000, "1M": 2_592_000_000,
};

// dev debugging handle
if (typeof window !== "undefined") {
  (window as unknown as { __perps?: unknown }).__perps = usePerpsData;
}
