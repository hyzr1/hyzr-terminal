/**
 * Server-side Hyperliquid info proxy with TTL caching + request shaping.
 *
 * Why: the browser used to hit api.hyperliquid.xyz directly. Page loads fired
 * 12+ concurrent heavy `metaAndAssetCtxs` calls (main + every builder dex) and
 * the app keeps several polling loops alive — Hyperliquid rate-limits by IP,
 * so real users got 429s and the chart/header values silently never loaded.
 *
 * This proxy:
 *  · serves each unique info payload from a TTL cache (type-aware TTLs)
 *  · single-flights concurrent requests for the same payload
 *  · serializes upstream calls with a small min-gap (no burst → no 429)
 *  · on upstream 429 serves stale-if-available, else backs off globally
 */
import { NextResponse } from "next/server";
import { HL_MAINNET, HL_TESTNET } from "@/lib/hyperliquid/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Entry { t: number; p: unknown; ok: boolean }

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 400;

let chain: Promise<unknown> = Promise.resolve();
let lastStart = 0;
let cooldownUntil = 0;
const MIN_GAP_MS = 110;

function ttlFor(body: Record<string, unknown>): number {
  const type = String(body.type ?? "");
  if (type === "allMids") return 1_000;
  if (type === "l2Book") return 700;
  if (type === "candleSnapshot") return 2_000;
  if (type === "metaAndAssetCtxs") return 3_000;
  if (type === "perpDexs") return 60_000;
  if (type === "meta") return 30_000;
  return 1_500;
}

function prune() {
  if (cache.size <= MAX_ENTRIES) return;
  const keys = [...cache.keys()].slice(0, cache.size - MAX_ENTRIES);
  for (const k of keys) cache.delete(k);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function upstream(base: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${base}/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (res.status === 429) {
    cooldownUntil = Date.now() + 4_000; // brief global cool-down
    throw Object.assign(new Error("HL 429"), { status: 429 });
  }
  if (!res.ok) throw Object.assign(new Error(`HL ${res.status}`), { status: res.status });
  return res.json();
}

/** Serialized upstream execution: never more than one in-flight HL call, min gap. */
function scheduled<T>(fn: () => Promise<T>): Promise<T> {
  const run = (chain as Promise<unknown>).then(async () => {
    const wait = Math.max(0, lastStart + MIN_GAP_MS - Date.now());
    const cd = cooldownUntil - Date.now();
    if (cd > 0) await sleep(Math.min(cd, 2_000));
    if (wait > 0) await sleep(wait);
    lastStart = Date.now();
    return fn();
  }) as Promise<T>;
  chain = run.catch(() => undefined);
  return run;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const testnet = body.__testnet === true;
  delete body.__testnet;
  const base = testnet ? HL_TESTNET : HL_MAINNET;
  const key = `${testnet ? "T" : "M"}|${JSON.stringify(body)}`;
  const ttl = ttlFor(body);

  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl && hit.ok) {
    return NextResponse.json(hit.p as object);
  }

  let p = inflight.get(key);
  if (!p) {
    p = scheduled(() => upstream(base, body)) as Promise<unknown>;
    inflight.set(key, p);
    // attach the rejection branch FIRST so the derived finally-promise can
    // never surface an unhandledRejection when upstream 429s
    p.catch(() => undefined).finally(() => inflight.delete(key));
  }

  try {
    const data = await p;
    cache.set(key, { t: Date.now(), p: data, ok: true });
    prune();
    return NextResponse.json(data as object);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 502;
    // stale-if-available beats a hard failure for the UI
    if (hit) return NextResponse.json(hit.p as object);
    // Cold cache + upstream 429: retry INSIDE the serialized queue after the
    // global cool-down instead of propagating the 429 to the browser (the UI
    // would flash "--" and log a console error). Bounded: one extra attempt.
    if (status === 429) {
      try {
        const data = await scheduled(async () => {
          const cd = cooldownUntil - Date.now();
          if (cd > 0) await sleep(Math.min(cd, 2_500));
          return upstream(base, body);
        });
        cache.set(key, { t: Date.now(), p: data, ok: true });
        prune();
        return NextResponse.json(data as object);
      } catch {
        // fall through to the error response below — client also backs off
      }
    }
    return NextResponse.json(
      { error: "upstream", status },
      { status: status === 429 ? 429 : 502 },
    );
  }
}
