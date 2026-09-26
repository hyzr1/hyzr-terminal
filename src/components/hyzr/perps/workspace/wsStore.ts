"use client";
/**
 * Workspace store (fx19) — the TopstepX/ProjectX panel model.
 *
 * The Trade Lab is a set of independent, draggable, resizable panels living
 * in one workspace. Every panel:
 *   - has a type (chart / dom / order / positions / orders / trades / tas /
 *     account) — "+ Add Component" lists types not currently on screen
 *   - stores its geometry as FRACTIONS of the workspace box (x, y, w, h),
 *     so an arrangement scales cleanly across viewport sizes
 *   - carries a link color (null = independent). Panels sharing a color are
 *     locked to the SAME market: switching the symbol in one updates all
 *     others of that color (groupMarkets). Colorless panels keep their own
 *     market (coin === undefined → follows the primary store coin).
 *
 * The current arrangement auto-persists to localStorage on every change and
 * survives a refresh. Users can save named layouts ("Save Layout") and
 * switch between them ("Select Layout"); "Standard" + "DOM Only" ship as
 * built-in presets.
 */
import { create } from "zustand";
import type { PanelType, LinkColor, PanelInst, SavedLayout } from "./types";
import { DEFAULT_LAYOUTS } from "./types";

const PERSIST_KEY = "hyzr-trade-workspace-v1";

interface WsState {
  panels: PanelInst[];
  groupMarkets: Partial<Record<LinkColor, string>>;
  savedLayouts: SavedLayout[];
  activeLayout: string | null;
  /** bumped to hand the newest panel the top z-slot */
  topSeq: number;
  // actions
  addPanel: (type: PanelType, geom?: Partial<Omit<PanelInst, "id" | "type">>) => string;
  removePanel: (id: string) => void;
  setGeom: (id: string, geom: Partial<Pick<PanelInst, "x" | "y" | "w" | "h">>) => void;
  bringToFront: (id: string) => void;
  setLink: (id: string, link: LinkColor | null) => void;
  setGroupMarket: (link: LinkColor, coin: string) => void;
  setPanelCoin: (id: string, coin: string) => void;
  saveLayout: (name: string) => void;
  applyLayout: (name: string) => void;
  deleteLayout: (name: string) => void;
  rehydrate: () => void;
}

let seq = 0;
const uid = () => `p${Date.now().toString(36)}-${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function loadPersisted(): Partial<WsState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = JSON.parse(localStorage.getItem(PERSIST_KEY) || "");
    if (!raw || !Array.isArray(raw.panels)) return null;
    const panels = raw.panels
      .filter((p: PanelInst) => p && typeof p.type === "string" && Number.isFinite(p.x))
      .map((p: PanelInst) => ({ ...p, id: String(p.id), link: p.link ?? null }));
    return {
      panels,
      groupMarkets: raw.groupMarkets ?? {},
      savedLayouts: Array.isArray(raw.savedLayouts) ? raw.savedLayouts : [],
      activeLayout: raw.activeLayout ?? null,
      topSeq: panels.length + 1,
    };
  } catch {
    return null;
  }
}

function persist(s: Pick<WsState, "panels" | "groupMarkets" | "savedLayouts" | "activeLayout">) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify({
      panels: s.panels,
      groupMarkets: s.groupMarkets,
      savedLayouts: s.savedLayouts,
      activeLayout: s.activeLayout,
    }));
  } catch { /* private mode */ }
}

/** default geometry (fractions) per panel type — used by "+ Add Component" */
export const DEFAULT_GEOM: Record<PanelType, { w: number; h: number }> = {
  chart: { w: 0.56, h: 0.68 },
  dom: { w: 0.24, h: 0.68 },
  order: { w: 0.2, h: 0.68 },
  positions: { w: 0.62, h: 0.32 },
  orders: { w: 0.42, h: 0.3 },
  trades: { w: 0.42, h: 0.3 },
  tas: { w: 0.26, h: 0.62 },
  account: { w: 0.26, h: 0.42 },
};

export const useWorkspace = create<WsState>((set, get) => ({
  panels: DEFAULT_LAYOUTS[0].panels,
  groupMarkets: {},
  savedLayouts: [],
  activeLayout: DEFAULT_LAYOUTS[0].name,
  topSeq: 1,

  addPanel: (type, geom) => {
    const id = uid();
    const n = get().panels.length;
    set((s) => ({
      panels: [
        ...s.panels,
        {
          id,
          type,
          // cascade so back-to-back inserts don't perfectly overlap
          x: geom?.x ?? Math.min(0.55, 0.08 + n * 0.045),
          y: geom?.y ?? Math.min(0.5, 0.06 + n * 0.045),
          w: geom?.w ?? DEFAULT_GEOM[type].w,
          h: geom?.h ?? DEFAULT_GEOM[type].h,
          link: geom?.link ?? null,
        },
      ],
      topSeq: s.topSeq + 1,
    }));
    get().bringToFront(id);
    persist(get());
    return id;
  },

  removePanel: (id) => {
    set((s) => ({ panels: s.panels.filter((p) => p.id !== id) }));
    persist(get());
  },

  setGeom: (id, geom) => {
    set((s) => ({
      panels: s.panels.map((p) => (p.id === id ? { ...p, ...geom } : p)),
    }));
    persist(get());
  },

  bringToFront: (id) => {
    set((s) => {
      const i = s.panels.findIndex((p) => p.id === id);
      if (i < 0 || i === s.panels.length - 1) return {};
      const panels = s.panels.slice();
      const [p] = panels.splice(i, 1);
      panels.push(p);
      return { panels, topSeq: s.topSeq + 1 };
    });
  },

  setLink: (id, link) => {
    set((s) => ({
      panels: s.panels.map((p) => (p.id === id ? { ...p, link } : p)),
    }));
    persist(get());
  },

  setGroupMarket: (link, coin) => {
    set((s) => ({ groupMarkets: { ...s.groupMarkets, [link]: coin } }));
    persist(get());
  },

  setPanelCoin: (id, coin) => {
    set((s) => ({ panels: s.panels.map((p) => (p.id === id ? { ...p, coin } : p)) }));
    persist(get());
  },

  saveLayout: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((s) => {
      const entry: SavedLayout = {
        name: trimmed,
        panels: s.panels.map((p) => ({ ...p })),
        groupMarkets: { ...s.groupMarkets },
      };
      const savedLayouts = [...s.savedLayouts.filter((l) => l.name !== trimmed), entry];
      return { savedLayouts, activeLayout: trimmed };
    });
    persist(get());
  },

  applyLayout: (name) => {
    const builtin = DEFAULT_LAYOUTS.find((l) => l.name === name);
    const saved = get().savedLayouts.find((l) => l.name === name);
    const layout = builtin ?? saved;
    if (!layout) return;
    set((s) => ({
      panels: layout.panels.map((p) => ({ ...p, id: uid() })),
      groupMarkets: { ...(layout.groupMarkets ?? {}) },
      activeLayout: name,
      topSeq: s.topSeq + 1,
    }));
    persist(get());
  },

  deleteLayout: (name) => {
    set((s) => ({
      savedLayouts: s.savedLayouts.filter((l) => l.name !== name),
      activeLayout: s.activeLayout === name ? null : s.activeLayout,
    }));
    persist(get());
  },

  rehydrate: () => {
    const data = loadPersisted();
    if (data) set(data);
  },
}));
