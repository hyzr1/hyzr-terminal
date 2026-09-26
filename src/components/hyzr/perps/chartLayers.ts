"use client";
/**
 * Chart drawing engine for the Perpetuals terminal (TradingView-style tools).
 *
 * Drawings are anchored to (logical bar index, price) pairs so they survive
 * pan/zoom/live-bar updates, rendered onto a 2D-canvas overlay above the
 * lightweight-charts pane, and persisted per symbol|interval in localStorage.
 */

import type { IChartApi, ISeriesApi } from "lightweight-charts";

export type DrawKind =
  | "trend"
  | "horz"
  | "fib"
  | "brush"
  | "text"
  | "sticker"
  | "measure";

export interface DrawPoint {
  lp: number; // logical bar index (float — sub-bar positioning allowed)
  price: number;
}

export interface Drawing {
  id: string;
  kind: DrawKind;
  points: DrawPoint[];
  text?: string;
  emoji?: string;
  color?: string;
  locked?: boolean;
}

/* ------------------------------ persistence ------------------------------ */

const LS_KEY = "hyzr-drawings-v1";
type Store = Record<string, Drawing[]>; // key = `${coin}|${interval}`

export function loadDrawingStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LS_KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

export function saveDrawingStore(s: Store) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* private mode — session-only drawings */
  }
}

export const drawKey = (coin: string, interval: string) => `${coin}|${interval}`;

/* -------------------------------- colors --------------------------------- */

export const DRAW_BLUE = "rgb(82, 197, 255)";
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

/* ------------------------------- geometry -------------------------------- */

export function distToSeg(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function uid(): string {
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/* -------------------------------- rendering ------------------------------ */

export interface RenderCtx {
  ctx: CanvasRenderingContext2D;
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
  width: number; // pane width (excludes price axis)
  height: number; // pane height (excludes time axis)
  hoverId: string | null;
  active: boolean; // drawing tool engaged (shows handles)
}

interface Pt {
  x: number;
  y: number;
}

function mapPoints(d: Drawing, rc: RenderCtx): (Pt | null)[] {
  const ts = rc.chart.timeScale();
  return d.points.map((p) => {
    const x = ts.logicalToCoordinate(p.lp as never);
    const y = rc.series.priceToCoordinate(p.price as never);
    return x == null || y == null ? null : { x: x as number, y: y as number };
  });
}

function pill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  bg: string,
  fg = "#090909",
) {
  ctx.font = "10px GeistMono, ui-monospace, monospace";
  const w = ctx.measureText(text).width + 8;
  const h = 14;
  const rx = Math.round(x - w);
  const ry = Math.round(y - h / 2);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(rx, ry, w, h, 3);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, rx + w / 2, ry + h / 2 + 0.5);
}

function handles(ctx: CanvasRenderingContext2D, pts: (Pt | null)[], color: string) {
  ctx.fillStyle = color;
  ctx.strokeStyle = "#0b0e13";
  ctx.lineWidth = 1;
  for (const p of pts) {
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** render one drawing; returns nothing (pure canvas output) */
export function drawShape(d: Drawing, rc: RenderCtx, preview = false) {
  const { ctx } = rc;
  const color = d.color ?? DRAW_BLUE;
  const pts = mapPoints(d, rc);
  if (pts.some((p) => p === null)) return;
  const P = pts as Pt[];
  ctx.save();
  ctx.globalAlpha = preview ? 0.85 : 1;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.4;

  switch (d.kind) {
    case "trend": {
      ctx.beginPath();
      ctx.moveTo(P[0].x, P[0].y);
      ctx.lineTo(P[1].x, P[1].y);
      ctx.stroke();
      if (rc.active || rc.hoverId === d.id) handles(ctx, P, color);
      break;
    }
    case "horz": {
      ctx.beginPath();
      ctx.moveTo(0, P[0].y);
      ctx.lineTo(rc.width, P[0].y);
      ctx.stroke();
      pill(ctx, rc.width - 4, P[0].y, fmtAxis(d.points[0].price), color);
      if (rc.active || rc.hoverId === d.id) handles(ctx, [{ x: Math.min(P[0].x, 120), y: P[0].y }], color);
      break;
    }
    case "brush": {
      ctx.beginPath();
      ctx.moveTo(P[0].x, P[0].y);
      for (let i = 1; i < P.length; i++) ctx.lineTo(P[i].x, P[i].y);
      ctx.stroke();
      break;
    }
    case "fib": {
      const x1 = Math.min(P[0].x, P[1].x);
      const x2 = Math.max(P[0].x, P[1].x);
      const p1 = d.points[0].price;
      const p2 = d.points[1].price;
      ctx.font = "10px GeistMono, ui-monospace, monospace";
      for (let i = 0; i < FIB_LEVELS.length; i++) {
        const lvl = FIB_LEVELS[i];
        const price = p1 + (p2 - p1) * lvl;
        const y = rc.series.priceToCoordinate(price as never);
        if (y == null) continue;
        // alternating subtle bands
        if (i < FIB_LEVELS.length - 1) {
          const next = p1 + (p2 - p1) * FIB_LEVELS[i + 1];
          const yn = rc.series.priceToCoordinate(next as never);
          if (yn != null) {
            ctx.fillStyle = i % 2 === 0 ? "rgba(82,197,255,0.06)" : "rgba(236,57,122,0.05)";
            ctx.fillRect(x1, Math.min(y, yn), x2 - x1, Math.abs(yn - y));
          }
        }
        ctx.strokeStyle = lvl === 0 || lvl === 1 ? "rgba(251, 191, 36, 0.9)" : color;
        ctx.globalAlpha = (preview ? 0.85 : 1) * 0.9;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
        ctx.globalAlpha = preview ? 0.85 : 1;
        ctx.fillStyle = lvl === 0 || lvl === 1 ? "rgb(251, 191, 36)" : color;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(`${lvl.toFixed(3)}  ${fmtAxis(price)}`, x1 + 4, y - 2);
      }
      if (rc.active || rc.hoverId === d.id) handles(ctx, P, color);
      break;
    }
    case "text": {
      ctx.font = "12px GeistMono, ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(d.text ?? "", P[0].x + 6, P[0].y);
      if (rc.active || rc.hoverId === d.id) {
        const w = ctx.measureText(d.text ?? "").width;
        ctx.strokeStyle = color;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(P[0].x + 2, P[0].y - 9, w + 10, 18);
        ctx.setLineDash([]);
      }
      break;
    }
    case "sticker": {
      ctx.font = "20px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(d.emoji ?? "🚀", P[0].x, P[0].y);
      break;
    }
    case "measure": {
      const up = d.points[1].price >= d.points[0].price;
      const c = up ? "rgb(47, 227, 172)" : "rgb(236, 57, 122)";
      const x1 = Math.min(P[0].x, P[1].x);
      const y1 = Math.min(P[0].y, P[1].y);
      const w = Math.abs(P[1].x - P[0].x);
      const h = Math.abs(P[1].y - P[0].y);
      ctx.fillStyle = up ? "rgba(47,227,172,0.12)" : "rgba(236,57,122,0.12)";
      ctx.fillRect(x1, y1, w, h);
      ctx.strokeStyle = c;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x1, y1, w, h);
      ctx.setLineDash([]);
      // center label: price Δ, %, bars
      const dp = d.points[1].price - d.points[0].price;
      const pct = d.points[0].price ? (dp / d.points[0].price) * 100 : 0;
      const bars = Math.abs(Math.round(d.points[1].lp - d.points[0].lp));
      const label = `${dp >= 0 ? "+" : ""}${fmtAxis(dp)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%) · ${bars} bars`;
      ctx.font = "11px GeistMono, ui-monospace, monospace";
      const tw = ctx.measureText(label).width + 12;
      const tx = x1 + w / 2;
      const ty = y1 + h / 2;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.roundRect(tx - tw / 2, ty - 9, tw, 18, 3);
      ctx.fill();
      ctx.fillStyle = "#090909";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, tx, ty + 0.5);
      break;
    }
  }
  ctx.restore();
}

function fmtAxis(v: number): string {
  const a = Math.abs(v);
  const digits = a >= 1000 ? 1 : a >= 100 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 5 : 7;
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/* -------------------------------- hit-test ------------------------------- */

/** returns true if (x,y) is on the drawing (for hover/drag/delete) */
export function hitTest(d: Drawing, x: number, y: number, rc: RenderCtx): boolean {
  const pts = mapPoints(d, rc);
  if (pts.some((p) => p === null)) return false;
  const P = pts as Pt[];
  switch (d.kind) {
    case "trend":
      return distToSeg(x, y, P[0].x, P[0].y, P[1].x, P[1].y) < 7;
    case "horz":
      return Math.abs(y - P[0].y) < 6;
    case "brush":
      for (let i = 1; i < P.length; i++) {
        if (distToSeg(x, y, P[i - 1].x, P[i - 1].y, P[i].x, P[i].y) < 6) return true;
      }
      return false;
    case "text": {
      rc.ctx.font = "12px GeistMono, ui-monospace, monospace";
      const w = rc.ctx.measureText(d.text ?? "").width;
      return x >= P[0].x && x <= P[0].x + w + 12 && Math.abs(y - P[0].y) < 11;
    }
    case "sticker":
      return Math.abs(x - P[0].x) < 14 && Math.abs(y - P[0].y) < 14;
    case "fib":
    case "measure": {
      const x1 = Math.min(P[0].x, P[1].x) - 4;
      const x2 = Math.max(P[0].x, P[1].x) + 4;
      const y1 = Math.min(P[0].y, P[1].y) - 4;
      const y2 = Math.max(P[0].y, P[1].y) + 4;
      return x >= x1 && x <= x2 && y >= y1 && y <= y2;
    }
  }
}

/** translate a drawing by (dLp bars, dPrice) — used while dragging */
export function translateDrawing(d: Drawing, dLp: number, dPrice: number): Drawing {
  return {
    ...d,
    points: d.points.map((p) => ({ lp: p.lp + dLp, price: p.price + dPrice })),
  };
}

/* --------------------- TopstepX-style position overlay -------------------- */

/* colors unified with the app palette (mint Buy / pink Sell / purple primary) */
export const TP_COLOR = "rgb(47, 227, 172)";    // bracket green = app --increase
export const SL_COLOR = "rgb(236, 57, 122)";    // bracket red = app --decrease
export const ENTRY_COLOR = "rgb(47, 227, 172)"; // position line — swapped live to SL_COLOR while losing
export const TS_BLUE = "rgb(178, 143, 255)";    // bid/ask lines = app --primary
export const CHIP_X_BG = "rgb(205, 205, 205)"; // light-gray ✕ segment

/** money helpers (Topstep formats: `$-627.00` and `~ +$684.00`) */
export function money2(v: number): string {
  return Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function fmtUpnlMoney(v: number): string {
  return `$${v < 0 ? "-" : ""}${money2(v)}`;
}
export function fmtBracketMoney(v: number): string {
  return `~ ${v >= 0 ? "+" : "-"}$${money2(v)}`;
}

/** shaded P&L box between entry and current price (green winning / red losing) */
export function drawPositionBox(rc: RenderCtx, entryPx: number, markPx: number, szi: number) {
  const yE = rc.series.priceToCoordinate(entryPx as never);
  const yM = rc.series.priceToCoordinate(markPx as never);
  if (yE == null || yM == null || Math.abs(yE - yM) < 1) return;
  const profit = (markPx - entryPx) * szi >= 0;
  const { ctx } = rc;
  ctx.save();
  ctx.fillStyle = profit ? "rgba(66, 240, 58, 0.16)" : "rgba(238, 28, 18, 0.16)";
  ctx.fillRect(0, Math.min(yE, yM), rc.width, Math.abs(yM - yE));
  /* brighter 1px edges make the box read at any zoom, like TopstepX */
  ctx.fillStyle = profit ? "rgba(66, 240, 58, 0.35)" : "rgba(238, 28, 18, 0.35)";
  ctx.fillRect(0, Math.min(yE, yM), rc.width, 1);
  ctx.fillRect(0, Math.max(yE, yM) - 1, rc.width, 1);
  ctx.restore();
}

/**
 * TopstepX 3-segment bracket chip drawn on canvas:
 *   [⋮⋮ grip | ~ +$684.00 | qty]  — green on TP side, red on SL side
 * Returns the chip bottom-right y for callers that stack more art.
 */
export function drawBracketChip(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  y: number,
  pnlText: string,
  qtyText: string,
  baseColor: string,
) {
  const h = 20;
  ctx.save();
  ctx.font = "bold 10.5px GeistMono, ui-monospace, monospace";
  const pnlW = ctx.measureText(pnlText).width + 14;
  const qtyW = ctx.measureText(qtyText).width + 13;
  const gripW = 14;
  const w = gripW + pnlW + qtyW;
  const x0 = centerX - w / 2;
  const y0 = y - h / 2;
  const isGreen = baseColor === TP_COLOR;
  const fg = isGreen ? "rgba(6,10,6,0.92)" : "rgba(255,255,255,0.95)";

  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, 3);
  ctx.fillStyle = baseColor;
  ctx.fill();
  // qty segment — darkened base
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 + gripW + pnlW, y0, qtyW, h);
  ctx.clip();
  ctx.fillStyle = "rgba(0,0,0,0.52)";
  ctx.fillRect(x0 + gripW + pnlW, y0, qtyW, h);
  ctx.restore();
  // grip dots (2 x 3)
  ctx.fillStyle = fg;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 2; c++) {
      ctx.beginPath();
      ctx.arc(x0 + 4.5 + c * 5, y0 + 5 + r * 5, 1.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = fg;
  ctx.fillText(pnlText, x0 + gripW + pnlW / 2, y0 + h / 2 + 0.5);
  ctx.fillText(qtyText, x0 + gripW + pnlW + qtyW / 2, y0 + h / 2 + 0.5);
  ctx.restore();
}

/**
 * Ghost TP/SL line + Topstep-style bracket chip drawn while the user drags
 * the position line up/down to create a bracket (TopstepX drag-to-create).
 */
export function drawGhostBracket(
  rc: RenderCtx,
  kind: "tp" | "sl",
  price: number,
  entry: number,
  szi: number,
  qtyText = "",
) {
  const y = rc.series.priceToCoordinate(price as never);
  if (y == null) return;
  const { ctx } = rc;
  const color = kind === "tp" ? TP_COLOR : SL_COLOR;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(rc.width, y);
  ctx.stroke();
  ctx.setLineDash([]);
  const pnl = (price - entry) * szi;
  drawBracketChip(ctx, rc.width / 2, y, fmtBracketMoney(pnl), qtyText, color);
  pill(ctx, rc.width - 8, y, fmtAxis(price), color, kind === "tp" ? "#0a0a0a" : "#ffffff");
  ctx.restore();
}

