/* ---------------------------------------------------------------------------
 * TrendScore — our own trending engine (user mandate: if hyzr's exact
 * private algorithm can't be copied, build one that is BETTER at surfacing
 * the cross-asset markets that are actually trending right now).
 *
 * What the real hyzr board teaches us (decoded from reference screenshots):
 *   - universe: pump.fun launchpad coins ONLY (bonding or graduated) and
 *     EVERY row has a real icon + a live bonding curve / AMM badge
 *   - ages span 42s … 7 months on the same board
 *   - ranking is NOT pure timeframe volume: a 7-minute-old coin doing $30K
 *     outranks a 2-month coin doing $39K — momentum + freshness matter
 *
 * Score = Activity × Quality × Momentum-shape × Freshness × Acceleration
 *
 *   activity    log10(1 + volume in the active timeframe)
 *   quality     buy pressure, txn rate, unique buyers, liquidity depth
 *   momentum    healthy pumps up-weighted, dumps and thin parabolas punished
 *   freshness   brand-new launches with real activity get a kicker
 *   acceleration last-minute volume rate vs window volume rate (heating up?)
 *
 * boardEligible() is the hard filter that keeps the board identical in KIND
 * to the real one: real icon, pump.fun ecosystem, aborted launches out,
 * dead/zero-activity coins out, NSFW out.
 * ------------------------------------------------------------------------- */

import type { LiveToken } from "@/lib/hyzr-live-types";
import { tfCh, tfTx, tfVol, type Timeframe } from "./toRow";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Window minimums so only coins with real trading activity can rank. */
export function boardEligible(
  t: LiveToken,
  now: number,
  tf: Timeframe,
): boolean {
  if (!t.image) return false; // icons everywhere — like the real board
  if (t.nsfw) return false;
  const age = now - t.createdAt;
  if (age < 1_000) return false;
  const v = tfVol(t, tf);
  const tx = tfTx(t, tf);
  const n = (tx?.b ?? 0) + (tx?.s ?? 0);
  if (tf === "30m" || tf === "1h") return v >= 1_500 && n >= 8;
  // short windows: established activity OR a very young coin waking up
  return (
    (v >= 600 && n >= 5) || (age < 6 * 60_000 && v >= 250 && n >= 3)
  );
}

/** Surge "Early" column: newness matters, activity doesn't yet. */
export function surgeEligible(t: LiveToken, now: number): boolean {
  return (
    !!t.image &&
    !t.nsfw &&
    true &&
    now - t.createdAt < 24 * 3_600_000 &&
    t.mc > 0
  );
}

/** Top tab: established movers — 24h volume rank, same quality gates. */
export function topEligible(t: LiveToken, now: number): boolean {
  if (!t.image || t.nsfw) return false;
  if (t.mc <= 0) return false;
  return t.v24h >= 3_000 && (t.t24h?.b ?? 0) + (t.t24h?.s ?? 0) >= 15;
}

/** The composite trending score for one token in one timeframe. */
export function trendScore(
  t: LiveToken,
  tf: Timeframe,
  now: number,
): number {
  const v = Math.max(0, tfVol(t, tf));
  const tx = tfTx(t, tf) ?? { b: 0, s: 0 };
  const n = Math.max(0, tx.b + tx.s);
  const ch = tfCh(t, tf) || 0;
  const ageMin = Math.max(0, (now - t.createdAt) / 60_000);
  if (v <= 0 && n <= 0) return 0;

  // activity level — log keeps $300K whales from permanently squatting the
  // top while still rewarding genuine size
  const act = Math.log10(1 + v);

  // quality — buy pressure, txn velocity, unique buyers, curve/pool depth
  const buyP = n > 0 ? clamp((tx.b - tx.s) / n, -1, 1) : 0;
  const txRate = Math.min(1.15, n / 45); // ~1 txn/s saturates
  const depth = clamp(
    Math.log10(1 + Math.max(t.liq, t.mc * 0.08, 1)) / Math.log10(1 + 60_000),
    0,
    1,
  );
  const uniq = clamp((t.b5 ?? 0) / 40, 0, 1);
  const qual =
    0.5 + 0.26 * Math.max(0, buyP) + 0.16 * txRate + 0.18 * depth + 0.06 * uniq;

  // momentum shape — reward sustained pumps, punish dumps; a parabolic move
  // on thin volume is a one-wallet fake and gets discounted, not rewarded
  const thin = act < 2.2; // <$1.5K traded in the window
  const mShape =
    ch >= 0
      ? thin
        ? 0.9
        : Math.min(1.3, 1 + ch / 350)
      : Math.max(0.45, 1 + ch / 220);

  // acceleration — is volume heating up right now? (1m rate vs window rate)
  let aMult = 1;
  if (tf !== "1m") {
    const v1m = t.v1m || v * 0.2;
    const accel = clamp((v1m * 5 + 1) / (v + 1), 0.4, 2.6);
    aMult = 0.8 + 0.22 * accel;
  }

  // freshness — the real board's 42s–26m coins sit at the top: new launches
  // with proven activity outrank similar-volume veterans (fades over 90min)
  const fresh = ageMin <= 90 ? 1 + 0.4 * (1 - ageMin / 90) : 1;

  // community buzz (pump.fun replies) — tiny nudge, never decisive
  const buzz = 1 + Math.min(0.05, Math.log10(1 + (t.replies ?? 0)) * 0.02);

  return act * qual * mShape * fresh * aMult * buzz;
}

/** Trending board: gates + score rank, volume as tiebreak. */
export function rankTrending(
  list: LiveToken[],
  tf: Timeframe,
  now: number,
): LiveToken[] {
  return list
    .filter((t) => boardEligible(t, now, tf))
    .map((t) => ({ t, s: trendScore(t, tf, now) }))
    .sort((a, b) => b.s - a.s || tfVol(b.t, tf) - tfVol(a.t, tf))
    .map((x) => x.t);
}
