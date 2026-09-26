"use client";

import { useEffect, useMemo, useState } from "react";
import { useProfileStore, type AvatarStyle, type BannerStyle, type NameEffect } from "@/lib/profileStore";

const AVATARS: { id: AvatarStyle; icon: string }[] = [
  { id: "h", icon: "ri-font-size-2" },
  { id: "bolt", icon: "ri-flashlight-fill" },
  { id: "ghost", icon: "ri-ghost-2-fill" },
  { id: "crown", icon: "ri-vip-crown-fill" },
];
const BANNERS: BannerStyle[] = ["forged", "graphite", "aurora", "carbon"];
const EFFECTS: NameEffect[] = ["steel", "pulse", "prism", "ember"];
const BADGES = ["Founding Trader", "Risk Taker", "12 Day Streak", "Top 5%", "Diamond Hands", "Night Owl"];

function Avatar({ style, large = false }: { style: AvatarStyle; large?: boolean }) {
  const icon = AVATARS.find((a) => a.id === style)?.icon ?? "ri-flashlight-fill";
  return (
    <div className={`hyzr-profile-avatar ${large ? "h-[72px] w-[72px] text-[28px]" : "h-[58px] w-[58px] text-[20px]"}`}>
      <i className={icon} />
    </div>
  );
}

export default function TraderIdentity({ pnl, bestTrade, winRate }: { pnl: number; bestTrade: number; winRate: number }) {
  const profile = useProfileStore();
  const [editor, setEditor] = useState(false);
  const [share, setShare] = useState(false);
  const [sharedTrade, setSharedTrade] = useState<{ coin: string; pnl: number; price: number; dir: string } | null>(null);
  const [draft, setDraft] = useState(() => ({ username: profile.username, handle: profile.handle, bio: profile.bio }));
  const xpPct = useMemo(() => Math.min(100, (profile.xp % 1000) / 10), [profile.xp]);
  const cardPnl = sharedTrade?.pnl ?? pnl;
  const cardBest = sharedTrade ? sharedTrade.pnl : bestTrade;

  useEffect(() => {
    const openTrade = (event: Event) => {
      setSharedTrade((event as CustomEvent<{ coin: string; pnl: number; price: number; dir: string }>).detail);
      setShare(true);
    };
    window.addEventListener("hyzr-share-trade", openTrade);
    return () => window.removeEventListener("hyzr-share-trade", openTrade);
  }, []);

  const downloadCard = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200; canvas.height = 675;
    const c = canvas.getContext("2d"); if (!c) return;
    const g = c.createLinearGradient(0, 0, 1200, 675); g.addColorStop(0, "#080a0c"); g.addColorStop(.55, "#171b20"); g.addColorStop(1, "#060708"); c.fillStyle = g; c.fillRect(0, 0, 1200, 675);
    c.strokeStyle = "#58616c"; c.lineWidth = 2; c.strokeRect(36, 36, 1128, 603);
    c.fillStyle = "#f4f6f8"; c.font = "italic 900 82px Georgia"; c.fillText("h", 78, 118);
    c.font = "700 28px Arial"; c.fillText("HYZR PERFORMANCE", 170, 100);
    c.fillStyle = "#9aa4af"; c.font = "500 22px Arial"; c.fillText(`@${profile.handle.replace(/^@/, "")}  ·  LEVEL ${profile.level}`, 78, 180);
    c.fillStyle = cardPnl >= 0 ? "#56e0b2" : "#ff5c85"; c.font = "800 110px Arial"; c.fillText(`${cardPnl >= 0 ? "+" : "-"}$${Math.abs(cardPnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, 78, 340);
    c.fillStyle = "#f4f6f8"; c.font = "700 34px Arial"; c.fillText(profile.username, 80, 420);
    c.fillStyle = "#9aa4af"; c.font = "500 23px Arial"; c.fillText(sharedTrade ? `${sharedTrade.coin}  ·  ${sharedTrade.dir.toUpperCase()}  ·  ENTRY ${sharedTrade.price}` : `BEST TRADE  +$${bestTrade.toFixed(2)}     WIN RATE  ${winRate.toFixed(0)}%`, 80, 485);
    c.fillStyle = "#7f8994"; c.font = "500 19px Arial"; c.fillText("Trade everything. Own the result.", 80, 585);
    const a = document.createElement("a"); a.download = `hyzr-${profile.username}-pnl.png`; a.href = canvas.toDataURL("image/png"); a.click();
  };

  return (
    <>
      <section className={`hyzr-profile-banner banner-${profile.banner}`}>
        <div className="hyzr-banner-sheen" />
        <div className="relative flex min-w-0 flex-1 items-center gap-[14px] pr-2">
          <Avatar style={profile.avatar} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className={`name-effect-${profile.nameEffect} min-w-0 truncate text-[16px] font-black sm:text-[20px]`}>{profile.username}</h1>
              <i className="ri-verified-badge-fill shrink-0 text-[15px] text-[#c8cdd2]" />
              <span className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.16em] text-[#cbd0d5]">Chrome II</span>
            </div>
            <p className="mt-1 truncate text-[11px] text-[#929aa4]">@{profile.handle.replace(/^@/, "")} · {profile.bio}</p>
            <div className="mt-2 hidden items-center gap-2 sm:flex">
              {profile.badges.slice(0, 3).map((badge) => <span key={badge} className="hyzr-profile-badge"><i className="ri-award-line" />{badge}</span>)}
            </div>
          </div>
        </div>
        <div className="relative ml-auto hidden min-w-[150px] flex-col gap-1.5 lg:flex">
          <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider text-[#8f98a3]"><span>Level {profile.level}</span><span>{profile.xp} XP</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full bg-[linear-gradient(90deg,#717b86,#eef1f4)]" style={{ width: `${xpPct}%` }} /></div>
        </div>
        <div className="relative ml-auto flex shrink-0 gap-2">
          <button aria-label="Customize profile" onClick={() => setEditor(true)} className="hyzr-secondary-button !h-8 !w-8 !px-0 sm:!w-auto sm:!px-3"><i className="ri-palette-line" /><span className="hidden sm:inline">Customize</span></button>
          <button onClick={() => { setSharedTrade(null); setShare(true); }} className="steel-button flex h-8 items-center gap-2 rounded-lg px-3 text-[11px] font-bold"><i className="ri-share-forward-line" /><span className="hidden sm:inline">Share PnL</span></button>
        </div>
      </section>

      {editor && <div className="hyzr-dialog-layer"><button aria-label="Close" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setEditor(false)} /><div className="hyzr-customizer">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><h2 className="text-[16px] font-bold">Customize trader card</h2><p className="mt-0.5 text-[11px] text-textTertiary">Your identity appears on your portfolio and every shared win.</p></div><button onClick={() => setEditor(false)}><i className="ri-close-line text-[20px]" /></button></div>
        <div className="grid gap-5 overflow-y-auto p-5 md:grid-cols-[1fr_240px]">
          <div className="space-y-4">
            <label className="hyzr-field-label">Username<input maxLength={18} value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} className="hyzr-field" /></label>
            <div className="grid grid-cols-2 gap-3"><label className="hyzr-field-label">Handle<input maxLength={18} value={draft.handle} onChange={(e) => setDraft({ ...draft, handle: e.target.value })} className="hyzr-field" /></label><label className="hyzr-field-label">Tagline<input maxLength={38} value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} className="hyzr-field" /></label></div>
            <div><p className="hyzr-field-label">Avatar</p><div className="grid grid-cols-4 gap-2">{AVATARS.map((a) => <button key={a.id} onClick={() => profile.updateProfile({ avatar: a.id })} className={`hyzr-cosmetic-tile ${profile.avatar === a.id ? "selected" : ""}`}><i className={`${a.icon} text-[20px]`} /><span>{a.id}</span></button>)}</div></div>
            <div><p className="hyzr-field-label">Name effect</p><div className="grid grid-cols-4 gap-2">{EFFECTS.map((effect) => <button key={effect} onClick={() => profile.updateProfile({ nameEffect: effect })} className={`hyzr-cosmetic-tile ${profile.nameEffect === effect ? "selected" : ""}`}><span className={`name-effect-${effect} text-[11px] font-bold`}>Aa</span><span>{effect}</span></button>)}</div></div>
            <div><p className="hyzr-field-label">Banner</p><div className="grid grid-cols-4 gap-2">{BANNERS.map((banner) => <button key={banner} onClick={() => profile.updateProfile({ banner })} className={`hyzr-banner-swatch banner-${banner} ${profile.banner === banner ? "selected" : ""}`}><span>{banner}</span></button>)}</div></div>
            <div><p className="hyzr-field-label">Showcase badges · choose 3</p><div className="flex flex-wrap gap-2">{BADGES.map((badge) => { const active = profile.badges.includes(badge); return <button key={badge} onClick={() => profile.updateProfile({ badges: active ? profile.badges.filter((b) => b !== badge) : profile.badges.length < 3 ? [...profile.badges, badge] : [...profile.badges.slice(1), badge] })} className={`hyzr-badge-choice ${active ? "selected" : ""}`}>{badge}</button>; })}</div></div>
          </div>
          <div className={`banner-${profile.banner} flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-white/10 p-5 text-center`}><Avatar style={profile.avatar} large /><h3 className={`name-effect-${profile.nameEffect} mt-3 text-xl font-black`}>{draft.username || "Trader"}</h3><p className="text-[11px] text-textTertiary">@{draft.handle.replace(/^@/, "")}</p><div className="mt-4 flex flex-wrap justify-center gap-1">{profile.badges.map((b) => <span key={b} className="hyzr-profile-badge">{b}</span>)}</div></div>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4"><button onClick={() => setEditor(false)} className="hyzr-secondary-button">Cancel</button><button onClick={() => { profile.updateProfile(draft); setEditor(false); }} className="steel-button h-9 rounded-lg px-5 text-[12px] font-bold">Save identity</button></div>
      </div></div>}

      {share && <div className="hyzr-dialog-layer"><button aria-label="Close" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShare(false)} /><div className="hyzr-share-dialog"><div className={`hyzr-pnl-card banner-${profile.banner}`}><div className="flex items-center justify-between"><span className="hyzr-wordmark text-[17px]">hyzr</span><span className="text-[9px] font-bold uppercase tracking-[.2em] text-textTertiary">{sharedTrade ? `${sharedTrade.coin} trade` : "Performance card"}</span></div><div className="mt-10 text-[10px] uppercase tracking-[.18em] text-textTertiary">{sharedTrade ? "Realized PnL" : "Total PnL"}</div><div className={`mt-1 text-[44px] font-black ${cardPnl >= 0 ? "text-increase" : "text-decrease"}`}>{cardPnl >= 0 ? "+" : "-"}${Math.abs(cardPnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div><div className="mt-8 flex items-end justify-between"><div><p className={`name-effect-${profile.nameEffect} text-[18px] font-black`}>{profile.username}</p><p className="mt-1 text-[10px] text-textTertiary">@{profile.handle.replace(/^@/, "")} · Level {profile.level}</p></div><div className="grid grid-cols-2 gap-6 text-right"><div><p className="text-[9px] uppercase text-textTertiary">{sharedTrade ? "Market" : "Best trade"}</p><p className="mt-1 font-mono text-[13px] text-increase">{sharedTrade ? sharedTrade.coin : `+$${cardBest.toFixed(2)}`}</p></div><div><p className="text-[9px] uppercase text-textTertiary">{sharedTrade ? "Side" : "Win rate"}</p><p className="mt-1 font-mono text-[13px]">{sharedTrade ? sharedTrade.dir : `${winRate.toFixed(0)}%`}</p></div></div></div></div><div className="mt-3 flex gap-2"><button onClick={downloadCard} className="steel-button h-10 flex-1 rounded-lg text-[12px] font-bold"><i className="ri-download-2-line mr-2" />Download image</button><button onClick={() => navigator.clipboard?.writeText(`${cardPnl >= 0 ? "+" : ""}$${cardPnl.toFixed(2)} ${sharedTrade?.coin ?? "portfolio"} PnL on HYZR — @${profile.handle.replace(/^@/, "")}`)} className="hyzr-secondary-button"><i className="ri-file-copy-line" />Copy caption</button></div></div></div>}
    </>
  );
}
