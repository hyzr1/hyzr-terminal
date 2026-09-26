import { NextRequest, NextResponse } from "next/server";
import { ensureLeaderboard, ensureTrackerLoops, queryLeaderboard } from "@/lib/tracker/tracker-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/tracker/leaderboard — ranked wallet universe (real HL leaderboard). */
export async function GET(req: NextRequest) {
  ensureTrackerLoops();
  await ensureLeaderboard();
  const sp = req.nextUrl.searchParams;
  const num = (k: string) => {
    const v = sp.get(k);
    return v === null || v === "" ? undefined : parseFloat(v);
  };
  const res = queryLeaderboard({
    window: (sp.get("window") as "day" | "week" | "month" | "allTime") ?? "day",
    sort: (sp.get("sort") as "pnl" | "roi" | "vlm" | "av") ?? "pnl",
    minPnl: num("minPnl"),
    minAv: num("minAv"),
    minVlm: num("minVlm"),
    q: sp.get("q") ?? undefined,
    limit: Math.min(parseInt(sp.get("limit") ?? "50", 10) || 50, 200),
    offset: Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0),
  });
  return NextResponse.json(res);
}
