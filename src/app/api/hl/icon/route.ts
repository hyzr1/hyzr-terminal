/**
 * Same-origin proxy for perp logos (app.hyperliquid.xyz/coins/*).
 * Resolution order: in-memory cache -> on-disk cache -> pre-seeded static
 * copies under public/icons/hl -> upstream (3s timeout, validated SVG).
 * Static files (public/) are also served directly by Next for the seeded
 * universe, so this route is only a backstop for coins outside the seed.
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

const CACHE_DIR = path.join(process.cwd(), ".hl-icon-cache");
const LOCAL_DIR = path.join(process.cwd(), "public", "icons", "hl");
const UPSTREAM = "https://app.hyperliquid.xyz/coins";

type Entry = { buf: Buffer; at: number };
const MEM = new Map<string, Entry>();
const MEM_MAX = 600;
const INFLIGHT = new Map<string, Promise<Entry | null>>();

function memPut(key: string, e: Entry) {
  if (MEM.size >= MEM_MAX) {
    let n = 0;
    for (const k of MEM.keys()) {
      MEM.delete(k);
      if (++n >= MEM_MAX / 4) break;
    }
  }
  MEM.set(key, e);
}

async function readDisk(key: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(CACHE_DIR, key));
  } catch {
    return null;
  }
}

async function writeDisk(key: string, buf: Buffer) {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(path.join(CACHE_DIR, key), buf);
  } catch { /* best effort */ }
}

function isSvg(buf: Buffer): boolean {
  const head = buf.subarray(0, 300).toString("utf8").toLowerCase();
  return head.includes("<svg") || head.startsWith("<?xml");
}

async function tryFetch(url: string): Promise<Entry | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; HyzrBot/1.0)" },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 2_000_000) return null;
    if (!isSvg(buf)) return null; // SPA HTML fallback -> treat as missing
    return { buf, at: Date.now() };
  } catch {
    return null;
  }
}

function svgResponse(buf: Buffer): NextResponse {
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}

export async function GET(req: NextRequest) {
  const coin = (req.nextUrl.searchParams.get("c") ?? "").slice(0, 40);
  // "@" = HL spot-pair ids (@107) — accepted so we return a clean 404 instead
  // of a console-noisy 400 (the client renders its letter badge for them).
  if (!coin || !/^[A-Za-z0-9:@_%-]+$/.test(coin)) {
    return new NextResponse("bad coin", { status: 400 });
  }
  const key = crypto.createHash("sha1").update(coin).digest("hex").slice(0, 24) + ".svg";

  // 1) memory
  const mem = MEM.get(key);
  if (mem) {
    mem.at = Date.now();
    return svgResponse(mem.buf);
  }

  // 2) disk
  const cached = await readDisk(key);
  if (cached) {
    const e = { buf: cached, at: Date.now() };
    memPut(key, e);
    return svgResponse(e.buf);
  }

  // 3) pre-seeded static copy (public/icons/hl/<BASE>.svg)
  const decoded = decodeURIComponent(coin);
  const base = decoded.includes(":") ? decoded.split(":")[1] : decoded;
  try {
    const local = await fs.readFile(path.join(LOCAL_DIR, `${base}.svg`));
    if (isSvg(local)) {
      const e = { buf: local, at: Date.now() };
      memPut(key, e);
      await writeDisk(key, e.buf);
      return svgResponse(e.buf);
    }
  } catch { /* not seeded */ }

  // 4) upstream (deduped)
  const inflight = INFLIGHT.get(key);
  if (inflight) {
    const got = await inflight;
    return got ? svgResponse(got.buf) : new NextResponse("not found", { status: 404 });
  }
  const task = (async (): Promise<Entry | null> => {
    const full = `${UPSTREAM}/${encodeURIComponent(decoded)}.svg`;
    const bare = decoded.includes(":")
      ? `${UPSTREAM}/${encodeURIComponent(decoded.split(":")[1])}.svg`
      : full;
    const candidates = decoded.includes(":") ? [full, bare] : [bare, full];
    for (const url of candidates) {
      const got = await tryFetch(url);
      if (got) {
        memPut(key, got);
        await writeDisk(key, got.buf);
        return got;
      }
    }
    return null;
  })();
  INFLIGHT.set(key, task);
  // rejection-safe eviction (a failed task must not surface as an
  // unhandledRejection; callers awaiting `task` still see the error)
  task.catch(() => undefined).finally(() => INFLIGHT.delete(key));

  const got = await task;
  return got ? svgResponse(got.buf) : new NextResponse("not found", { status: 404 });
}
