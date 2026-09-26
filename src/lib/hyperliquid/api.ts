/**
 * Hyperliquid REST client.
 * Public info endpoint — CORS is enabled (access-control-allow-origin: *)
 * so the browser talks to it directly = lowest possible latency.
 */
import type { AssetCtx, Book, Candle, Interval, PerpMeta } from "./types";

export const HL_MAINNET = "https://api.hyperliquid.xyz";
export const HL_TESTNET = "https://api.hyperliquid-testnet.xyz";

export function hlBase(testnet: boolean) {
  return testnet ? HL_TESTNET : HL_MAINNET;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function hlInfo<T>(body: Record<string, unknown>, testnet = false): Promise<T> {
  /**
   * Goes through our own /api/hl/info proxy (TTL cache + serialized upstream
   * calls + server-side 429 retry). Direct-from-browser fan-out (12+
   * metaAndAssetCtxs on page load plus the polling loops) was tripping
   * Hyperliquid's per-IP rate limit (429) and leaving the chart + header
   * values stuck on "--".
   *
   * Bounded client backoff on 429/5xx: the proxy almost never errors now, but
   * if it does (rate-limit storm, cold start) we retry twice with growing
   * delays instead of throwing once and flashing "--".
   */
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("/api/hl/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testnet ? { ...body, __testnet: true } : body),
        cache: "no-store",
      });
      if (!res.ok) {
        if (res.status !== 429 && res.status < 500) throw new Error(`HL info ${res.status}`);
        throw Object.assign(new Error(`HL info ${res.status}`), { retryable: true });
      }
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e as Error;
      if (!(lastErr as { retryable?: boolean }).retryable || attempt === 2) break;
      await sleep(1_200 * (attempt + 1)); // 1.2s, 2.4s — bounded, no hot loop
    }
  }
  throw lastErr ?? new Error("HL info failed");
}

export async function fetchMetaAndCtxs(testnet = false) {
  return hlInfo<[{ universe: PerpMeta[] }, AssetCtx[]]>(
    { type: "metaAndAssetCtxs" },
    testnet,
  );
}

/** builder-deployed perp dexes ("xyz", "flx", …) — stocks / gold / indices live here */
export async function fetchPerpDexs(testnet = false): Promise<Array<{ name: string; fullName?: string } | null>> {
  return hlInfo<Array<{ name: string; fullName?: string } | null>>({ type: "perpDexs" }, testnet);
}

export async function fetchMetaAndCtxsDex(dex: string, testnet = false) {
  return hlInfo<[{ universe: PerpMeta[] }, AssetCtx[]]>(
    { type: "metaAndAssetCtxs", dex },
    testnet,
  );
}

export async function fetchCandles(
  coin: string,
  interval: Interval,
  startTime: number,
  endTime?: number,
  testnet = false,
): Promise<Candle[]> {
  const raw = await hlInfo<Array<{
    t: number; T: number; s: string; i: string;
    o: string; c: string; h: string; l: string; v: string; n: number;
  }>>(
    {
      type: "candleSnapshot",
      req: { coin, interval, startTime, endTime: endTime ?? Date.now() },
    },
    testnet,
  );
  return raw
    .map((r) => ({
      time: Math.floor(r.t / 1000),
      open: +r.o,
      high: +r.h,
      low: +r.l,
      close: +r.c,
      volume: +r.v,
    }))
    .sort((a, b) => a.time - b.time);
}

export async function fetchBook(coin: string, testnet = false): Promise<Book> {
  const raw = await hlInfo<{ coin: string; time: number; levels: [[{ px: string; sz: string; n: number }], [{ px: string; sz: string; n: number }]] }>(
    { type: "l2Book", coin },
    testnet,
  );
  return {
    coin,
    time: raw.time,
    bids: raw.levels[0].map((l) => ({ px: +l.px, sz: +l.sz, n: l.n })),
    asks: raw.levels[1].map((l) => ({ px: +l.px, sz: +l.sz, n: l.n })),
  };
}

/** REST snapshot of all mid prices (fallback when the WS is unavailable). */
export async function fetchAllMids(testnet = false): Promise<Record<string, number>> {
  const raw = await hlInfo<Record<string, string>>({ type: "allMids" }, testnet);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = +v;
  return out;
}

/** Place a signed exchange action (live mode). */
export async function hlExchange(payload: Record<string, unknown>, testnet = false) {
  const res = await fetch(`${hlBase(testnet)}/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.response ?? `HL exchange ${res.status}`);
  return json;
}
