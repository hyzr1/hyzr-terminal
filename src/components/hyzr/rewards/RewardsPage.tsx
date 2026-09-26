"use client";

import { useState } from "react";
import { useProfileStore } from "@/lib/profileStore";

const tiers = [
  { level: 17, label: "Chrome cache", icon: "ri-archive-stack-fill", unlocked: true },
  { level: 18, label: "Steel pulse", icon: "ri-rhythm-fill", unlocked: false },
  { level: 19, label: "500 XP", icon: "ri-flashlight-fill", unlocked: false },
  { level: 20, label: "Ghost avatar", icon: "ri-ghost-2-fill", unlocked: false },
  { level: 21, label: "Fee shield", icon: "ri-shield-check-fill", unlocked: false },
  { level: 22, label: "Prism name", icon: "ri-magic-fill", unlocked: false },
];

/** the full track shown by "All rewards" */
const allTiers = [
  ...tiers,
  { level: 23, label: "Animated name", icon: "ri-movie-2-fill", unlocked: false },
  { level: 24, label: "Founder's badge", icon: "ri-verified-badge-fill", unlocked: false },
  { level: 25, label: "Hologram profile", icon: "ri-sparkling-2-fill", unlocked: false },
  { level: 30, label: "Share-card frame", icon: "ri-image-2-fill", unlocked: false },
  { level: 35, label: "Golden ticker", icon: "ri-vip-crown-2-fill", unlocked: false },
  { level: 40, label: "Season legend", icon: "ri-fire-fill", unlocked: false },
];
const quests = [
  { icon: "ri-line-chart-line", title: "Trade three asset classes", detail: "Crypto, equity and commodity perpetuals", progress: 2, goal: 3, xp: 450 },
  { icon: "ri-shield-star-line", title: "Disciplined trader", detail: "Place 5 trades with a stop loss", progress: 3, goal: 5, xp: 300 },
  { icon: "ri-share-forward-line", title: "Show your edge", detail: "Export a HYZR PnL card", progress: 0, goal: 1, xp: 150 },
  { icon: "ri-radar-line", title: "Track the smart money", detail: "Add two wallets to your tracker", progress: 1, goal: 2, xp: 200 },
];

export default function RewardsPage() {
  const profile = useProfileStore();
  const [showAll, setShowAll] = useState(false);
  const pct = Math.min(100, (profile.xp % 1000) / 10);
  return <div className="min-h-full w-full overflow-y-auto bg-[#090b0d] p-4 sm:p-6">
    <div className="mx-auto max-w-[1280px]">
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(120deg,#1b2025,#0c0f12_50%,#272d33)] p-5 sm:p-8">
        <div className="hyzr-banner-sheen" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_360px] lg:items-center">
          <div><span className="text-[10px] font-black uppercase tracking-[.24em] text-[#9ca6af]">Season 01 · Forged</span><h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Trade. Level up. Look legendary.</h1><p className="mt-3 max-w-[650px] text-[13px] leading-6 text-textSecondary">Every trade builds your HYZR identity. Unlock animated names, profile frames, badges and share-card effects without changing the professional terminal underneath.</p><div className="mt-5 flex flex-wrap gap-2"><span className="hyzr-profile-badge"><i className="ri-time-line" />34 days left</span><span className="hyzr-profile-badge"><i className="ri-lock-unlock-line" />Cosmetics only — never pay to win</span></div></div>
          <div className="rounded-xl border border-white/10 bg-black/30 p-5"><div className="flex items-end justify-between"><div><p className="text-[10px] uppercase tracking-widest text-textTertiary">Current level</p><p className="mt-1 text-4xl font-black text-white">{profile.level}</p></div><p className="font-mono text-[12px] text-[#b8c0c8]">{profile.xp} XP</p></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[linear-gradient(90deg,#626d78,#f2f5f7)]" style={{width:`${pct}%`}} /></div><div className="mt-2 flex justify-between text-[9px] uppercase text-textTertiary"><span>Chrome II</span><span>{1000 - (profile.xp % 1000)} XP to level {profile.level + 1}</span></div></div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_380px]">
        <section className="rounded-xl border border-white/8 bg-[#0e1114] p-4 sm:p-5"><div className="flex items-center justify-between"><div><h2 className="text-[16px] font-bold">Battle pass</h2><p className="mt-1 text-[11px] text-textTertiary">Your next six unlocks</p></div><button className="hyzr-secondary-button" onClick={() => setShowAll((v) => !v)}><i className="ri-layout-grid-line" />{showAll ? "Next six" : "All rewards"}</button></div><div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">{(showAll ? allTiers : tiers).map((tier) => <div key={tier.level} className={`relative min-h-[150px] overflow-hidden rounded-xl border p-4 ${tier.unlocked ? "border-[#9da6af]/40 bg-[linear-gradient(145deg,#30363d,#111418)]" : "border-white/[.07] bg-white/[.025]"}`}><div className="flex items-center justify-between"><span className="text-[9px] font-black uppercase tracking-widest text-textTertiary">Level {tier.level}</span>{tier.unlocked ? <i className="ri-check-double-line text-increase" /> : <i className="ri-lock-2-line text-textTertiary" />}</div><i className={`${tier.icon} mt-7 block text-[30px] ${tier.unlocked ? "text-white" : "text-[#59616a]"}`} /><p className="mt-3 text-[12px] font-bold text-[#d8dde2]">{tier.label}</p></div>)}</div></section>
        <section className="rounded-xl border border-white/8 bg-[#0e1114] p-5"><div className="flex items-center justify-between"><div><h2 className="text-[16px] font-bold">Weekly quests</h2><p className="mt-1 text-[11px] text-textTertiary">Refreshes Monday</p></div><span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-textSecondary">1,100 XP</span></div><div className="mt-4 space-y-3">{quests.map((q) => <div key={q.title} className="rounded-lg border border-white/[.06] bg-white/[.02] p-3"><div className="flex gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[.06] text-[#c5cbd1]"><i className={q.icon} /></div><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="text-[12px] font-bold">{q.title}</p><span className="text-[10px] font-bold text-[#aeb6bf]">+{q.xp} XP</span></div><p className="mt-0.5 truncate text-[10px] text-textTertiary">{q.detail}</p><div className="mt-2 flex items-center gap-2"><div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[.07]"><div className="h-full bg-[#9ba5ae]" style={{width:`${q.progress/q.goal*100}%`}} /></div><span className="font-mono text-[9px] text-textTertiary">{q.progress}/{q.goal}</span></div></div></div></div>)}</div></section>
      </div>
    </div>
  </div>;
}
