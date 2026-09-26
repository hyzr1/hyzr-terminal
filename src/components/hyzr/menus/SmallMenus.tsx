"use client";

import { useEffect, useRef, useState } from "react";
import { NAV_TABS, TOKENS } from "@/lib/hyzr-data";
import { useHyzrUI, type SurgeSource } from "../ui/HyzrUI";
import { Popover } from "../ui/Popover";
import { useLive } from "../live/LiveProvider";
import { fmtUsd } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* shared row styles                                                   */
/* ------------------------------------------------------------------ */
const row =
  "flex h-[40px] w-full flex-row items-center gap-[12px] rounded-[8px] px-[10px] text-[14px] font-medium text-textPrimary transition-colors duration-150 hover:bg-white/[0.05]";

/* ------------------------------------------------------------------ */
/* GLOBAL region menu (top nav + footer)                               */
/* ------------------------------------------------------------------ */
export function RegionMenuContent({ close: _close }: { close: () => void }) {
  const { region, setRegion } = useHyzrUI();
  void _close;
  return (
    <div className="w-[170px] p-[6px]">
      {(["GLOBAL", "US", "EU", "ASIA"] as const).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => setRegion(r)}
          className={row}
        >
          <span className="h-[8px] w-[8px] rounded-full bg-primaryGreen" />
          <span className="text-textPrimary">{r}</span>
          {region === r && (
            <i className="ri-check-line ml-auto text-[15px] text-primaryGreen" />
          )}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Footer PRESET menu                                                  */
/* ------------------------------------------------------------------ */
export function PresetMenuContent({ close }: { close: () => void }) {
  const { preset, setPreset } = useHyzrUI();
  return (
    <div className="w-[150px] p-[6px]">
      {[1, 2, 3].map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => {
            setPreset(p);
            close();
          }}
          className={row}
        >
          <i className="ri-list-settings-line text-[15px] text-textSecondary" />
          <span className="text-textPrimary">PRESET {p}</span>
          {preset === p && (
            <i className="ri-check-line ml-auto text-[15px] text-primaryBlue" />
          )}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Controls-row gear menu (Discover Filters / Quick Sell / Blacklist /  */
/* Pump Live)                                                          */
/* ------------------------------------------------------------------ */
export function SettingsMenuContent({ close }: { close: () => void }) {
  const { setFilterOpen, setModal, pumpLive, setPumpLive } = useHyzrUI();
  return (
    <div className="w-[232px] p-[8px]">
      <button
        type="button"
        onClick={() => {
          setFilterOpen(true);
          close();
        }}
        className={row}
      >
        <i className="ri-equalizer-3-line text-[16px] text-textSecondary" />
        <span className="text-textPrimary">Discover Filters</span>
      </button>
      <button
        type="button"
        onClick={() => {
          setModal("quicksell");
          close();
        }}
        className={row}
      >
        <i className="ri-inbox-unarchive-line text-[16px] text-textSecondary" />
        <span className="text-textPrimary">Quick Sell</span>
      </button>
      <button
        type="button"
        onClick={() => {
          setModal("blacklist");
          close();
        }}
        className={row}
      >
        <i className="ri-file-forbid-line text-[16px] text-textSecondary" />
        <span className="text-textPrimary">Blacklist</span>
      </button>
      <div className="mx-[6px] my-[6px] border-t border-white/[0.06]" />
      <div className={`${row} justify-between`}>
        <span className="flex flex-row items-center gap-[12px]">
          <i className="ri-flashlight-line text-[16px] text-textSecondary" />
          <span className="text-textPrimary">Advanced mode</span>
        </span>
        <button
          type="button"
          onClick={() => setPumpLive(!pumpLive)}
          className={`relative h-[22px] w-[40px] rounded-full transition-colors duration-150 ${
            pumpLive ? "bg-primaryBlue" : "bg-white/[0.14]"
          }`}
        >
          <span
            className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all duration-150 ${
              pumpLive ? "left-[20px]" : "left-[2px]"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Surge tab menu — four live sources (matches reference screenshots)   */
/* ------------------------------------------------------------------ */
export function SurgeMenuContent({ close }: { close: () => void }) {
  const { surgeSource, setSurgeSource, setTab } = useHyzrUI();
  const options: { id: SurgeSource; title: string; desc: string }[] = [
    { id: "surge", title: "Surge", desc: "Algorithmic surge alerts" },
    { id: "dexscreener", title: "DEX Screener", desc: "Top pairs by DEX Screener" },
    { id: "pumplive", title: "Pump Live", desc: "New Streams and Top Streams" },
    { id: "topstreams", title: "Top Pump Streams", desc: "Highest Market Cap Streams" },
  ];
  return (
    <div className="w-[300px] rounded-[12px] p-[6px]">
      {options.map((o) => {
        const active = surgeSource === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => {
              setSurgeSource(o.id);
              setTab("surge");
              close();
            }}
            className={`flex w-full flex-col items-start justify-center gap-[2px] rounded-[8px] px-[12px] py-[10px] text-left transition-colors duration-150 ${
              active
                ? "bg-white/[0.07]"
                : "hover:bg-white/[0.05]"
            }`}
          >
            <span
              className={`text-[16px] font-semibold tracking-[-0.01em] ${
                active ? "text-textPrimary" : "text-textPrimary/90"
              }`}
            >
              {o.title}
            </span>
            <span className="text-[13px] font-normal text-textSecondary">
              {o.desc}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Timer (auto-refresh interval) menu                                  */
/* ------------------------------------------------------------------ */
export function TimerMenuContent({ close }: { close: () => void }) {
  const { refreshInterval, setRefreshInterval } = useHyzrUI();
  return (
    <div className="w-[140px] p-[6px]">
      {["Off", "5s", "10s", "30s", "1m"].map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => {
            setRefreshInterval(m);
            close();
          }}
          className={row}
        >
          <span className="text-textPrimary">{m}</span>
          {refreshInterval === m && (
            <i className="ri-check-line ml-auto text-[15px] text-primaryBlue" />
          )}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Quick-buy preset config menu (20% / 0.001 / 0.01 / On)              */
/* ------------------------------------------------------------------ */
export function QuickBuyPresetMenu({
  preset,
  onPick,
}: {
  preset: number;
  onPick: (v: "20%" | "0.001" | "0.01" | "on") => void;
}) {
  const { quickBuy } = useHyzrUI();
  const active = quickBuy[preset] ?? "0.001";
  const items: {
    v: "20%" | "0.001" | "0.01" | "on";
    icon: string;
    label: string;
  }[] = [
    { v: "20%", icon: "ri-hand-coin-line", label: "20%" },
    { v: "0.001", icon: "ri-bar-chart-line", label: "0.001" },
    { v: "0.01", icon: "ri-coin-line", label: "0.01" },
    { v: "on", icon: "ri-shield-check-line", label: "On" },
  ];
  return (
    <div className="w-[112px] p-[6px]">
      {items.map((it) => (
        <button
          key={it.v}
          type="button"
          onClick={() => onPick(it.v)}
          className={`flex h-[34px] w-full flex-row items-center gap-[10px] rounded-[8px] px-[10px] text-[14px] font-semibold transition-colors duration-150 ${
            active === it.v
              ? "bg-white/[0.06] text-textPrimary"
              : "text-textSecondary hover:bg-white/[0.04] hover:text-textPrimary"
          }`}
        >
          <i className={`${it.icon} text-[14px] text-textSecondary`} />
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Notifications panel                                                 */
/* ------------------------------------------------------------------ */
export function NotificationsContent() {
  return (
    <div className="w-[330px]">
      <div className="flex flex-row items-center justify-between border-b border-white/[0.06] px-[14px] py-[12px]">
        <span className="text-[15px] font-semibold text-textPrimary">
          Notifications
        </span>
        <span className="rounded-full bg-white/[0.06] px-[8px] py-[2px] text-[12px] font-medium text-textTertiary">
          0
        </span>
      </div>
      <div className="flex flex-col items-center gap-[8px] px-[14px] py-[36px]">
        <i className="ri-notification-3-line text-[26px] text-textTertiary" />
        <span className="text-[14px] text-textTertiary">
          You&apos;re all caught up!
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Avatar account menu                                                 */
/* ------------------------------------------------------------------ */
export function AvatarMenuContent({ close }: { close: () => void }) {
  return (
    <div className="w-[190px] p-[6px]">
      <button type="button" onClick={close} className={row}>
        <i className="ri-user-3-line text-[16px] text-textSecondary" />
        <span className="text-textPrimary">Profile</span>
      </button>
      <button type="button" onClick={close} className={row}>
        <i className="ri-settings-3-line text-[16px] text-textSecondary" />
        <span className="text-textPrimary">Settings</span>
      </button>
      <div className="mx-[6px] my-[6px] border-t border-white/[0.06]" />
      <button type="button" onClick={close} className={row}>
        <i className="ri-logout-box-r-line text-[16px] text-textSecondary" />
        <span className="text-textPrimary">Log Out</span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Star / favorites panel                                              */
/* ------------------------------------------------------------------ */
export function StarPanelContent() {
  return (
    <div className="flex w-[240px] flex-col items-center gap-[8px] px-[16px] py-[32px]">
      <i className="ri-star-line text-[24px] text-textTertiary" />
      <span className="text-[14px] text-textTertiary">No favorites yet</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Search panel                                                        */
/* ------------------------------------------------------------------ */
export function SearchPanelContent({
  close,
  initialQuery = "",
}: {
  close: () => void;
  initialQuery?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(initialQuery);
  const { tokens } = useLive();
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  const query = q.trim().toLowerCase();
  const match = (t: { symbol: string; name: string; id?: string }) =>
    !query ||
    t.symbol.toLowerCase().includes(query) ||
    t.name.toLowerCase().includes(query) ||
    (t.id ? t.id.toLowerCase().includes(query) : false);

  const rows = tokens.length
    ? [...tokens]
        .filter(match)
        .sort((a, b) => (query ? b.v5 - a.v5 : b.v5 - a.v5))
        .slice(0, 8)
        .map((t) => ({
          key: t.id,
          image: t.image,
          symbol: t.symbol,
          name: t.name,
          mc: t.mc,
        }))
    : TOKENS.filter(match)
        .slice(0, 8)
        .map((t) => ({
          key: t.symbol,
          image: t.image,
          symbol: t.symbol,
          name: t.name,
          mc: t.marketCap,
        }));
  return (
    <div className="w-[400px] max-w-[92vw] p-[12px]">
      <div className="flex h-[40px] flex-row items-center gap-[8px] rounded-[10px] bg-white/[0.05] px-[12px]">
        <i className="ri-search-2-line text-[15px] text-textTertiary" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by token or CA"
          className="w-full bg-transparent text-[14px] text-textPrimary outline-none"
        />
      </div>
      <div className="px-[4px] pb-[4px] pt-[12px] text-[12px] font-medium text-textTertiary">
        {query ? "Results" : "Trending"}
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-[6px] px-[12px] py-[28px]">
          <i className="ri-search-eye-line text-[22px] text-textTertiary" />
          <span className="text-[13px] text-textTertiary">
            No tokens match “{q.trim()}”
          </span>
        </div>
      ) : (
        rows.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={close}
          className="flex h-[48px] w-full flex-row items-center gap-[10px] rounded-[8px] px-[8px] transition-colors duration-150 hover:bg-white/[0.04]"
        >
          {t.image ? (
            <img
              src={t.image}
              alt={t.symbol}
              className="h-[26px] w-[26px] rounded-full object-cover"
            />
          ) : (
            <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-secondaryStroke/60 text-[10px] font-bold text-textPrimary">
              {t.symbol.slice(0, 2)}
            </div>
          )}
          <span className="text-[14px] font-semibold text-textPrimary">
            {t.symbol}
          </span>
          <span className="truncate text-[13px] text-textTertiary">{t.name}</span>
          <span className="ml-auto text-[13px] font-medium text-textSecondary">
            {typeof t.mc === "number" ? fmtUsd(t.mc) : t.mc}
          </span>
        </button>
        ))
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nav tab overflow helper (unused here; kept minimal)                 */
/* ------------------------------------------------------------------ */
export const NAV_TAB_COUNT = NAV_TABS.length;

/* ------------------------------------------------------------------ */
/* Wrapped search trigger (icon + label + "/" badge, same visuals)     */
/* ------------------------------------------------------------------ */
export function SearchButton() {
  return (
    <Popover
      align="end"
      content={(close) => <SearchPanelContent close={close} />}
      button={({ open, toggle }) => (
        <button

          type="button"
          onClick={toggle}
          className={`duration-fast hidden h-[32px] w-[32px] flex-shrink-0 flex-row items-center justify-center gap-[8px] whitespace-nowrap rounded-full border-[1px] font-normal transition-colors hover:bg-primaryStroke/35 sm:flex 2xl:w-auto 2xl:pl-[12px] 2xl:pr-[6px] ${
            open ? "bg-primaryStroke/35" : ""
          }`}
        >
          <i className="ri-search-2-line pt-[0px] text-[18px] text-textPrimary" />
          <span className="hidden text-[12px] font-medium text-textTertiary 2xl:block">
            Search by token or CA
          </span>
          <div className="hidden h-[20px] flex-row items-center justify-center gap-[8px] rounded-full border-[1px] border-primaryStroke px-[8px] text-[12px] 2xl:block">
            <span className="text-textPrimary">/</span>
          </div>
        </button>
      )}
    />
  );
}
