/**
 * IO-470-F power model.
 *
 * Reproduces the manufacturer's graphical procedure from the
 * "Sea Level vs Altitude Performance Curve, IO-470-F":
 *   A  = MAP line x RPM line on the altitude chart (full-throttle point)
 *   B  = RPM line at MAP on the sea-level chart
 *   C  = B carried across to the sea-level axis of the altitude chart
 *   D  = point on line C–A at the pressure altitude  -> actual BHP
 *
 * All geometry lives in the scanned chart's own pixel space (600 dpi scan),
 * so the overlay in the UI can draw the construction directly on the image.
 */
import D from './chartData.json'

export const RATED_HP: number = D.ratedHP
export const CROP = D.crop

type Poly = number[] // numpy order: highest power first

const SL_RPMS = Object.keys(D.slLines).map(Number).sort((a, b) => a - b)
const ALT_RPMS = Object.keys(D.altRpmLines).map(Number).sort((a, b) => a - b)
const MAP_LINES = D.mapLines as Record<string, { c: Poly; hpMin: number; hpMax: number }>

export const RPM_MIN = Math.max(SL_RPMS[0], ALT_RPMS[0]) // 2200
export const RPM_MAX = 2500 // highest RPM drawn on both charts below rated (2625 kept for reference only)
export const MAP_SCAN_MIN = 14
export const MAP_SCAN_MAX = 28.8

/* ---------- helpers ---------- */
export function polyval(c: Poly, x: number): number {
  return c.reduce((acc, k) => acc * x + k, 0)
}
function interp(x: number, xs: number[], ys: number[]): number {
  if (x <= xs[0]) return ys[0] + ((ys[1] - ys[0]) * (x - xs[0])) / (xs[1] - xs[0])
  const n = xs.length - 1
  if (x >= xs[n]) return ys[n] + ((ys[n] - ys[n - 1]) * (x - xs[n])) / (xs[n] - xs[n - 1])
  let i = 1
  while (xs[i] < x) i++
  return ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1])
}
function bracket(v: number, list: number[]): [number, number, number] {
  if (v <= list[0]) return [list[0], list[1], (v - list[0]) / (list[1] - list[0])]
  for (let i = 1; i < list.length; i++) {
    if (v <= list[i]) return [list[i - 1], list[i], (v - list[i - 1]) / (list[i] - list[i - 1])]
  }
  const n = list.length - 1
  return [list[n - 1], list[n], (v - list[n - 1]) / (list[n] - list[n - 1])]
}
function bisect(f: (x: number) => number, lo: number, hi: number, it = 50): number {
  let flo = f(lo)
  for (let i = 0; i < it; i++) {
    const mid = (lo + hi) / 2
    const fm = f(mid)
    if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm } else hi = mid
  }
  return (lo + hi) / 2
}

/* ---------- calibration (chart pixel space) ---------- */
export const sl = D.sl
export const alt = D.alt
export const slMapX = (m: number) => sl.x17 + (m - 17) * sl.pxPerIn
export const slMapFromX = (x: number) => 17 + (x - sl.x17) / sl.pxPerIn
export const slY = (hp: number) => sl.y260 + (260 - hp) * sl.pxPerHp
export const altX = (h: number) => interp(h, alt.gridAlt, alt.gridX)
export const xToAlt = (x: number) => interp(x, alt.gridX, alt.gridAlt)
export const atY = (hp: number) => alt.y260 + (260 - hp) * alt.pxPerHp
export const atHp = (y: number) => 260 - (y - alt.y260) / alt.pxPerHp

/* ---------- chart curves ---------- */
/** Sea-level chart: BHP at sea level for RPM and MAP (RPM interpolated between drawn lines). */
export function hpSL(rpm: number, m: number): number {
  const [r0, r1, f] = bracket(rpm, SL_RPMS)
  const l0 = (D.slLines as any)[r0], l1 = (D.slLines as any)[r1]
  const h0 = l0.a * m + l0.b, h1 = l1.a * m + l1.b
  return h0 + (h1 - h0) * f
}
/** Altitude chart: full-throttle BHP of an RPM line at chart position x. */
export function altRpmHp(rpm: number, x: number): number {
  const [r0, r1, f] = bracket(rpm, ALT_RPMS)
  const h0 = polyval((D.altRpmLines as any)[r0], x)
  const h1 = polyval((D.altRpmLines as any)[r1], x)
  return h0 + (h1 - h0) * f
}
/** Altitude chart: x position of a (possibly fractional) MAP line at a given BHP. */
export function mapX(m: number, hp: number): number {
  const lo = Math.min(Math.max(Math.floor(m), 14), 28)
  const hi = Math.min(lo + 1, 28)
  const f = m - lo
  const xl = polyval(MAP_LINES[lo].c, hp)
  const xh = polyval(MAP_LINES[hi].c, hp)
  return xl + (xh - xl) * f
}
export function mapLineTop(m: number): number {
  const lo = Math.min(Math.max(Math.floor(m), 14), 28)
  const hi = Math.min(lo + 1, 28)
  return Math.min(MAP_LINES[lo].hpMax, MAP_LINES[hi].hpMax)
}

export interface PointA { x: number; hp: number; alt: number }
/** Point A: where the MAP line meets the RPM line (full throttle). */
export function pointA(rpm: number, m: number): PointA | null {
  const top = mapLineTop(m) + 1
  const g = (hp: number) => altRpmHp(rpm, mapX(m, hp)) - hp
  const lo = 119.5
  if (g(lo) * g(top) > 0) return null
  const hp = bisect(g, lo, top)
  const x = mapX(m, hp)
  return { x, hp, alt: xToAlt(x) }
}

export interface Construction {
  rpm: number; map: number; altitude: number
  hpB: number; A: PointA; hpD: number; xh: number
}
/** Forward procedure: actual BHP at pressure altitude (ISA) for RPM and MAP. Null if MAP is not available there. */
export function construct(rpm: number, m: number, h: number): Construction | null {
  const A = pointA(rpm, m)
  if (!A) return null
  const xh = altX(h)
  if (xh > A.x + 1e-6) return null
  const hpB = hpSL(rpm, m)
  const hpD = hpB + ((A.hp - hpB) * (xh - alt.xSL)) / (A.x - alt.xSL)
  return { rpm, map: m, altitude: h, hpB, A, hpD, xh }
}
export const hpAt = (rpm: number, m: number, h: number) => construct(rpm, m, h)?.hpD ?? null

export interface FullThrottle { map: number; hp: number }
/** Highest MAP available at this altitude/RPM (full throttle) and the power it gives. */
export function fullThrottle(rpm: number, h: number): FullThrottle | null {
  // validity (A exists and lies at/above h) holds on an interval [mLow, mFT]
  let mLow: number | null = null
  for (let m = MAP_SCAN_MIN; m <= MAP_SCAN_MAX + 1e-9; m += 0.1) {
    if (construct(rpm, m, h)) { mLow = m; break }
  }
  if (mLow === null) return null
  let hi = MAP_SCAN_MAX
  if (construct(rpm, hi, h)) return { map: hi, hp: hpAt(rpm, hi, h)! }
  let lo = mLow
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (construct(rpm, mid, h)) lo = mid; else hi = mid
  }
  return { map: lo, hp: hpAt(rpm, lo, h)! }
}

export interface Solve { map: number | null; fullThrottle: FullThrottle | null; lowest: number | null }
/** Reverse procedure: MAP that gives `hpTarget` (chart BHP) at altitude `h` and `rpm`. */
export function solveMap(rpm: number, hpTarget: number, h: number): Solve {
  const ft = fullThrottle(rpm, h)
  if (!ft) return { map: null, fullThrottle: null, lowest: null }
  let lo = MAP_SCAN_MIN
  while (lo < ft.map && !construct(rpm, lo, h)) lo += 0.05
  const hpLo = hpAt(rpm, lo, h)!
  if (ft.hp < hpTarget - 1e-9) return { map: null, fullThrottle: ft, lowest: lo }
  if (hpLo > hpTarget) return { map: null, fullThrottle: ft, lowest: lo } // below chart range
  const m = bisect((mm) => (hpAt(rpm, mm, h) ?? 999) - hpTarget, lo, ft.map)
  return { map: m, fullThrottle: ft, lowest: lo }
}

/* ---------- atmosphere & temperature ---------- */
export const isaC = (h: number) => 15 - 1.98 * (h / 1000)
export const isaF = (h: number) => 59 - 3.566 * (h / 1000)
/**
 * Chart rule: subtract 1 % for each 6 °F above standard (add below).
 * Returns the chart BHP needed so that the actual BHP equals `hpActual`.
 */
export function chartHpForActual(hpActual: number, isaDevC: number): number {
  const devF = isaDevC * 1.8
  return hpActual / (1 - (0.01 * devF) / 6)
}
export const actualFromChartHp = (hpChart: number, isaDevC: number) => hpChart * (1 - (0.01 * isaDevC * 1.8) / 6)
