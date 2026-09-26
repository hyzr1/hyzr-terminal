import { NextRequest, NextResponse } from "next/server";
import { ensureTrackerLoops, walletProfile } from "@/lib/tracker/tracker-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 30_000;

/** GET /api/tracker/wallet?address=0x.. — full wallet analysis bundle. */
export async function GET(req: NextRequest) {
  ensureTrackerLoops();
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase() ?? "";
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  const hit = cache.get(address);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.data);
  try {
    const data = await walletProfile(address);
    cache.set(address, { at: Date.now(), data });
    if (cache.size > 300) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 100);
      for (const [k] of oldest) cache.delete(k);
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("[tracker] wallet profile failed", err);
    return NextResponse.json({ error: "profile failed" }, { status: 502 });
  }
}
