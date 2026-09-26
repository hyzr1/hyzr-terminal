"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useHyzrUI } from "../ui/HyzrUI";
import { toast } from "@/lib/hyperliquid/tradeStore";

/* ------------------------------------------------------------------ */
/* protocol chip model                                                 */
/* ------------------------------------------------------------------ */
type Chip = { name: string; color: string; icon: ReactNode };

const chip = (name: string, color: string, icon: ReactNode): Chip => ({
  name,
  color,
  icon,
});

const BASE_PROTOCOLS: Chip[] = [
  chip("Crypto", "#8ddbc4", <i className="ri-bit-coin-line text-[15px]" />),
  chip("US Equities", "#aeb8c3", <i className="ri-line-chart-line text-[15px]" />),
  chip("Commodities", "#c6b58f", <i className="ri-copper-coin-line text-[15px]" />),
  chip("Forex", "#91aee8", <i className="ri-exchange-dollar-line text-[15px]" />),
  chip("Indices", "#c4a7e7", <i className="ri-bar-chart-grouped-line text-[15px]" />),
  chip("24/7", "#78c9a9", <i className="ri-time-line text-[15px]" />),
  chip("High volume", "#d7dde3", <i className="ri-pulse-line text-[15px]" />),
  chip("Favorites", "#e0c884", <i className="ri-star-line text-[15px]" />),
];

const MORE_PROTOCOLS: Chip[] = [
  chip("Layer 1", "#7bdc9f", <i className="ri-stack-line text-[15px]" />),
  chip("AI", "#b1a1ef", <i className="ri-brain-line text-[15px]" />),
  chip("Energy", "#e0b26f", <i className="ri-oil-line text-[15px]" />),
  chip("Metals", "#c4cbd2", <i className="ri-medal-line text-[15px]" />),
  chip("Mega cap", "#7fa8dc", <i className="ri-building-line text-[15px]" />),
  chip("Technology", "#70c4dd", <i className="ri-cpu-line text-[15px]" />),
  chip("Consumer", "#dd9ab0", <i className="ri-shopping-bag-3-line text-[15px]" />),
  chip("Finance", "#98c390", <i className="ri-bank-line text-[15px]" />),
];

function ProtocolChip({
  c,
  selected,
  onClick,
}: {
  c: Chip;
  selected: boolean;
  onClick: () => void;
}) {
  if (selected) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex h-[38px] flex-row items-center gap-[8px] rounded-full border px-[14px] text-[14px] font-semibold transition-all duration-150 active:scale-[0.97]"
        style={{
          color: c.color,
          borderColor: `${c.color}59`,
          background: `${c.color}1f`,
        }}
      >
        {c.icon}
        {c.name}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[38px] flex-row items-center gap-[8px] rounded-full border border-white/[0.09] bg-white/[0.03] px-[14px] text-[14px] font-semibold text-textTertiary transition-all duration-150 hover:text-textSecondary active:scale-[0.97]"
    >
      <span className="opacity-60">{c.icon}</span>
      {c.name}
    </button>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative h-[22px] w-[40px] flex-shrink-0 rounded-full transition-colors duration-150 ${
        on ? "bg-primaryBlue" : "bg-white/[0.14]"
      }`}
    >
      <span
        className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all duration-150 ${
          on ? "left-[20px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}

type Tab = "Markets" | "Keywords" | "Risk" | "Metrics";

/* ------------------------------------------------------------------ */
/* The full "Discover Filters" floating panel                          */
/* ------------------------------------------------------------------ */
export function FilterPanel() {
  const { filterOpen, setFilterOpen } = useHyzrUI();
  const [tab, setTab] = useState<Tab>("Markets");
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(
      BASE_PROTOCOLS.map((c) => [c.name, c.name !== "Soar" && c.name !== "Heaven"]),
    ),
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const [showMigrated, setShowMigrated] = useState(true);
  const [showPreMigrated, setShowPreMigrated] = useState(true);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [audit, setAudit] = useState<Record<string, boolean>>({
    "Mint Authority Revoked": false,
    "Freeze Authority Revoked": false,
    "LP Burned": false,
    "Top 10 Holders < 30%": false,
  });

  if (!filterOpen) return null;

  const visibleMore = moreOpen ? MORE_PROTOCOLS : [];
  const moreCount = MORE_PROTOCOLS.length;

  const toggle = (name: string) =>
    setSelected((s) => ({ ...s, [name]: !s[name] }));

  const unselectAll = () =>
    setSelected((s) =>
      Object.fromEntries(Object.keys(s).map((k) => [k, false])),
    );

  const headerIconBtn =
    "flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-textSecondary transition-colors duration-150 hover:bg-white/[0.06] hover:text-textPrimary";

  return createPortal(
    <div className="fixed inset-0 z-[90]" id="hyzr-filter-panel">
      {/* click-catcher (no dim, like the original) */}
      <div
        className="absolute inset-0"
        onPointerDown={() => setFilterOpen(false)}
      />
      <div
        className="hyzr-modal-panel absolute left-1/2 top-[86px] flex max-h-[calc(100dvh-130px)] w-[calc(100vw-16px)] max-w-[664px] -translate-x-1/2 flex-col overflow-hidden rounded-[16px] border border-white/[0.07] bg-backgroundTertiary shadow-[0_32px_80px_-16px_rgb(0_0_0/0.8)]"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex flex-row items-center justify-between px-[20px] pb-[6px] pt-[16px]">
          <div className="flex flex-row items-center gap-[10px]">
            <i className="ri-search-line text-[18px] text-textSecondary" />
            <span className="text-[17px] font-semibold text-textPrimary">
              Discover Filters
            </span>
            <i className="ri-equalizer-3-line text-[16px] text-textSecondary" />
          </div>
          <div className="flex flex-row items-center gap-[4px]">
            <button
              type="button"
              title="Copy filter config"
              onClick={() => {
                const cfg = JSON.stringify({ selected, showMigrated, showPreMigrated, keywords, audit });
                navigator.clipboard?.writeText(cfg).catch(() => {});
                toast("Filter config copied to clipboard", "success");
              }}
              className={headerIconBtn}
            >
              <i className="ri-upload-2-line text-[17px]" />
            </button>
            <button
              type="button"
              title="Paste filter config"
              onClick={async () => {
                try {
                  const raw = await navigator.clipboard.readText();
                  const cfg = JSON.parse(raw);
                  if (cfg.selected) setSelected(cfg.selected);
                  if (typeof cfg.showMigrated === "boolean") setShowMigrated(cfg.showMigrated);
                  if (typeof cfg.showPreMigrated === "boolean") setShowPreMigrated(cfg.showPreMigrated);
                  if (Array.isArray(cfg.keywords)) setKeywords(cfg.keywords);
                  if (cfg.audit) setAudit(cfg.audit);
                  toast("Filter config applied", "success");
                } catch {
                  toast("Clipboard has no valid filter config", "error");
                }
              }}
              className={headerIconBtn}
            >
              <i className="ri-download-2-line text-[17px]" />
            </button>
            <button
              type="button"
              title="Reset filters"
              onClick={() => {
                setSelected(
                  Object.fromEntries(
                    Object.keys(selected).map((k) => [k, true]),
                  ),
                );
                setShowMigrated(true);
                setShowPreMigrated(true);
                setKeywords([]);
                setAudit(Object.fromEntries(Object.keys(audit).map((k) => [k, false])));
                toast("Filters reset to defaults", "success");
              }}
              className={headerIconBtn}
            >
              <i className="ri-refresh-line text-[17px]" />
            </button>
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className={headerIconBtn}
            >
              <i className="ri-close-line text-[19px]" />
            </button>
          </div>
        </div>

        {/* tabs */}
        <div className="flex flex-row items-center justify-between px-[20px] pb-[10px] pt-[8px]">
          <div className="flex flex-row items-center gap-[6px]">
            {(["Markets", "Keywords", "Risk", "Metrics"] as Tab[]).map(
              (t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`flex h-[36px] items-center rounded-[10px] px-[14px] text-[14px] font-semibold transition-colors duration-150 ${
                    tab === t
                      ? "bg-white/[0.07] text-textPrimary"
                      : "text-textTertiary hover:text-textSecondary"
                  }`}
                >
                  {t}
                </button>
              ),
            )}
          </div>
          <button
            type="button"
            onClick={unselectAll}
            className="text-[14px] font-semibold text-textPrimary transition-opacity duration-150 hover:opacity-75"
          >
            Unselect All
          </button>
        </div>

        {/* content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-[20px] pb-[8px]">
          {tab === "Markets" ? (
            <>
              <div className="rounded-[12px] bg-white/[0.025] p-[16px]">
                <div className="grid grid-cols-3 gap-x-[12px] gap-y-[12px]">
                  {BASE_PROTOCOLS.map((c) => (
                    <ProtocolChip
                      key={c.name}
                      c={c}
                      selected={!!selected[c.name]}
                      onClick={() => toggle(c.name)}
                    />
                  ))}
                  {visibleMore.map((c) => (
                    <ProtocolChip
                      key={c.name}
                      c={c}
                      selected={!!selected[c.name]}
                      onClick={() => toggle(c.name)}
                    />
                  ))}
                </div>
              </div>
              <div className="flex flex-row items-center gap-[8px] py-[14px]">
                <button
                  type="button"
                  onClick={() => setMoreOpen((v) => !v)}
                  className="flex h-[32px] items-center gap-[6px] rounded-full bg-white/[0.05] px-[12px] text-[13px] font-semibold text-textSecondary transition-colors duration-150 hover:bg-white/[0.08]"
                >
                  {moreOpen ? "Show less" : `Show more ${moreCount}`}
                  <i
                    className={`ri-arrow-down-s-line text-[15px] transition-transform duration-150 ${
                      moreOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <span className="text-[13px] font-medium text-textTertiary">
                  {moreCount}
                </span>
              </div>
              <div className="border-t border-white/[0.06]">
                <div className="flex flex-row items-center justify-between py-[16px]">
                  <div className="flex flex-row items-center gap-[6px]">
                    <span className="text-[15px] font-medium text-textPrimary">
                      Show Migrated
                    </span>
                    <i className="ri-information-line text-[14px] text-textTertiary" />
                  </div>
                  <Switch on={showMigrated} onChange={setShowMigrated} />
                </div>
                <div className="border-t border-white/[0.06]" />
                <div className="flex flex-row items-center justify-between py-[16px]">
                  <div className="flex flex-row items-center gap-[6px]">
                    <span className="text-[15px] font-medium text-textPrimary">
                      Show Pre-migrated
                    </span>
                    <i className="ri-information-line text-[14px] text-textTertiary" />
                  </div>
                  <Switch on={showPreMigrated} onChange={setShowPreMigrated} />
                </div>
              </div>
            </>
          ) : tab === "Keywords" ? (
            <div className="py-[6px]">
              <input
                value={keywordDraft}
                onChange={(e) => setKeywordDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && keywordDraft.trim()) {
                    setKeywords((k) => [...k, keywordDraft.trim()]);
                    setKeywordDraft("");
                  }
                }}
                placeholder="Add keyword and press Enter"
                className="h-[40px] w-full rounded-[10px] bg-white/[0.05] px-[12px] text-[14px] text-textPrimary outline-none"
              />
              {keywords.length === 0 ? (
                <div className="py-[40px] text-center text-[14px] text-textTertiary">
                  No keywords yet
                </div>
              ) : (
                <div className="flex flex-row flex-wrap gap-[8px] py-[14px]">
                  {keywords.map((k) => (
                    <span
                      key={k}
                      className="flex h-[32px] items-center gap-[6px] rounded-full bg-white/[0.06] px-[12px] text-[13px] font-medium text-textSecondary"
                    >
                      {k}
                      <button
                        type="button"
                        onClick={() =>
                          setKeywords((arr) => arr.filter((x) => x !== k))
                        }
                      >
                        <i className="ri-close-line text-[14px] text-textTertiary hover:text-textPrimary" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : tab === "Risk" ? (
            <div className="py-[4px]">
              {Object.entries(audit).map(([label, on], i) => (
                <div key={label}>
                  {i > 0 && <div className="border-t border-white/[0.06]" />}
                  <div className="flex flex-row items-center justify-between py-[16px]">
                    <span className="text-[15px] font-medium text-textPrimary">
                      {label}
                    </span>
                    <Switch
                      on={on}
                      onChange={(v) => setAudit((s) => ({ ...s, [label]: v }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-[12px] py-[8px]">
              {[
                "Min Market Cap",
                "Max Market Cap",
                "Min Liquidity",
                "Min Volume 24h",
                "Min Holders",
                "Max Top 10 %",
              ].map((label) => (
                <label key={label} className="flex flex-col gap-[6px]">
                  <span className="text-[13px] font-medium text-textTertiary">
                    {label}
                  </span>
                  <input
                    placeholder="0"
                    className="h-[40px] rounded-[10px] bg-white/[0.05] px-[12px] text-[14px] text-textPrimary outline-none"
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex flex-row items-center justify-end gap-[10px] px-[20px] py-[14px]">
          <button
            type="button"
            onClick={() => setFilterOpen(false)}
            className="h-[40px] rounded-[10px] bg-primaryBlue px-[20px] text-[14px] font-bold text-white transition-colors duration-150 hover:bg-primaryBlueHover"
          >
            Apply All
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
