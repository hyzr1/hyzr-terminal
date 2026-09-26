import { NextRequest } from "next/server";
import { ensureTrackerLoops, recentEvents, subscribeEvents } from "@/lib/tracker/tracker-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/tracker/stream — SSE live money-flow (whale + tracked wallet events). */
export async function GET(req: NextRequest) {
  ensureTrackerLoops();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // snapshot of recent events on connect (client filters by size/coin)
      send({ type: "snapshot", events: recentEvents(220) });

      const pending: unknown[] = [];
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const unsub = subscribeEvents((evs) => {
        pending.push(...evs);
        if (flushTimer) return;
        flushTimer = setTimeout(() => {
          flushTimer = null;
          if (closed || !pending.length) return;
          const batch = pending.splice(0, pending.length);
          send({ type: "events", events: batch });
        }, 400);
      });

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
        if (flushTimer) clearTimeout(flushTimer);
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
