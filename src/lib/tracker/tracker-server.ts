/**
 * Hyperliquid Tracker engine (server singleton — Node runtime only).
 *
 * Powers the flagship "Trackers" page:
 *  - Full leaderboard universe ingest (every Hyperliquid wallet, day/week/
 *    month/allTime PnL, ROI, volume) with disk cache + background refresh.
 *  - Whale scanner: rotating `userFills` polls over the best wallets
 *    (fast lane ~10s, deep lane ~60s) + the user's tracked wallets,
 *    deduped by fill id, emitting a live money-flow event stream.
 *  - Smart-money aggregator: clearinghouseState polls over the top 100
 *    wallets -> per-coin long/short positioning.
 *  - Wallet profile bundles (leaderboard row + portfolio curves +
 *    positions + fills + derived trading stats).
 *
 * All data is REAL Hyperliquid data (public /info + stats-data endpoints).
 */

import type { WhaleEvent } from "./tracker-types";

export type { WhaleEvent };

const API = "https://api.hyperliquid.xyz";
const LEADERBOARD_URL = "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard";
const CACHE_DIR = ".tracker-cache";
const LB_TTL = 30 * 60 * 1000; // leaderboard refresh cadence

/* ------------------------------------------------------------------ */
/* types                                                               */
/* ------------------------------------------------------------------ */



export interface LbQuery {
  window: "day" | "week" | "month" | "allTime";
  sort: "pnl" | "roi" | "vlm" | "av";
  minPnl?: number;
  minAv?: number;
  minVlm?: number;
  q?: string;
  limit: number;
  offset: number;
}

/* ------------------------------------------------------------------ */
/* singleton state                                                     */
/* ------------------------------------------------------------------ */

interface Engine {
  // compact leaderboard store
  addrs: string[];
  names: Map<string, string>;
  av: Float64Array;
  pnl: Record<"day" | "week" | "month" | "allTime", Float64Array>;
  roi: Record<"day" | "week" | "month" | "allTime", Float64Array>;
  vlm: Record<"day" | "week" | "month" | "allTime", Float64Array>;
  idxByAddr: Map<string, number>;
  sorted: Map<string, Int32Array>; // `${window}:${key}` -> row indices desc
  lbLoadedAt: number;
  lbLoading: Promise<void> | null;

  // scanner
  watchlist: string[]; // server-side extra tracked wallets (from client)
  scanCursor: number;
  lastTid: Map<string, number>;
  events: WhaleEvent[];
  eventSeq: number;
  subscribers: Set<(evs: WhaleEvent[], snapshot: boolean) => void>;
  scanStarted: boolean;

  // tracked-wallet enrichment cache
  trackedCache: Map<
    string,
    { av: number; lastActive: number; pnl24h: number; fills24h: number; positions: number; at: number }
  >;

  // smart money
  smart: {
    updatedAt: number;
    coins: Map<
      string,
      { longs: number; shorts: number; longUsd: number; shortUsd: number; top: { w: string; usd: number; szi: number }[] }
    >;
    smCursor: number;
    started: boolean;
  };
}

const g = globalThis as unknown as { __hlTracker?: Engine };

function eng(): Engine {
  if (!g.__hlTracker) {
    g.__hlTracker = {
      addrs: [],
      names: new Map(),
      av: new Float64Array(0),
      pnl: { day: new Float64Array(0), week: new Float64Array(0), month: new Float64Array(0), allTime: new Float64Array(0) },
      roi: { day: new Float64Array(0), week: new Float64Array(0), month: new Float64Array(0), allTime: new Float64Array(0) },
      vlm: { day: new Float64Array(0), week: new Float64Array(0), month: new Float64Array(0), allTime: new Float64Array(0) },
      idxByAddr: new Map(),
      sorted: new Map(),
      lbLoadedAt: 0,
      lbLoading: null,
      watchlist: [],
      scanCursor: 0,
      lastTid: new Map(),
      events: [],
      eventSeq: 0,
      subscribers: new Set(),
      scanStarted: false,
      trackedCache: new Map(),
      smart: { updatedAt: 0, coins: new Map(), smCursor: 0, started: false },
    };
  }
  return g.__hlTracker;
}

/* ------------------------------------------------------------------ */
/* info helper                                                         */
/* ------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function info<T>(body: Record<string, unknown>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${API}/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`info ${res.status}`);
      if (!res.ok) throw new Error(`info ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (i < tries - 1) await sleep(350 + i * 550);
    }
  }
  throw lastErr;
}

/* ------------------------------------------------------------------ */
/* leaderboard ingest                                                  */
/* ------------------------------------------------------------------ */

interface RawLbRow {
  ethAddress: string;
  accountValue: string;
  windowPerformances: [string, { pnl: string; roi: string; vlm: string }][];
  displayName?: string | null;
}

interface CompactLb {
  t: number;
  addrs: string[];
  names: [string, string][];
  av: number[];
  pnl: Record<string, number[]>;
  roi: Record<string, number[]>;
  vlm: Record<string, number[]>;
}

const WINDOWS = ["day", "week", "month", "allTime"] as const;

/**
 * Extract rows from the 37MB leaderboard text WITHOUT a whole-file
 * JSON.parse (that transient spike OOM-killed the server). Each row is
 * sliced out and parsed individually; the compact result is cached to
 * disk so boots never touch the big file at all.
 */
function extractCompactFromText(txt: string): CompactLb {
  const rowRe =
    /"ethAddress"\s*:\s*"(0x[0-9a-fA-F]{40})"[^{}]*?"accountValue"\s*:\s*"([-0-9.eE]+)"[^\[]*?(\[\s*[\s\S]*?\]\s*\])\s*,\s*"prize"\s*:\s*-?\d+(?:\s*,\s*"displayName"\s*:\s*(null|"(?:[^"\\]|\\.)*"))?/g;
  const addrs: string[] = [];
  const av: number[] = [];
  const names: [string, string][] = [];
  const pnl: Record<string, number[]> = { day: [], week: [], month: [], allTime: [] };
  const roi: Record<string, number[]> = { day: [], week: [], month: [], allTime: [] };
  const vlm: Record<string, number[]> = { day: [], week: [], month: [], allTime: [] };
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(txt)) !== null) {
    let wins: [string, { pnl: string; roi: string; vlm: string }][] = [];
    try {
      wins = JSON.parse(m[3]);
    } catch {
      continue;
    }
    const i = addrs.length;
    addrs.push(m[1].toLowerCase());
    av[i] = parseFloat(m[2]) || 0;
    if (m[4] && m[4] !== "null") {
      try {
        names.push([m[1].toLowerCase(), JSON.parse(m[4]) as string]);
      } catch {
        /* ignore */
      }
    }
    for (const [win, p] of wins) {
      if (win === "day" || win === "week" || win === "month" || win === "allTime") {
        pnl[win][i] = parseFloat(p.pnl) || 0;
        roi[win][i] = parseFloat(p.roi) || 0;
        vlm[win][i] = parseFloat(p.vlm) || 0;
      }
    }
  }
  return { t: Date.now(), addrs, names, av, pnl, roi, vlm };
}

async function downloadLeaderboard(): Promise<void> {
  const fs = await import("fs");
  const compactPath = `${CACHE_DIR}/lb-compact.json`;
  // 1) fresh compact cache -> tiny parse, no big-file touch
  try {
    const st = fs.statSync(compactPath);
    if (Date.now() - st.mtimeMs < LB_TTL) {
      const c = JSON.parse(fs.readFileSync(compactPath, "utf8")) as CompactLb;
      buildEngineFromCompact(c);
      return;
    }
  } catch {
    /* no compact cache */
  }
  // 2) download + stream-extract straight into compact (no whole-file
  //    JSON.parse and no row-object intermediates — both OOM the box)
  const res = await fetch(LEADERBOARD_URL, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  let txt = await res.text();
  let compact = extractCompactFromText(txt);
  const textBytes = txt.length;
  txt = ""; // release the 37MB string before we touch anything else
  if (compact.addrs.length < 1000) {
    // format drift — fall back to the heavy whole-file parse
    const parsed = (JSON.parse(txt || (await fetch(LEADERBOARD_URL).then((r) => r.text()))) as {
      leaderboardRows: RawLbRow[];
    }).leaderboardRows ?? [];
    compact = toCompact(
      parsed.map((r) => ({
        ethAddress: r.ethAddress.toLowerCase(),
        accountValue: r.accountValue,
        windowPerformances: r.windowPerformances,
      })),
      [],
    );
    for (const r of parsed) {
      if (r.displayName) compact.names.push([r.ethAddress.toLowerCase(), r.displayName]);
    }
  }
  void textBytes;
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(compactPath, JSON.stringify(compact));
  } catch {
    /* disk issue — keep going with memory */
  }
  buildEngineFromCompact(compact);
}

/** fallback compactor for the heavy-parse path */
function toCompact(rows: RawLbRow[], names: [string, string][]): CompactLb {
  const n = rows.length;
  const compact: CompactLb = {
    t: Date.now(),
    addrs: new Array(n),
    names,
    av: new Array(n),
    pnl: { day: [], week: [], month: [], allTime: [] },
    roi: { day: [], week: [], month: [], allTime: [] },
    vlm: { day: [], week: [], month: [], allTime: [] },
  };
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    compact.addrs[i] = r.ethAddress.toLowerCase();
    compact.av[i] = parseFloat(r.accountValue) || 0;
    for (const [win, p] of r.windowPerformances) {
      if (win === "day" || win === "week" || win === "month" || win === "allTime") {
        compact.pnl[win][i] = parseFloat(p.pnl) || 0;
        compact.roi[win][i] = parseFloat(p.roi) || 0;
        compact.vlm[win][i] = parseFloat(p.vlm) || 0;
      }
    }
  }
  return compact;
}

/** build engine straight from the compact structure (no row objects) */
function buildEngineFromCompact(c: CompactLb) {
  const e = eng();
  const n = c.addrs.length;
  e.addrs = c.addrs;
  e.names = new Map(c.names);
  e.av = Float64Array.from(c.av);
  for (const w of WINDOWS) {
    e.pnl[w] = Float64Array.from(c.pnl[w] ?? []);
    e.roi[w] = Float64Array.from(c.roi[w] ?? []);
    e.vlm[w] = Float64Array.from(c.vlm[w] ?? []);
  }
  e.idxByAddr = new Map();
  for (let i = 0; i < n; i++) e.idxByAddr.set(c.addrs[i], i);
  buildSortedIndexes(e, n);
  e.lbLoadedAt = Date.now();
}

function buildSortedIndexes(e: Engine, n: number) {
  e.sorted.clear();
  const sortKey = (label: string, get: (i: number) => number) => {
    const arr = new Array<number>(n);
    for (let i = 0; i < n; i++) arr[i] = i;
    arr.sort((a, b) => get(b) - get(a));
    e.sorted.set(label, Int32Array.from(arr));
  };
  for (const w of ["day", "week", "month", "allTime"] as const) {
    const P = e.pnl[w];
    const R = e.roi[w];
    const V = e.vlm[w];
    sortKey(`${w}:pnl`, (i) => P[i]);
    sortKey(`${w}:roi`, (i) => R[i]);
    sortKey(`${w}:vlm`, (i) => V[i]);
  }
  const AV = e.av;
  sortKey("av:av", (i) => AV[i]);
}


export async function ensureLeaderboard(): Promise<void> {
  const e = eng();
  if (e.lbLoadedAt && Date.now() - e.lbLoadedAt < LB_TTL) return;
  if (e.lbLoading) return e.lbLoading;
  e.lbLoading = (async () => {
    try {
      await downloadLeaderboard();
      console.log(`[tracker] leaderboard ready: ${eng().addrs.length} wallets`);
    } catch (err) {
      console.error("[tracker] leaderboard load failed", err);
      if (e.lbLoadedAt === 0) {
        // retry sooner on cold failure
        e.lbLoadedAt = Date.now() - LB_TTL + 20_000;
      }
    } finally {
      e.lbLoading = null;
    }
  })();
  return e.lbLoading;
}

/** start background loops (idempotent) */
export function ensureTrackerLoops() {
  const e = eng();
  if (!e.scanStarted) {
    e.scanStarted = true;
    setInterval(() => {
      void ensureLeaderboard().then(() => {
        if (!e.lbLoadedAt) return;
        void scanTick();
      });
    }, 800);
    setInterval(() => {
      void ensureLeaderboard().then(() => {
        if (!e.lbLoadedAt) return;
        void smartTick();
      });
    }, 1_400);
    // leaderboard background refresh
    setInterval(() => {
      void ensureLeaderboard();
    }, 60_000);
  }
}

/* ------------------------------------------------------------------ */
/* whale scanner                                                       */
/* ------------------------------------------------------------------ */

interface RawFill {
  coin: string;
  px: string;
  sz: string;
  side: "B" | "A";
  time: number;
  dir: string;
  closedPnl: string;
  hash: string;
  tid: number;
  crossed: boolean;
  fee: string;
}

const WHALE_FAST = 60; // fast lane (volume-ranked + best day/week PnL + tracked)
const WHALE_DEEP = 280; // total scanned wallets

function whaleWatchlist(): string[] {
  const e = eng();
  if (!e.addrs.length) return [];
  const idx = e.sorted.get("day:pnl");
  const wk = e.sorted.get("week:pnl");
  if (!idx) return [];
  const set = new Set<string>();
  const list: string[] = [];
  // user-tracked wallets always in the fast lane
  for (const w of e.watchlist) {
    if (!set.has(w)) {
      set.add(w);
      list.push(w);
    }
  }
  // only wallets that actually TRADE produce fills — skip vlm-0 vault/ecosystem rows
  const trades = (i: number) => e.vlm.day[i] > 50_000 || e.vlm.week[i] > 250_000;
  // activity-ranked lane: money flow follows VOLUME (active books) — half the fast lane
  const vlmIdx = e.sorted.get("day:vlm");
  let vi = 0;
  for (let i = 0; list.length < WHALE_FAST / 2 && vi < (vlmIdx?.length ?? 0); vi++) {
    const row = vlmIdx![vi];
    const addr = e.addrs[row];
    if (addr && !set.has(addr) && e.vlm.day[row] > 500_000) {
      set.add(addr);
      list.push(addr);
      i++;
    }
  }
  // fast lane: best day + best week PnL among traders, interleaved
  for (let i = 0; list.length < WHALE_FAST && i < idx.length; i++) {
    for (const arr of [idx, wk]) {
      if (!arr || list.length >= WHALE_FAST) continue;
      const row = arr[i % arr.length];
      const addr = e.addrs[row];
      if (addr && !set.has(addr) && trades(row)) {
        set.add(addr);
        list.push(addr);
      }
    }
  }
  // deep lane: wide net — interleave volume-ranked and pnl-ranked traders
  for (let i = 0; list.length < WHALE_DEEP && i < idx.length * 2; i++) {
    const vRow = vlmIdx?.[Math.floor(i / 2)];
    const pRow = idx[Math.floor(i / 2)];
    for (const row of i % 2 === 0 ? [vRow] : [pRow]) {
      if (row === undefined) continue;
      const addr = e.addrs[row];
      if (addr && !set.has(addr) && trades(row)) {
        set.add(addr);
        list.push(addr);
      }
    }
  }
  return list;
}

function emit(ev: WhaleEvent) {
  const e = eng();
  e.events.push(ev);
  if (e.events.length > 800) e.events.splice(0, e.events.length - 800);
  e.eventSeq++;
  if (e.subscribers.size) {
    for (const fn of e.subscribers) {
      try {
        fn([ev], false);
      } catch {
        /* ignore */
      }
    }
  }
}

function processFills(wallet: string, fills: RawFill[]) {
  const e = eng();
  const last = e.lastTid.get(wallet) ?? 0;
  let maxTid = last;
  const fresh: RawFill[] = [];
  for (const f of fills) {
    if (f.tid > maxTid) maxTid = f.tid;
    if (f.tid > last && Date.now() - f.time < 10 * 60_000) fresh.push(f);
  }
  e.lastTid.set(wallet, maxTid);
  if (!fresh.length) return;
  // HFT wallets can produce huge deltas — keep the 25 biggest fills per poll
  fresh.sort((a, b) => parseFloat(b.px) * parseFloat(b.sz) - parseFloat(a.px) * parseFloat(a.sz));
  const keep = fresh.slice(0, 25);
  const tracked = e.watchlist.includes(wallet);
  for (const f of keep) {
    const closing = f.dir.startsWith("Close") || f.dir.includes(">");
    emit({
      k: tracked ? "tracked" : "whale",
      w: wallet,
      coin: f.coin,
      side: f.side,
      px: parseFloat(f.px),
      sz: parseFloat(f.sz),
      usd: parseFloat(f.px) * parseFloat(f.sz),
      dir: f.dir,
      pnl: closing && f.closedPnl ? parseFloat(f.closedPnl) : null,
      t: f.time,
      taker: !!f.crossed,
      tid: f.tid,
    });
  }
}

async function scanTick() {
  const e = eng();
  const list = whaleWatchlist();
  if (!list.length) return;
  // one wallet per tick (~450ms) — ~2.2 req/s, well inside rate limits
  const wallet = list[e.scanCursor % list.length];
  e.scanCursor = (e.scanCursor + 1) % list.length;
  const fills = await fetchFills(wallet);
  if (fills && fills.length) processFills(wallet, fills);
}

async function fetchFills(wallet: string): Promise<RawFill[] | null> {
  try {
    const r = await info<RawFill[] | null>({ type: "userFills", user: wallet });
    return Array.isArray(r) ? r : null; // HL occasionally serves null under load
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* smart money aggregator                                              */
/* ------------------------------------------------------------------ */

interface AssetPos {
  position: {
    coin: string;
    szi: string;
    entryPx: string;
    marginUsed: string;
    positionValue: string;
    unrealizedPnl: string;
    returnOnEquity: string;
    leverage: { type: string; value: number };
    liquidationPx: string | null;
  };
  type: string;
}
interface ChState {
  marginSummary: { accountValue: string; totalMarginUsed: string };
  assetPositions: AssetPos[];
}

async function smartTick() {
  const e = eng();
  if (!e.addrs.length) return;
  // hold the finished snapshot for 100s before re-sampling
  if (e.smart.updatedAt && Date.now() - e.smart.updatedAt < 100_000) return;
  const idx = e.sorted.get("day:pnl");
  if (!idx) return;
  // snapshot top 100 day-PnL wallets in a rolling fashion (3 per tick)
  const coins = e.smart.coins;
  if (e.smart.smCursor === 0) {
    coins.clear();
  }
  for (let k = 0; k < 2; k++) {
    if (e.smart.smCursor >= 100) break;
    // walk the ranked list, skipping vault/ecosystem rows (no volume)
    const pos = e.smart.smCursor;
    let pick = -1;
    for (let i = pos; i < idx.length && i < pos + 400; i++) {
      const row = idx[i];
      if (e.vlm.day[row] > 50_000 || e.vlm.week[row] > 250_000) {
        pick = row;
        break;
      }
    }
    if (pick < 0) break;
    e.smart.smCursor = pos + 1;
    const wallet = e.addrs[pick];
    try {
      const st = await info<ChState>({ type: "clearinghouseState", user: wallet });
      for (const ap of st.assetPositions) {
        const p = ap.position;
        const szi = parseFloat(p.szi);
        const usd = parseFloat(p.positionValue);
        if (!usd || Math.abs(szi) < 1e-12) continue;
        let c = coins.get(p.coin);
        if (!c) {
          c = { longs: 0, shorts: 0, longUsd: 0, shortUsd: 0, top: [] };
          coins.set(p.coin, c);
        }
        if (szi > 0) {
          c.longs++;
          c.shortUsd += 0;
          c.longUsd += usd;
        } else {
          c.shorts++;
          c.shortUsd += usd;
        }
        c.top.push({ w: wallet, usd, szi });
      }
    } catch {
      /* skip */
    }
  }
  e.smart.smCursor += 2;
  if (e.smart.smCursor >= 100) {
    e.smart.smCursor = 0;
    e.smart.updatedAt = Date.now();
    for (const c of coins.values()) {
      c.top.sort((a, b) => b.usd - a.usd);
      c.top = c.top.slice(0, 5);
    }
  }
}

export function smartMoneySnapshot() {
  const e = eng();
  const coins = [...e.smart.coins.entries()]
    .filter(([, c]) => c.longUsd + c.shortUsd > 0)
    .map(([coin, c]) => ({
      coin,
      longs: c.longs,
      shorts: c.shorts,
      longUsd: c.longUsd,
      shortUsd: c.shortUsd,
      net: c.longUsd - c.shortUsd,
      top: c.top,
    }))
    .sort((a, b) => b.longUsd + b.shortUsd - (a.longUsd + a.shortUsd));
  return { updatedAt: e.smart.updatedAt, sampled: e.smart.smCursor, coins };
}

/* ------------------------------------------------------------------ */
/* leaderboard query                                                   */
/* ------------------------------------------------------------------ */

export function queryLeaderboard(q: LbQuery) {
  const e = eng();
  if (!e.addrs.length) return { total: 0, rows: [], ready: false };
  const label = q.sort === "av" ? "av:av" : `${q.window}:${q.sort}`;
  const idx = e.sorted.get(label) ?? e.sorted.get(`${q.window}:pnl`)!;
  const n = e.addrs.length;

  const pass = (i: number) => {
    if (q.minPnl !== undefined && e.pnl[q.window][i] < q.minPnl) return false;
    if (q.minAv !== undefined && e.av[i] < q.minAv) return false;
    if (q.minVlm !== undefined && e.vlm[q.window][i] < q.minVlm) return false;
    return true;
  };
  const query = q.q?.trim().toLowerCase() ?? "";
  const rows: {
    address: string;
    name: string | null;
    av: number;
    pnl: number;
    roi: number;
    vlm: number;
  }[] = [];

  if (!query) {
    // exact total in one typed-array pass (fast)
    let total = 0;
    if (q.minPnl !== undefined || q.minAv !== undefined || q.minVlm !== undefined) {
      for (let i = 0; i < n; i++) if (pass(i)) total++;
    } else {
      total = n;
    }
    let matched = 0;
    for (let k = 0; k < n && matched < q.offset + q.limit; k++) {
      const i = idx[k];
      if (!pass(i)) continue;
      if (matched >= q.offset) {
        const a = e.addrs[i];
        rows.push({
          address: a,
          name: e.names.get(a) ?? null,
          av: e.av[i],
          pnl: e.pnl[q.window][i],
          roi: e.roi[q.window][i],
          vlm: e.vlm[q.window][i],
        });
      }
      matched++;
    }
    return { total, rows, ready: true };
  }

  // search: scan all
  let total = 0;
  for (let k = 0; k < n; k++) {
    const i = idx[k];
    if (!pass(i)) continue;
    const a = e.addrs[i];
    const nm = e.names.get(a);
    if (!a.includes(query) && !(nm && nm.toLowerCase().includes(query))) continue;
    if (total >= q.offset && rows.length < q.limit) {
      rows.push({
        address: a,
        name: nm ?? null,
        av: e.av[i],
        pnl: e.pnl[q.window][i],
        roi: e.roi[q.window][i],
        vlm: e.vlm[q.window][i],
      });
    }
    total++;
  }
  return { total, rows, ready: true };
}

export function leaderboardRow(address: string) {
  const e = eng();
  const i = e.idxByAddr.get(address.toLowerCase());
  if (i === undefined) return null;
  const win = (w: "day" | "week" | "month" | "allTime") => ({
    pnl: e.pnl[w][i],
    roi: e.roi[w][i],
    vlm: e.vlm[w][i],
  });
  return {
    address: e.addrs[i],
    name: e.names.get(e.addrs[i]) ?? null,
    av: e.av[i],
    day: win("day"),
    week: win("week"),
    month: win("month"),
    allTime: win("allTime"),
  };
}

export function walletName(address: string) {
  return eng().names.get(address.toLowerCase()) ?? null;
}

/* ------------------------------------------------------------------ */
/* watchlist (user tracked wallets)                                    */
/* ------------------------------------------------------------------ */

export function setWatchlist(wallets: string[]) {
  const e = eng();
  const clean = wallets.filter((w) => /^0x[a-fA-F0-9]{40}$/.test(w)).map((w) => w.toLowerCase());
  e.watchlist = [...new Set(clean)];
  return e.watchlist.length;
}

export function getWatchlist() {
  return [...eng().watchlist];
}

export async function trackedSnapshot() {
  const e = eng();
  const list = [...e.watchlist];
  const now = Date.now();
  // blend the live event ring (scanner-provided fills) with a direct fetch —
  // HL's userFills intermittently serves [] / null for some wallets
  const fromEvents = new Map<string, { pnl24h: number; fills24h: number; lastActive: number }>();
  for (const ev of e.events) {
    if (now - ev.t > 24 * 3600_000) continue;
    const cur = fromEvents.get(ev.w) ?? { pnl24h: 0, fills24h: 0, lastActive: 0 };
    cur.fills24h++;
    if (ev.pnl) cur.pnl24h += ev.pnl;
    if (ev.t > cur.lastActive) cur.lastActive = ev.t;
    fromEvents.set(ev.w, cur);
  }
  const out = await Promise.all(
    list.map(async (wallet) => {
      try {
        const [fills, st] = await Promise.all([
          info<RawFill[] | null>({ type: "userFills", user: wallet }).catch(() => null),
          info<ChState>({ type: "clearinghouseState", user: wallet }).catch(() => null),
        ]);
        let pnl24h = 0;
        let fills24h = 0;
        let lastActive = 0;
        const seen = new Set<number>();
        if (Array.isArray(fills)) {
          for (const f of fills) {
            if (now - f.time >= 24 * 3600_000) continue;
            seen.add(f.tid);
            fills24h++;
            pnl24h += parseFloat(f.closedPnl) || 0;
            if (f.time > lastActive) lastActive = f.time;
          }
        }
        const evRow = fromEvents.get(wallet);
        // if the direct fetch came back empty (flaky endpoint), use scanner-derived stats
        if (fills24h === 0 && evRow) {
          pnl24h = evRow.pnl24h;
          fills24h = evRow.fills24h;
        }
        if (evRow && evRow.lastActive > lastActive) lastActive = evRow.lastActive;
        void seen;
        const lb = leaderboardRow(wallet);
        const cached = e.trackedCache.get(wallet);
        const row = {
          address: wallet,
          name: e.names.get(wallet) ?? null,
          av: st ? parseFloat(st.marginSummary.accountValue) : (cached?.av ?? 0),
          lastActive: lastActive || (cached?.lastActive ?? 0),
          pnl24h,
          fills24h,
          positions: st ? st.assetPositions.length : (cached?.positions ?? 0),
          dayPnl: lb ? lb.day.pnl : null,
        };
        e.trackedCache.set(wallet, { ...row, at: now });
        return row;
      } catch {
        return null;
      }
    }),
  );
  return out.filter((r) => r !== null) as NonNullable<(typeof out)[number]>[];
}

/* ------------------------------------------------------------------ */
/* wallet profile                                                      */
/* ------------------------------------------------------------------ */

interface PortfolioResp {
  accountValueHistory: [number, string][];
  pnlHistory: [number, string][];
}

export async function walletProfile(address: string) {
  const wallet = address.toLowerCase();
  const [lb, portfolio, state, openOrders, fills] = await Promise.all([
    Promise.resolve(leaderboardRow(wallet)),
    info<[string, PortfolioResp][]>({ type: "portfolio", user: wallet }).catch(() => [] as [string, PortfolioResp][]),
    info<ChState>({ type: "clearinghouseState", user: wallet }).catch(() => null),
    info<{ coin: string; isPositionTpsl: boolean; limitPx: string; origSz: string; sz: string; side: string; timestamp: number }[]>(
      { type: "openOrders", user: wallet },
    ).catch(() => [] as { coin: string; isPositionTpsl: boolean; limitPx: string; origSz: string; sz: string; side: string; timestamp: number }[]),
    info<RawFill[]>({ type: "userFills", user: wallet }).catch(() => [] as RawFill[]),
  ]);

  // derived stats from fills (real, per-trade)
  let wins = 0;
  let losses = 0;
  let realized = 0;
  let volume = 0;
  let fees = 0;
  let biggestWin = 0;
  let biggestLoss = 0;
  let sumWin = 0;
  let sumLoss = 0;
  let longs = 0;
  let shorts = 0;
  const coinAgg = new Map<string, { trades: number; vol: number; pnl: number }>();
  const bigTrades: {
    coin: string;
    px: number;
    sz: number;
    usd: number;
    side: "B" | "A";
    dir: string;
    pnl: number | null;
    t: number;
  }[] = [];
  for (const f of fills) {
    const px = parseFloat(f.px);
    const sz = parseFloat(f.sz);
    const usd = px * sz;
    volume += usd;
    fees += Math.abs(parseFloat(f.fee) || 0);
    if (f.side === "B") longs++;
    else shorts++;
    const pnl = parseFloat(f.closedPnl) || 0;
    if (pnl !== 0 || f.dir.startsWith("Close")) {
      realized += pnl;
      if (pnl > 0) {
        wins++;
        sumWin += pnl;
        if (pnl > biggestWin) biggestWin = pnl;
      } else if (pnl < 0) {
        losses++;
        sumLoss += pnl;
        if (pnl < biggestLoss) biggestLoss = pnl;
      }
    }
    let ca = coinAgg.get(f.coin);
    if (!ca) {
      ca = { trades: 0, vol: 0, pnl: 0 };
      coinAgg.set(f.coin, ca);
    }
    ca.trades++;
    ca.vol += usd;
    ca.pnl += pnl;
    bigTrades.push({
      coin: f.coin,
      px,
      sz,
      usd,
      side: f.side,
      dir: f.dir,
      pnl: parseFloat(f.closedPnl) || null,
      t: f.time,
    });
  }
  bigTrades.sort((a, b) => b.usd - a.usd);
  const closedTrades = wins + losses;

  const positions =
    state?.assetPositions.map((ap) => ({
      coin: ap.position.coin,
      szi: parseFloat(ap.position.szi),
      entryPx: parseFloat(ap.position.entryPx),
      value: parseFloat(ap.position.positionValue),
      unrealizedPnl: parseFloat(ap.position.unrealizedPnl),
      roe: parseFloat(ap.position.returnOnEquity),
      lev: ap.position.leverage.value,
      levType: ap.position.leverage.type,
      liqPx: ap.position.liquidationPx ? parseFloat(ap.position.liquidationPx) : null,
      marginUsed: parseFloat(ap.position.marginUsed),
    })) ?? [];

  const portfolioObj: Record<string, { av: [number, number][]; pnl: [number, number][] }> = {};
  for (const [win, data] of portfolio) {
    portfolioObj[win] = {
      av: (data.accountValueHistory ?? []).map(([t, v]) => [t, parseFloat(v)] as [number, number]),
      pnl: (data.pnlHistory ?? []).map(([t, v]) => [t, parseFloat(v)] as [number, number]),
    };
  }

  return {
    address: wallet,
    name: lb?.name ?? eng().names.get(wallet) ?? null,
    lb,
    portfolio: portfolioObj,
    state: state
      ? {
          accountValue: parseFloat(state.marginSummary.accountValue),
          marginUsed: parseFloat(state.marginSummary.totalMarginUsed),
          positions,
        }
      : null,
    openOrders,
    fills: fills.slice(0, 300),
    stats: {
      closedTrades,
      wins,
      losses,
      winRate: closedTrades ? wins / closedTrades : null,
      realized,
      volume,
      fees,
      biggestWin,
      biggestLoss,
      avgWin: wins ? sumWin / wins : 0,
      avgLoss: losses ? sumLoss / losses : 0,
      longs,
      shorts,
      coins: [...coinAgg.entries()]
        .map(([coin, c]) => ({ coin, ...c }))
        .sort((a, b) => b.vol - a.vol)
        .slice(0, 12),
    },
    bigTrades: bigTrades.slice(0, 25),
  };
}

/* ------------------------------------------------------------------ */
/* event feed access                                                   */
/* ------------------------------------------------------------------ */

export function recentEvents(limit = 250) {
  return eng().events.slice(-limit);
}

export function subscribeEvents(fn: (evs: WhaleEvent[], snapshot: boolean) => void) {
  const e = eng();
  e.subscribers.add(fn);
  return () => {
    e.subscribers.delete(fn);
  };
}
