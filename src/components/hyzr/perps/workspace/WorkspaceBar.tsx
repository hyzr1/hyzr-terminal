"use client";
/**
 * WorkspaceBar (fx19) — the terminal control strip, TopstepX-style:
 *   · left: "Select Layout" dropdown (built-ins + saved layouts) and
 *     "Save Layout" (names the current arrangement + link groups)
 *   · right: "+ Add Component" — lists panel types NOT currently on screen;
 *     choosing one inserts it into the layout
 */
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "./wsStore";
import { DEFAULT_LAYOUTS, PANEL_META, type PanelType } from "./types";
import { toast } from "@/lib/hyperliquid/tradeStore";

const ALL_TYPES = Object.keys(PANEL_META) as PanelType[];

export default function WorkspaceBar() {
  const panels = useWorkspace((s) => s.panels);
  const savedLayouts = useWorkspace((s) => s.savedLayouts);
  const activeLayout = useWorkspace((s) => s.activeLayout);
  const applyLayout = useWorkspace((s) => s.applyLayout);
  const saveLayout = useWorkspace((s) => s.saveLayout);
  const deleteLayout = useWorkspace((s) => s.deleteLayout);
  const addPanel = useWorkspace((s) => s.addPanel);

  const [openMenu, setOpenMenu] = useState<"layouts" | "save" | "add" | null>(null);
  const [layoutName, setLayoutName] = useState("");
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const missing = ALL_TYPES.filter((t) => !panels.some((p) => p.type === t));
  const layoutNames = [
    ...DEFAULT_LAYOUTS.map((l) => l.name),
    ...savedLayouts.map((l) => l.name).filter((n) => !DEFAULT_LAYOUTS.some((l) => l.name === n)),
  ];

  return (
    <div
      ref={barRef}
      className="relative z-[60] flex h-[38px] flex-shrink-0 items-center gap-[8px] border-b border-primaryStroke bg-backgroundSecondary px-[10px]"
      data-testid="workspace-bar"
    >
      {/* ---------------- Select Layout ---------------- */}
      <div className="relative">
        <button
          onClick={() => setOpenMenu(openMenu === "layouts" ? null : "layouts")}
          data-testid="select-layout"
          className={`flex h-[26px] items-center gap-[6px] rounded-[7px] border px-[9px] text-[11.5px] font-medium transition-colors ${
            openMenu === "layouts"
              ? "border-primaryBlue/60 bg-primaryBlue/10 text-textPrimary"
              : "border-primaryStroke bg-backgroundTertiary text-textSecondary hover:text-textPrimary"
          }`}
        >
          <i className="ri-layout-grid-line text-[13px]" />
          <span className="text-textTertiary">Layout</span>
          <span className="max-w-[140px] truncate">{activeLayout ?? "Custom"}</span>
          <i className="ri-arrow-down-s-line text-[12px] text-textTertiary" />
        </button>
        {openMenu === "layouts" && (
          <div className="glass-pop pop-in absolute left-0 top-[30px] z-50 w-[210px] rounded-[9px] border border-white/10 p-[4px] shadow-dropdown" data-testid="layout-menu">
            {layoutNames.map((name) => (
              <div key={name} className="group flex items-center">
                <button
                  onClick={() => { applyLayout(name); setOpenMenu(null); toast(`Layout: ${name}`, "info"); }}
                  className={`flex min-h-[28px] flex-1 items-center gap-[7px] rounded-[6px] px-[8px] py-[4px] text-left text-[12px] transition-colors ${
                    activeLayout === name ? "bg-primaryStroke/60 text-textPrimary" : "text-textSecondary hover:bg-primaryStroke/30 hover:text-textPrimary"
                  }`}
                >
                  <i className={`${DEFAULT_LAYOUTS.some((l) => l.name === name) ? "ri-shapes-line" : "ri-bookmark-line"} text-[13px] text-textTertiary`} />
                  <span className="truncate">{name}</span>
                  {activeLayout === name && <i className="ri-check-line ml-auto text-[13px] text-primaryBlue" />}
                </button>
                {!DEFAULT_LAYOUTS.some((l) => l.name === name) && (
                  <button
                    onClick={() => { deleteLayout(name); toast(`Layout deleted: ${name}`, "info"); }}
                    title="Delete layout"
                    className="mr-[2px] flex h-[22px] w-[22px] items-center justify-center rounded-[5px] text-textTertiary opacity-0 transition-opacity hover:bg-decrease/15 hover:text-decrease group-hover:opacity-100"
                  >
                    <i className="ri-delete-bin-6-line text-[13px]" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------------- Save Layout ---------------- */}
      <div className="relative">
        <button
          onClick={() => {
            setOpenMenu(openMenu === "save" ? null : "save");
            setLayoutName(activeLayout && !DEFAULT_LAYOUTS.some((l) => l.name === activeLayout) ? activeLayout : "");
          }}
          data-testid="save-layout"
          className="flex h-[26px] items-center gap-[6px] rounded-[7px] border border-primaryStroke bg-backgroundTertiary px-[9px] text-[11.5px] font-medium text-textSecondary transition-colors hover:text-textPrimary"
        >
          <i className="ri-save-3-line text-[13px]" />
          Save Layout
        </button>
        {openMenu === "save" && (
          <div className="glass-pop pop-in absolute left-0 top-[30px] z-50 w-[228px] rounded-[9px] border border-white/10 p-[8px] shadow-dropdown">
            <input
              autoFocus
              value={layoutName}
              onChange={(e) => setLayoutName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && layoutName.trim()) {
                  saveLayout(layoutName);
                  setOpenMenu(null);
                  toast(`Layout saved: ${layoutName.trim()}`, "success");
                }
                if (e.key === "Escape") setOpenMenu(null);
              }}
              placeholder="Layout name…"
              data-testid="layout-name-input"
              className="h-[28px] w-full rounded-[6px] border border-primaryStroke bg-backgroundTertiary px-[8px] text-[12px] text-textPrimary outline-none placeholder:text-textTertiary focus:border-primaryBlue/60"
            />
            <button
              onClick={() => {
                if (!layoutName.trim()) return;
                saveLayout(layoutName);
                setOpenMenu(null);
                toast(`Layout saved: ${layoutName.trim()}`, "success");
              }}
              className="mt-[6px] flex h-[28px] w-full items-center justify-center rounded-[6px] bg-primaryBlue text-[12px] font-bold text-background transition-transform active:scale-[0.98]"
            >
              Save current arrangement
            </button>
          </div>
        )}
      </div>

      <span className="ml-[2px] hidden text-[10.5px] text-textTertiary xl:block">
        Drag headers to move · drag edges to resize · dots link panels
      </span>

      {/* ---------------- + Add Component ---------------- */}
      <div className="relative ml-auto">
        <button
          onClick={() => setOpenMenu(openMenu === "add" ? null : "add")}
          data-testid="add-component"
          className="flex h-[26px] items-center gap-[5px] rounded-[7px] border border-primaryBlue/50 bg-primaryBlue/10 px-[9px] text-[11.5px] font-semibold text-primaryBlueHover transition-colors hover:bg-primaryBlue/20 active:scale-[0.97]"
        >
          <i className="ri-add-line text-[14px]" />
          Add Component
        </button>
        {openMenu === "add" && (
          <div className="glass-pop pop-in absolute right-0 top-[30px] z-50 w-[238px] rounded-[9px] border border-white/10 p-[4px] shadow-dropdown" data-testid="add-component-menu">
            {missing.length === 0 ? (
              <div className="px-[9px] py-[8px] text-[11.5px] text-textTertiary">All components are on screen</div>
            ) : (
              missing.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    addPanel(t);
                    setOpenMenu(null);
                    toast(`${PANEL_META[t].label} added`, "success");
                  }}
                  data-testid={`add-${t}`}
                  className="flex w-full items-start gap-[9px] rounded-[6px] px-[8px] py-[7px] text-left transition-colors hover:bg-primaryStroke/30"
                >
                  <i className={`${PANEL_META[t].icon} mt-[1px] text-[15px] text-textSecondary`} />
                  <span>
                    <span className="block text-[12px] font-medium text-textPrimary">{PANEL_META[t].label}</span>
                    <span className="block text-[10.5px] leading-[14px] text-textTertiary">{PANEL_META[t].blurb}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
