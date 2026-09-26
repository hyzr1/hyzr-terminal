"use client";
/**
 * Perps chart — clean lightweight-charts terminal (TradingView-style but minimal):
 *   · top toolbar: interval dropdown · chart-type (candles/line + volume) ·
 *     position-bracket toggle · click-to-place limit "+" · fullscreen
 *   · TV legend: "{SYM}-USD · 1D" + OHLC line
 *   · ProjectX/Topstep-style position overlay: Entry/TP/SL price lines with
 *     P&L chips (✕ close, B/E stop), drag lines to adjust, drag the entry
 *     line vertically to create the bracket when no TP/SL is set
 *   · Topstep-style click-to-place limits: arm the "+" mode, click the chart
 *     at a price (the y-coordinate) → a working GTC limit order drops there
 *     with a draggable line + cancel chip; size = the trade panel's amount
 *   · bottom bar: 5y 1y 6m 3m 1m 5d 1d quick ranges · live clock · % log auto
 *   · colors unified with the app: mint = Buy/Long, pink = Sell/Short, purple accent
 * Live data: Hyperliquid candle stream + snapshot backfill.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type IPriceLine,
  ColorType,
} from "lightweight-charts";
import { usePerpsData, useCoinWatch, backfillCandles } from "@/lib/hyperliquid/perpsStore";
import { hlWs } from "@/lib/hyperliquid/ws";
import { useClock } from "@/hooks/use-clock";
import { baseName } from "@/lib/hyperliquid/types";
import type { Candle, Interval, PerpMeta } from "@/lib/hyperliquid/types";
import { fmtPrice, fmtPxQuote, fmtSzQuote } from "@/lib/hyperliquid/format";
import {
  useTradeStore,
  estLiqPrice,
  unrealizedPnl,
  toast,
  tradeDraft,
  type Position,
} from "@/lib/hyperliquid/tradeStore";
import {
  loadDrawingStore,
  saveDrawingStore,
  drawKey,
  drawShape,
  hitTest,
  translateDrawing,
  drawGhostBracket,
  drawPositionBox,
  uid,
  DRAW_BLUE,
  TP_COLOR,
  SL_COLOR,
  ENTRY_COLOR,
  TS_BLUE,
  fmtUpnlMoney,
  fmtBracketMoney,
  type Drawing,
  type DrawKind,
  type DrawPoint,
  type RenderCtx,
} from "./chartLayers";

const UP = "rgb(47, 227, 172)";      // app mint (--increase) — matches Buy/Long buttons
const DOWN = "rgb(236, 57, 122)";    // app pink (--decrease) — matches Sell/Short buttons
const ACCENT = "rgb(178, 143, 255)"; // app purple (--primary)
const BG = "#000000";             // TV-black canvas
const GRID = "rgb(22, 24, 29)";   // barely-there grid
const BORDER = "rgb(28, 30, 36)"; // toolbar separators
const TOOL_TEXT = "rgb(143, 150, 173)";

const INTERVALS: Interval[] = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "8h", "12h", "1d", "3d", "1w", "1M"];
const tvLabel = (iv: Interval) => (iv === "1d" ? "D" : iv === "3d" ? "3D" : iv === "1w" ? "W" : iv === "1M" ? "M" : iv);

const QUICK_RANGES: Array<{ label: string; secs: number }> = [
  { label: "5y", secs: 1825 * 86400 },
  { label: "1y", secs: 365 * 86400 },
  { label: "6m", secs: 182 * 86400 },
  { label: "3m", secs: 91 * 86400 },
  { label: "1m", secs: 30 * 86400 },
  { label: "5d", secs: 5 * 86400 },
  { label: "1d", secs: 86400 },
];

/* ------------------------------ tiny SVG icons ------------------------------ */

function I({ children, size = 17 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3">
      {children}
    </svg>
  );
}
const CandleIcon = () => (<I><rect x="4" y="7" width="4" height="7" /><path d="M6 3v4M6 14v3" /><rect x="12" y="5" width="4" height="6" /><path d="M14 2v3M14 11v4" /></I>);
const BracketIcon = () => (<I><path d="M7 3H4v14h3M13 3h3v14h-3" /><path d="M10 7v6M8.5 11.5L10 13l1.5-1.5" /></I>);
/* TopstepX drag-handle dots for the bracket chips */
const GripDots = () => (
  <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" className="opacity-55">
    <circle cx="3" cy="2.5" r="1.05" /><circle cx="7" cy="2.5" r="1.05" />
    <circle cx="3" cy="7" r="1.05" /><circle cx="7" cy="7" r="1.05" />
    <circle cx="3" cy="11.5" r="1.05" /><circle cx="7" cy="11.5" r="1.05" />
  </svg>
);

type ToolKey = "cross" | "trend" | "horz" | "fib" | "brush" | "text" | "sticker" | "measure";

const STICKERS = ["🚀", "😎", "🔥", "💎", "🙌", "🐂", "🐻", "🤑", "👀", "😂"];

/* -------------------------------- component -------------------------------- */

export default function PerpsChart({ coin: coinProp }: { coin?: string } = {}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const entryPLRef = useRef<IPriceLine | null>(null);
  const tpPLRef = useRef<IPriceLine | null>(null);
  const slPLRef = useRef<IPriceLine | null>(null);
  const bidPLRef = useRef<IPriceLine | null>(null);
  const askPLRef = useRef<IPriceLine | null>(null);
  const lastEntryColorRef = useRef<string | null>(null);
  /* lets the DOM bracket chips start the same drag pipeline as line hits */
  const beginDragRef = useRef<((kind: "tp" | "sl" | "entryNew", price: number, clientY: number) => void) | null>(null);
  const lastKeyRef = useRef("");
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  /* drawing engine refs (mirrors of state so the rAF loop reads latest) */
  const drawingsRef = useRef<Drawing[]>([]);
  const pendingRef = useRef<{ kind: DrawKind; points: DrawPoint[]; startX: number; startY: number; movedFar: boolean } | null>(null);
  const drawingDragRef = useRef<{ id: string; lastLp: number; lastPrice: number; startX: number; startY: number; moved: boolean } | null>(null);
  const posDragRef = useRef<{
    kind: "tp" | "sl" | "entryNew";
    ghostKind: "tp" | "sl" | null;
    price: number;
    startClientY: number;
    origTp: number | null;
    origSl: number | null;
  } | null>(null);
  const hoverIdRef = useRef<string | null>(null);
  const undoRef = useRef<Drawing[][]>([]);
  const redoRef = useRef<Drawing[][]>([]);
  const toolRef = useRef<ToolKey>("cross");
  const magnetRef = useRef(false);
  const hiddenRef = useRef(false);
  const lockRef = useRef(false);
  const bracketRef = useRef(true);
  const coinRef = useRef<string>("BTC");
  const intervalRef = useRef<string>("5m");
  const textDraftRef = useRef<{ lp: number; price: number; x: number; y: number } | null>(null);
  const stickerDraftRef = useRef<{ lp: number; price: number; x: number; y: number } | null>(null);
  const entryChipRef = useRef<HTMLDivElement | null>(null);
  const tpChipRef = useRef<HTMLDivElement | null>(null);
  const slChipRef = useRef<HTMLDivElement | null>(null);

  /* fx19 panel model — a chart panel can point at ANY market; without an
     explicit coin prop it follows the primary store coin. Interval is
     per-chart (TopstepX charts are independent). */
  const storeCoin = usePerpsData((s) => s.coin);
  const coin = coinProp ?? storeCoin;
  const [interval, setIntervalLocal] = useState<Interval>(() => usePerpsData.getState().interval);
  const candles = usePerpsData((s) => s.candles[coin]?.[interval]);
  const seriesVersion = usePerpsData((s) => s.candleVersions[`${coin}|${interval}`] ?? 0);
  const byName = usePerpsData((s) => s.byName);
  const mids = usePerpsData((s) => s.mids);
  const book = usePerpsData((s) => s.books[coin]);
  useCoinWatch(coin); // keep L2 bid/ask lines fed even as a solo chart
  const position = useTradeStore((s) => s.positions[coin]);
  const closePosition = useTradeStore((s) => s.closePosition);
  const editTpSl = useTradeStore((s) => s.editTpSl);
  const orders = useTradeStore((s) => s.orders);

  const [chartType, setChartType] = useState<"candles" | "line">("candles");
  const [showVolume, setShowVolume] = useState(false); // TV default: no volume study
  const [isLog, setIsLog] = useState(false);
  const [isPct, setIsPct] = useState(false);
  const [legend, setLegend] = useState<Candle | null>(null);
  const [tool, setTool] = useState<ToolKey>("cross");
  const [magnetOn, setMagnetOn] = useState(false);
  const [hiddenDraw, setHiddenDraw] = useState(false);
  const [lockDraw, setLockDraw] = useState(false);
  const [bracketOn, setBracketOn] = useState(true);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [textDraft, setTextDraft] = useState<{ lp: number; price: number; x: number; y: number; value: string } | null>(null);
  const [stickerDraft, setStickerDraft] = useState<{ lp: number; price: number; x: number; y: number } | null>(null);
  const [ivOpen, setIvOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  /* Topstep click-to-place limit mode */
  const [limitArm, setLimitArm] = useState(false);
  const limitArmRef = useRef(false);
  const orderDragRef = useRef<{ id: string; price: number; startClientY: number } | null>(null);
  const beginOrderDragRef = useRef<((id: string, price: number, clientY: number) => void) | null>(null);
  const orderPLRef = useRef<Map<string, IPriceLine>>(new Map());
  const orderChipRef = useRef<Map<string, HTMLDivElement>>(new Map());

  /* mirror latest state into refs (effect — the rAF loop + native handlers
     read these, so they must never be written during render) */
  useEffect(() => {
    coinRef.current = coin;
    intervalRef.current = interval;
    toolRef.current = tool;
    magnetRef.current = magnetOn;
    hiddenRef.current = hiddenDraw;
    lockRef.current = lockDraw;
    bracketRef.current = bracketOn;
    drawingsRef.current = drawings;
    textDraftRef.current = textDraft;
    stickerDraftRef.current = stickerDraft;
    limitArmRef.current = limitArm;
  }, [coin, interval, tool, magnetOn, hiddenDraw, lockDraw, bracketOn, drawings, textDraft, stickerDraft, limitArm]);

  const meta: PerpMeta | undefined = byName[coin]?.meta;
  const last = candles?.[candles.length - 1];
  const l = legend ?? last;
  const up = l ? l.close >= l.open : true;
  const base = baseName(coin);

  /* mark + unrealized PnL for the position chips */
  const mark = mids[coin] ?? position?.entryPx ?? 0;
  const upnl = position && position.szi !== 0 ? unrealizedPnl(position, mark) : 0;

  /* ------------------------- drawing persistence ------------------------- */
  const dKey = drawKey(coin, interval);
  /* reset state when the symbol|interval key changes — done during render
     (the React-sanctioned pattern for key-derived resets) */
  const [prevDKey, setPrevDKey] = useState(dKey);
  if (prevDKey !== dKey) {
    setPrevDKey(dKey);
    setDrawings(loadDrawingStore()[dKey] ?? []);
  }
  /* interaction-state cleanup belongs after render */
  useEffect(() => {
    pendingRef.current = null;
    drawingDragRef.current = null;
    undoRef.current = [];
    redoRef.current = [];
  }, [dKey]);
  useEffect(() => {
    const store = loadDrawingStore();
    store[dKey] = drawings;
    saveDrawingStore(store);
  }, [drawings, dKey]);

  /* undo/redo helpers */
  const pushUndo = useCallback(() => {
    undoRef.current.push(drawingsRef.current);
    if (undoRef.current.length > 60) undoRef.current.shift();
    redoRef.current = [];
  }, []);
  const commitDrawing = useCallback(
    (d: Drawing) => {
      pushUndo();
      setDrawings((ds) => [...ds, d]);
    },
    [pushUndo],
  );

  /* clock (bottom bar center) — SSR-safe via the shared 1 Hz clock store */
  const clockNow = useClock();
  const clock = clockNow
    ? (() => {
        const d = new Date(clockNow);
        const off = -d.getTimezoneOffset() / 60;
        const lbl = `(UTC${off >= 0 ? "+" : "-"}${String(Math.abs(off)).padStart(2, "0")})`;
        return `${d.toLocaleTimeString("en-US", { hour12: false })} ${lbl}`;
      })()
    : "";

  /* ---------- pane metrics / coordinate helpers ---------- */
  const paneMetrics = useCallback(() => {
    const chart = chartRef.current;
    const wrap = wrapRef.current;
    if (!chart || !wrap) return null;
    let axisW = 0;
    let timeH = 0;
    try {
      axisW = chart.priceScale("right").width();
      timeH = chart.timeScale().height();
    } catch {
      /* chart not ready */
    }
    return {
      w: Math.max(0, wrap.clientWidth - axisW),
      h: Math.max(0, wrap.clientHeight - timeH),
      axisW,
    };
  }, []);

  const makeRc = useCallback((m: { w: number; h: number }): RenderCtx | null => {
    const chart = chartRef.current;
    const series = candleRef.current;
    const ctx = ctxRef.current;
    if (!chart || !series || !ctx) return null;
    return { ctx, chart, series, width: m.w, height: m.h, hoverId: hoverIdRef.current, active: false };
  }, []);

  const lpAt = useCallback((x: number): number => {
    const chart = chartRef.current;
    if (!chart) return 0;
    return (chart.timeScale().coordinateToLogical(x as never) as number) ?? 0;
  }, []);
  const priceAt = useCallback((y: number): number => {
    const series = candleRef.current;
    if (!series) return 0;
    return (series.coordinateToPrice(y as never) as number) ?? 0;
  }, []);
  const snapPrice = useCallback(
    (price: number, lp: number): number => {
      const cs = usePerpsData.getState().candles[coinRef.current]?.[intervalRef.current as Interval];
      if (!cs || cs.length === 0) return price;
      const idx = Math.max(0, Math.min(cs.length - 1, Math.round(lp)));
      const c = cs[idx];
      if (!c) return price;
      const cands = [c.open, c.high, c.low, c.close];
      let best = cands[0];
      for (const v of cands) {
        if (Math.abs(v - price) < Math.abs(best - price)) best = v;
      }
      return best;
    },
    [],
  );

  /* ---------- create chart + pointer interaction ---------- */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: BG },
        textColor: TOOL_TEXT,
        fontSize: 11,
        fontFamily: "GeistMono, ui-monospace, SFMono-Regular, Menlo, monospace",
        attributionLogo: true, // TV watermark badge (the real page shows it)
      },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      rightPriceScale: {
        borderColor: BORDER,
        scaleMargins: { top: 0.08, bottom: 0.12 },
        entireTextOnly: true,
      },
      timeScale: { borderColor: BORDER, timeVisible: true, secondsVisible: false, rightOffset: 6 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgb(117, 134, 150)", width: 1, style: LineStyle.LargeDashed, labelBackgroundColor: "rgb(50, 53, 66)" },
        horzLine: { color: "rgb(117, 134, 150)", width: 1, style: LineStyle.LargeDashed, labelBackgroundColor: "rgb(50, 53, 66)" },
      },
      autoSize: true,
    });
    chartRef.current = chart;

    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN,
      wickUpColor: UP, wickDownColor: DOWN,
      priceLineColor: UP,
      priceLineStyle: LineStyle.Dashed,
    });
    lineRef.current = chart.addSeries(LineSeries, {
      color: ACCENT, lineWidth: 2, visible: false, priceLineVisible: false,
    });
    volRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" }, priceScaleId: "vol",
      lastValueVisible: false, priceLineVisible: false,
    });
    volRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !candleRef.current) { setLegend(null); return; }
      const bar = param.seriesData.get(candleRef.current) as
        | { open: number; high: number; low: number; close: number } | undefined;
      if (bar) setLegend({ time: 0, ...bar, volume: 0 });
      else setLegend(null);
    });

    /* -------------------------------------------------------------- */
    /* pointer interaction: drawing tools + ProjectX bracket dragging  */
    /* -------------------------------------------------------------- */
    const getXY = (e: PointerEvent | MouseEvent) => {
      const wrap = wrapRef.current;
      if (!wrap) return null;
      const rect = wrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      return { x, y, rect };
    };

    const rcNow = () => {
      const m = paneMetrics();
      if (!m) return null;
      return { m, rc: makeRc(m) };
    };

    const attachMoveUp = () => {
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    };
    const detachMoveUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    const beginPosDrag = (kind: "tp" | "sl" | "entryNew", startPrice: number, clientY: number) => {
      const pos = useTradeStore.getState().positions[coinRef.current];
      if (!pos) return;
      posDragRef.current = {
        kind,
        ghostKind: null,
        price: startPrice,
        startClientY: clientY,
        origTp: pos.tpPx,
        origSl: pos.slPx,
      };
      attachMoveUp();
    };
    beginDragRef.current = beginPosDrag;

    const beginOrderDrag = (id: string, price: number, clientY: number) => {
      orderDragRef.current = { id, price, startClientY: clientY };
      attachMoveUp();
    };
    beginOrderDragRef.current = beginOrderDrag;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 2) return; // context menu handles right-click
      const hit = getXY(e);
      const ctx = rcNow();
      if (!hit || !ctx) return;
      const { x, y } = hit;
      const { m, rc } = ctx;
      if (x < 0 || y < 0 || x > m.w || y > m.h) return; // on axes → chart handles

      /* chip buttons handle themselves */
      const tEl = e.target as HTMLElement;
      if (tEl && tEl.closest("[data-chip-btn]")) return;
      /* chip body = drag that line */
      const chipEl = tEl?.closest("[data-chip]") as HTMLElement | null;
      const chipKind = chipEl?.getAttribute("data-chip");

      /* 1) close any open text/sticker draft */
      if (textDraftRef.current || stickerDraftRef.current) {
        setTextDraft(null);
        setStickerDraft(null);
        return;
      }

      /* 1.5) Topstep click-to-place limit — the y-coordinate IS the price */
      if (limitArmRef.current) {
        const c = coinRef.current;
        const metaNow = usePerpsData.getState().byName[c]?.meta;
        const mark = usePerpsData.getState().mids[c];
        const px = priceAt(y);
        if (metaNow && px > 0) {
          const isBuy = !(mark != null && px > mark); // below market = buy limit, above = sell limit
          let usd = tradeDraft.usd;
          if (!(usd > 0)) usd = 100; // panel empty → sane default notional
          const dec = Math.min(metaNow.szDecimals ?? 4, 6);
          let sz = +(usd / px).toFixed(dec);
          if (!(sz > 0)) sz = +(1 / 10 ** dec).toFixed(dec);
          void useTradeStore.getState().placeOrder({ coin: c, isBuy, sz, type: "limit", px, tif: "Gtc" });
        }
        setLimitArm(false);
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      /* 2) position bracket dragging (cross mode) */
      if (toolRef.current === "cross") {
        const pos = useTradeStore.getState().positions[coinRef.current];
        if (pos && pos.szi !== 0 && candleRef.current) {
          const ser = candleRef.current;
          const yT = pos.tpPx != null ? (ser.priceToCoordinate(pos.tpPx as never) as number | null) : null;
          const yS = pos.slPx != null ? (ser.priceToCoordinate(pos.slPx as never) as number | null) : null;
          const yE = ser.priceToCoordinate(pos.entryPx as never) as number | null;
          /* 12px hit tolerance (the live auto-scaling pane can drift the
             DOM chip a frame behind the live coordinate during fast moves);
             a chip-body hit always engages its own line */
          const HIT = 12;
          if (chipKind === "tp" && pos.tpPx != null) { beginPosDrag("tp", pos.tpPx, e.clientY); e.stopPropagation(); return; }
          if (chipKind === "sl" && pos.slPx != null) { beginPosDrag("sl", pos.slPx, e.clientY); e.stopPropagation(); return; }
          if (yT != null && Math.abs(y - yT) <= HIT) { beginPosDrag("tp", pos.tpPx!, e.clientY); e.stopPropagation(); return; }
          if (yS != null && Math.abs(y - yS) <= HIT) { beginPosDrag("sl", pos.slPx!, e.clientY); e.stopPropagation(); return; }
          const nearEntry = yE != null && Math.abs(y - yE) <= HIT;
          if ((nearEntry || chipKind === "entry") && bracketRef.current) {
            // drag away from entry creates the missing bracket leg
            const hasTp = pos.tpPx != null;
            const hasSl = pos.slPx != null;
            if (!hasTp || !hasSl) { beginPosDrag("entryNew", pos.entryPx, e.clientY); e.stopPropagation(); return; }
          }
        }

        /* 3) hit a drawing → drag it */
        const list = drawingsRef.current;
        if (rc) {
          for (let i = list.length - 1; i >= 0; i--) {
            const d = list[i];
            if (hitTest(d, x, y, rc)) {
              if (lockRef.current || d.locked) { e.stopPropagation(); return; }
              pushUndo();
              drawingDragRef.current = {
                id: d.id,
                lastLp: lpAt(x),
                lastPrice: priceAt(y),
                startX: e.clientX,
                startY: e.clientY,
                moved: false,
              };
              attachMoveUp();
              e.stopPropagation();
              return;
            }
          }
        }
        return; // empty space in cross mode → chart pans
      }

      /* 4) drawing tool creation */
      e.stopPropagation();
      e.preventDefault();
      const lp = lpAt(x);
      const priceRaw = priceAt(y);
      const price = magnetRef.current ? snapPrice(priceRaw, lp) : priceRaw;
      const t = toolRef.current;
      const pend = pendingRef.current;

      if (t === "horz") {
        commitDrawing({ id: uid(), kind: "horz", points: [{ lp, price }] });
        return;
      }
      if (t === "text") {
        setTextDraft({ lp, price, x, y, value: "" });
        return;
      }
      if (t === "sticker") {
        setStickerDraft({ lp, price, x, y });
        return;
      }
      if (t === "brush") {
        pendingRef.current = { kind: "brush", points: [{ lp, price }], startX: e.clientX, startY: e.clientY, movedFar: true };
        attachMoveUp();
        return;
      }
      // trend / fib / measure — click-click or drag
      if (pend && pend.kind === t && pend.points.length === 1) {
        commitDrawing({ id: uid(), kind: t, points: [pend.points[0], { lp, price }] });
        pendingRef.current = null;
        detachMoveUp();
        return;
      }
      if (t === "measure") {
        setDrawings((ds) => ds.filter((d) => d.kind !== "measure"));
      }
      pendingRef.current = { kind: t, points: [{ lp, price }], startX: e.clientX, startY: e.clientY, movedFar: false };
      attachMoveUp();
    };

    const onPointerMove = (e: PointerEvent) => {
      const hit = getXY(e);
      const ctx = rcNow();
      if (!hit || !ctx || !ctx.rc) return;
      const { x, y } = hit;
      const { rc } = ctx;

      /* working-order drag → live-move the line (commit on pointerup) */
      const od = orderDragRef.current;
      if (od && candleRef.current) {
        const price = priceAt(y);
        od.price = price;
        const pl = orderPLRef.current.get(od.id);
        if (pl) pl.applyOptions({ price });
        return;
      }

      /* bracket drag */
      const pd = posDragRef.current;
      if (pd && candleRef.current) {
        const price = priceAt(y);
        pd.price = price;
        if (pd.kind === "tp" && tpPLRef.current) tpPLRef.current.applyOptions({ price });
        else if (pd.kind === "sl" && slPLRef.current) slPLRef.current.applyOptions({ price });
        else if (pd.kind === "entryNew") {
          const pos = useTradeStore.getState().positions[coinRef.current];
          if (pos) {
            const long = pos.szi > 0;
            const delta = price - pos.entryPx;
            const wantTp = long ? delta > 0 : delta < 0;
            const legFree = wantTp ? pos.tpPx == null : pos.slPx == null;
            pd.ghostKind = legFree ? (wantTp ? "tp" : "sl") : null;
            pd.price = price;
          }
        }
        return;
      }

      /* drawing drag */
      const dg = drawingDragRef.current;
      if (dg) {
        const lp = lpAt(x);
        const price = priceAt(y);
        if (Math.abs(e.clientX - dg.startX) > 2 || Math.abs(e.clientY - dg.startY) > 2) dg.moved = true;
        const dLp = lp - dg.lastLp;
        const dPrice = price - dg.lastPrice;
        if (dLp !== 0 || dPrice !== 0) {
          setDrawings((ds) => ds.map((d) => (d.id === dg.id ? translateDrawing(d, dLp, dPrice) : d)));
          dg.lastLp = lp;
          dg.lastPrice = price;
        }
        return;
      }

      /* pending shape preview */
      const pend = pendingRef.current;
      if (pend && pend.points.length >= 1) {
        if (Math.abs(e.clientX - pend.startX) > 8 || Math.abs(e.clientY - pend.startY) > 8) pend.movedFar = true;
        const lp = lpAt(x);
        const priceRaw = priceAt(y);
        const price = magnetRef.current ? snapPrice(priceRaw, lp) : priceRaw;
        if (pend.kind === "brush") {
          const lp2 = pend.points[pend.points.length - 1];
          const yPrev = candleRef.current?.priceToCoordinate(lp2.price as never) as number | null;
          const xPrev = chartRef.current?.timeScale().logicalToCoordinate(lp2.lp as never) as number | null;
          if (xPrev == null || yPrev == null || Math.hypot(x - xPrev, y - yPrev) > 3) {
            pend.points.push({ lp, price });
          }
        } else if (pend.points.length === 1) {
          pend.points[1] = { lp, price };
        }
        return;
      }

      /* hover detection (cross mode) */
      if (toolRef.current === "cross") {
        hoverIdRef.current = null;
        const list = drawingsRef.current;
        for (let i = list.length - 1; i >= 0; i--) {
          if (hitTest(list[i], x, y, rc)) { hoverIdRef.current = list[i].id; break; }
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const od = orderDragRef.current;
      if (od) {
        orderDragRef.current = null;
        detachMoveUp();
        const moved = Math.abs(e.clientY - od.startClientY) > 8;
        const st = useTradeStore.getState();
        const cur = st.orders.find((z) => z.id === od.id);
        if (moved && cur) {
          // drag-to-reprice = cancel + re-place at the dropped price
          st.cancelOrder(od.id);
          void st.placeOrder({ coin: cur.coin, isBuy: cur.isBuy, sz: cur.sz, type: "limit", px: od.price, tif: "Gtc" });
        }
        return;
      }
      const pd = posDragRef.current;
      if (pd) {
        posDragRef.current = null;
        detachMoveUp();
        commitPosDrag(pd, e.clientY);
        return;
      }
      const dg = drawingDragRef.current;
      if (dg) {
        drawingDragRef.current = null;
        detachMoveUp();
        if (!dg.moved) undoRef.current.pop(); // click without drag — no undo entry
        return;
      }
      const pend = pendingRef.current;
      if (pend) {
        if (pend.kind === "brush") {
          if (pend.points.length > 1) commitDrawing({ id: uid(), kind: "brush", points: pend.points });
          pendingRef.current = null;
          detachMoveUp();
          return;
        }
        if (pend.points.length === 2 && pend.movedFar) {
          commitDrawing({ id: uid(), kind: pend.kind, points: pend.points });
          pendingRef.current = null;
        }
        // else: keep armed for the second click (click-click placement)
        detachMoveUp();
        return;
      }
      detachMoveUp();
    };

    const commitPosDrag = (pd: NonNullable<typeof posDragRef.current>, endClientY: number) => {
      const st = useTradeStore.getState();
      const coin = coinRef.current;
      const pos = st.positions[coin];
      if (!pos) return;
      const pMeta = usePerpsData.getState().byName[coin]?.meta;

      if (pd.kind === "tp" || pd.kind === "sl") {
        const isTp = pd.kind === "tp";
        const valid = isTp
          ? pos.szi > 0 ? pd.price > pos.entryPx : pd.price < pos.entryPx
          : pos.szi > 0 ? pd.price < pos.entryPx : pd.price > pos.entryPx;
        if (valid) {
          st.editTpSl(coin, isTp ? pd.price : pos.tpPx, isTp ? pos.slPx : pd.price);
          toast(`${isTp ? "Take Profit" : "Stop Loss"} moved to ${fmtPrice(pMeta, pd.price)}`, "info");
        } else {
          // revert
          const revert = isTp ? tpPLRef.current : slPLRef.current;
          const orig = isTp ? pd.origTp : pd.origSl;
          if (revert && orig != null) revert.applyOptions({ price: orig });
        }
        return;
      }

      /* entryNew — drag-to-create bracket */
      const isTp = pd.ghostKind === "tp";
      const isSl = pd.ghostKind === "sl";
      const moved = Math.abs(endClientY - pd.startClientY) > 10;
      if (!moved || (!isTp && !isSl)) return;
      const valid = isTp
        ? pos.szi > 0 ? pd.price > pos.entryPx : pd.price < pos.entryPx
        : pos.szi > 0 ? pd.price < pos.entryPx : pd.price > pos.entryPx;
      if (!valid) return;
      st.editTpSl(coin, isTp ? pd.price : pos.tpPx, isSl ? pd.price : pos.slPx);
      toast(`Bracket ${isTp ? "TP" : "SL"} set @ ${fmtPrice(pMeta, pd.price)}`, "success");
    };

    const onContextMenu = (e: MouseEvent) => {
      const hit = getXY(e);
      const ctx = rcNow();
      if (!hit || !ctx || !ctx.rc) return;
      const { x, y } = hit;
      const { m, rc } = ctx;
      if (x < 0 || y < 0 || x > m.w || y > m.h) return;
      e.preventDefault();
      e.stopPropagation();
      // cancel pending shape
      pendingRef.current = null;
      setTextDraft(null);
      setStickerDraft(null);
      // right-click deletes hovered drawing (when unlocked)
      if (toolRef.current === "cross") {
        const list = drawingsRef.current;
        for (let i = list.length - 1; i >= 0; i--) {
          const d = list[i];
          if (hitTest(d, x, y, rc)) {
            if (lockRef.current || d.locked) return;
            pushUndo();
            setDrawings((ds) => ds.filter((z) => z.id !== d.id));
            return;
          }
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (textDraftRef.current || stickerDraftRef.current) {
          setTextDraft(null);
          setStickerDraft(null);
        }
        pendingRef.current = null;
        if (toolRef.current !== "cross") setTool("cross");
        setLimitArm(false);
      }
    };

    el.addEventListener("pointerdown", onPointerDown, true);
    el.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown, true);
      el.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      chart.remove();
      chartRef.current = null; candleRef.current = null;
      lineRef.current = null; volRef.current = null;
      priceLinesRef.current = [];
      entryPLRef.current = null; tpPLRef.current = null; slPLRef.current = null;
      orderPLRef.current.clear();
      orderChipRef.current.clear();
    };
  }, []);

  /* ---------- rAF render loop: drawings canvas + chip positions ---------- */
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const chart = chartRef.current;
      const series = candleRef.current;
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!chart || !series || !canvas || !wrap) return;
      const m = paneMetrics();
      if (!m) return;

      const dpr = window.devicePixelRatio || 1;
      const W = Math.round(m.w * dpr);
      const H = Math.round(m.h * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
        canvas.style.width = `${m.w}px`;
        canvas.style.height = `${m.h}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctxRef.current = ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, m.w, m.h);

      const rc: RenderCtx = {
        ctx, chart, series,
        width: m.w, height: m.h,
        hoverId: hoverIdRef.current,
        active: toolRef.current !== "cross",
      };

      if (!hiddenRef.current) {
        for (const d of drawingsRef.current) drawShape(d, rc);
      }

      /* pending shape preview */
      const pend = pendingRef.current;
      if (pend && pend.points.length >= 1) {
        if (pend.points.length === 2) {
          drawShape({ id: "__pending", kind: pend.kind, points: pend.points } as Drawing, rc, true);
        } else if (pend.kind === "horz") {
          drawShape({ id: "__pending", kind: "horz", points: [pend.points[0]] } as Drawing, rc, true);
        } else {
          const px = chart.timeScale().logicalToCoordinate(pend.points[0].lp as never);
          const py = series.priceToCoordinate(pend.points[0].price as never);
          if (px != null && py != null) {
            ctx.fillStyle = DRAW_BLUE;
            ctx.beginPath();
            ctx.arc(px as number, py as number, 3.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      /* Topstep limit-arm ghost: dashed line at the cursor's y = the price */
      if (limitArmRef.current) {
        const cy = lastClientY.current;
        if (cy != null && cy >= 0 && cy <= m.h) {
          const px = priceAt(cy);
          if (px > 0) {
            ctx.save();
            ctx.strokeStyle = "rgba(178, 143, 255, 0.95)";
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, cy);
            ctx.lineTo(m.w, cy);
            ctx.stroke();
            ctx.setLineDash([]);
            const label = fmtPrice(usePerpsData.getState().byName[coinRef.current]?.meta, px);
            ctx.font = "600 11px GeistMono, ui-monospace, monospace";
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = "rgb(178, 143, 255)";
            ctx.fillRect(m.w - tw - 14, cy - 9, tw + 12, 18);
            ctx.fillStyle = "#0a0a0a";
            ctx.fillText(label, m.w - tw - 8, cy + 4);
            ctx.restore();
          }
        }
      }

      /* Topstep position: shaded P&L box + live entry-line color flip */
      const pos = useTradeStore.getState().positions[coinRef.current];
      const markNow = pos && pos.szi !== 0
        ? (usePerpsData.getState().mids[coinRef.current] ?? pos.entryPx)
        : 0;
      if (pos && pos.szi !== 0) {
        drawPositionBox(rc, pos.entryPx, markNow, pos.szi);
        const want = (markNow - pos.entryPx) * pos.szi >= 0 ? ENTRY_COLOR : SL_COLOR;
        if (entryPLRef.current && lastEntryColorRef.current !== want) {
          lastEntryColorRef.current = want;
          entryPLRef.current.applyOptions({ color: want });
        }
      }

      /* bracket ghost while creating from the entry line */
      const pd = posDragRef.current;
      if (pd && pd.kind === "entryNew" && pd.ghostKind) {
        if (pos) {
          const qtyTxt = `${pos.szi > 0 ? "+" : "-"}${fmtSzQuote(Math.abs(pos.szi), usePerpsData.getState().byName[coinRef.current]?.meta)}`;
          drawGhostBracket(rc, pd.ghostKind, pd.price, pos.entryPx, pos.szi, qtyTxt);
        }
      }

      /* position chips follow their price lines (drag-aware) + live P&L text */
      const setTop = (el: HTMLDivElement | null, price: number | null | undefined) => {
        if (!el) return;
        if (!pos || pos.szi === 0 || price == null) { el.style.display = "none"; return; }
        const y = series.priceToCoordinate(price as never) as number | null;
        if (y == null) { el.style.display = "none"; return; }
        el.style.display = "flex";
        el.style.top = `${y - 10}px`;
      };
      const setPnlText = (el: HTMLDivElement | null, text: string) => {
        const q = el?.querySelector("[data-pnl]");
        if (q && q.textContent !== text) q.textContent = text;
      };
      const tpPxNow = pd?.kind === "tp" ? pd.price : pos?.tpPx;
      const slPxNow = pd?.kind === "sl" ? pd.price : pos?.slPx;
      setTop(entryChipRef.current, pos?.entryPx);
      setTop(tpChipRef.current, tpPxNow);
      setTop(slChipRef.current, slPxNow);
      if (pos && pos.szi !== 0) {
        const upnlNow = (markNow - pos.entryPx) * pos.szi;
        setPnlText(entryChipRef.current, fmtUpnlMoney(upnlNow));
        if (tpPxNow != null) setPnlText(tpChipRef.current, fmtBracketMoney((tpPxNow - pos.entryPx) * pos.szi));
        if (slPxNow != null) setPnlText(slChipRef.current, fmtBracketMoney((slPxNow - pos.entryPx) * pos.szi));
      }

      /* working-order chips follow their lines (drag-aware) */
      const ordersNow = useTradeStore.getState().orders;
      const odNow = orderDragRef.current;
      for (const o of ordersNow) {
        if (o.coin !== coinRef.current || o.kind !== "Limit") continue;
        const el = orderChipRef.current.get(o.id);
        if (!el) continue;
        const price = odNow?.id === o.id ? odNow.price : o.px;
        const y = series.priceToCoordinate(price as never) as number | null;
        if (y == null) { el.style.display = "none"; continue; }
        el.style.display = "flex";
        el.style.top = `${y - 10}px`;
      }

      /* cursor */
      let cur = "";
      if (limitArmRef.current || toolRef.current !== "cross") {
        cur = "crosshair";
      } else if (!posDragRef.current && !drawingDragRef.current) {
        if (pos && pos.szi !== 0) {
          const yOf = (p: number | null | undefined) =>
            p != null ? (series.priceToCoordinate(p as never) as number | null) : null;
          const cy = lastClientY.current;
          if (cy != null) {
            const yT = yOf(pos.tpPx);
            const yS = yOf(pos.slPx);
            const yE = yOf(pos.entryPx);
            if ((yT != null && Math.abs(cy - yT) <= 8) || (yS != null && Math.abs(cy - yS) <= 8)) cur = "ns-resize";
            else if (yE != null && Math.abs(cy - yE) <= 8 && bracketRef.current) cur = "ns-resize";
          }
        }
        if (!cur && hoverIdRef.current) cur = "move";
      }
      if (wrap.style.cursor !== cur) wrap.style.cursor = cur;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* track last client Y inside the pane for cursor hit-testing */
  const lastClientY = useRef<number | null>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const y = e.clientY - r.top;
      const m = paneMetrics();
      lastClientY.current = m && y >= 0 && y <= m.h ? y : null;
    };
    const onLeave = () => {
      lastClientY.current = null;
      hoverIdRef.current = null;
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [paneMetrics]);

  /* ---------- per-panel candle feed: backfill + live stream (fx19) ----------
     Every chart panel owns its coin+interval feed — the panel-ized workspace
     can show several markets at once. */
  useEffect(() => {
    if (!coin || !interval) return;
    backfillCandles(coin, interval);
    const off = hlWs.subscribe({ type: "candle", coin, interval }, (data) => {
      usePerpsData.getState().mergeCandle(coin, interval, data as Candle);
    });
    return off;
  }, [coin, interval]);

  /* ---------- data (never clears while a new interval is loading) ---------- */
  useEffect(() => {
    const cs = candles;
    if (!cs || cs.length === 0) return; // keep previous bars until backfill lands
    // the per-coin|interval seriesVersion bumps ONLY on backfill replacement →
    // guaranteed full reset even when bar-count and last-bar-time collide
    // across coins (BTC vs GOLD 5m), while OTHER charts' backfills never
    // disturb this chart's zoom
    const key = `${coin}|${interval}|${seriesVersion}`;
    const fullReset = key !== lastKeyRef.current;
    lastKeyRef.current = key;
    if (fullReset) {
      candleRef.current?.setData(cs.map(toBar) as never);
      lineRef.current?.setData(cs.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })) as never);
      volRef.current?.setData(
        cs.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? "rgba(47,227,172,0.45)" : "rgba(236,57,122,0.45)",
        })) as never,
      );
      chartRef.current?.priceScale("right").applyOptions({ autoScale: true });
      // TradingView-style default zoom: ~7px per bar (~60-180 bars visible,
      // adaptive to width) instead of fitContent() which crams all 500
      // backfilled bars into the viewport. Older history stays scroll-left.
      const ts = chartRef.current?.timeScale();
      if (ts) {
        const target = Math.round(Math.min(180, Math.max(60, ts.width() / 7)));
        try {
          ts.setVisibleLogicalRange({ from: Math.max(0, cs.length - target), to: cs.length + 6 });
        } catch {
          ts.fitContent();
        }
      }
    } else if (cs.length > 0) {
      const lastBar = cs[cs.length - 1];
      candleRef.current?.update(toBar(lastBar) as never);
      lineRef.current?.update({ time: lastBar.time as UTCTimestamp, value: lastBar.close } as never);
      volRef.current?.update({
        time: lastBar.time as UTCTimestamp,
        value: lastBar.volume,
        color: lastBar.close >= lastBar.open ? "rgba(47,227,172,0.45)" : "rgba(236,57,122,0.45)",
      } as never);
      // last-price label follows bar direction (real page: green pill in uptrends)
      candleRef.current?.applyOptions({
        priceLineColor: lastBar.close >= lastBar.open ? UP : DOWN,
      });
    }
  }, [candles, seriesVersion, coin, interval]);

  /* ---------- chart type / volume / scale-mode toggles ---------- */
  useEffect(() => {
    candleRef.current?.applyOptions({ visible: chartType === "candles" });
    lineRef.current?.applyOptions({ visible: chartType === "line" });
    volRef.current?.applyOptions({ visible: showVolume });
  }, [chartType, showVolume]);

  useEffect(() => {
    const mode = isPct ? 2 : isLog ? 1 : 0;
    chartRef.current?.priceScale("right").applyOptions({ mode });
  }, [isLog, isPct]);

  /* ---------- position / tp / sl / liq price lines (TopstepX style) ---------- */
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    for (const pl of priceLinesRef.current) {
      try { series.removePriceLine(pl); } catch { /* noop */ }
    }
    priceLinesRef.current = [];
    entryPLRef.current = null;
    tpPLRef.current = null;
    slPLRef.current = null;
    lastEntryColorRef.current = null;
    if (!position || position.szi === 0) return;
    const midsNow = usePerpsData.getState().mids;
    const markNow = midsNow[coin] ?? position.entryPx;
    const avail = availableMarginNow();
    const liq = estLiqPrice(position, avail);
    const win = (markNow - position.entryPx) * position.szi >= 0;
    const add = (price: number, color: string, title: string, style: LineStyle, width: 1 | 2 | 3 | 4 = 2) => {
      const pl = series.createPriceLine({
        price, color, lineWidth: width, lineStyle: style, axisLabelVisible: true, title,
      });
      priceLinesRef.current.push(pl);
      return pl;
    };
    /* entry line wears the live P&L color (green winning / red losing, like TopstepX) */
    lastEntryColorRef.current = win ? ENTRY_COLOR : SL_COLOR;
    entryPLRef.current = add(position.entryPx, lastEntryColorRef.current, "", LineStyle.Solid);
    if (position.tpPx != null) tpPLRef.current = add(position.tpPx, TP_COLOR, "", LineStyle.Dashed);
    if (position.slPx != null) slPLRef.current = add(position.slPx, SL_COLOR, "", LineStyle.Dashed);
    if (liq) add(liq, "rgb(226, 124, 77)", "Liq.", LineStyle.Dotted, 1);
  }, [position, coin]);

  /* ---------- Topstep bid/ask lines (solid blue, no axis labels) ---------- */
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    const bid = book?.bids[0]?.px;
    const ask = book?.asks[0]?.px;
    if (bid == null || ask == null) {
      for (const r of [bidPLRef, askPLRef]) {
        if (r.current) { try { series.removePriceLine(r.current); } catch { /* noop */ } r.current = null; }
      }
      return;
    }
    const mk = (price: number) => series.createPriceLine({
      price, color: TS_BLUE, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "",
    });
    if (!bidPLRef.current) bidPLRef.current = mk(bid);
    if (!askPLRef.current) askPLRef.current = mk(ask);
    bidPLRef.current.applyOptions({ price: bid });
    askPLRef.current.applyOptions({ price: ask });
  }, [book, coin]);

  /* ---------- working limit-order lines (chart-placed + panel) ---------- */
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    const mine = orders.filter((o) => o.coin === coin && o.kind === "Limit");
    const live = new Set(mine.map((o) => o.id));
    for (const [id, pl] of orderPLRef.current) {
      if (!live.has(id)) {
        try { series.removePriceLine(pl); } catch { /* noop */ }
        orderPLRef.current.delete(id);
      }
    }
    for (const o of mine) {
      const color = o.isBuy ? UP : DOWN;
      const existing = orderPLRef.current.get(o.id);
      if (existing) {
        existing.applyOptions({ price: o.px, color });
      } else {
        const pl = series.createPriceLine({
          price: o.px, color, lineWidth: 1, lineStyle: LineStyle.Dashed,
          axisLabelVisible: true, title: o.isBuy ? "BUY LMT" : "SELL LMT",
        });
        orderPLRef.current.set(o.id, pl);
      }
    }
  }, [orders, coin]);

  /* ---------- toolbar actions ---------- */
  const applyQuickRange = useCallback((secs: number) => {
    const chart = chartRef.current;
    if (!chart) return;
    const cs = usePerpsData.getState().candles[coinRef.current]?.[intervalRef.current as Interval];
    if (!cs || cs.length === 0) return;
    const lastT = cs[cs.length - 1].time;
    try {
      chart.timeScale().setVisibleRange({
        from: Math.max(cs[0].time, lastT - secs) as UTCTimestamp,
        to: lastT as UTCTimestamp,
      });
    } catch {
      chart.timeScale().fitContent();
    }
  }, []);

  const fullscreen = () => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  };

  /* Download the chart (canvas layers + drawings) as a branded PNG */
  const shoot = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (!w || !h) return;
    const BAR = 34;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h + BAR;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0b0e11";
    ctx.fillRect(0, 0, out.width, out.height);
    const layers = Array.from(wrap.querySelectorAll("canvas")) as HTMLCanvasElement[];
    for (const c of layers) {
      try { ctx.drawImage(c, 0, BAR, w, h); } catch { /* cross-origin — skip layer */ }
    }
    const drawC = canvasRef.current;
    if (drawC) {
      try { ctx.drawImage(drawC, 0, BAR, w, h); } catch { /* skip */ }
    }
    // header: pair · interval · price · UTC stamp · brand
    ctx.fillStyle = "#0b0e11";
    ctx.fillRect(0, 0, out.width, BAR);
    ctx.strokeStyle = "#1c1e24";
    ctx.beginPath();
    ctx.moveTo(0, BAR - 0.5);
    ctx.lineTo(out.width, BAR - 0.5);
    ctx.stroke();
    const cs = usePerpsData.getState().candles[coin]?.[interval];
    const lastPx = cs && cs.length ? cs[cs.length - 1].close : null;
    ctx.font = "600 13px 'Geist Mono', ui-monospace, monospace";
    ctx.fillStyle = "rgb(178,143,255)";
    const pair = `${baseName(coin)}-USD`;
    ctx.fillText(pair, 10, 22);
    ctx.fillStyle = "#8a8e98";
    ctx.fillText(
      `${tvLabel(interval)}${lastPx != null ? ` · ${lastPx}` : ""} · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
      16 + ctx.measureText(pair).width,
      22,
    );
    ctx.fillStyle = "rgb(178,143,255)";
    ctx.fillText("hyzr", out.width - 36, 22);
    out.toBlob((b) => {
      if (!b) return;
      const url = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hyzr-${coin.replace(/[:]/g, "-")}-${interval}-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, "image/png");
  };

  /* Topstep bracket chip helpers */
  const pos: Position | undefined = position && position.szi !== 0 ? position : undefined;
  const limitOrders = orders.filter((o) => o.coin === coin && o.kind === "Limit");
  const tpPnl = pos?.tpPx != null ? (pos.tpPx - pos.entryPx) * pos.szi : 0;
  const slPnl = pos?.slPx != null ? (pos.slPx - pos.entryPx) * pos.szi : 0;
  const winning = upnl >= 0;
  const entryBg = winning ? TP_COLOR : SL_COLOR;
  const entryFg = "#0a0a0a";
  const qtyTxt = pos ? `${pos.szi > 0 ? "+" : "-"}${fmtSzQuote(Math.abs(pos.szi), meta)}` : "";
  /* chip body drag → same pipeline as grabbing the line itself */
  const chipDrag = (kind: "entry" | "tp" | "sl") => (e: React.PointerEvent) => {
    if (!pos) return;
    e.stopPropagation();
    e.preventDefault();
    if (kind === "entry") {
      if (!bracketOn || (pos.tpPx != null && pos.slPx != null)) return; // bracket complete — entry is fixed
      beginDragRef.current?.("entryNew", pos.entryPx, e.clientY);
    } else {
      beginDragRef.current?.(kind, (kind === "tp" ? pos.tpPx : pos.slPx)!, e.clientY);
    }
  };
  const chipCls =
    "pointer-events-auto absolute left-1/2 flex h-[20px] -translate-x-1/2 touch-none items-center overflow-hidden rounded-[3px] font-GeistMono text-[11px] font-bold shadow-[0_1px_5px_rgba(0,0,0,0.65)]";
  const chipQty = "border-l border-black/30 bg-black/50 px-[6px] tabular-nums";
  const chipX =
    "ml-[2px] flex h-full w-[22px] items-center justify-center bg-[#cdcdcd] text-[14px] font-black leading-none text-black hover:bg-white";

  return (
    <div ref={shellRef} className="flex h-full w-full flex-col bg-black">
      {/* ============================ top toolbar ============================ */}
      <div className="relative flex h-[38px] max-h-[38px] min-h-[38px] flex-shrink-0 items-center justify-between border-b border-[#1c1e24] pl-[8px] pr-[12px]">
        <div className="flex items-center gap-[2px]">
          {/* interval dropdown */}
          <div className="relative">
            <button
              onClick={() => { setIvOpen((o) => !o); setTypeOpen(false); }}
              className={`flex h-[26px] items-center gap-[3px] rounded-[4px] border px-[7px] text-[12px] font-semibold text-[#d1d4dc] transition-colors hover:border-[rgb(178,143,255)]/50 ${ivOpen ? "border-[rgb(178,143,255)]/60 bg-[rgba(178,143,255,0.08)]" : "border-[#2a2e39]"}`}
            >
              {tvLabel(interval)}
              <i className="ri-arrow-down-s-line text-[13px] text-textTertiary" />
            </button>
            {ivOpen && (
              <Dropdown onClose={() => setIvOpen(false)} width={74}>
                {INTERVALS.map((iv) => (
                  <DropRow
                    key={iv}
                    label={tvLabel(iv)}
                    active={iv === interval}
                    onClick={() => { setIntervalLocal(iv); setIvOpen(false); }}
                  />
                ))}
              </Dropdown>
            )}
          </div>
          <span className="mx-[5px] h-[18px] w-px bg-[#2a2e39]" />
          {/* chart type + volume study */}
          <div className="relative">
            <button
              onClick={() => { setTypeOpen((o) => !o); setIvOpen(false); }}
              title="Chart type"
              className={`flex h-[28px] w-[28px] max-lg:h-[40px] max-lg:w-[40px] items-center justify-center rounded-[4px] transition-colors ${
                typeOpen ? "bg-[rgba(178,143,255,0.12)] text-white" : "text-[#b2b5be] hover:bg-[#1e222d] hover:text-white"
              }`}
            >
              <CandleIcon />
            </button>
            {typeOpen && (
              <Dropdown onClose={() => setTypeOpen(false)} width={130}>
                <DropRow label="Candles" active={chartType === "candles"} onClick={() => { setChartType("candles"); setTypeOpen(false); }} />
                <DropRow label="Line" active={chartType === "line"} onClick={() => { setChartType("line"); setTypeOpen(false); }} />
                <div className="mx-[6px] my-[3px] h-px bg-[#2a2e39]" />
                <button
                  onClick={() => setShowVolume((v) => !v)}
                  className="flex w-full items-center justify-between rounded-[4px] px-[10px] py-[7px] text-left text-[12px] text-[#d1d4dc] hover:bg-[#1e222d]"
                >
                  Volume
                  <span className={`flex h-[12px] w-[12px] items-center justify-center rounded-[3px] text-[9px] font-bold ${showVolume ? "bg-[rgb(178,143,255)] text-black" : "border border-[#4a4e59] text-transparent"}`}>
                    ✓
                  </span>
                </button>
              </Dropdown>
            )}
          </div>
        </div>

        <div className="flex items-center gap-[2px]">
          {/* Position bracket — drag the entry line to draw TP/SL */}
          <button
            title={`Position Bracket — ${bracketOn ? "drag the entry line up/down to draw TP/SL" : "off"}`}
            onClick={() => setBracketOn((v) => !v)}
            className={`flex h-[26px] w-[26px] items-center justify-center rounded-[4px] border transition-colors ${
              bracketOn
                ? "border-[rgb(178,143,255)] bg-[rgba(178,143,255,0.2)] text-[#c9adff]"
                : "border-transparent text-[#b2b5be] hover:bg-[#1e222d] hover:text-white"
            }`}
          >
            <BracketIcon />
          </button>
          {/* Topstep click-to-place limit mode */}
          <button
            title={limitArm ? "Limit mode armed — click the chart (Esc to cancel)" : "Place limit order — then click the chart at your price"}
            onClick={() => setLimitArm((v) => !v)}
            className={`flex h-[26px] w-[26px] items-center justify-center rounded-[4px] border transition-colors ${
              limitArm
                ? "border-[rgb(178,143,255)] bg-[rgba(178,143,255,0.2)] text-[#c9adff]"
                : "border-transparent text-[#b2b5be] hover:bg-[#1e222d] hover:text-white"
            }`}
          >
            <i className="ri-add-line text-[18px]" />
          </button>
          {/* Drawing tools — compact dropdown (engine always existed; fx7 removed only the rail) */}
          <div className="relative">
            <button
              title="Drawing tools"
              onClick={() => { setToolsOpen((o) => !o); setIvOpen(false); setTypeOpen(false); }}
              className={`flex h-[26px] w-[26px] items-center justify-center rounded-[4px] border transition-colors ${
                tool !== "cross"
                  ? "border-[rgb(178,143,255)] bg-[rgba(178,143,255,0.2)] text-[#c9adff]"
                  : toolsOpen
                    ? "border-[#2a2e39] bg-[#1e222d] text-white"
                    : "border-transparent text-[#b2b5be] hover:bg-[#1e222d] hover:text-white"
              }`}
            >
              <i className="ri-pencil-line text-[15px]" />
            </button>
            {toolsOpen && (
              <Dropdown onClose={() => setToolsOpen(false)} width={168}>
                {([
                  ["cross", "Crosshair"],
                  ["trend", "Trend line"],
                  ["horz", "Horizontal line"],
                  ["fib", "Fib retracement"],
                  ["brush", "Brush"],
                  ["text", "Text"],
                  ["sticker", "Sticker"],
                  ["measure", "Measure"],
                ] as Array<[ToolKey, string]>).map(([k, lab]) => (
                  <DropRow
                    key={k}
                    label={lab}
                    active={tool === k}
                    onClick={() => { setTool(k); setLimitArm(false); setToolsOpen(false); }}
                  />
                ))}
                <div className="mx-[6px] my-[3px] h-px bg-[#2a2e39]" />
                <DropRow label={`Magnet${magnetOn ? "  \u2713" : ""}`} active={magnetOn} onClick={() => setMagnetOn((v) => !v)} />
                <DropRow label={`Hide drawings${hiddenDraw ? "  \u2713" : ""}`} active={hiddenDraw} onClick={() => setHiddenDraw((v) => !v)} />
                <DropRow label={`Lock drawings${lockDraw ? "  \u2713" : ""}`} active={lockDraw} onClick={() => setLockDraw((v) => !v)} />
                <div className="mx-[6px] my-[3px] h-px bg-[#2a2e39]" />
                <DropRow
                  label="Clear all"
                  active={false}
                  onClick={() => {
                    undoRef.current.push(drawingsRef.current);
                    setDrawings([]);
                    setTool("cross");
                    setToolsOpen(false);
                  }}
                />
              </Dropdown>
            )}
          </div>
          <span className="mx-[3px] h-[18px] w-px bg-[#2a2e39]" />
          <ToolBtn title="Download chart image" onClick={shoot}>
            <i className="ri-camera-3-line text-[15px]" />
          </ToolBtn>
          <ToolBtn title="Fullscreen" onClick={fullscreen}>
            <i className="ri-fullscreen-line text-[15px]" />
          </ToolBtn>
        </div>
      </div>

      {/* ============================== chart ============================== */}
      <div className="flex min-h-[0px] min-w-0 flex-1">
        <div className="relative min-h-[0px] min-w-0 flex-1">
          <div ref={wrapRef} className="h-full w-full touch-none" />

          {/* loading pill — non-blocking; candles usually land in <1s */}
          {(!candles || candles.length === 0) && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="flex items-center gap-[8px] rounded-[6px] border border-[#2a2e39] bg-[rgba(19,23,34,0.85)] px-[12px] py-[6px] text-[12px] text-[#b2b5be]">
                <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[rgb(178,143,255)]" />
                Loading {baseName(coin)} · {tvLabel(interval)}…
              </div>
            </div>
          )}

          {/* armed hint */}
          {limitArm ? (
            <div className="pointer-events-none absolute left-1/2 top-[8px] z-30 -translate-x-1/2 whitespace-nowrap rounded-[6px] border border-[rgb(178,143,255)]/40 bg-[rgba(20,16,32,0.92)] px-[10px] py-[4px] font-GeistMono text-[11px] text-[#c9adff]">
              Click the chart to place your limit · Esc to cancel
            </div>
          ) : null}

          {/* drawings overlay (render-only — events pass through to the chart) */}
          <canvas ref={canvasRef} className="pointer-events-none absolute left-0 top-0 z-10" />

          {/* TopstepX-style position chips: [⋮⋮ | P&L | qty | ✕] */}
          {pos ? (
            <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
              {/* position chip: live P&L · qty · close (drag body to draw bracket) */}
              <div
                ref={entryChipRef}
                data-chip="entry"
                onPointerDown={chipDrag("entry")}
                title={bracketOn && (pos.tpPx == null || pos.slPx == null) ? "Drag up/down to draw TP / SL" : "Position"}
                className={`${chipCls} ${bracketOn && (pos.tpPx == null || pos.slPx == null) ? "cursor-ns-resize" : "cursor-default"}`}
                style={{ backgroundColor: entryBg, color: entryFg, top: -100, display: "none" }}
              >
                <span className="flex h-full w-[14px] items-center justify-center bg-black/15"><GripDots /></span>
                <span data-pnl className="px-[7px] tabular-nums">{fmtUpnlMoney(upnl)}</span>
                <span className={chipQty}>{qtyTxt}</span>
                <button
                  data-chip-btn
                  title="Close position"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => void closePosition(coin)}
                  className={chipX}
                >
                  ✕
                </button>
              </div>

              {/* TP chip: projected P&L · qty · remove — drag body to adjust */}
              <div
                ref={tpChipRef}
                data-chip="tp"
                onPointerDown={chipDrag("tp")}
                title="Take profit — drag to adjust"
                className={`${chipCls} cursor-ns-resize`}
                style={{ backgroundColor: TP_COLOR, color: "#0a0a0a", top: -100, display: "none" }}
              >
                <span className="flex h-full w-[14px] items-center justify-center bg-black/15"><GripDots /></span>
                <span data-pnl className="px-[7px] tabular-nums">{fmtBracketMoney(tpPnl)}</span>
                <span className={chipQty}>{qtyTxt}</span>
                <button
                  data-chip-btn
                  title="Remove take profit"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { editTpSl(coin, null, pos.slPx); toast("Take profit removed", "info"); }}
                  className={chipX}
                >
                  ✕
                </button>
              </div>

              {/* SL chip */}
              <div
                ref={slChipRef}
                data-chip="sl"
                onPointerDown={chipDrag("sl")}
                title="Stop loss — drag to adjust"
                className={`${chipCls} cursor-ns-resize`}
                style={{ backgroundColor: SL_COLOR, color: "#0a0a0a", top: -100, display: "none" }}
              >
                <span className="flex h-full w-[14px] items-center justify-center bg-black/15"><GripDots /></span>
                <span data-pnl className="px-[7px] tabular-nums">{fmtBracketMoney(slPnl)}</span>
                <span className={chipQty}>{qtyTxt}</span>
                <button
                  data-chip-btn
                  title="Remove stop loss"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { editTpSl(coin, pos.tpPx, null); toast("Stop loss removed", "info"); }}
                  className={chipX}
                >
                  ✕
                </button>
              </div>
            </div>
          ) : null}

          {/* working limit-order chips: [BUY sz @ px | ✕] — drag body to reprice */}
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
            {limitOrders.map((o) => (
              <div
                key={o.id}
                ref={(el) => { if (el) orderChipRef.current.set(o.id, el); else orderChipRef.current.delete(o.id); }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  beginOrderDragRef.current?.(o.id, o.px, e.clientY);
                }}
                title="Working limit order — drag to reprice, ✕ to cancel"
                className={`pointer-events-auto absolute left-1/2 flex h-[20px] -translate-x-1/2 touch-none cursor-ns-resize items-center overflow-hidden rounded-[3px] font-GeistMono text-[11px] font-bold shadow-[0_1px_5px_rgba(0,0,0,0.65)] ${
                  o.isBuy ? "bg-[#2fe3ac] text-[#0a0a0a]" : "bg-[#ec397a] text-white"
                }`}
                style={{ top: -100, display: "none" }}
              >
                <span className="whitespace-nowrap px-[7px] tabular-nums">
                  {o.isBuy ? "BUY" : "SELL"} {fmtSzQuote(o.sz, meta)} @ {fmtPxQuote(o.px, meta)}
                </span>
                <button
                  data-ochip-btn
                  title="Cancel order"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { useTradeStore.getState().cancelOrder(o.id); toast("Limit order cancelled", "info"); }}
                  className="ml-[2px] flex h-full w-[22px] items-center justify-center bg-[#cdcdcd] text-[14px] font-black leading-none text-black hover:bg-white"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* text tool input */}
          {textDraft ? (
            <input
              autoFocus
              value={textDraft.value}
              onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && textDraft.value.trim()) {
                  commitDrawing({
                    id: uid(),
                    kind: "text",
                    points: [{ lp: textDraft.lp, price: textDraft.price }],
                    text: textDraft.value.trim(),
                  });
                  setTextDraft(null);
                } else if (e.key === "Escape") {
                  setTextDraft(null);
                }
              }}
              onBlur={() => {
                if (textDraft.value.trim()) {
                  commitDrawing({
                    id: uid(),
                    kind: "text",
                    points: [{ lp: textDraft.lp, price: textDraft.price }],
                    text: textDraft.value.trim(),
                  });
                }
                setTextDraft(null);
              }}
              placeholder="Type text…"
              style={{ left: textDraft.x + 4, top: textDraft.y - 11 }}
              className="absolute z-30 w-[140px] rounded-[3px] border border-[#2a2e39] bg-[#131722] px-[6px] py-[3px] text-[12px] text-white outline-none placeholder:text-textTertiary"
            />
          ) : null}

          {/* sticker picker */}
          {stickerDraft ? (
            <div
              className="absolute z-30 flex gap-[2px] rounded-[6px] border border-[#2a2e39] bg-[#131722] p-[4px] shadow-[0_8px_24px_rgba(0,0,0,0.55)]"
              style={{ left: Math.max(4, stickerDraft.x - 90), top: stickerDraft.y + 12 }}
            >
              {STICKERS.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    commitDrawing({
                      id: uid(),
                      kind: "sticker",
                      points: [{ lp: stickerDraft.lp, price: stickerDraft.price }],
                      emoji: e,
                    });
                    setStickerDraft(null);
                  }}
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-[4px] text-[16px] hover:bg-white/10"
                >
                  {e}
                </button>
              ))}
            </div>
          ) : null}

          {/* TV legend */}
          <div className="pointer-events-none absolute left-[10px] top-[8px] z-10 flex flex-col gap-[3px] font-GeistMono text-[11px] leading-[14px]">
            <div className="flex items-center gap-[6px]">
              <span className="text-[12px] font-medium text-white">{base}-USD</span>
              <span className="text-textTertiary">· {tvLabel(interval)} ·</span>
              <span className="ml-[2px] h-[7px] w-[7px] animate-pulse rounded-full bg-[#2fe3ac]" />
            </div>
            {l && (
              <div className="flex items-center gap-[6px]">
                <span className={up ? "text-[#2fe3ac]" : "text-[#ec397a]"}>
                  <span className="text-textSecondary">O</span>{fmtPrice(meta, l.open)}
                </span>
                <span className={up ? "text-[#2fe3ac]" : "text-[#ec397a]"}>
                  <span className="text-textSecondary">H</span>{fmtPrice(meta, l.high)}
                </span>
                <span className={up ? "text-[#2fe3ac]" : "text-[#ec397a]"}>
                  <span className="text-textSecondary">L</span>{fmtPrice(meta, l.low)}
                </span>
                <span className={up ? "text-[#2fe3ac]" : "text-[#ec397a]"}>
                  <span className="text-textSecondary">C</span>{fmtPrice(meta, l.close)}
                </span>
                <span className={up ? "text-[#2fe3ac]" : "text-[#ec397a]"}>
                  {fmtPrice(meta, l.close - l.open)} ({l.close - l.open >= 0 ? "+" : ""}{l.open ? (((l.close - l.open) / l.open) * 100).toFixed(2) : "0.00"}%)
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===================== Topstep position strip ====================== */}
      {pos ? (
        <div className="flex h-[30px] max-h-[30px] min-h-[30px] flex-shrink-0 items-center justify-center gap-[16px] border-t border-[#1c1e24] bg-[#0b0d11] font-GeistMono text-[12.5px]">
          <span className="tabular-nums text-white">
            {qtyTxt} @ {fmtPrice(meta, pos.entryPx)}
          </span>
          <span className={`tabular-nums ${winning ? "text-[#2fe3ac]" : "text-[#ec397a]"}`}>
            UP&L {fmtUpnlMoney(upnl)}
          </span>
          <button
            title="Move stop loss to break-even"
            onClick={() => { editTpSl(coin, pos.tpPx, pos.entryPx); toast("Stop moved to break-even", "info"); }}
            className="flex h-[21px] items-center rounded-[4px] bg-[rgba(178,143,255,0.15)] px-[9px] text-[11px] font-semibold text-[#c9adff] transition-colors hover:bg-[rgba(178,143,255,0.28)]"
          >
            B/E
          </button>
        </div>
      ) : null}

      {/* ============================ bottom bar ============================ */}
      {/* fx20: the three clusters (quick ranges · clock · % log auto) used to
          butt together with 0px between them at mobile widths. On <lg the
          ranges strip is now its own horizontal scroller (no-scrollbar) while
          clock + toggles stay fixed, with hairline dividers (the FooterBar
          divider language) padding each cluster 8px on both sides = 17px of
          visual separation. Bar is 40px on mobile so the 40px tap targets sit
          inside the scroller without clipping, and the right padding reserves
          the FAB's corner so the floating order-ticket button can never
          intercept taps on the toggles. Desktop (lg+) is untouched:
          justify-between, no dividers, natural widths. */}
      <div className="flex h-[38px] max-h-[38px] min-h-[38px] flex-shrink-0 items-center justify-between border-t border-[#1c1e24] pl-[8px] pr-[10px] max-lg:h-[40px] max-lg:max-h-[40px] max-lg:min-h-[40px] max-lg:justify-start max-lg:gap-[6px] max-lg:pl-[6px] max-lg:pr-[68px]">
        <div className="no-scrollbar flex items-center gap-[2px] max-lg:min-w-0 max-lg:flex-1 max-lg:gap-[4px] max-lg:overflow-x-auto">
          {QUICK_RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => applyQuickRange(r.secs)}
              className="rounded-[4px] px-[6px] py-[3px] max-lg:min-h-[40px] max-lg:shrink-0 max-lg:px-[5px] text-[12px] text-[#b2b5be] hover:bg-[#1e222d] hover:text-white"
            >
              {r.label}
            </button>
          ))}
        </div>

        <span aria-hidden="true" className="hidden h-[16px] w-[1px] shrink-0 bg-white/10 max-lg:block" />

        <span className="shrink-0 font-GeistMono text-[12px] text-[#b2b5be] [font-variant-numeric:tabular-nums]">{clock}</span>

        <span aria-hidden="true" className="hidden h-[16px] w-[1px] shrink-0 bg-white/10 max-lg:block" />

        <div className="flex items-center gap-[2px] max-lg:shrink-0 max-lg:gap-[4px]">
          <button
            onClick={() => { setIsPct((p) => !p); if (!isPct) setIsLog(false); }}
            className={`rounded-[4px] px-[6px] py-[3px] max-lg:min-h-[40px] max-lg:px-[5px] text-[12px] transition-colors ${isPct ? "bg-[rgba(178,143,255,0.18)] text-[#c9adff]" : "text-[#b2b5be] hover:bg-[#1e222d] hover:text-white"}`}
          >
            %
          </button>
          <button
            onClick={() => { setIsLog((v) => !v); if (!isLog) setIsPct(false); }}
            className={`rounded-[4px] px-[6px] py-[3px] max-lg:min-h-[40px] max-lg:px-[5px] text-[12px] transition-colors ${isLog ? "bg-[rgba(178,143,255,0.18)] text-[#c9adff]" : "text-[#b2b5be] hover:bg-[#1e222d] hover:text-white"}`}
          >
            log
          </button>
          <button
            onClick={() => chartRef.current?.timeScale().fitContent()}
            className="rounded-[4px] px-[6px] py-[3px] max-lg:min-h-[40px] max-lg:px-[5px] text-[12px] text-[#b2b5be] hover:bg-[#1e222d] hover:text-white"
          >
            auto
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ toolbar atoms ------------------------------ */

function ToolBtn({ title, children, onClick }: { title: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-[28px] w-[28px] max-lg:h-[40px] max-lg:w-[40px] items-center justify-center rounded-[4px] text-[#b2b5be] transition-colors hover:bg-[rgba(178,143,255,0.10)] hover:text-white"
    >
      {children}
    </button>
  );
}

function Dropdown({ children, onClose, width }: { children: React.ReactNode; onClose: () => void; width: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return (
    <div
      ref={ref}
      style={{ width }}
      className="glass-pop pop-in absolute left-0 top-[32px] z-40 max-h-[320px] overflow-y-auto rounded-[8px] border border-white/10 py-[4px] shadow-[0_8px_24px_rgba(0,0,0,0.55)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </div>
  );
}

function DropRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center rounded-[4px] px-[10px] py-[7px] text-left text-[12px] ${
        active ? "bg-[rgba(178,143,255,0.16)] text-[#c9adff]" : "text-[#d1d4dc] hover:bg-[#1e222d]"
      }`}
    >
      {label}
    </button>
  );
}

/* --------------------------------- helpers --------------------------------- */

function toBar(c: Candle) {
  return { time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close };
}

function availableMarginNow(): number {
  const st = useTradeStore.getState();
  const mids = usePerpsData.getState().mids;
  let upnl = 0;
  let used = 0;
  for (const p of Object.values(st.positions)) {
    const mark = mids[p.coin] ?? p.entryPx;
    upnl += (mark - p.entryPx) * p.szi;
    used += Math.abs(p.szi) * p.entryPx / p.leverage;
  }
  return Math.max(0, st.balance + upnl - used);
}
