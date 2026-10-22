// ponytail: pure SVG geometry for the growth chart — one copy, used by EMR + portal
export type GrowthPoint = { date: string; ageMonths: number; value: number; z: number | null; percentile: number | null; band: string };
export type GrowthCurve = {
  indicator: string; unit: string; standard: string;
  points: GrowthPoint[];
  curves: { z: number; points: { ageMonths: number; value: number }[] }[];
};

export const BAND_LABEL: Record<string, string> = {
  very_low: "Sangat rendah", low: "Rendah", normal: "Normal", high: "Tinggi", very_high: "Sangat tinggi",
};
export const BAND_TONE: Record<string, string> = {
  very_low: "bad", low: "warn", normal: "ok", high: "warn", very_high: "bad", unknown: "",
};

// ponytail: IDR money format — no Intl dependency, no rounding surprises
export function formatIDR(n: number): string {
  const v = Math.round(Number(n) || 0);
  return "Rp " + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// build the geometry of a growth chart (bands + child line + axes)
export function growthGeometry(curve: GrowthCurve, opts: { width: number; height: number; pad?: number }) {
  const w = opts.width, h = opts.height, P = opts.pad ?? 34;
  const all = curve.curves.flatMap((c) => c.points);
  const ages = all.map((p) => p.ageMonths);
  const values = all.map((p) => p.value).concat(curve.points.map((p) => p.value));
  if (!ages.length || !values.length) return null;
  const minA = Math.min(...ages), maxA = Math.max(...ages);
  let minV = Math.min(...values), maxV = Math.max(...values);
  const padV = (maxV - minV) * 0.08 || 1;
  minV -= padV; maxV += padV;
  const x = (m: number) => P + ((m - minA) / Math.max(0.001, maxA - minA)) * (w - P * 2);
  const y = (v: number) => h - P - ((v - minV) / Math.max(0.001, maxV - minV)) * (h - P * 2);
  const pathOf = (pts: { ageMonths: number; value: number }[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${x(p.ageMonths).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const lines = curve.curves.map((c) => ({ z: c.z, d: pathOf(c.points) }));
  const area = (lo: number, hi: number) => {
    const a = curve.curves.find((c) => c.z === lo)?.points || [];
    const b = curve.curves.find((c) => c.z === hi)?.points || [];
    if (!a.length || !b.length) return "";
    return pathOf(a) + " " + [...b].reverse().map((p) => `L${x(p.ageMonths).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ") + " Z";
  };
  const child = curve.points.map((p, i) => `${i ? "L" : "M"}${x(p.ageMonths).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const dots = curve.points.map((p) => ({ ...p, cx: x(p.ageMonths), cy: y(p.value) }));
  const step = (maxA - minA) / 4 || 1;
  const xTicks = [0, 1, 2, 3, 4].map((i) => {
    const m = minA + i * step;
    return { x: x(m), label: m >= 12 ? `${Math.round(m / 12)} th` : `${Math.round(m)} bl` };
  });
  const yTicks = [0, 1, 2, 3, 4].map((i) => {
    const v = minV + ((maxV - minV) * i) / 4;
    return { y: y(v), label: (Math.round(v * 10) / 10).toString() };
  });
  return { w, h, P, x, y, lines, area, child, dots, xTicks, yTicks, minA, maxA, minV, maxV };
}
