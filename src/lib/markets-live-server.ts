/* ---------------------------------------------------------------------------
 * markets-live-server — the Markets board feed.
 *
 * The board is a cross-asset perpetuals screener: crypto majors, US equities,
 * indices, commodities and forex — all real markets on Hyperliquid (main dex
 * + the xyz builder dex). Every ~1.5s we poll metaAndAssetCtxs for both dexes
 * (429-aware, alternating), maintain per-market price history and push a full
 * LiveSnapshot over SSE.
 *
 * Field mapping for the Markets table:
 *   price    = oracle/mark mid            -> "Price" column
 *   liq      = open interest notional     -> "Open Interest" column
 *   v24h     = dayNtlVlm                  -> "Volume" column (windows est.)
 *   trades   = synthesized from volume    -> "Trades" column
 *   badges   = funding / 24h high/low / premium / max leverage
 * ------------------------------------------------------------------------- */

import type { LiveSnapshot, LiveToken, LiveTxns } from "./hyzr-live-types";

const HL = "https://api.hyperliquid.xyz/info";

/* ---------------------------- curated universe --------------------------- */

type Cat = "crypto" | "equity" | "index" | "commodity" | "forex";

type Entry = {
  /** HL coin name (main: "BTC", xyz: "xyz:SP500") */
  hl: string;
  /** display symbol shown in the UI */
  sym: string;
  /** display name */
  name: string;
  cat: Cat;
};

const CRYPTO: [string, string, string?][] = [
  ["BTC", "Bitcoin"], ["ETH", "Ethereum"], ["SOL", "Solana"], ["XRP", "XRP"],
  ["DOGE", "Dogecoin"], ["ADA", "Cardano"], ["AVAX", "Avalanche"], ["LINK", "Chainlink"],
  ["LTC", "Litecoin"], ["SUI", "Sui"], ["APT", "Aptos"], ["NEAR", "NEAR"],
  ["TRX", "TRON"], ["DOT", "Polkadot"], ["ATOM", "Cosmos"], ["HYPE", "Hyperliquid"],
  ["UNI", "Uniswap"], ["AAVE", "Aave"], ["OP", "Optimism"], ["ARB", "Arbitrum"],
  ["PEPE", "Pepe"], ["WIF", "dogwifhat"], ["BONK", "Bonk"], ["JUP", "Jupiter"],
  ["ENA", "Ethena"], ["ONDO", "Ondo"], ["FET", "Artificial Superintelligence"], ["TIA", "Celestia"],
  ["INJ", "Injective"], ["SEI", "Sei"], ["FIL", "Filecoin"], ["CRV", "Curve"],
];

const EQUITIES: [string, string, string?][] = [
  ["NVDA", "NVIDIA"], ["TSLA", "Tesla"], ["AAPL", "Apple"], ["MSFT", "Microsoft"],
  ["GOOGL", "Alphabet"], ["AMZN", "Amazon"], ["META", "Meta Platforms"], ["AMD", "AMD"],
  ["NFLX", "Netflix"], ["COST", "Costco"], ["ORCL", "Oracle"], ["MSTR", "Strategy"],
  ["HOOD", "Robinhood"], ["PLTR", "Palantir"], ["COIN", "Coinbase"], ["MU", "Micron"],
  ["INTC", "Intel"], ["AVGO", "Broadcom"], ["QCOM", "Qualcomm"], ["ARM", "Arm Holdings"],
  ["TSM", "TSMC"], ["BABA", "Alibaba"], ["LLY", "Eli Lilly"], ["CRCL", "Circle"],
  ["IBM", "IBM"], ["DELL", "Dell"], ["NET", "Cloudflare"], ["CRWD", "CrowdStrike"],
  ["RKLB", "Rocket Lab"], ["NBIS", "Nebius"],
];

const INDICES: [string, string, string, string][] = [
  // hlName, display, name, iconOverride
  ["SP500", "SPX", "S&P 500 Index", "SP500"],
  ["XYZ100", "NDX", "Nasdaq 100 Index", "XYZ100"],
  ["VIX", "VIX", "CBOE Volatility Index", "VIX"],
  ["DXY", "DXY", "US Dollar Index", "DXY"],
  ["JP225", "JP225", "Nikkei 225", "JP225"],
  ["KR200", "KR200", "KOSPI 200", "KR200"],
  ["NIFTY", "NIFTY", "Nifty 50", "NIFTY"],
  ["IBOV", "IBOV", "Ibovespa", "IBOV"],
];

const COMMODITIES: [string, string, string, string][] = [
  ["GOLD", "GOLD", "Gold Spot", "GOLD"],
  ["SILVER", "SILVER", "Silver Spot", "SILVER"],
  ["CL", "CL", "WTI Crude Oil", "CL"],
  ["BRENTOIL", "BRENT", "Brent Crude Oil", "BRENTOIL"],
  ["NATGAS", "NATGAS", "Natural Gas", "NATGAS"],
  ["COPPER", "COPPER", "Copper", "COPPER"],
  ["PLATINUM", "PLAT", "Platinum", "PLATINUM"],
  ["URANIUM", "URANIUM", "Uranium", "URANIUM"],
  ["ALUMINIUM", "ALUM", "Aluminium", "ALUMINIUM"],
  ["CORN", "CORN", "Corn", "CORN"],
  ["WHEAT", "WHEAT", "Wheat", "WHEAT"],
];

const FOREX: [string, string, string, string][] = [
  ["EUR", "EUR", "Euro / US Dollar", "EUR"],
  ["JPY", "JPY", "US Dollar / Japanese Yen", "JPY"],
  ["GBP", "GBP", "British Pound / US Dollar", "GBP"],
  ["KRW", "KRW", "US Dollar / Korean Won", "KRW"],
];

const UNIVERSE: Entry[] = [
  ...CRYPTO.map(([h, n, s]) => ({ hl: h, sym: s ?? h, name: n, cat: "crypto" as Cat })),
  ...EQUITIES.map(([h, n, s]) => ({ hl: `xyz:${h}`, sym: s ?? h, name: n, cat: "equity" as Cat })),
  ...INDICES.map(([h, s, n, icon]) => ({ hl: `xyz:${h}`, sym: s, name: n, cat: "index" as Cat })),
  ...COMMODITIES.map(([h, s, n, icon]) => ({ hl: `xyz:${h}`, sym: s, name: n, cat: "commodity" as Cat })),
  ...FOREX.map(([h, s, n, icon]) => ({ hl: `xyz:${h}`, sym: s, name: n, cat: "forex" as Cat })),
];

/** icon file under /icons/hl — SPX -> SP500.svg, PLAT -> PLATINUM.svg ... */
function iconFor(e: Entry): string {
  const raw = e.hl.includes(":") ? e.hl.slice(4) : e.hl;
  return `/icons/hl/${raw}.svg`;
}

/* ------------------------------- state ----------------------------------- */

type MState = {
  t: LiveToken;
  hist: number[];          // price history, oldest first (~2.2s samples)
  maxHist: number;
  firstSeen: number;
  prevDay: number;
  /** true once hist was rebuilt from real 1m candle closes */
  histReal: boolean;
  /** candle-backfill attempts (cap 3) */
  bfTries: number;
};

type Feed = {
  states: Map<string, MState>;
  snap: LiveSnapshot | null;
  subs: Set<(s: LiveSnapshot | null) => void>;
  timer: ReturnType<typeof setInterval> | null;
  metaTimer: ReturnType<typeof setInterval> | null;
  /** hl coin -> max leverage from meta */
  maxLev: Map<string, number>;
  metaAge: number;
  busy: boolean;
  consecutive429: number;
  /** keys awaiting real 1m-candle history backfill (staggered 1 call/tick) */
  backfillQ: string[];
  backfillTimer: ReturnType<typeof setInterval> | null;
  backfillBusy: boolean;
};

const g = globalThis as unknown as { __hyzrMarkets?: Feed };

function feed(): Feed {
  if (!g.__hyzrMarkets) {
    g.__hyzrMarkets = {
      states: new Map(),
      snap: null,
      subs: new Set(),
      timer: null,
      metaTimer: null,
      maxLev: new Map(),
      metaAge: 0,
      busy: false,
      consecutive429: 0,
      backfillQ: [],
      backfillTimer: null,
      backfillBusy: false,
    };
  }
  return g.__hyzrMarkets;
}

/* ------------------------------- helpers --------------------------------- */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hlInfo(body: Record<string, unknown>): Promise<any | null> {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(HL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8_000),
      });
      if (res.status === 429) {
        const f = feed();
        f.consecutive429 += 1;
        await sleep(1_500 + f.consecutive429 * 1_200);
        continue;
      }
      if (!res.ok) return null;
      feed().consecutive429 = 0;
      return await res.json();
    } catch {
      await sleep(1_200);
    }
  }
  return null;
}

function hashSeed(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = ((h * 31 + s.charCodeAt(i)) | 0) >>> 0;
  return h;
}

/** price change % between two points, guarded against div0 */
function chPct(now: number, then: number): number {
  if (!then || then <= 0) return 0;
  return ((now - then) / then) * 100;
}

/** deterministic synthesized trade counts from volume + direction */
function tradeCounts(sym: string, vol: number, ch: number): LiveTxns {
  const n = Math.max(1, Math.round(vol / 8_500));
  const skew =
    0.5 + (((hashSeed(sym) % 17) - 8) / 100) + Math.max(-0.12, Math.min(0.12, ch / 200));
  const b = Math.round(n * Math.min(0.82, Math.max(0.18, skew)));
  return { b, s: Math.max(0, n - b) };
}

/** cold-start placeholder ONLY (≤~40s until the real candle backfill lands):
 *  a flat line at the live price with ~1bp deterministic micro-wobble so the
 *  sparkline canvas has something to draw. Never used for ch* math once the
 *  real 1m closes arrive (replaceHistWithCandles). */
function seedHist(price: number, maxHist: number): number[] {
  const pts: number[] = [];
  const amp = price * 0.0001;
  for (let i = 0; i < maxHist; i++) {
    const n1 = (hashSeed(`a${i}:${price}`) % 1000) / 1000 - 0.5;
    pts.push(Math.max(1e-9, price + amp * n1));
  }
  pts.push(price);
  return pts;
}

/** rebuild a market's sample history from REAL 1m candle closes (Hyperliquid
 *  candleSnapshot): piecewise-linear across maxHist slots so index math keeps
 *  its samples-per-minute ratio (~2600 samples / 65min ≈ 40 samples/min ≈
 *  the live push rate). The final sample is the live mark price. This is what
 *  makes ch1m/ch5/ch30/ch1h and the sparklines real from the first frame. */
function histFromCloses(closes: number[], price: number, maxHist: number): number[] {
  const pts: number[] = [];
  const n = closes.length;
  if (n >= 2) {
    const per = maxHist / (n - 1); // samples per bar-step
    for (let i = 0; i < maxHist - 1; i++) {
      const f = i / per;
      const k = Math.min(n - 2, Math.floor(f));
      const u = f - k;
      pts.push(closes[k] + (closes[k + 1] - closes[k]) * u);
    }
  }
  pts.push(price);
  return pts;
}

/** downsample hist to ≤cap points for the wire (oldest → newest, always ends
 *  at the live price); each output point is the MEAN of its stride window —
 *  point-sampling a noisy live-tick tail aliases into sawtooth, a box average
 *  keeps the true trend. Rounded to 6 significant digits to keep SSE light */
function sparkOf(h: number[], cap = 40): number[] {
  const n = h.length;
  if (n <= cap) return h.slice();
  const out: number[] = [];
  const stride = (n - 1) / (cap - 1);
  for (let j = 0; j < cap; j++) {
    const a = Math.round(j * stride);
    const b = Math.min(n - 1, Math.round((j + 1) * stride));
    let sum = 0;
    let cnt = 0;
    for (let i = a; i <= b; i++) {
      sum += h[i];
      cnt++;
    }
    out.push(+(cnt ? sum / cnt : h[a]).toPrecision(6));
  }
  out[cap - 1] = +h[n - 1].toPrecision(6);
  return out;
}

/* ------------------------------ snapshot --------------------------------- */

function buildSnap(f: Feed): LiveSnapshot | null {
  const pools: LiveToken[] = [];
  let sol = 0;
  let solCh = 0;
  for (const [key, st] of f.states) {
    const t = st.t;
    // live timeframe changes from price history
    const h = st.hist;
    const n = h.length;
    const ago = (samples: number) => h[Math.max(0, n - 1 - samples)] ?? 0;
    t.ch1m = chPct(t.price, ago(40));
    t.ch5 = chPct(t.price, ago(200));
    t.ch30 = chPct(t.price, ago(1_200));
    t.ch1h = chPct(t.price, ago(2_400));
    if (key === "hl:SOL") {
      sol = t.price;
      solCh = t.ch24h;
    }
    t.spark = sparkOf(h);
    pools.push(t);
  }
  if (pools.length === 0) return null;
  return { t: Date.now(), sol, solCh, pools, src: "hl" };
}

/* ------------------------------- polling --------------------------------- */

async function pollOnce(f: Feed): Promise<void> {
  if (f.busy) return;
  f.busy = true;
  try {
    const [main, xyz] = await Promise.all([
      hlInfo({ type: "metaAndAssetCtxs" }),
      hlInfo({ type: "metaAndAssetCtxs", dex: "xyz" }),
    ]);
    type Ctx = Record<string, any>;
    const ctxMain: Ctx = {};
    const ctxXyz: Ctx = {};
    if (Array.isArray(main)) {
      const names = (main[0]?.universe ?? []).map((u: any) => u.name as string);
      (main[1] ?? []).forEach((c: any, i: number) => { ctxMain[names[i]] = c; });
    }
    if (Array.isArray(xyz)) {
      const names = (xyz[0]?.universe ?? []).map((u: any) => u.name as string);
      (xyz[1] ?? []).forEach((c: any, i: number) => { ctxXyz[names[i]] = c; });
    }
    // both upstreams failed (rate limit / network) — keep the last snapshot,
    // NEVER drop or re-seed markets off a failed cycle
    if (!Array.isArray(main) && !Array.isArray(xyz)) return;
    const now = Date.now();
    let changed = f.snap == null;

    for (const e of UNIVERSE) {
      const raw = e.hl.includes(":") ? e.hl.slice(4) : e.hl;
      const ctx = e.hl.includes(":") ? ctxXyz[e.hl] : ctxMain[e.hl];
      if (!ctx) continue;
      const key = `hl:${e.hl}`;
      const mark = Number(ctx.markPx ?? 0);
      const oracle = Number(ctx.oraclePx ?? 0);
      const price = mark > 0 ? mark : oracle;
      if (!(price > 0)) continue;
      const prevDay = Number(ctx.prevDayPx ?? 0);
      const v24h = Number(ctx.dayNtlVlm ?? 0);
      const oi = Number(ctx.openInterest ?? 0);
      const funding = Number(ctx.funding ?? 0);
      const premium = prevDay > 0 ? ((price - oracle) / oracle) * 100 : 0;

      let st = f.states.get(key);
      if (!st) {
        const ch24 = prevDay > 0 ? ((price - prevDay) / prevDay) * 100 : 0;
        const maxHist = 2_600;
        const t: LiveToken = {
          id: key,
          mint: key,
          symbol: e.sym,
          name: e.name,
          image: iconFor(e),
          dex: e.cat,
          createdAt: now - 86_400_000,
          fs: now,
          mc: price,
          mcSol: 0,
          liq: oi * price,
          price,
          ch1m: 0, ch5: 0, ch30: 0, ch1h: 0,
          ch24h: ch24,
          v1m: v24h * 0.0015,
          v5: v24h * 0.008,
          v30: v24h * 0.03,
          v1h: v24h * 0.06,
          v24h,
          t5: tradeCounts(e.sym, v24h * 0.008, ch24),
          t30: tradeCounts(e.sym, v24h * 0.03, ch24),
          t1h: tradeCounts(e.sym, v24h * 0.06, ch24),
          t24h: tradeCounts(e.sym, v24h, ch24),
          b5: Math.max(2, Math.round((v24h * 0.008) / 9_500)),
          tr: null,
          bonding: null,
          complete: true,
          ath: 0,
          twitter: "",
          website: "",
          telegram: "",
          replies: 0,
          // market-board extras
          oraclePx: oracle,
          funding,
          premium,
          maxLev: f.maxLev.get(e.hl) ?? undefined,
          oiCoins: oi,
          prevDayPx: prevDay,
          tradeCoin: e.hl,
        };
        st = {
          t,
          hist: seedHist(price, 2_599),
          maxHist: 2_600,
          firstSeen: now,
          prevDay,
          histReal: false,
          bfTries: 0,
        };
        f.states.set(key, st);
        f.backfillQ.push(key);
        changed = true;
      } else {
        const t = st.t;
        const moved = t.price !== price;
        t.price = price;
        t.mc = price;
        t.liq = oi * price;
        t.ch24h = prevDay > 0 ? ((price - prevDay) / prevDay) * 100 : t.ch24h;
        t.v24h = v24h;
        t.v1m = v24h * 0.0015;
        t.v5 = v24h * 0.008;
        t.v30 = v24h * 0.03;
        t.v1h = v24h * 0.06;
        t.oraclePx = oracle;
        t.funding = funding;
        t.premium = premium;
        t.maxLev = f.maxLev.get(e.hl) ?? t.maxLev;
        t.oiCoins = oi;
        st.prevDay = prevDay;
        if (moved) {
          st.hist.push(price);
          if (st.hist.length > st.maxHist) st.hist.splice(0, st.hist.length - st.maxHist);
          changed = true;
        }
      }
    }

    // drop curated markets that vanished upstream — only when that dex
    // actually answered (an empty ctx map means the call failed, not that
    // every market disappeared)
    if (Array.isArray(main)) {
      for (const key of [...f.states.keys()]) {
        const e = UNIVERSE.find((u) => `hl:${u.hl}` === key);
        if (!e || e.hl.includes(":")) continue;
        if (!ctxMain[e.hl]) {
          f.states.delete(key);
          changed = true;
        }
      }
    }
    if (Array.isArray(xyz)) {
      for (const key of [...f.states.keys()]) {
        const e = UNIVERSE.find((u) => `hl:${u.hl}` === key);
        if (!e || !e.hl.includes(":")) continue;
        if (!ctxXyz[e.hl]) {
          f.states.delete(key);
          changed = true;
        }
      }
    }

    if (changed) {
      const snap = buildSnap(f);
      if (snap) {
        f.snap = snap;
        for (const sub of f.subs) {
          try { sub(snap); } catch { /* subscriber errors never kill the feed */ }
        }
      }
    }
  } finally {
    f.busy = false;
  }
}

async function loadMeta(f: Feed): Promise<void> {
  const [main, xyz] = await Promise.all([
    hlInfo({ type: "meta" }),
    sleep(600).then(() => hlInfo({ type: "meta", dex: "xyz" })),
  ]);
  for (const u of main?.universe ?? []) f.maxLev.set(u.name, u.maxLeverage);
  for (const u of xyz?.universe ?? []) f.maxLev.set(u.name, u.maxLeverage);
  f.metaAge = Date.now();
  // annotate live states with leverage once meta lands
  for (const st of f.states.values()) {
    st.t.maxLev = f.maxLev.get(st.t.tradeCoin ?? "") ?? st.t.maxLev;
  }
}

/* ----------------- real history backfill (staggered) --------------------- */

/** one market per tick: rebuild hist from real 1m candle closes so sparklines
 *  and window changes are accurate ~seconds after a market is first seen */
async function processBackfill(f: Feed): Promise<void> {
  if (f.backfillBusy) return;
  const key = f.backfillQ.shift();
  if (!key) return;
  const st = f.states.get(key);
  if (!st || st.histReal) return;
  f.backfillBusy = true;
  try {
    const coin = key.slice(3); // "hl:BTC" -> "BTC", "hl:xyz:SP500" -> "xyz:SP500"
    const now = Date.now();
    const raw = await hlInfo({
      type: "candleSnapshot",
      req: { coin, interval: "1m", startTime: now - 66 * 60_000, endTime: now },
    });
    if (Array.isArray(raw) && raw.length >= 2) {
      const closes = raw
        .map((r: any) => Number(r.c))
        .filter((v: number) => v > 0);
      if (closes.length >= 2) {
        st.hist = histFromCloses(closes, st.t.price, st.maxHist);
        st.histReal = true;
      }
    }
  } catch {
    /* network blip — retried below while tries remain */
  } finally {
    f.backfillBusy = false;
    if (!st.histReal) {
      st.bfTries += 1;
      if (st.bfTries < 3 && f.states.has(key)) f.backfillQ.push(key);
    }
  }
}

/* ------------------------------ public API ------------------------------- */

export function marketsFeedStart(): void {
  const f = feed();
  if (!f.timer) {
    // 2.2s cadence: two /info calls per tick stays comfortably inside HL's
    // rate budget even with the perps terminal polling in parallel
    f.timer = setInterval(() => { void pollOnce(f); }, 2_200);
    void pollOnce(f);
  }
  if (!f.metaTimer) {
    void loadMeta(f);
    f.metaTimer = setInterval(() => {
      if (Date.now() - f.metaAge > 10 * 60_000) void loadMeta(f);
    }, 60_000);
  }
  if (!f.backfillTimer) {
    // ~0.6s between candleSnapshot calls — 54-coin cold start backfills in
    // ~35s without pressuring HL's rate budget alongside the 2.2s poll loop
    f.backfillTimer = setInterval(() => { void processBackfill(f); }, 600);
  }
}

export function marketsFeedSnapshot(): LiveSnapshot | null {
  return feed().snap;
}

export function marketsFeedSubscribe(fn: (s: LiveSnapshot | null) => void): () => void {
  const f = feed();
  f.subs.add(fn);
  return () => f.subs.delete(fn);
}
