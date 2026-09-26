"use client";

import { useEffect, useRef } from "react";

/* Deterministic PRNG (mulberry32) so each token draws the same curve
   on every render, exactly like the frozen snapshot charts. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSeries(seed: number, up: boolean, points = 32) {
  const rand = mulberry32(seed);
  const series: number[] = [];
  let v = 50;
  const drift = up ? 0.9 : -0.9;
  for (let i = 0; i < points; i++) {
    v += (rand() - 0.5) * 14 + (drift * (i / points) * 2.4);
    v = Math.min(96, Math.max(4, v));
    series.push(v);
  }
  // ensure the final point sits in the direction of the change
  series[points - 1] = up ? Math.max(series[points - 1], 78) : Math.min(series[points - 1], 22);
  return series;
}

export default function Sparkline({
  seed,
  up,
  series,
  width = 78,
  height = 40,
}: {
  seed: number;
  up: boolean;
  /** live data — when provided (≥2 points) it replaces the seeded series */
  series?: number[];
  width?: number;
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    /* fx16: fill the column (56px mobile / 96px desktop) instead of a hard
       78px — measured from the wrapper so breakpoint crossings stay sharp */
    const draw = () => {
      const w = Math.max(24, Math.floor(canvas.parentElement?.clientWidth ?? width));
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, height);

    const live = series && series.length >= 2;
    const src = live
      ? (series as number[]).slice(-48)
      : buildSeries(seed, up);
    const n = src.length;
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of src) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const span = hi - lo || 1;
    const pad = span * 0.12;
    const stepX = w / (n - 1);
    const toXY = (v: number, i: number) =>
      [
        i * stepX,
        height - 2 - ((v - lo + pad) / (span + pad * 2)) * (height - 4),
      ] as const;

    const color = up ? "rgb(11,153,129)" : "rgb(242,53,70)";

    // area fill
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, up ? "rgba(11,153,129,0.28)" : "rgba(242,53,70,0.28)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.beginPath();
    src.forEach((v, i) => {
      const [x, y] = toXY(v, i);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(w, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // line
    ctx.beginPath();
    src.forEach((v, i) => {
      const [x, y] = toXY(v, i);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineJoin = "round";
    ctx.stroke();

    // end dot
    const [ex, ey] = toXY(src[n - 1], n - 1);
    ctx.beginPath();
    ctx.arc(ex, ey, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    };

    draw();
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [seed, up, series, width, height]);

  return (
    <div className="relative h-[40px] w-[100%]">
      <div className="relative opacity-70" style={{ height: "100%", width: "100%" }}>
        <canvas
          ref={ref}
          role="img"
          style={{ display: "block", boxSizing: "border-box", height: 40, width: "100%" }}
        />
      </div>
    </div>
  );
}
