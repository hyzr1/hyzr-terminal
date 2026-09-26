"use client";

/* ---------------------------------------------------------------------------
 * LiveProvider — consumes the SSE snapshot stream and exposes live state.
 *
 * - tokens: LiveToken[] (full universe currently tracked server-side)
 * - sol: live SOL price
 * - status: connecting | live | simulated
 * - now: 1s ticking clock for ages
 * - history(id): recent market-cap points for sparklines (client-built)
 * - ath(id): highest market cap seen this session (client-tracked)
 *
 * If the stream is unavailable the provider falls back to a built-in
 * simulator so the board always streams cross-asset markets and updates in place.
 * ------------------------------------------------------------------------- */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { LiveSnapshot, LiveToken } from "@/lib/hyzr-live-types";
import { hashSeed, rng } from "@/lib/format";

export type LiveStatus = "connecting" | "live" | "simulated";

type LiveCtx = {
  tokens: LiveToken[];
  sol: number;
  status: LiveStatus;
  now: number;
  lastUpdate: number;
  history: (id: string) => number[];
  ath: (id: string) => number;
  solHistory: number[];
};

const Ctx = createContext<LiveCtx | null>(null);

const HISTORY_CAP = 64;
const STALL_MS = 8_000;

/* ----------------------------------------------------------------------- */
/* Offline simulator (fallback only)                                       */
/* ----------------------------------------------------------------------- */

const MARKETS = [
  ["BTC", "Bitcoin", 112840, 31_800_000_000, "crypto"],
  ["ETH", "Ethereum", 4382, 18_400_000_000, "crypto"],
  ["SOL", "Solana", 214.72, 3_900_000_000, "crypto"],
  ["XRP", "XRP", 2.34, 2_400_000_000, "crypto"],
  ["DOGE", "Dogecoin", 0.1982, 890_000_000, "crypto"],
  ["HYPE", "Hyperliquid", 48.21, 1_420_000_000, "crypto"],
  ["SPX", "S&P 500 Index", 6762.4, 4_100_000_000, "index"],
  ["NDX", "Nasdaq 100 Index", 25110.6, 2_600_000_000, "index"],
  ["VIX", "CBOE Volatility Index", 14.8, 180_000_000, "index"],
  ["NVDA", "NVIDIA", 182.64, 2_180_000_000, "equity"],
  ["TSLA", "Tesla", 416.38, 1_760_000_000, "equity"],
  ["AAPL", "Apple", 241.16, 1_090_000_000, "equity"],
  ["META", "Meta Platforms", 718.42, 830_000_000, "equity"],
  ["AMZN", "Amazon", 238.76, 720_000_000, "equity"],
  ["GOOGL", "Alphabet", 213.2, 610_000_000, "equity"],
  ["MSFT", "Microsoft", 512.4, 940_000_000, "equity"],
  ["GOLD", "Gold Spot", 3588.4, 980_000_000, "commodity"],
  ["SILVER", "Silver Spot", 41.28, 430_000_000, "commodity"],
  ["CL", "WTI Crude Oil", 64.32, 760_000_000, "commodity"],
  ["BRENT", "Brent Crude Oil", 68.15, 540_000_000, "commodity"],
  ["NATGAS", "Natural Gas", 3.18, 224_000_000, "commodity"],
  ["COPPER", "Copper", 5.04, 190_000_000, "commodity"],
  ["EUR", "Euro / US Dollar", 1.1724, 540_000_000, "forex"],
  ["JPY", "US Dollar / Japanese Yen", 148.34, 470_000_000, "forex"],
] as const;

function hexColor(n: number): string {
  const r = rng(n);
  const h = Math.floor(r() * 360);
  return `hsl(${h} ${45 + r() * 35}% ${28 + r() * 30}%)`;
}
void hexColor;

const MAIN_DEX = new Set(["BTC", "ETH", "SOL", "XRP", "DOGE", "HYPE"]);

function makeFakeToken(now: number, ageMin: number, i: number): LiveToken {
  const r = rng((now + i * 977) >>> 0);
  const market = MARKETS[i % MARKETS.length];
  const [sym, name, basePrice, openInterest, category] = market;
  const id = `market-${String(sym).toLowerCase()}`;
  const mc = basePrice * (0.992 + r() * 0.016);
  const mom = r() * 2 - 1;
  const ch24 = mom * 6.4 * r();
  return {
    id,
    mint: id,
    symbol: sym,
    name,
    image: `/icons/hl/${String(sym) === "SPX" ? "SP500" : String(sym) === "NDX" ? "XYZ100" : String(sym) === "BRENT" ? "BRENTOIL" : String(sym)}.svg`,
    dex: category,
    createdAt: now - Math.round((ageMin + 10) * 60_000),
    fs: now,
    mc,
    mcSol: mc,
    liq: openInterest,
    price: mc,
    ch1m: mom * 0.18 * r(),
    ch5: mom * 0.65 * r(),
    ch30: mom * 1.4 * r(),
    ch1h: mom * 2.1 * r(),
    ch24h: ch24,
    v5: openInterest * (0.002 + r() * 0.006),
    v30: openInterest * (0.01 + r() * 0.018),
    v1h: openInterest * (0.025 + r() * 0.04),
    v24h: openInterest * (0.2 + r() * 0.55),
    t5: { b: Math.round(120 + r() * 900), s: Math.round(100 + r() * 850) },
    t30: { b: Math.round(800 + r() * 4200), s: Math.round(700 + r() * 3900) },
    t1h: { b: Math.round(1800 + r() * 9000), s: Math.round(1600 + r() * 8500) },
    t24h: { b: Math.round(18_000 + r() * 80_000), s: Math.round(16_000 + r() * 75_000) },
    b5: Math.round(r() * 60),
    tr: null,
    bonding: null,
    complete: true,
    ath: mc * (1.01 + r() * 0.08),
    twitter: "",
    website: "",
    telegram: "",
    replies: Math.round(r() * 80),
    funding: mom * 0.00004,
    premium: mom * 0.004,
    maxLev: 40,
    oiCoins: openInterest / mc,
    prevDayPx: mc / (1 + ch24 / 100),
    tradeCoin: MAIN_DEX.has(String(sym)) ? String(sym) : String(sym) === "SPX" ? "xyz:SP500" : String(sym) === "NDX" ? "xyz:XYZ100" : String(sym) === "BRENT" ? "xyz:BRENTOIL" : String(sym) === "PLAT" ? "xyz:PLATINUM" : String(sym) === "ALUM" ? "xyz:ALUMINIUM" : `xyz:${sym}`,
  };
}

function simulate(prev: LiveToken[], seq: number): { pools: LiveToken[]; sol: number } {
  const now = Date.now();
  let pools = prev;
  if (prev.length === 0) {
    pools = Array.from({ length: MARKETS.length }, (_, i) =>
      makeFakeToken(now, 1 + (i % 14) * 3.5, i * 13 + seq),
    );
  }
  // cap universe
  if (pools.length > 80) pools = pools.slice(0, 80);
  const mutated = pools.map((t) => {
    // market-scale ticks: ±0.09% per 1.5s with momentum bias (the old
    // pump.fun-scale math produced absurd ±80% "5m changes" on majors)
    const drift = Math.tanh((t.ch5 ?? 0) / 18) * 0.5;
    const shock = (Math.random() - 0.5 + drift * 0.05) * 0.0016;
    const mc = Math.max(0.0001, t.mc * (1 + shock));
    const ch5 = Math.max(-15, Math.min(15, t.ch5 * 0.94 + shock * 100));
    return {
      ...t,
      mc,
      mcSol: mc,
      price: mc,
      liq: t.liq * (1 + (Math.random() - 0.5) * 0.01),
      ch1m: Math.max(-8, Math.min(8, (t.ch1m ?? 0) * 0.8 + shock * 40)),
      ch5,
      ch30: Math.max(-30, Math.min(30, t.ch30 + (ch5 - t.ch5) * 0.4)),
      ch1h: Math.max(-45, Math.min(45, t.ch1h + (ch5 - t.ch5) * 0.2)),
      v5: Math.max(0, t.v5 + (Math.random() - 0.4) * t.v5 * 0.06),
      v30: t.v30 + (Math.random() - 0.4) * t.v30 * 0.02,
      v1h: t.v1h + (Math.random() - 0.4) * t.v1h * 0.012,
      v24h: t.v24h + (Math.random() - 0.35) * t.v24h * 0.008,
      t5: {
        b: t.t5.b + (Math.random() < 0.45 ? 1 : 0),
        s: t.t5.s + (Math.random() < 0.45 ? 1 : 0),
      },
      b5: t.b5 + (Math.random() < 0.3 ? 1 : 0),
      bonding: null,
    };
  });
  const sol = 104 + Math.sin(now / 240_000) * 0.8 + Math.random() * 0.14;
  return { pools: mutated, sol };
}

/* ----------------------------------------------------------------------- */

export function LiveProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<LiveToken[]>([]);
  const [sol, setSol] = useState(0);
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [now, setNow] = useState(() => Date.now());
  const [lastUpdate, setLastUpdate] = useState(0);
  const [solHistory, setSolHistory] = useState<number[]>([]);

  const histories = useRef(new Map<string, number[]>());
  const aths = useRef(new Map<string, number>());
  const simSeq = useRef(0);
  const simTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMsgAt = useRef(Date.now());

  const ingest = useCallback((snap: LiveSnapshot | null) => {
    if (!snap) return;
    lastMsgAt.current = Date.now();
    setTokens(snap.pools);
    if (snap.sol > 0) {
      setSol(snap.sol);
      setSolHistory((h) => {
        const last = h[h.length - 1] ?? 0;
        if (snap.sol === last) return h;
        const next = [...h, snap.sol];
        return next.length > HISTORY_CAP
          ? next.slice(next.length - HISTORY_CAP)
          : next;
      });
    }
    setLastUpdate(Date.now());
    const hs = histories.current;
    const as = aths.current;
    for (const p of snap.pools) {
      if (p.mc > 0) {
        // prime from the server's real sparkline (1m-candle backfill + live
        // ticks) when our buffer is missing or still too short to draw
        let arr = hs.get(p.id);
        if (!arr || (arr.length < 8 && p.spark && p.spark.length > arr.length)) {
          arr = p.spark && p.spark.length > 3 ? [...p.spark] : [p.mc];
          hs.set(p.id, arr);
        }
        const last = arr[arr.length - 1] ?? 0;
        if (p.mc !== last) {
          arr.push(p.mc);
          if (arr.length > HISTORY_CAP) arr.splice(0, arr.length - HISTORY_CAP);
        }
        const prevAth = as.get(p.id) ?? 0;
        if (p.mc > prevAth) as.set(p.id, p.mc);
      }
    }
  }, []);

  /* Live data: SSE stream first, JSON polling fallback, simulator last.
   * Some proxies/gateways buffer SSE — the poll fallback guarantees the
   * board always gets real data. The pump-era simulator is a last resort
   * only (offline dev), with market-scale moves. */
  useEffect(() => {
    let es: EventSource | null = null;
    let stopped = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const bootAt = lastMsgAt.current;

    const ingestSim = (pools: LiveToken[]) => {
      const hs = histories.current;
      const as = aths.current;
      for (const p of pools) {
        if (p.mc > 0) {
          const arr = hs.get(p.id);
          if (arr) {
            arr.push(p.mc);
            if (arr.length > HISTORY_CAP) arr.splice(0, arr.length - HISTORY_CAP);
          } else hs.set(p.id, [p.mc]);
          const a = as.get(p.id) ?? 0;
          if (p.mc > a) as.set(p.id, p.mc);
        }
      }
    };

    const stopSim = () => {
      if (simTimer.current) {
        clearInterval(simTimer.current);
        simTimer.current = null;
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const startPoll = () => {
      if (pollTimer || stopped) return;
      const tick = async () => {
        if (stopped) return;
        try {
          const res = await fetch("/api/hyzr/snapshot", { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          const snap = (await res.json()) as LiveSnapshot | null;
          if (stopped) return;
          if (snap && snap.pools?.length) {
            stopSim();
            setStatus("live");
            ingest(snap);
          }
        } catch {
          startSim(); // poll failed too — last resort
        }
      };
      void tick();
      pollTimer = setInterval(tick, 3_000);
    };

    const startSim = () => {
      if (simTimer.current || pollTimer) return;
      simTimer.current = setInterval(() => {
        simSeq.current += 1;
        setTokens((prev) => {
          const { pools, sol: s2 } = simulate(prev, simSeq.current);
          if (s2 > 0) {
            const vNew = s2;
            setSol((old2) => (old2 > 0 ? old2 * 0.7 + vNew * 0.3 : vNew));
            setSolHistory((h) => {
              const last = h[h.length - 1] ?? 0;
              const nextV = last > 0 ? last * 0.7 + vNew * 0.3 : vNew;
              if (Math.abs(nextV - last) < 0.005) return h;
              const next = [...h, nextV];
              return next.length > HISTORY_CAP
                ? next.slice(next.length - HISTORY_CAP)
                : next;
            });
          }
          ingestSim(pools);
          setLastUpdate(Date.now());
          return pools;
        });
      }, 1_500);
    };

    const connect = () => {
      if (stopped) return;
      es = new EventSource("/api/hyzr/stream");
      es.onmessage = (ev) => {
        try {
          const snap = JSON.parse(ev.data) as LiveSnapshot;
          if (!snap || !snap.pools?.length) return; // warm-up null frame
          stopSim();
          setStatus("live");
          ingest(snap);
        } catch {
          /* malformed frame */
        }
      };
      es.onerror = () => {
        // EventSource auto-retries; the stall detector arms the poll fallback
      };
    };

    connect();

    const stall = setInterval(() => {
      if (Date.now() - lastMsgAt.current > STALL_MS) {
        setStatus((st) => (st === "live" ? "simulated" : st));
        startPoll();
      }
    }, 4_000);

    // arm the poll fallback quickly if the very first frames never arrive
    const firstData = setTimeout(() => {
      if (lastMsgAt.current <= bootAt && !stopped) startPoll();
    }, 3_500);

    return () => {
      stopped = true;
      clearInterval(stall);
      clearTimeout(firstData);
      stopSim();
      es?.close();
    };
  }, [ingest]);

  /* 1s clock for ages */
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);

  const history = useCallback(
    (id: string): number[] => histories.current.get(id) ?? [],
    [],
  );
  const ath = useCallback(
    (id: string): number => aths.current.get(id) ?? 0,
    [],
  );

  const value = useMemo<LiveCtx>(
    () => ({ tokens, sol, status, now, lastUpdate, history, ath, solHistory }),
    [tokens, sol, status, now, lastUpdate, history, ath, solHistory],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLive(): LiveCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLive must be used inside LiveProvider");
  return ctx;
}
