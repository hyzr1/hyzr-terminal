/**
 * Single multiplexed WebSocket to wss://api.hyperliquid.xyz/ws
 * - ref-counted subscriptions (many components can subscribe to the same channel)
 * - auto reconnect with backoff + replay of active subscriptions
 * - micro-latency: messages are demuxed synchronously, no polling involved
 */
import type { Book, Candle, Interval, Trade } from "./types";

export type HLSubscription =
  | { type: "allMids" }
  | { type: "l2Book"; coin: string }
  | { type: "trades"; coin: string }
  | { type: "candle"; coin: string; interval: Interval }
  | { type: "activeAssetCtx"; coin: string; dex?: string | null }
  | { type: "webData2"; user: string };

type Handler = (data: unknown) => void;
type Channel =
  | "allMids"
  | "l2Book"
  | "trades"
  | "candle"
  | "activeAssetCtx"
  | "webData2";

function subKey(s: HLSubscription): string {
  switch (s.type) {
    case "allMids": return "allMids";
    case "l2Book": return `l2Book:${s.coin}`;
    case "trades": return `trades:${s.coin}`;
    case "candle": return `candle:${s.coin}:${s.interval}`;
    case "activeAssetCtx": return `activeAssetCtx:${s.dex ?? ""}:${s.coin}`;
    case "webData2": return `webData2:${s.user}`;
  }
}

function channelOf(m: { channel?: string; data?: unknown }): Channel | null {
  switch (m.channel) {
    case "allMids":
    case "l2Book":
    case "trades":
    case "candle":
    case "activeAssetCtx":
    case "webData2":
      return m.channel;
    default:
      return null;
  }
}

class HLWebSocket {
  private ws: WebSocket | null = null;
  private subs = new Map<string, { sub: HLSubscription; handlers: Set<Handler> }>();
  private statusHandlers = new Set<(s: HLStatus) => void>();
  private retry = 0;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private queued: HLSubscription[] = [];
  private aliveTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private lastMsgAt = 0;
  status: HLStatus = "connecting";

  onStatus(cb: (s: HLStatus) => void) {
    this.statusHandlers.add(cb);
    cb(this.status);
    return () => this.statusHandlers.delete(cb);
  }

  private setStatus(s: HLStatus) {
    if (this.status === s) return;
    this.status = s;
    this.statusHandlers.forEach((cb) => cb(s));
  }

  subscribe(sub: HLSubscription, handler: Handler): () => void {
    const key = subKey(sub);
    let entry = this.subs.get(key);
    if (!entry) {
      entry = { sub, handlers: new Set() };
      this.subs.set(key, entry);
      this.sendOrQueue({ method: "subscribe", subscription: sub });
    }
    entry.handlers.add(handler);
    return () => {
      const e = this.subs.get(key);
      if (!e) return;
      e.handlers.delete(handler);
      if (e.handlers.size === 0) {
        this.subs.delete(key);
        this.sendOrQueue({ method: "unsubscribe", subscription: sub });
      }
    };
  }

  private sendOrQueue(msg: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      if (msg.method === "subscribe") this.queued.push(msg.subscription as unknown as HLSubscription);
      this.ensureConnected();
    }
  }

  ensureConnected() {
    if (typeof window === "undefined") return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    if (this.connectTimer) return;
    this.setStatus("connecting");
    try {
      const ws = new WebSocket("wss://api.hyperliquid.xyz/ws");
      this.ws = ws;
      ws.onopen = () => {
        this.retry = 0;
        this.lastMsgAt = Date.now();
        this.setStatus("live");
        // (re)subscribe everything active
        this.subs.forEach((e) => this.ws!.send(JSON.stringify({ method: "subscribe", subscription: e.sub })));
        for (const s of this.queued.splice(0)) {
          this.ws!.send(JSON.stringify({ method: "subscribe", subscription: s }));
        }
        // keep-alive ping
        if (this.aliveTimer) clearInterval(this.aliveTimer);
        this.aliveTimer = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ method: "ping" }));
        }, 30_000);
        // staleness watchdog — if the stream goes quiet >12s while "live",
        // force a reconnect so prices NEVER freeze
        if (this.watchdogTimer) clearInterval(this.watchdogTimer);
        this.watchdogTimer = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN && Date.now() - this.lastMsgAt > 12_000) {
            try { this.ws.close(); } catch { /* reconnect via onclose */ }
          }
        }, 4_000);
      };
      ws.onmessage = (ev) => {
        let m: { channel?: string; data?: unknown };
        try { m = JSON.parse(ev.data as string); } catch { return; }
        this.lastMsgAt = Date.now();
        const ch = channelOf(m);
        if (!ch) return;
        if (ch === "l2Book") {
          const d = m.data as { coin: string; time: number; levels: [[{ px: string; sz: string; n: number }], [{ px: string; sz: string; n: number }]] };
          const book: Book = {
            coin: d.coin,
            time: d.time,
            bids: d.levels[0].map((l) => ({ px: +l.px, sz: +l.sz, n: l.n })),
            asks: d.levels[1].map((l) => ({ px: +l.px, sz: +l.sz, n: l.n })),
          };
          this.dispatch(`l2Book:${book.coin}`, book);
        } else if (ch === "trades") {
          const arr = m.data as Array<{ coin: string; side: "B" | "A"; px: string; sz: string; time: number; tid: number }>;
          for (const t of arr) {
            this.dispatch(`trades:${t.coin}`, { ...t, px: +t.px, sz: +t.sz } as Trade);
          }
        } else if (ch === "candle") {
          const d = m.data as { t: number; o: string; c: string; h: string; l: string; v: string; s: string; i: string };
          // symbol is "<coin>-<interval>" — split at the LAST hyphen so dex
          // names like "xyz:GOLD-5m" keep their full coin key
          const sep = d.s.lastIndexOf("-");
          const coin = sep > 0 ? d.s.slice(0, sep) : d.s;
          const interval = sep > 0 ? d.s.slice(sep + 1) : d.i;
          const candle: Candle = {
            time: Math.floor(d.t / 1000),
            open: +d.o, high: +d.h, low: +d.l, close: +d.c, volume: +d.v,
          };
          this.lastMsgAt = Date.now();
          this.dispatch(`candle:${coin}:${interval}`, candle);
        } else if (ch === "allMids") {
          const d = m.data as { mids: Record<string, string> } | Record<string, string>;
          const mids = (d as { mids?: Record<string, string> }).mids ?? (d as Record<string, string>);
          const out: Record<string, number> = {};
          for (const [k, v] of Object.entries(mids)) out[k] = +v;
          this.dispatch("allMids", out);
        } else if (ch === "activeAssetCtx") {
          this.dispatch(`activeAssetCtx:${(m.data as { coin: string }).coin}`, m.data);
        } else if (ch === "webData2") {
          this.dispatch(`webData2:${(m.data as { user?: string }).user ?? "*"}`, m.data);
        }
      };
      ws.onclose = () => {
        this.setStatus("down");
        this.ws = null;
        if (this.watchdogTimer) { clearInterval(this.watchdogTimer); this.watchdogTimer = null; }
        this.scheduleReconnect();
      };
      ws.onerror = () => {
        try { ws.close(); } catch { /* noop */ }
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.connectTimer || this.subs.size === 0) return;
    const delay = Math.min(500 * Math.pow(2, this.retry++), 5_000);
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      this.ensureConnected();
    }, delay);
  }

  private dispatch(key: string, data: unknown) {
    const e = this.subs.get(key);
    if (e) e.handlers.forEach((h) => h(data));
  }
}

export type HLStatus = "connecting" | "live" | "down";

/** Global singleton (client side only). */
export const hlWs: HLWebSocket =
  ((globalThis as unknown as { __hlWs?: HLWebSocket }).__hlWs ??= new HLWebSocket());
