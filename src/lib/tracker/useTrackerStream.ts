"use client";
/**
 * Live tracker stream hook — wires the SSE money-flow feed into the app:
 *  - feed store (non-persisted) shared by Whale Flow / Trades / sidebar
 *  - tracked-wallet sync (POST /api/tracker/watch) + enrichment poll
 *  - alert-rule evaluation -> toast + in-app alert log + desktop notification
 *  - copy-trade engine -> mirrors tracked wallets' trades into the paper
 *    trading engine (real sizing, real fills, real PnL)
 */
import { useEffect } from "react";
import { create } from "zustand";
import type { WhaleEvent } from "./tracker-types";
import { useTrackerStore } from "./trackerStore";
import { useTradeStore, toast, accountValueCalc } from "@/lib/hyperliquid/tradeStore";
import { ensureMetaLoop, usePerpsData } from "@/lib/hyperliquid/perpsStore";

/* ------------------------------------------------------------------ */
/* live feed store                                                     */
/* ------------------------------------------------------------------ */

export interface TrackedRow {
  address: string;
  name: string | null;
  av: number;
  lastActive: number;
  pnl24h: number;
  fills24h: number;
  positions: number;
  dayPnl: number | null;
}

interface FeedState {
  events: WhaleEvent[];
  connected: boolean;
  tracked: TrackedRow[];
  bump: number; // increments per applied batch (drives UI ticks)
  push: (evs: WhaleEvent[]) => void;
  setConnected: (c: boolean) => void;
  setTracked: (t: TrackedRow[]) => void;
}

export const useFeedStore = create<FeedState>((set) => ({
  events: [],
  connected: false,
  tracked: [],
  bump: 0,
  push: (evs) =>
    set((s) => {
      if (!evs.length) return { bump: s.bump + 1 };
      const merged = [...evs, ...s.events];
      // dedupe by tid
      const seen = new Set<string>();
      const out: WhaleEvent[] = [];
      for (const ev of merged) {
        const key = `${ev.w}:${ev.tid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(ev);
        if (out.length >= 800) break;
      }
      return { events: out, bump: s.bump + 1 };
    }),
  setConnected: (connected) => set({ connected }),
  setTracked: (tracked) => set({ tracked }),
}));

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
    setTimeout(() => void ctx.close(), 500);
  } catch {
    /* ignore */
  }
}

function notify(title: string, body: string) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch {
    /* ignore */
  }
}

function fmtUsdInline(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/* ------------------------------------------------------------------ */
/* the hook                                                            */
/* ------------------------------------------------------------------ */

let streamMounted = false;

export function useTrackerStream() {
  const watchAck = useTrackerStore((s) => s.watchAck);
  const wallets = useTrackerStore((s) => s.wallets);

  useEffect(() => {
    if (streamMounted) return;
    streamMounted = true;
    ensureMetaLoop(); // market meta so the copy engine can price/fill anything

    const es = new EventSource("/api/tracker/stream");
    es.onopen = () => useFeedStore.getState().setConnected(true);
    es.onerror = () => useFeedStore.getState().setConnected(false);
    es.onmessage = (m) => {
      try {
        const msg = JSON.parse(m.data) as { type: string; events?: WhaleEvent[] };
        if ((msg.type === "snapshot" || msg.type === "events") && msg.events) {
          useFeedStore.getState().setConnected(true);
          for (const ev of msg.events) handleEvent(ev);
          useFeedStore.getState().push(msg.events);
        }
      } catch {
        /* ignore bad frame */
      }
    };

    // tracked-wallet enrichment poll
    const pollTracked = () => {
      if (!useTrackerStore.getState().wallets.length) {
        useFeedStore.getState().setTracked([]);
        return;
      }
      fetch("/api/tracker/watch")
        .then((r) => r.json())
        .then((j: { wallets?: TrackedRow[] }) => {
          if (j.wallets) useFeedStore.getState().setTracked(j.wallets);
        })
        .catch(() => {});
    };
    const trackedTimer = setInterval(pollTracked, 20_000);

    return () => {
      es.close();
      clearInterval(trackedTimer);
      streamMounted = false;
    };
  }, []);

  // push the tracked list to the server whenever it changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const addresses = wallets.map((w) => w.address);
    fetch("/api/tracker/watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallets: addresses }),
    }).catch(() => {});
  }, [watchAck, wallets]);

  // keep a ticking ref of live account equity for proportional sizing
  useEffect(() => {
    const refresh = () => {
      const st = useTradeStore.getState();
      const mids = usePerpsData.getState().mids;
      equityCache = accountValueCalc(st.balance, st.positions, mids);
    };
    refresh();
    const t = setInterval(refresh, 2_500);
    return () => clearInterval(t);
  }, []);
}

let equityCache = 10_000;

/* ------------------------------------------------------------------ */
/* alert evaluation                                                    */
/* ------------------------------------------------------------------ */

function openAction(dir: string): "open" | "close" | "flip" | "other" {
  if (dir.startsWith("Open")) return "open";
  if (dir.startsWith("Close")) return "close";
  if (dir.includes(">")) return "flip";
  return "other";
}

function actionMatch(filter: "open" | "close" | "both" | undefined, dir: string) {
  if (!filter || filter === "both") return true;
  const a = openAction(dir);
  if (filter === "open") return a === "open" || a === "flip";
  return a === "close" || a === "flip";
}

const posState = new Map<string, boolean>(); // `${coin}` -> smart-money long share last alerted

function handleEvent(ev: WhaleEvent) {
  handleEventCopy(ev);
  evaluateAlerts(ev);
}

function evaluateAlerts(ev: WhaleEvent) {
  const store = useTrackerStore.getState();
  const rules = store.rules.filter((r) => r.enabled);
  if (!rules.length) return;
  const trackedSet = new Set(store.wallets.map((w) => w.address));

  for (const r of rules) {
    let fire: { text: string; sub: string; tone: "long" | "short" | "neutral" } | null = null;

    if (r.kind === "whale_trade") {
      if (ev.usd < (r.minUsd ?? 0)) continue;
      if (r.coins?.length && !r.coins.includes(ev.coin)) continue;
      if (r.side === "buy" && ev.side !== "B") continue;
      if (r.side === "sell" && ev.side !== "A") continue;
      if (!actionMatch(r.action, ev.dir)) continue;
      const verb = ev.side === "B" ? "bought" : "sold";
      const act = openAction(ev.dir);
      const actLabel = act === "close" ? "closed" : act === "flip" ? "flipped to" : "opened";
      fire = {
        text: `Whale ${ev.side === "B" ? "bought" : "sold"} ${fmtUsdInline(ev.usd)} ${ev.coin}`,
        sub: `${ev.w.slice(0, 6)}…${ev.w.slice(-4)} · ${ev.dir} @ ${ev.px.toLocaleString()} · ${new Date(ev.t).toLocaleTimeString()}`,
        tone: ev.side === "B" ? "long" : "short",
      };
      void verb;
      void actLabel;
    } else if (r.kind === "wallet_trade") {
      const match = r.wallet === "tracked" ? ev.k === "tracked" : ev.w === r.wallet?.toLowerCase();
      if (!match) continue;
      if (ev.usd < (r.minUsd ?? 0)) continue;
      if (!actionMatch(r.action, ev.dir)) continue;
      fire = {
        text: `Tracked wallet ${ev.side === "B" ? "bought" : "sold"} ${fmtUsdInline(ev.usd)} ${ev.coin}`,
        sub: `${ev.w.slice(0, 6)}…${ev.w.slice(-4)} · ${ev.dir} @ ${ev.px.toLocaleString()}`,
        tone: ev.side === "B" ? "long" : "short",
      };
    } else if (r.kind === "wallet_close") {
      const match = r.wallet === "tracked" ? ev.k === "tracked" : ev.w === r.wallet?.toLowerCase();
      if (!match || ev.pnl === null) continue;
      if (Math.abs(ev.pnl) < (r.minPnl ?? 0)) continue;
      const win = ev.pnl >= 0;
      fire = {
        text: `${win ? "Big WIN" : "Big LOSS"}: ${fmtUsdInline(ev.pnl)} on ${ev.coin} close`,
        sub: `${ev.w.slice(0, 6)}…${ev.w.slice(-4)} · ${ev.dir} @ ${ev.px.toLocaleString()}`,
        tone: win ? "long" : "short",
      };
    }

    if (fire) {
      store.pushAlert({
        t: Date.now(),
        ruleId: r.id,
        ruleName: r.name,
        text: fire.text,
        sub: fire.sub,
        tone: fire.tone,
      });
      toast(fire.text, fire.tone === "long" ? "success" : fire.tone === "short" ? "error" : "info");
      notify(`Hyzr Tracker — ${r.name}`, fire.text);
      if (useTrackerStore.getState().feed.sound) beep();
      // only the first matching rule fires per event
      break;
    }
  }
  void trackedSet;
  void posState;
}

export function checkPositioningAlert(coin: string, longSharePct: number) {
  const store = useTrackerStore.getState();
  for (const r of store.rules) {
    if (!r.enabled || r.kind !== "coin_positioning") continue;
    if (r.positioningCoin && r.positioningCoin !== coin) continue;
    const threshold = r.positioningPct ?? 80;
    const above = r.positioningAbove ?? true;
    const hit = above ? longSharePct >= threshold : longSharePct <= threshold;
    const key = `${r.id}:${coin}`;
    const was = posState.get(key) ?? false;
    posState.set(key, hit);
    if (hit && !was) {
      store.pushAlert({
        t: Date.now(),
        ruleId: r.id,
        ruleName: r.name,
        text: `${coin} smart money is ${longSharePct.toFixed(0)}% long`,
        sub: `Crossed ${above ? "≥" : "≤"} ${threshold}% positioning threshold`,
        tone: "long",
      });
      toast(`${coin} positioning: ${longSharePct.toFixed(0)}% long`, "info");
      notify("Hyzr Tracker — positioning", `${coin} smart money ${longSharePct.toFixed(0)}% long`);
      if (store.feed.sound) beep();
    }
  }
}

/* ------------------------------------------------------------------ */
/* copy-trade engine                                                   */
/* ------------------------------------------------------------------ */

const copySeen = new Set<number>(); // tids already mirrored
const copyOpenCoins = new Map<string, Set<string>>(); // wallet -> coins opened by copy

function szDecimalsOf(coin: string): number {
  const m = usePerpsData.getState().byName[coin];
  return m?.meta.szDecimals ?? 3;
}

async function mirrorOpen(ev: WhaleEvent) {
  const store = useTrackerStore.getState();
  const cfg = store.copies.find((c) => c.wallet === ev.w && c.enabled);
  if (!cfg) return;
  if (cfg.longOnly && ev.side !== "B") return;

  const usd = cfg.sizing === "fixed" ? cfg.fixedUsd : Math.max((equityCache * cfg.propPct) / 100, 10);
  const px = ev.px > 0 ? ev.px : 1;
  let sz = usd / px;
  const dec = szDecimalsOf(ev.coin);
  sz = parseFloat(sz.toFixed(dec));
  if (!(sz > 0) || sz * px < 10) {
    store.recordCopy({
      wallet: ev.w,
      coin: ev.coin,
      isBuy: ev.side === "B",
      px,
      sz,
      usd: sz * px,
      t: Date.now(),
      status: "failed",
      detail: "Below $10 min notional",
    });
    return;
  }

  const trade = useTradeStore.getState();
  trade.setLeverage(ev.coin, Math.min(cfg.maxLev, 20), true);
  const res = await useTradeStore.getState().placeOrder({
    coin: ev.coin,
    isBuy: ev.side === "B",
    sz,
    type: "market",
  });
  store.recordCopy({
    wallet: ev.w,
    coin: ev.coin,
    isBuy: ev.side === "B",
    px,
    sz,
    usd: sz * px,
    t: Date.now(),
    status: res.ok ? "filled" : "failed",
    detail: res.ok ? `Copied ${ev.dir} from ${ev.w.slice(0, 6)}…${ev.w.slice(-4)}` : res.error,
  });
  if (res.ok) {
    toast(`Copied ${ev.side === "B" ? "LONG" : "SHORT"} ${ev.coin} · $${(sz * px).toFixed(0)}`, "success");
    let set = copyOpenCoins.get(ev.w);
    if (!set) {
      set = new Set();
      copyOpenCoins.set(ev.w, set);
    }
    set.add(ev.coin);
  }
}

async function mirrorClose(ev: WhaleEvent) {
  const store = useTrackerStore.getState();
  const cfg = store.copies.find((c) => c.wallet === ev.w && c.enabled);
  if (!cfg) return;
  const set = copyOpenCoins.get(ev.w);
  if (!set || !set.has(ev.coin)) return; // we don't hold a mirrored position
  const before = useTradeStore.getState().fills.length;
  const res = await useTradeStore.getState().closePosition(ev.coin, 1);
  set.delete(ev.coin);
  let closePnl: number | undefined;
  if (res.ok) {
    const fills = useTradeStore.getState().fills;
    // newest fill for this coin added by the close
    for (let i = fills.length - 1; i >= Math.max(0, before - 3); i--) {
      const f = fills[i];
      if (f.coin === ev.coin && f.closedPnl !== 0) {
        closePnl = f.closedPnl;
        break;
      }
    }
  }
  store.recordCopy({
    wallet: ev.w,
    coin: ev.coin,
    isBuy: ev.side === "B",
    px: ev.px,
    sz: 0,
    usd: 0,
    t: Date.now(),
    status: res.ok ? "closed" : "failed",
    detail: res.ok ? `Closed copy — whale ${ev.dir}` : res.error,
    closePnl,
  });
  if (res.ok) {
    toast(`Copy closed: ${ev.coin}${closePnl !== undefined ? ` · ${closePnl >= 0 ? "+" : ""}${closePnl.toFixed(2)} PnL` : ""}`, closePnl !== undefined && closePnl < 0 ? "error" : "info");
  }
}

function handleEventCopy(ev: WhaleEvent) {
  if (copySeen.has(ev.tid)) return;
  copySeen.add(ev.tid);
  if (copySeen.size > 4000) {
    // prune
    const it = copySeen.values().next();
    if (!it.done) copySeen.delete(it.value);
  }
  const store = useTrackerStore.getState();
  if (!store.copies.some((c) => c.wallet === ev.w && c.enabled)) return;
  const act = openAction(ev.dir);
  if (act === "open") void mirrorOpen(ev);
  else if (act === "close") void mirrorClose(ev);
  else if (act === "flip") {
    void mirrorClose(ev).then(() => mirrorOpen(ev));
  }
}


