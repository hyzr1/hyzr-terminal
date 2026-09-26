"use client";
/**
 * Trading engine for the Perpetuals terminal.
 *
 * Paper mode (default): orders execute against the LIVE Hyperliquid order book /
 * mark prices (real fills with real slippage walk), positions, unrealized PnL,
 * fees, funding accrual, TP/SL triggers and liquidations are simulated locally
 * and persisted to localStorage.
 *
 * Live mode: orders are signed per the Hyperliquid L1 action spec (RLP + EIP-712
 * "Exchange" domain) with a user-provided API/agent key and POSTed to /exchange.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Book } from "./types";
import { fmtSzQuote, fmtPxQuote } from "./format";
import { hlExchange } from "./api";

export type MarginMode = "cross" | "isolated";

export interface Position {
  coin: string;
  szi: number; // signed: + long / - short
  entryPx: number;
  leverage: number;
  isCross: boolean;
  isolatedMargin: number;
  tpPx: number | null;
  slPx: number | null;
  openedAt: number;
}

export interface OpenOrder {
  id: string;
  coin: string;
  isBuy: boolean;
  px: number;
  sz: number;
  origSz: number;
  kind: "Limit" | "Trigger";
  tif: "Gtc" | "Ioc";
  reduceOnly: boolean;
  isTp?: boolean;
  createdAt: number;
}

export interface Fill {
  id: string;
  coin: string;
  dir: "Open Long" | "Close Long" | "Open Short" | "Close Short";
  px: number;
  sz: number;
  time: number;
  fee: number;
  closedPnl: number;
  by: "user" | "tp" | "sl" | "liq" | "trigger" | "liquidation";
}

export const TAKER_FEE = 0.00045; // 0.045%
export const MAKER_FEE = 0.00015; // 0.015%
export const DEMO_DEPOSIT = 10_000;

/**
 * Zero-re-render mirror of the trade panel's notional input. The chart's
 * click-to-place-limit mode reads it so orders dropped on the chart use the
 * size the user already dialed in (falls back to $100 notional when empty).
 */
export const tradeDraft = { usd: 0 };

interface TradeState {
  mode: "paper" | "live";
  testnet: boolean;
  agentKey: string | null;
  agentAddress: string | null;
  balance: number;
  positions: Record<string, Position>;
  orders: OpenOrder[];
  fills: Fill[];
  leverage: Record<string, number>;
  marginMode: Record<string, MarginMode>;
  // actions
  setMode: (m: "paper" | "live") => void;
  setAgent: (key: string | null) => void;
  setTestnet: (t: boolean) => void;
  deposit: (usd: number) => void;
  setLeverage: (coin: string, lev: number, isCross: boolean) => void;
  placeOrder: (o: PlaceOrderInput) => Promise<PlaceResult>;
  cancelOrder: (id: string) => void;
  cancelAll: (coin?: string) => void;
  closePosition: (coin: string, pct?: number) => Promise<PlaceResult>;
  editTpSl: (coin: string, tp: number | null, sl: number | null) => void;
  resetAccount: () => void;
}

export interface PlaceOrderInput {
  coin: string;
  isBuy: boolean;
  sz: number;
  type: "market" | "limit";
  px?: number; // for limit
  tif?: "Gtc" | "Ioc";
  reduceOnly?: boolean;
  tp?: number | null;
  sl?: number | null;
}

export type PlaceResult = { ok: boolean; error?: string };

export function toast(msg: string, kind: "success" | "error" | "info" = "info") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("hyzr-toast", { detail: { msg, kind } }));
  }
}

/* ------------------------------------------------------------------ */
/* per-wallet account routing (fx24)                                   */
/*                                                                     */
/* Every paired wallet owns its own trading account: balance,          */
/* positions, orders, fills, leverage and margin mode are persisted    */
/* under `hyzr-perps-account:<address>`; with no wallet connected the   */
/* terminal runs the shared demo account under the legacy key          */
/* `hyzr-perps-account` so existing users keep their state.             */
/* ------------------------------------------------------------------ */

const PERSIST_NAME = "hyzr-perps-account";
let accountKey: string = "demo";
let suppressWrite = false;

function storageKeyFor(key: string): string {
  // demo account keeps the legacy key for back-compat with existing users
  return key === "demo" ? PERSIST_NAME : `${PERSIST_NAME}:${key}`;
}

const routedStorage = {
  getItem: (name: string): string | null => localStorage.getItem(storageKeyFor(accountKey)),
  setItem: (name: string, value: string): void => {
    if (!suppressWrite) localStorage.setItem(storageKeyFor(accountKey), value);
  },
  removeItem: (name: string): void => {
    localStorage.removeItem(storageKeyFor(accountKey));
  },
};

/** Fields each wallet account owns (persisted + switched). */
function accountSlice(s: {
  balance: number;
  positions: Record<string, Position>;
  orders: OpenOrder[];
  fills: Fill[];
  leverage: Record<string, number>;
  marginMode: Record<string, MarginMode>;
  mode: "paper" | "live";
  testnet: boolean;
}) {
  return {
    balance: s.balance,
    positions: s.positions,
    orders: s.orders,
    fills: s.fills,
    leverage: s.leverage,
    marginMode: s.marginMode,
    mode: s.mode,
    testnet: s.testnet,
  };
}

/**
 * Swaps the terminal over to another wallet's trading account:
 * flushes the current account to its key, resets memory, then rehydrates
 * from the target key. Safe to call repeatedly with the same target.
 */
export function switchTradeAccount(next: string | null): void {
  const key = next ?? "demo";
  if (key === accountKey || typeof window === "undefined") return;

  // 1) explicit flush of the outgoing account, in zustand-persist's envelope
  //    format (same shape createJSONStorage writes) so rehydrate can read it
  const outgoing = accountSlice(useTradeStore.getState());
  try {
    localStorage.setItem(
      storageKeyFor(accountKey),
      JSON.stringify({ state: outgoing, version: 2 }),
    );
  } catch {
    /* private mode — rehydrate below still works off defaults */
  }

  // 2) flip routing, reset memory WITHOUT persisting the defaults over the
  //    target account's stored state
  accountKey = key;
  suppressWrite = true;
  useTradeStore.setState({
    balance: DEMO_DEPOSIT,
    positions: {},
    orders: [],
    fills: [],
    leverage: {},
    marginMode: {},
    mode: "paper",
  });
  suppressWrite = false;

  // 3) load the incoming account (merge over the clean defaults)
  void useTradeStore.persist.rehydrate();
}

export const useTradeStore = create<TradeState>()(
  persist(
    (set, get) => ({
      mode: "paper",
      testnet: false,
      agentKey: null,
      agentAddress: null,
      balance: DEMO_DEPOSIT,
      positions: {},
      orders: [],
      fills: [],
      leverage: {},
      marginMode: {},

      setMode: (mode) => set({ mode }),
      setAgent: (agentKey) => set({ agentKey }),
      setTestnet: (testnet) => set({ testnet }),
      deposit: (usd) => set((s) => ({ balance: s.balance + usd })),
      setLeverage: (coin, lev, isCross) =>
        set((s) => ({ leverage: { ...s.leverage, [coin]: lev }, marginMode: { ...s.marginMode, [coin]: isCross ? "cross" : "isolated" } })),
      resetAccount: () =>
        set({ balance: DEMO_DEPOSIT, positions: {}, orders: [], fills: [] }),

      editTpSl: (coin, tp, sl) =>
        set((s) => {
          const p = s.positions[coin];
          if (!p) return {};
          return { positions: { ...s.positions, [coin]: { ...p, tpPx: tp, slPx: sl } } };
        }),

      cancelOrder: (id) =>
        set((s) => ({ orders: s.orders.filter((o) => o.id !== id) })),

      cancelAll: (coin) =>
        set((s) => ({ orders: s.orders.filter((o) => coin ? o.coin !== coin : false) })),

      closePosition: async (coin, pct = 1) => {
        const p = get().positions[coin];
        if (!p) return { ok: false, error: "No position" };
        const sz = Math.abs(p.szi) * pct;
        return get().placeOrder({ coin, isBuy: p.szi < 0, sz, type: "market", reduceOnly: true });
      },

      placeOrder: async (o) => {
        const st = get();
        const meta = coinMeta(o.coin);
        if (!meta) return { ok: false, error: "Unknown market" };
        if (!(o.sz > 0)) return { ok: false, error: "Size must be > 0" };
        const lev = st.leverage[o.coin] ?? 5;
        const isCross = (st.marginMode[o.coin] ?? "cross") === "cross";

        // ---------- LIVE MODE ----------
        if (st.mode === "live") {
          if (!st.agentKey) return { ok: false, error: "Connect an API wallet in Settings" };
          try {
            const { sendLiveOrder } = await import("./signing");
            const mid = liveMid(o.coin) ?? 0;
            const res = await sendLiveOrder({
              agentKey: st.agentKey,
              testnet: st.testnet,
              coin: o.coin,
              assetIndex: assetIndex(o.coin),
              isBuy: o.isBuy,
              sz: o.sz,
              px: o.type === "limit" ? o.px! : marketPx(mid, o.isBuy),
              tif: o.type === "limit" ? (o.tif ?? "Gtc") : "Ioc",
              reduceOnly: o.reduceOnly ?? false,
              meta,
            });
            if (!res.ok) return { ok: false, error: res.error };
            toast(`Live order sent: ${o.isBuy ? "Buy" : "Sell"} ${fmtSzQuote(o.sz, meta)} ${o.coin}`, "success");
            return { ok: true };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            toast(`Live order failed: ${msg}`, "error");
            return { ok: false, error: msg };
          }
        }

        // ---------- PAPER MODE ----------
        const book = liveBook(o.coin);
        const mid = liveMid(o.coin) ?? o.px ?? 0;
        let fillPx: number;
        if (o.type === "limit" && o.px != null) {
          const bestAsk = book?.asks[0]?.px ?? mid;
          const bestBid = book?.bids[0]?.px ?? mid;
          const crosses = o.isBuy ? o.px >= bestAsk : o.px <= bestBid;
          if (crosses && o.tif !== "Gtc") {
            fillPx = walkBook(book, o.isBuy, o.sz, o.px) ?? o.px;
          } else if (crosses) {
            fillPx = walkBook(book, o.isBuy, o.sz, o.px) ?? o.px;
          } else {
            // rest order
            const order: OpenOrder = {
              id: `pp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              coin: o.coin,
              isBuy: o.isBuy,
              px: o.px,
              sz: o.sz,
              origSz: o.sz,
              kind: "Limit",
              tif: o.tif ?? "Gtc",
              reduceOnly: o.reduceOnly ?? false,
              createdAt: Date.now(),
            };
            set((s) => ({ orders: [order, ...s.orders] }));
            toast(`Limit order placed: ${o.isBuy ? "Buy" : "Sell"} ${fmtSzQuote(o.sz, meta)} ${o.coin} @ ${fmtPxQuote(o.px, meta)}`, "info");
            return { ok: true };
          }
        } else {
          fillPx = walkBook(book, o.isBuy, o.sz, o.isBuy ? Infinity : 0) ?? (mid * (o.isBuy ? 1.0005 : 0.9995));
        }

        executeFill(o, fillPx, meta, lev, isCross);
        return { ok: true };
      },
    }),
    {
      name: PERSIST_NAME,
      version: 2, // MUST match the envelope written by switchTradeAccount's flush
      storage: createJSONStorage(() => routedStorage),
      // legacy envelopes (version 0/1 — the pre-fx24 demo account) keep the same shape
      migrate: (persisted) => persisted as TradeState,
      // rehydrated manually after mount (Providers) so the SSR HTML and the
      // client's first render match — prevents React hydration mismatches
      skipHydration: true,
      partialize: (s) => accountSlice(s),
    },
  ),
);

/* ------------------------------------------------------------------ */
/* shared live-data refs (kept outside zustand for zero re-render)     */

const books: Record<string, Book> = {};
const midsRef: Record<string, number> = {};
const universeRef: Array<{ name: string; maxLeverage: number; szDecimals: number; index: number }> = [];

export function liveBook(coin: string): Book | null {
  return books[coin] ?? null;
}
export function liveMid(coin: string): number | null {
  return midsRef[coin] ?? null;
}
export function coinMeta(coin: string) {
  return universeRef.find((m) => m.name === coin);
}
export function assetIndex(coin: string): number {
  return universeRef.find((m) => m.name === coin)?.index ?? -1;
}
export function setUniverseRef(u: Array<{ name: string; maxLeverage: number; szDecimals: number; index: number }>) {
  universeRef.length = 0;
  universeRef.push(...u);
}

export function marketPx(mid: number, isBuy: boolean): number {
  return mid * (isBuy ? 1.10 : 0.90);
}

function walkBook(book: Book | null, isBuy: boolean, sz: number, limitPx: number): number | null {
  if (!book) return null;
  const levels = isBuy ? book.asks : book.bids;
  let rem = sz;
  let notional = 0;
  let filled = 0;
  for (const l of levels) {
    if (rem <= 0) break;
    if (isBuy && l.px > limitPx) break;
    if (!isBuy && l.px < limitPx && limitPx > 0) break;
    const take = Math.min(rem, l.sz);
    notional += take * l.px;
    filled += take;
    rem -= take;
  }
  if (filled <= 0) return null;
  if (rem > 0) {
    // sweep beyond visible book at worst visible price + small slippage
    const last = levels[levels.length - 1]?.px ?? (isBuy ? book.bids[0]?.px : book.asks[0]?.px) ?? 0;
    notional += rem * last * (isBuy ? 1.001 : 0.999);
    filled += rem;
  }
  return notional / filled;
}

/* ------------------------- engine tick --------------------------- */

let lastTick = Date.now();
let lastFundingHour = Math.floor(Date.now() / 3_600_000);

export function engineTick(mids: Record<string, number>, book?: Book) {
  if (book) books[book.coin] = book;
  for (const [k, v] of Object.entries(mids)) midsRef[k] = v;

  const st = useTradeStore.getState();
  if (st.mode !== "paper") return;

  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;

  const positions = { ...st.positions };
  let balanceDelta = 0;
  let orders = st.orders;
  let dirty = false;

  // 1) limit order fills (crossing the live book)
  const remaining: OpenOrder[] = [];
  for (const o of st.orders) {
    const mid = midsRef[o.coin];
    const b = o.coin === book?.coin ? book : books[o.coin];
    const bestAsk = b?.asks[0]?.px ?? mid;
    const bestBid = b?.bids[0]?.px ?? mid;
    const px = o.px;
    const shouldFill =
      px != null && mid != null &&
      (o.kind === "Trigger"
        ? (o.isBuy ? bestAsk >= px : bestBid <= px) // sell triggers when price falls to px, buy when it rises to px
        : o.isBuy ? bestAsk <= px : bestBid >= px);
    if (shouldFill) {
      const meta = coinMeta(o.coin);
      const pos = positions[o.coin];
      const lev = st.leverage[o.coin] ?? 5;
      const isCross = (st.marginMode[o.coin] ?? "cross") === "cross";
      if (meta) {
        const fillPx = o.kind === "Trigger" ? px : px;
        executeFill(
          { coin: o.coin, isBuy: o.isBuy, sz: o.sz, type: "market", reduceOnly: o.reduceOnly, tp: null, sl: null },
          fillPx,
          meta,
          lev,
          isCross,
          o.kind === "Trigger" ? (o.isTp ? "tp" : "sl") : "trigger",
        );
        dirty = true;
        continue;
      }
    }
    remaining.push(o);
  }
  if (remaining.length !== st.orders.length) orders = remaining;

  // 2) position TP/SL + liquidation
  for (const p of Object.values(positions)) {
    const mark = midsRef[p.coin];
    if (!mark) continue;
    const meta = coinMeta(p.coin);
    const mmr = meta ? 1 / (2 * p.leverage) < 0.02 ? 0.02 : 1 / (2 * p.leverage) : 0.02;
    const pnl = (mark - p.entryPx) * p.szi;

    // TP/SL triggers
    const hitTp = p.tpPx != null && (p.szi > 0 ? mark >= p.tpPx : mark <= p.tpPx);
    const hitSl = p.slPx != null && (p.szi > 0 ? mark <= p.slPx : mark >= p.slPx);
    if (hitTp || hitSl) {
      closePositionInternal({ ...p }, mark, hitTp ? "tp" : "sl");
      delete positions[p.coin];
      dirty = true;
      continue;
    }

    // liquidation (isolated: per-position margin; cross: account-level)
    if (p.isCross) {
      const accountValue = accountValueCalc(st.balance + balanceDelta, positions, midsRef);
      const totalMaint = Object.values(positions)
        .filter((x) => !positions[x.coin] || true)
        .reduce((acc, x) => {
          const mk = midsRef[x.coin] ?? x.entryPx;
          return acc + Math.abs(x.szi) * mk * mmrFor(x);
        }, 0);
      if (accountValue <= totalMaint && Object.keys(positions).length > 0) {
        for (const x of Object.values(positions)) {
          const mk = midsRef[x.coin] ?? x.entryPx;
          closePositionInternal({ ...x }, mk, "liq");
          delete positions[x.coin];
        }
        dirty = true;
        toast("Cross margin account liquidated", "error");
        break;
      }
    } else {
      const isoMargin = p.isolatedMargin;
      const maint = Math.abs(p.szi) * mark * mmr;
      if (isoMargin + pnl <= maint) {
        closePositionInternal({ ...p }, mark, "liq");
        delete positions[p.coin];
        dirty = true;
        toast(`${p.coin} isolated position liquidated`, "error");
        continue;
      }
    }
  }

  // 3) funding accrual (on the hour, HL-style)
  const hour = Math.floor(now / 3_600_000);
  if (hour !== lastFundingHour) {
    lastFundingHour = hour;
    for (const p of Object.values(positions)) {
      const mark = midsRef[p.coin];
      const ctx = fundingRef[p.coin];
      if (mark && ctx != null && p.szi !== 0) {
        // longs pay positive funding
        const pay = mark * Math.abs(p.szi) * ctx * (p.szi > 0 ? 1 : -1);
        balanceDelta -= pay;
        dirty = true;
      }
    }
  }
  void dt;

  if (dirty) {
    // NOTE: positions/balance are updated incrementally by executeFill/
    // closePositionInternal; here we only add engineTick's own delta (funding)
    // and patch orders, so mid-tick fills can never be clobbered or resurrected.
    const cur = useTradeStore.getState();
    useTradeStore.setState({ balance: cur.balance + balanceDelta, orders });
  }
}

export const fundingRef: Record<string, number> = {};
export function setFundingRef(coin: string, funding: number) {
  fundingRef[coin] = funding;
}

function mmrFor(p: Position): number {
  const r = 1 / (2 * p.leverage);
  return r < 0.02 ? 0.02 : r;
}

export function accountValueCalc(
  balance: number,
  positions: Record<string, Position>,
  mids: Record<string, number>,
): number {
  let upnl = 0;
  for (const p of Object.values(positions)) {
    const mark = mids[p.coin] ?? p.entryPx;
    upnl += (mark - p.entryPx) * p.szi;
  }
  return balance + upnl;
}

/* ------------------------- fill execution ------------------------ */

function closePositionInternal(p: Position, fillPx: number, by: Fill["by"]) {
  const st = useTradeStore.getState();
  const closedPnl = (fillPx - p.entryPx) * p.szi;
  const sz = Math.abs(p.szi);
  const fee = sz * fillPx * TAKER_FEE;
  const dir: Fill["dir"] = p.szi > 0 ? "Close Long" : "Close Short";
  const marginReleased = p.isCross ? 0 : p.isolatedMargin;
  const fill: Fill = {
    id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    coin: p.coin,
    dir,
    px: fillPx,
    sz,
    time: Date.now(),
    fee,
    closedPnl,
    by,
  };
  useTradeStore.setState((s) => {
    const { [p.coin]: _removed, ...rest } = s.positions;
    void _removed;
    return {
      positions: rest as Record<string, Position>,
      balance: s.balance + marginReleased,
      fills: [fill, ...s.fills].slice(0, 200),
    };
  });
  if (by === "tp") toast(`Take profit filled: ${p.coin} ${closedPnl >= 0 ? "+" : ""}${closedPnl.toFixed(2)} USDC`, closedPnl >= 0 ? "success" : "info");
  else if (by === "sl") toast(`Stop loss filled: ${p.coin} ${closedPnl >= 0 ? "+" : ""}${closedPnl.toFixed(2)} USDC`, closedPnl < 0 ? "error" : "info");
  void st;
}

function executeFill(
  o: PlaceOrderInput,
  fillPx: number,
  meta: { name: string; maxLeverage: number; szDecimals: number },
  lev: number,
  isCross: boolean,
  by: Fill["by"] = "user",
) {
  const st = useTradeStore.getState();
  void st;
  const notional = o.sz * fillPx;
  const fee = notional * TAKER_FEE;
  let positions = { ...st.positions };
  let balance = st.balance - fee;
  const existing = positions[o.coin];
  const signed = o.isBuy ? o.sz : -o.sz;

  let closedPnl = 0;
  const isReduce = o.reduceOnly || (existing && Math.sign(existing.szi) !== Math.sign(signed));

  if (existing && existing.szi !== 0) {
    const sameDir = Math.sign(existing.szi) === Math.sign(signed);
    if (sameDir && !o.reduceOnly) {
      // increase → new avg entry
      const totalSz = existing.szi + signed;
      const entry = (existing.entryPx * Math.abs(existing.szi) + fillPx * Math.abs(signed)) / Math.abs(totalSz);
      const isoMargin = existing.isolatedMargin + (notional / lev);
      positions[o.coin] = { ...existing, szi: totalSz, entryPx: entry, isolatedMargin: isoMargin };
    } else {
      // reduce / close / flip
      const closeSz = Math.min(Math.abs(existing.szi), Math.abs(signed));
      closedPnl = (fillPx - existing.entryPx) * Math.sign(existing.szi) * closeSz;
      const remSz = existing.szi + signed;
      const marginUsed = (closeSz / Math.abs(existing.szi)) * existing.isolatedMargin;
      if (Math.abs(remSz) < 1e-12) {
        const { [o.coin]: _rm, ...rest } = positions;
        void _rm;
        positions = rest as Record<string, Position>;
        balance += existing.isolatedMargin - marginUsed; // release iso margin (cross: 0)
      } else {
        positions[o.coin] = {
          ...existing,
          szi: remSz,
          isolatedMargin: existing.isolatedMargin - marginUsed,
          tpPx: existing.tpPx,
          slPx: existing.slPx,
        };
      }
    }
  } else if (!o.reduceOnly) {
    // open new
    const isoMargin = isCross ? 0 : notional / lev;
    positions[o.coin] = {
      coin: o.coin,
      szi: signed,
      entryPx: fillPx,
      leverage: lev,
      isCross,
      isolatedMargin: isoMargin,
      tpPx: o.tp ?? null,
      slPx: o.sl ?? null,
      openedAt: Date.now(),
    };
  }

  const dir: Fill["dir"] =
    (isReduce && existing ? (existing.szi > 0 ? "Close Long" : "Close Short")
      : o.isBuy ? "Open Long" : "Open Short");

  const fill: Fill = {
    id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    coin: o.coin,
    dir,
    px: fillPx,
    sz: o.sz,
    time: Date.now(),
    fee,
    closedPnl,
    by,
  };

  useTradeStore.setState({ positions, balance, fills: [fill, ...st.fills].slice(0, 200) });

  const label =
    by === "liq" ? "LIQUIDATION" :
    dir === "Open Long" ? "Buy filled" : dir === "Close Long" ? "Sell (close) filled" :
    dir === "Open Short" ? "Sell filled" : "Buy (close) filled";
  toast(`${label}: ${fmtSzQuote(o.sz, meta)} ${o.coin} @ ${fmtPxQuote(fillPx, meta)}${closedPnl !== 0 ? ` · PnL ${closedPnl >= 0 ? "+" : ""}${closedPnl.toFixed(2)}` : ""}`, closedPnl >= 0 ? "success" : "info");
}

/* ------------------------- selectors ----------------------------- */

export function unrealizedPnl(p: Position, mark: number): number {
  return (mark - p.entryPx) * p.szi;
}

export function estLiqPrice(p: Position | undefined, avail: number): number | null {
  if (!p || p.szi === 0) return null;
  const mmr = mmrFor(p);
  let liq: number;
  if (p.isCross) {
    const buffer = avail / Math.abs(p.szi);
    liq = p.szi > 0 ? p.entryPx - buffer : p.entryPx + buffer;
  } else {
    liq = p.szi > 0
      ? p.entryPx * (1 - 1 / p.leverage + mmr)
      : p.entryPx * (1 + 1 / p.leverage - mmr);
  }
  // beyond-zero liq means position can't be liquidated with current margin
  if (liq <= 0) return null;
  return liq;
}
