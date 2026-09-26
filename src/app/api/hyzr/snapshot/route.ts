import {
  marketsFeedSnapshot,
  marketsFeedStart,
} from "@/lib/markets-live-server";
import type { LiveSnapshot } from "@/lib/hyzr-live-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Plain-JSON snapshot of the markets board — polling fallback for clients
 * whose proxy/gateway buffers or blocks SSE. Same payload as the stream.
 */
export async function GET() {
  marketsFeedStart();
  const snap: LiveSnapshot | null = marketsFeedSnapshot();
  return Response.json(snap, {
    headers: { "Cache-Control": "no-store" },
  });
}
