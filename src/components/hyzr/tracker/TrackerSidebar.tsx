"use client";
/**
 * TrackerSidebar — the right rail of the Trackers page, chrome matched to
 * the real page: "Customize Feed | Social Alerts | Socials" pill tabs,
 * the blue/green round toggles (whales / tracked lanes), and social-style
 * event cards (icon, title, age, chips).
 */
import { useEffect, useMemo, useState } from "react";
import { useTrackerStore, shortAddr } from "@/lib/tracker/trackerStore";
import { useFeedStore } from "@/lib/tracker/useTrackerStream";
import {
  WalletAvatar,
  CoinChip,
  IconBtn,
  PillAction,
  ageStr,
  pnlClass,
  fmtUsdCompact,
} from "./bits";
import { baseName } from "@/lib/hyperliquid/types";

const SIZE_STEPS = [50_000, 100_000, 250_000, 1_000_000, 5_000_000];

export default function TrackerSidebar({
  collapsed,
  onToggle,
  onOpenWallet,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onOpenWallet: (addr: string) => void;
}) {
  const [tab, setTab] = useState<"customize" | "alerts" | "socials">("socials");
  const feed = useTrackerStore((s) => s.feed);
  const setFeed = useTrackerStore((s) => s.setFeed);
  const rules = useTrackerStore((s) => s.rules);
  const alertLog = useTrackerStore((s) => s.alertLog);
  const unread = useTrackerStore((s) => s.unread);
  const markAllRead = useTrackerStore((s) => s.markAllRead);
  const removeRule = useTrackerStore((s) => s.removeRule);
  const addRule = useTrackerStore((s) => s.addRule);
  const updateRule = useTrackerStore((s) => s.updateRule);
  const events = useFeedStore((s) => s.events);
  const [coinInput, setCoinInput] = useState("");

  // header bell / equalizer open this rail on a specific tab (works on mobile drawer too)
  useEffect(() => {
    const alerts = () => setTab("alerts");
    const customize = () => setTab("customize");
    document.addEventListener("tracker-open-alerts", alerts);
    document.addEventListener("tracker-open-customize", customize);
    return () => {
      document.removeEventListener("tracker-open-alerts", alerts);
      document.removeEventListener("tracker-open-customize", customize);
    };
  }, []);

  const socialEvents = useMemo(
    () =>
      events.filter((ev) => {
        if (ev.usd < Math.min(feed.minUsd, 50_000)) return false;
        if (feed.k.length && !feed.k.includes(ev.k)) return false;
        return true;
      }),
    [events, feed],
  );

  if (collapsed) {
    return (
      <div className="flex w-[18px] shrink-0 flex-col items-center border-l border-primaryStroke pt-[8px]">
        <RailBtn icon="ri-arrow-left-s-line" onClick={onToggle} />
      </div>
    );
  }

  return (
    <div className="flex w-full shrink-0 flex-col border-l border-primaryStroke bg-background/20 lg:w-[380px] 2xl:w-[480px]">
      {/* header tabs — exact chrome from the reference */}
      <div className="flex h-[40px] shrink-0 items-center justify-between border-b border-primaryStroke pl-[10px] pr-[8px]">
        <div className="flex flex-row items-center gap-[4px]">
          <Tab label="Customize Feed" active={tab === "customize"} onClick={() => setTab("customize")} />
          <Tab
            label="Social Alerts"
            active={tab === "alerts"}
            dot={unread > 0}
            onClick={() => {
              setTab("alerts");
              markAllRead();
            }}
          />
          <Tab label="Socials" active={tab === "socials"} onClick={() => setTab("socials")} />
        </div>
        <div className="flex flex-row items-center gap-[10px]">
          {/* whale lane toggle (blue) */}
          <div className="relative flex h-[32px] items-center gap-[2px] rounded-full p-[4px]">
            <button
              type="button"
              aria-label="Toggle whale lane"
              aria-pressed={feed.k.includes("whale")}
              onClick={() =>
                setFeed({
                  k: feed.k.includes("whale")
                    ? feed.k.filter((x) => x !== "whale")
                    : [...feed.k, "whale"],
                })
              }
              className="relative flex h-[24px] items-center gap-[5px] rounded-full px-[8px] text-[12px] font-medium outline-none transition-colors"
              style={
                feed.k.includes("whale")
                  ? { backgroundColor: "rgba(93, 188, 255, 0.15)", color: "rgb(93, 188, 255)" }
                  : { color: "#777a8c" }
              }
            >
              <i className="ri-quill-pen-line text-[14px] leading-none" />
            </button>
            {/* tracked lane toggle (green) */}
            <button
              type="button"
              aria-label="Toggle tracked lane"
              aria-pressed={feed.k.includes("tracked")}
              onClick={() =>
                setFeed({
                  k: feed.k.includes("tracked")
                    ? feed.k.filter((x) => x !== "tracked")
                    : [...feed.k, "tracked"],
                })
              }
              className="relative flex h-[24px] items-center gap-[5px] rounded-full px-[8px] text-[12px] font-medium outline-none transition-colors"
              style={
                feed.k.includes("tracked")
                  ? { backgroundColor: "rgba(0, 220, 130, 0.15)", color: "rgb(0, 220, 130)" }
                  : { color: "#777a8c" }
              }
            >
              <i className="ri-base-station-line text-[14px] leading-none" />
            </button>
          </div>
          <IconBtn icon="ri-equalizer-3-line" onClick={() => setTab("customize")} active={tab === "customize"} />
          <RailBtn icon="ri-arrow-right-s-line" onClick={onToggle} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ---------------- customize ---------------- */}
        {tab === "customize" ? (
          <div className="flex flex-col gap-[14px] p-[14px]">
            <Group title="Min trade size">
              <div className="flex flex-wrap gap-[6px]">
                {SIZE_STEPS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFeed({ minUsd: s })}
                    className={`h-[26px] rounded-full px-[11px] text-[12px] font-medium transition-colors ${
                      feed.minUsd === s
                        ? "bg-primaryStroke text-textPrimary"
                        : "bg-primaryStroke/40 text-textTertiary hover:text-textSecondary"
                    }`}
                  >
                    {fmtUsdCompact(s)}
                  </button>
                ))}
              </div>
            </Group>

            <Group title="Event types">
              <div className="flex gap-[6px]">
                {(["open", "close"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setFeed({
                        types: feed.types.includes(t)
                          ? feed.types.filter((x) => x !== t)
                          : [...feed.types, t],
                      })
                    }
                    className={`h-[26px] rounded-full px-[11px] text-[12px] font-medium capitalize transition-colors ${
                      feed.types.includes(t)
                        ? "bg-primaryStroke text-textPrimary"
                        : "bg-primaryStroke/40 text-textTertiary"
                    }`}
                  >
                    {t === "open" ? "Position opens" : "Position closes"}
                  </button>
                ))}
              </div>
            </Group>

            <Group title="Coin filter">
              <div className="flex items-center gap-[6px]">
                <input
                  value={coinInput}
                  onChange={(e) => setCoinInput(e.target.value)}
                  placeholder="Add a coin (BTC, xyz:GOLD…)"
                  className="h-[30px] min-w-0 flex-1 rounded-[8px] border border-primaryStroke bg-background px-[10px] text-[12px] text-textPrimary outline-none placeholder:text-textTertiary focus:border-primaryBlue"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && coinInput.trim()) {
                      const c = coinInput.trim().toUpperCase();
                      if (!feed.coins.includes(c)) setFeed({ coins: [...feed.coins, c] });
                      setCoinInput("");
                    }
                  }}
                />
              </div>
              {feed.coins.length ? (
                <div className="mt-[8px] flex flex-wrap gap-[6px]">
                  {feed.coins.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFeed({ coins: feed.coins.filter((x) => x !== c) })}
                      className="flex h-[24px] items-center gap-[5px] rounded-full bg-primaryStroke/50 px-[9px] text-[11px] text-textSecondary hover:bg-decrease/20 hover:text-decrease"
                    >
                      {c}
                      <i className="ri-close-line text-[12px]" />
                    </button>
                  ))}
                </div>
              ) : (
                <span className="mt-[6px] text-[11px] text-textTertiary">All coins (no filter)</span>
              )}
            </Group>

            <Group title="Notifications">
              <div className="flex flex-col gap-[8px]">
                <label className="flex cursor-pointer items-center justify-between text-[12px] text-textSecondary">
                  Sound on alert
                  <input
                    type="checkbox"
                    checked={feed.sound}
                    onChange={(e) => setFeed({ sound: e.target.checked })}
                    className="accent-[rgb(var(--primary-color))]"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof Notification !== "undefined" && Notification.permission === "default") {
                      void Notification.requestPermission();
                    }
                  }}
                  className="text-left text-[12px] text-primaryBlue hover:underline"
                >
                  Enable desktop notifications →
                </button>
              </div>
            </Group>

            <Group title={`Alert rules (${rules.filter((r) => r.enabled).length} active)`}>
              <div className="flex flex-col gap-[8px]">
                {rules.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-[8px] rounded-[8px] border border-primaryStroke bg-background/50 px-[10px] py-[8px]"
                  >
                    <button
                      type="button"
                      onClick={() => updateRule(r.id, { enabled: !r.enabled })}
                      className={`relative h-[16px] w-[28px] shrink-0 rounded-full transition-colors ${
                        r.enabled ? "bg-increase" : "bg-primaryStroke"
                      }`}
                    >
                      <span
                        className={`absolute top-[2px] h-[12px] w-[12px] rounded-full bg-background transition-all ${
                          r.enabled ? "left-[14px]" : "left-[2px]"
                        }`}
                      />
                    </button>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[12px] font-medium text-textPrimary">{r.name}</span>
                      <span className="truncate text-[10px] text-textTertiary">{ruleDesc(r)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRule(r.id)}
                      className="text-textTertiary hover:text-decrease"
                    >
                      <i className="ri-delete-bin-line text-[13px]" />
                    </button>
                  </div>
                ))}
                <PillAction
                  label="New whale alert"
                  icon="ri-notification-add-line"
                  onClick={() => {
                    addRule({
                      name: `Whales > ${fmtUsdCompact(2_000_000)}`,
                      enabled: true,
                      kind: "whale_trade",
                      minUsd: 2_000_000,
                      coins: feed.coins,
                      side: "both",
                      action: "both",
                    });
                  }}
                />
                <span className="text-[10px] leading-[14px] text-textTertiary/80">
                  Tip: create coin-positioning alerts from the Smart Money tab, wallet alerts from any profile.
                </span>
              </div>
            </Group>
          </div>
        ) : null}

        {/* ---------------- alerts ---------------- */}
        {tab === "alerts" ? (
          alertLog.length === 0 ? (
            <Empty
              icon="ri-notification-off-line"
              text="No alerts yet. Alerts fire when your rules match live whale or tracked-wallet activity."
            />
          ) : (
            <div className="flex flex-col">
              {alertLog.slice(0, 120).map((a) => (
                <div key={a.id} className="flex gap-[10px] border-b border-primaryStroke/30 px-[14px] py-[10px]">
                  <div
                    className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] ${
                      a.tone === "long"
                        ? "bg-increase/15 text-increase"
                        : a.tone === "short"
                          ? "bg-decrease/15 text-decrease"
                          : "bg-primaryBlue/15 text-primaryBlue"
                    }`}
                  >
                    <i className="ri-notification-3-line text-[16px]" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <div className="flex items-center justify-between gap-[8px]">
                      <span className="truncate text-[13px] font-semibold text-textPrimary">{a.text}</span>
                      <span className="shrink-0 text-[10px] text-textTertiary">{ageStr(a.t)}</span>
                    </div>
                    <span className="truncate text-[11px] text-textTertiary">{a.sub}</span>
                    <span className="flex w-fit items-center gap-[4px] rounded-full bg-primaryStroke/50 px-[7px] py-[2px] text-[10px] text-textSecondary">
                      <i className="ri-flashlight-line text-[10px]" />
                      {a.ruleName}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : null}

        {/* ---------------- socials ---------------- */}
        {tab === "socials" ? (
          socialEvents.length === 0 ? (
            <Empty
              icon="ri-base-station-line"
              text="The whale wire is warming up — big Hyperliquid trades will stream here."
            />
          ) : (
            <div className="flex flex-col">
              {socialEvents.slice(0, 120).map((ev) => {
                const isBuy = ev.side === "B";
                const act = ev.dir.startsWith("Open")
                  ? "opened"
                  : ev.dir.startsWith("Close")
                    ? "closed"
                    : "flipped to";
                return (
                  <div
                    key={`${ev.w}:${ev.tid}`}
                    className="cursor-pointer border-b border-primaryStroke/30 px-[14px] py-[10px] transition-colors hover:bg-primaryStroke/20"
                    onClick={() => onOpenWallet(ev.w)}
                  >
                    <div className="flex items-start gap-[10px]">
                      <div className="relative">
                        <WalletAvatar address={ev.w} size={38} />
                        <span
                          className={`absolute -bottom-[2px] -right-[2px] flex h-[14px] w-[14px] items-center justify-center rounded-full border-[2px] border-background ${
                            isBuy ? "bg-increase" : "bg-decrease"
                          }`}
                        >
                          <i className={`text-[8px] text-background ${isBuy ? "ri-arrow-up-line" : "ri-arrow-down-line"}`} />
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
                        <div className="flex items-center justify-between gap-[8px]">
                          <span className="flex min-w-0 items-center gap-[6px]">
                            <span className="truncate text-[14px] font-semibold text-textPrimary">
                              {shortAddr(ev.w)}
                            </span>
                            {ev.k === "tracked" ? (
                              <span className="flex h-[15px] shrink-0 items-center rounded-full bg-increase/15 px-[5px] text-[9px] font-bold uppercase text-increase">
                                tracked
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-[10px] text-textTertiary">{ageStr(ev.t)}</span>
                        </div>
                        <div className="flex items-center gap-[6px] text-[12px] text-textSecondary">
                          <span>
                            {act}{" "}
                            <span className={`font-semibold ${isBuy ? "text-increase" : "text-decrease"}`}>
                              {fmtUsdCompact(ev.usd)} {baseName(ev.coin)}
                            </span>{" "}
                            {ev.dir.toLowerCase().includes("short") ? "short" : "long"}
                          </span>
                        </div>
                        <div className="flex items-center gap-[6px]">
                          <span className="flex items-center gap-[4px] rounded-full bg-primaryStroke/50 px-[7px] py-[2px]">
                            <CoinChip coin={ev.coin} size={12} />
                            <span className="text-[10px] text-textSecondary">@ {ev.px.toPrecision(6)}</span>
                          </span>
                          {ev.pnl !== null ? (
                            <span
                              className={`rounded-full px-[7px] py-[2px] text-[10px] font-medium ${
                                ev.pnl >= 0 ? "bg-increase/15 text-increase" : "bg-decrease/15 text-decrease"
                              }`}
                            >
                              {ev.pnl >= 0 ? "+" : ""}
                              {fmtUsdCompact(ev.pnl)} realized
                            </span>
                          ) : null}
                          <span className={`font-GeistMono text-[10px] ${pnlClass(ev.pnl)}`}>
                            {ev.taker ? "taker" : "maker"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

function Tab({
  label,
  active,
  dot,
  onClick,
}: {
  label: string;
  active: boolean;
  dot?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex h-[24px] cursor-pointer flex-row items-center justify-start gap-[4px] rounded-[4px] px-[4px] border-[1px] ${
        active
          ? "border-primaryStroke bg-primaryStroke/60 hover:bg-primaryStroke/90"
          : "border-transparent hover:border-transparent hover:bg-primaryStroke/60"
      }`}
    >
      {dot ? (
        <div className="absolute right-[-3px] top-[-1px] h-[7px] w-[7px] rounded-full border-[1px] border-solid border-background bg-decrease" />
      ) : null}
      <span
        className={`text-[13px] tracking-[-0.02rem] text-nowrap font-medium ${
          active ? "text-textPrimary" : "text-textTertiary transition-[color] group-hover:text-textSecondary"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

function RailBtn({ icon, onClick }: { icon: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[24px] w-[16px] items-center justify-center text-textTertiary hover:text-textPrimary"
    >
      <i className={`${icon} text-[16px]`} />
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[7px]">
      <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-textTertiary">{title}</span>
      {children}
    </div>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex h-[220px] flex-col items-center justify-center gap-[10px] px-[30px] text-center">
      <div className="flex h-[46px] w-[46px] items-center justify-center rounded-[12px] bg-primaryStroke/40">
        <i className={`${icon} text-[22px] text-textTertiary`} />
      </div>
      <span className="text-[12px] leading-[17px] text-textTertiary">{text}</span>
    </div>
  );
}

function ruleDesc(r: {
  kind: string;
  minUsd?: number;
  minPnl?: number;
  wallet?: string;
  side?: string;
  action?: string;
  coins?: string[];
}) {
  if (r.kind === "whale_trade") {
    return `Any whale ${r.side === "both" ? "trade" : r.side} ≥ ${fmtUsdCompact(r.minUsd ?? 0)}${
      r.coins?.length ? ` · ${r.coins.join(", ")}` : ""
    }`;
  }
  if (r.kind === "wallet_trade") {
    return `${r.wallet === "tracked" ? "Tracked wallets" : shortAddr(r.wallet ?? "")} trades ≥ ${fmtUsdCompact(
      r.minUsd ?? 0,
    )}`;
  }
  if (r.kind === "wallet_close") {
    return `Close with |PnL| ≥ ${fmtUsdCompact(r.minPnl ?? 0)} on ${
      r.wallet === "tracked" ? "tracked wallets" : shortAddr(r.wallet ?? "")
    }`;
  }
  return "Positioning threshold";
}
