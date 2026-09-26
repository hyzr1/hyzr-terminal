"use client";
/**
 * WorkspaceHost (fx19) — the panel canvas.
 * Hosts absolutely-positioned PanelFrames, resolves each panel's market
 * (link color → groupMarkets / own coin / primary), scopes the market
 * picker to the panel that opened it, and rehydrates the persisted
 * arrangement pre-paint so a refresh restores the exact layout with zero
 * hydration churn (first client render = SSR defaults).
 */
import { useLayoutEffect, useRef, useState } from "react";
import { useWorkspace } from "./wsStore";
import { WorkspaceCtx, PanelFrame } from "./PanelFrame";
import MarketSelector from "../MarketSelector";
import { usePerpsData } from "@/lib/hyperliquid/perpsStore";

export default function WorkspaceHost() {
  const panels = useWorkspace((s) => s.panels);
  const groupMarkets = useWorkspace((s) => s.groupMarkets);
  const setGroupMarket = useWorkspace((s) => s.setGroupMarket);
  const setPanelCoin = useWorkspace((s) => s.setPanelCoin);
  const storeCoin = usePerpsData((s) => s.coin);

  const hostRef = useRef<HTMLDivElement>(null);
  const [picker, setPicker] = useState<{ panelId: string | null } | null>(null);

  /* restore the persisted arrangement before first paint (defaults match
     the SSR HTML — no hydration mismatch, no layout flash) */
  useLayoutEffect(() => {
    useWorkspace.getState().rehydrate();
  }, []);

  const resolveCoin = (panelId: string): string => {
    const p = panels.find((x) => x.id === panelId);
    if (!p) return storeCoin;
    if (p.link) return groupMarkets[p.link] ?? storeCoin;
    return p.coin ?? storeCoin;
  };

  const pickForPanel = (panelId: string, coin: string) => {
    const p = panels.find((x) => x.id === panelId);
    if (!p) return;
    if (p.link) setGroupMarket(p.link, coin);
    else setPanelCoin(panelId, coin);
    // keep the primary coin in sync (deep links / ticker routing highlight)
    usePerpsData.getState().setCoin(coin);
  };

  return (
    <WorkspaceCtx.Provider
      value={{
        hostEl: () => hostRef.current,
        onSymbolClick: (panelId) => setPicker({ panelId }),
      }}
    >
      <div
        ref={hostRef}
        className="relative min-h-[0px] flex-1 overflow-hidden bg-background"
        data-testid="workspace-host"
      >
        {panels.map((p, i) => (
          <PanelFrame
            key={p.id}
            panel={p}
            z={i + 1}
            focused={i === panels.length - 1}
            coin={resolveCoin(p.id)}
          />
        ))}

        {panels.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-[8px]">
            <i className="ri-layout-masonry-line text-[30px] text-textTertiary" />
            <span className="text-[13px] font-medium text-textSecondary">Empty workspace</span>
            <span className="text-[11.5px] text-textTertiary">Use + Add Component to build your layout</span>
          </div>
        )}
      </div>

      {/* per-panel market picker */}
      {picker && (
        <MarketSelector
          onClose={() => setPicker(null)}
          onPick={(coin) => {
            if (picker.panelId) pickForPanel(picker.panelId, coin);
            else usePerpsData.getState().setCoin(coin);
          }}
        />
      )}
    </WorkspaceCtx.Provider>
  );
}
