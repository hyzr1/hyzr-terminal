import { NextResponse } from "next/server";
import { ensureTrackerLoops, smartMoneySnapshot } from "@/lib/tracker/tracker-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/tracker/smartmoney — per-coin positioning among the top 100 wallets. */
export async function GET() {
  ensureTrackerLoops();
  return NextResponse.json(smartMoneySnapshot());
}
