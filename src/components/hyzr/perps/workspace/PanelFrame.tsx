"use client";
/**
 * PanelFrame (fx19) — the chrome every workspace panel shares:
 *   · header = drag handle (TopstepX grab-and-reposition), with the
 *     link-color dot (None/Yellow/Red/Blue/Gold), per-panel symbol picker,
 *     panel title, and a close button
 *   · 8 resize handles (4 edges + 4 corners), each ≥7px with hover highlight
 *     + an always-visible corner grip — easy to grab, never a sliver
 *   · focused panel gets a ring; pointer-down brings it to the front
 * Geometry is stored as fractions of the workspace box and clamped to
 * per-type min px sizes; drops snap to a fine grid (TopstepX tiles).
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, memo } from "react";
import { useWorkspace } from "./wsStore";
import { LINK_COLORS, MIN_PX, PANEL_META, type PanelInst, type LinkColor } from "./types";
import { baseName } from "@/lib/hyperliquid/types";
import HlIcon from "../HlIcon";
import PerpsChart from "../PerpsChart";
import DomPanel from "../DomPanel";
import TradePanel from "../TradePanel";
import { PositionsTable, OrdersTable, FillsTable } from "../PositionsPanel";
import TimeAndSalesPanel from "../TimeAndSalesPanel";
import AccountPanel from "../AccountPanel";

const round4 = (v: number) => +v.toFixed(4);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const SNAP = 240; // snap grid = 1/240 of the workspace

export interface WorkspaceCtxValue {
  hostEl: () => HTMLElement | null;
  /** open the market picker scoped to this panel */
  onSymbolClick: (panelId: string) => void;
}
export const WorkspaceCtx = createContext<WorkspaceCtxValue>({
  hostEl: () => null,
  onSymbolClick: () => undefined,
});

interface Props {
  panel: PanelInst;
  z: number;
  focused: boolean;
  /** resolved market for this panel (link color / own coin / primary) */
  coin: string;
}

function PanelFrameImpl({ panel, z, focused, coin }: Props) {
  const { hostEl, onSymbolClick } = useContext(WorkspaceCtx);
  const setGeom = useWorkspace((s) => s.setGeom);
  const bringToFront = useWorkspace((s) => s.bringToFront);
  const removePanel = useWorkspace((s) => s.removePanel);
  const setLink = useWorkspace((s) => s.setLink);

  const [linkOpen, setLinkOpen] = useState(false);
  const linkRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const meta = PANEL_META[panel.type];
  const showSymbol = panel.type === "chart" || panel.type === "dom" || panel.type === "order" || panel.type === "tas";
  const linkHex = panel.link ? LINK_COLORS.find((c) => c.id === panel.link)?.hex : null;

  useEffect(() => {
    if (!linkOpen) return;
    const h = (e: MouseEvent) => {
      if (linkRef.current && !linkRef.current.contains(e.target as Node)) setLinkOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [linkOpen]);

  /* ---------------- drag (header) ---------------- */
  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest("button, input, [data-no-drag]")) return;
      e.preventDefault();
      const host = hostEl();
      if (!host) return;
      const box = host.getBoundingClientRect();
      if (box.width < 40 || box.height < 40) return;
      bringToFront(panel.id);
      setDragging(true);
      document.body.style.userSelect = "none";
      const startX = e.clientX;
      const startY = e.clientY;
      const start = { x: panel.x, y: panel.y };
      let lastDx = 0;
      let lastDy = 0;
      const move = (ev: PointerEvent) => {
        const dx = (ev.clientX - startX) / box.width;
        const dy = (ev.clientY - startY) / box.height;
        const nx = clamp(start.x + dx, 0, 1 - panel.w);
        const ny = clamp(start.y + dy, 0, 1 - panel.h);
        setGeom(panel.id, { x: round4(nx), y: round4(ny) });
      };
      const up = () => {
        window.removeEventListener("pointermove", moveWrap);
        window.removeEventListener("pointerup", up);
        document.body.style.userSelect = "";
        setDragging(false);
        // snap to grid on drop (position only — sizes stay as dropped)
        setGeom(panel.id, {
          x: round4(Math.round(clamp(start.x + (lastDx / box.width), 0, 1 - panel.w) * SNAP) / SNAP),
          y: round4(Math.round(clamp(start.y + (lastDy / box.height), 0, 1 - panel.h) * SNAP) / SNAP),
        });
      };
      const moveWrap = (ev: PointerEvent) => {
        lastDx = ev.clientX - startX;
        lastDy = ev.clientY - startY;
        move(ev);
      };
      window.addEventListener("pointermove", moveWrap);
      window.addEventListener("pointerup", up);
    },
    [panel, hostEl, bringToFront, setGeom],
  );

  /* ---------------- resize (edges + corners) ---------------- */
  const beginResize = useCallback(
    (e: React.PointerEvent, dir: string) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const host = hostEl();
      if (!host) return;
      const box = host.getBoundingClientRect();
      if (box.width < 40 || box.height < 40) return;
      bringToFront(panel.id);
      setDragging(true);
      document.body.style.userSelect = "none";
      const startX = e.clientX;
      const startY = e.clientY;
      const start = { x: panel.x, y: panel.y, w: panel.w, h: panel.h };
      const minW = Math.max(0.08, MIN_PX[panel.type].w / box.width);
      const minH = Math.max(0.08, MIN_PX[panel.type].h / box.height);

      const move = (ev: PointerEvent) => {
        const dx = (ev.clientX - startX) / box.width;
        const dy = (ev.clientY - startY) / box.height;
        let { x, y, w, h } = start;
        if (dir.includes("e")) w = clamp(start.w + dx, minW, 1 - start.x);
        if (dir.includes("s")) h = clamp(start.h + dy, minH, 1 - start.y);
        if (dir.includes("w")) {
          w = clamp(start.w - dx, minW, start.x + start.w);
          x = start.x + start.w - w;
        }
        if (dir.includes("n")) {
          h = clamp(start.h - dy, minH, start.y + start.h);
          y = start.y + start.h - h;
        }
        setGeom(panel.id, { x: round4(x), y: round4(y), w: round4(w), h: round4(h) });
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        document.body.style.userSelect = "";
        setDragging(false);
        // snap the moving edges to the grid
        const cur = useWorkspace.getState().panels.find((p) => p.id === panel.id);
        if (cur) {
          const snap = (v: number) => round4(Math.round(v * SNAP) / SNAP);
          setGeom(panel.id, {
            x: snap(cur.x), y: snap(cur.y), w: snap(cur.w), h: snap(cur.h),
          });
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [panel, hostEl, bringToFront, setGeom],
  );

  const grip =
    "absolute z-[5] touch-none transition-colors hover:bg-[rgba(178,143,255,0.22)] active:bg-[rgba(178,143,255,0.32)]";

  return (
    <div
      data-panel={panel.type}
      data-panel-id={panel.id}
      className={`absolute flex flex-col overflow-hidden rounded-[10px] border bg-backgroundSecondary shadow-[0_2px_14px_rgba(0,0,0,0.35)] transition-[border-color,box-shadow] ${
        focused
          ? "border-white/[0.16] shadow-[0_10px_34px_rgba(0,0,0,0.5)]"
          : "border-white/[0.08] hover:border-white/[0.14]"
      } ${dragging ? "select-none" : ""}`}
      style={{
        left: `${panel.x * 100}%`,
        top: `${panel.y * 100}%`,
        width: `${panel.w * 100}%`,
        height: `${panel.h * 100}%`,
        zIndex: z,
      }}
      onPointerDown={() => bringToFront(panel.id)}
    >
      {/* ---------------- header (drag handle) ---------------- */}
      <div
        onPointerDown={onHeaderPointerDown}
        className={`flex h-[30px] flex-shrink-0 items-center gap-[6px] border-b border-primaryStroke bg-[#131417] px-[8px] ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        data-testid="panel-header"
      >
        {/* link color dot */}
        <div className="relative" ref={linkRef} data-no-drag>
          <button
            onClick={() => setLinkOpen((o) => !o)}
            title={panel.link ? `Linked: ${panel.link}` : "Link color — sync this panel to a market group"}
            className="flex h-[22px] w-[18px] items-center justify-center rounded-[5px] transition-colors hover:bg-white/[0.07]"
          >
            <span
              className="h-[9px] w-[9px] rounded-full border transition-transform active:scale-[0.9]"
              style={
                linkHex
                  ? { backgroundColor: linkHex, borderColor: linkHex, boxShadow: `0 0 5px ${linkHex}66` }
                  : { borderColor: "rgba(255,255,255,0.35)", backgroundColor: "transparent" }
              }
            />
          </button>
          {linkOpen && (
            <div className="glass-pop pop-in absolute left-0 top-[24px] z-50 w-[112px] rounded-[8px] border border-white/10 p-[4px] shadow-dropdown">
              <button
                onClick={() => { setLink(panel.id, null); setLinkOpen(false); }}
                className="flex w-full items-center gap-[7px] rounded-[5px] px-[7px] py-[4px] text-left text-[11px] text-textSecondary hover:bg-white/[0.06]"
              >
                <span className="h-[9px] w-[9px] rounded-full border border-white/30" />
                None
              </button>
              {LINK_COLORS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setLink(panel.id, c.id as LinkColor); setLinkOpen(false); }}
                  className="flex w-full items-center gap-[7px] rounded-[5px] px-[7px] py-[4px] text-left text-[11px] capitalize text-textSecondary hover:bg-white/[0.06]"
                >
                  <span className="h-[9px] w-[9px] rounded-full" style={{ backgroundColor: c.hex }} />
                  {c.label}
                  {panel.link === c.id && <i className="ri-check-line ml-auto text-[12px] text-textPrimary" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* per-panel symbol picker (market-bound panels) */}
        {showSymbol && (
          <button
            onClick={() => onSymbolClick(panel.id)}
            className="flex h-[22px] items-center gap-[4px] rounded-[5px] px-[4px] transition-colors hover:bg-white/[0.07]"
            title="Change market"
            data-testid={`panel-symbol-${panel.type}`}
          >
            <HlIcon coin={coin} size={13} />
            <span className="font-GeistMono text-[11px] font-semibold text-textPrimary">{baseName(coin)}</span>
            <i className="ri-arrow-down-s-line text-[11px] text-textTertiary" />
          </button>
        )}

        <span className="truncate text-[11px] font-medium text-textSecondary">{meta.label}</span>

        <button
          onClick={() => removePanel(panel.id)}
          title="Close panel"
          aria-label={`Close ${meta.label} panel`}
          className="ml-auto flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-[5px] text-textTertiary transition-colors hover:bg-decrease/20 hover:text-decrease"
        >
          <i className="ri-close-line text-[14px] leading-none" />
        </button>
      </div>

      {/* ---------------- body ---------------- */}
      <div className="relative flex min-h-[0px] flex-1 flex-col overflow-hidden">
        {panel.type === "chart" && <ChartBody coin={coin} />}
        {panel.type === "dom" && <DomBody coin={coin} />}
        {panel.type === "order" && <OrderBody coin={coin} />}
        {panel.type === "positions" && <PositionsBody />}
        {panel.type === "orders" && <OrdersBody />}
        {panel.type === "trades" && <TradesBody />}
        {panel.type === "tas" && <TasBody coin={coin} />}
        {panel.type === "account" && <AccountBody />}
      </div>

      {/* ---------------- resize handles ---------------- */}
      <div onPointerDown={(e) => beginResize(e, "n")} className={`${grip} left-[10px] right-[10px] top-0 h-[7px] cursor-ns-resize`} />
      <div onPointerDown={(e) => beginResize(e, "s")} className={`${grip} bottom-0 left-[10px] right-[10px] h-[7px] cursor-ns-resize`} />
      <div onPointerDown={(e) => beginResize(e, "w")} className={`${grip} bottom-[10px] left-0 top-[10px] w-[7px] cursor-ew-resize`} />
      <div onPointerDown={(e) => beginResize(e, "e")} className={`${grip} bottom-[10px] right-0 top-[10px] w-[7px] cursor-ew-resize`} />
      <div onPointerDown={(e) => beginResize(e, "nw")} className={`${grip} left-0 top-0 h-[12px] w-[12px] cursor-nwse-resize`} />
      <div onPointerDown={(e) => beginResize(e, "ne")} className={`${grip} right-0 top-0 h-[12px] w-[12px] cursor-nesw-resize`} />
      <div onPointerDown={(e) => beginResize(e, "sw")} className={`${grip} bottom-0 left-0 h-[12px] w-[12px] cursor-nesw-resize`} />
      <div
        onPointerDown={(e) => beginResize(e, "se")}
        title="Drag to resize"
        className={`${grip} bottom-0 right-0 flex h-[14px] w-[14px] cursor-nwse-resize items-end justify-end p-[2px]`}
      >
        <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor" className="text-textTertiary group-hover:text-textSecondary">
          <circle cx="7.5" cy="7.5" r="1" /><circle cx="4.5" cy="7.5" r="1" /><circle cx="7.5" cy="4.5" r="1" />
        </svg>
      </div>
    </div>
  );
}

/* memoized bodies — geometry drags re-render only the frame, never the
   heavy content (chart/ladder keep their canvases untouched) */

const ChartBody = memo(function ChartBody({ coin }: { coin: string }) {
  return <PerpsChart coin={coin} />;
});
const DomBody = memo(function DomBody({ coin }: { coin: string }) {
  return <DomPanel coin={coin} />;
});
const OrderBody = memo(function OrderBody({ coin }: { coin: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <TradePanel variant="panel" coin={coin} />
    </div>
  );
});
const PositionsBody = memo(function PositionsBody() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PositionsTable />
    </div>
  );
});
const OrdersBody = memo(function OrdersBody() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <OrdersTable />
    </div>
  );
});
const TradesBody = memo(function TradesBody() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <FillsTable />
    </div>
  );
});
const TasBody = memo(function TasBody({ coin }: { coin: string }) {
  return <TimeAndSalesPanel coin={coin} />;
});
const AccountBody = memo(function AccountBody() {
  return <AccountPanel />;
});

export const PanelFrame = memo(PanelFrameImpl);
