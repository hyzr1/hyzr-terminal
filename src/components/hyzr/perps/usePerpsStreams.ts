"use client";
/**
 * Wires Hyperliquid WS streams into the perps store + drives the paper engine.
 * Mount once inside the Perps page.
 *
 * Reliability model (prices must NEVER freeze):
 *  1. primary: multiplexed WS (allMids / l2Book / trades / activeAssetCtx)
 *  2. staleness watchdog inside ws.ts force-reconnects a quiet socket
 *  3. REST fallback: while the WS is not "live", poll allMids + l2Book (~800ms)
 *  4. ctx backstop: active coin's metaAndAssetCtxs polled every 2.5s (also the
 *     only way builder-dex coins get live funding/OI/mark, since HL's
 *     activeAssetCtx channel is main-universe oriented)
 *
 * fx19 multi-market workspace: subscriptions are driven by the panel
 * watchlist (useCoinWatch) — every market shown by ANY panel gets its own
 * l2Book + trades + activeAssetCtx feed. Candles are NOT handled here:
 * each chart panel subscribes/backfills its own coin+interval.
 */
import { useEffect } from "react";
import { hlWs } from "@/lib/hyperliquid/ws";
import {
  usePerpsData, ensureMetaLoop, useWatchCoins,
} from "@/lib/hyperliquid/perpsStore";
import { fetchAllMids, fetchBook, fetchMetaAndCtxs, fetchMetaAndCtxsDex } from "@/lib/hyperliquid/api";
import { dexOf } from "@/lib/hyperliquid/types";
import { useTradeStore, engineTick } from "@/lib/hyperliquid/tradeStore";
import type { Book } from "@/lib/hyperliquid/types";

export function usePerpsStreams() {
  const status = usePerpsData((s) => s.status);
  /** joined "a,b,c" so the effect re-runs only when the SET changes */
  const watched = useWatchCoins((s) => Object.keys(s.refs).sort().join(","));
  const primary = usePerpsData((s) => s.coin);

  // global: status, allMids, universe
  useEffect(() => {
    ensureMetaLoop();
    const offStatus = hlWs.onStatus((s) => usePerpsData.getState().setStatus(s));
    const offMids = hlWs.subscribe({ type: "allMids" }, (data) => {
      usePerpsData.getState().setMids(data as Record<string, number>);
      // paper engine consumes ticks (fills, triggers, liquidation)
      engineTick(usePerpsData.getState().mids);
    });
    return () => { offStatus(); offMids(); };
  }, []);

  // per-coin streams: every coin watched by ANY panel gets L2 + tape + ctx
  useEffect(() => {
    const coins = watched ? watched.split(",") : [];
    if (coins.length === 0) return;
    const offs = coins.flatMap((coin) => {
      const dex = dexOf(coin);
      const base = dex ? coin.slice(dex.length + 1) : coin;
      return [
        hlWs.subscribe({ type: "l2Book", coin }, (data) => {
          const b = data as Book;
          usePerpsData.getState().setBook(coin, b);
          engineTick(usePerpsData.getState().mids, b);
        }),
        hlWs.subscribe({ type: "trades", coin }, (data) => {
          usePerpsData.getState().pushTrade(coin, data as import("@/lib/hyperliquid/types").Trade);
        }),
        hlWs.subscribe(
          dex ? { type: "activeAssetCtx", dex, coin: base } : { type: "activeAssetCtx", coin },
          (data) => {
            const d = data as { coin: string; ctx: import("@/lib/hyperliquid/types").AssetCtx };
            if (d?.ctx) usePerpsData.getState().patchCtx(coin, d.ctx);
          },
        ),
      ];
    });
    return () => { offs.forEach((off) => off()); };
  }, [watched]);

  // REST fallback — keeps EVERYTHING updating even if the WS is blocked
  useEffect(() => {
    if (status === "live") return;
    let stopped = false;
    (async () => {
      while (!stopped) {
        try {
          const mids = await fetchAllMids();
          if (stopped) return;
          usePerpsData.getState().setMids(mids);
          engineTick(usePerpsData.getState().mids);
          const st = usePerpsData.getState();
          const watchedNow = Object.keys(useWatchCoins.getState().refs);
          for (const c of watchedNow) {
            const b = await fetchBook(c);
            if (!stopped) usePerpsData.getState().setBook(c, b);
          }
        } catch { /* keep trying */ }
        await new Promise((r) => setTimeout(r, 800));
      }
    })();
    return () => { stopped = true; };
  }, [status]);

  // ctx backstop: refresh the PRIMARY coin's funding/OI/mark/volume every 2.5s
  // (works for both main + builder-dex markets; other watched coins rely on
  // their activeAssetCtx WS channel)
  useEffect(() => {
    if (!primary) return;
    let stopped = false;
    const tick = async () => {
      try {
        const dex = dexOf(primary);
        const [meta, ctxs] = dex ? await fetchMetaAndCtxsDex(dex) : await fetchMetaAndCtxs();
        if (stopped) return;
        const idx = meta.universe.findIndex((u) => u.name === primary);
        if (idx >= 0 && ctxs[idx]) usePerpsData.getState().patchCtx(primary, ctxs[idx]);
      } catch { /* backstop only */ }
    };
    tick();
    const t = setInterval(tick, 2_500);
    return () => { stopped = true; clearInterval(t); };
  }, [primary]);

  // engine slow tick (margin/liquidation housekeeping at 500ms)
  useEffect(() => {
    const t = setInterval(() => engineTick(usePerpsData.getState().mids), 500);
    return () => clearInterval(t);
  }, []);

  // ensure trading engine is hydrated
  useEffect(() => {
    useTradeStore.persist.rehydrate?.();
  }, []);
}
