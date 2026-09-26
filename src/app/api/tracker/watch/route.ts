import { NextRequest, NextResponse } from "next/server";
import { ensureTrackerLoops, getWatchlist, setWatchlist, trackedSnapshot } from "@/lib/tracker/tracker-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/tracker/watch — enriched snapshot of the user's tracked wallets. */
export async function GET() {
  ensureTrackerLoops();
  const wallets = getWatchlist();
  if (!wallets.length) return NextResponse.json({ wallets: [] });
  const snap = await trackedSnapshot();
  return NextResponse.json({ wallets: snap });
}

/** POST /api/tracker/watch { wallets: [...] } — set the tracked list (added to scan lanes). */
export async function POST(req: NextRequest) {
  ensureTrackerLoops();
  const body = (await req.json().catch(() => ({}))) as { wallets?: string[] };
  const count = setWatchlist(Array.isArray(body.wallets) ? body.wallets : []);
  return NextResponse.json({ ok: true, count });
}
