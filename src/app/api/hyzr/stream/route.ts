import { NextRequest } from "next/server";
import {
  marketsFeedSnapshot,
  marketsFeedStart,
  marketsFeedSubscribe,
} from "@/lib/markets-live-server";
import type { LiveSnapshot } from "@/lib/hyzr-live-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server-Sent Events stream of the cross-asset markets board (~1 push/1.5s). */
export async function GET(req: NextRequest) {
  marketsFeedStart();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (snap: LiveSnapshot | null) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(snap)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      // initial payload (may be null while the first poll is in flight)
      send(marketsFeedSnapshot());

      const unsub = marketsFeedSubscribe((snap) => send(snap));

      // heartbeat keeps proxies from closing the connection
      const hb = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ka\n\n"));
        } catch {
          closed = true;
        }
      }, 15_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(hb);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
