import { RATED_HP, solveMap, chartHpForActual, actualFromChartHp, type FullThrottle } from './model'

export interface Limits {
  rpmMin: number          // tachometer green arc
  rpmMax: number
  mapMin: number          // manifold-pressure green arc
  mapMax: number
  cruiseMapMax: number    // edge of the chart's hatched "recommended cruise" area
  hartzell: boolean       // POH supplement: max 23 in below 2300 RPM with Hartzell prop
  throttleMargin: number  // preferred margin below full throttle for a recommendation (in Hg)
  autoStep: number        // RPM step used by "Auto"
}
export const DEFAULT_LIMITS: Limits = {
  rpmMin: 2200, rpmMax: 2500, mapMin: 15, mapMax: 26, cruiseMapMax: 24,
  hartzell: true, throttleMargin: 0.3, autoStep: 100,
}

export type FlagKind = 'unattainable' | 'rpmArc' | 'greenArc' | 'hartzell' | 'offScale' | 'cruise' | 'nearFT' | 'atFT'
export interface Flag { kind: FlagKind; severity: 'block' | 'warn'; text: string }

export const FLAG_SHORT: Record<FlagKind, string> = {
  unattainable: 'N/A', rpmArc: 'RPM', greenArc: 'MAP', hartzell: 'HZ', offScale: 'SCL',
  cruise: '>CR', nearFT: 'FT~', atFT: 'FT',
}

export interface Setting {
  pct: number; altitude: number; rpm: number; isaDevC: number
  hpTarget: number        // actual BHP wanted
  hpChart: number         // chart (ISA) BHP to solve for
  map: number | null      // required MAP (already temperature-corrected)
  ft: FullThrottle | null // full throttle at this altitude/RPM
  maxPct: number | null   // actual % available at full throttle
  flags: Flag[]
  ok: boolean             // no blocking flag
}

export function evaluate(pct: number, altitude: number, rpm: number, isaDevC: number, L: Limits): Setting {
  const hpTarget = (RATED_HP * pct) / 100
  const hpChart = chartHpForActual(hpTarget, isaDevC)
  const s = solveMap(rpm, hpChart, altitude)
  const flags: Flag[] = []
  const ft = s.fullThrottle
  const maxPct = ft ? (actualFromChartHp(ft.hp, isaDevC) / RATED_HP) * 100 : null
  let map = s.map
  if (map === null && ft && ft.hp >= hpChart - 0.5) map = ft.map // reachable right at full throttle
  if (map === null) {
    flags.push({ kind: 'unattainable', severity: 'block', text: ft ? `Not attainable at ${rpm} RPM: full throttle gives ${maxPct!.toFixed(0)} %` : 'Outside the chart' })
  } else {
    if (rpm < L.rpmMin || rpm > L.rpmMax) flags.push({ kind: 'rpmArc', severity: 'block', text: `RPM outside ${L.rpmMin}–${L.rpmMax}` })
    if (map < L.mapMin || map > L.mapMax) flags.push({ kind: 'greenArc', severity: 'block', text: `MAP outside ${L.mapMin}–${L.mapMax} in green arc` })
    if (L.hartzell && rpm < 2300 && map > 23.0 + 1e-9) flags.push({ kind: 'hartzell', severity: 'block', text: 'Over 23 in below 2300 RPM (Hartzell limit)' })
    if (map < 16.4) flags.push({ kind: 'offScale', severity: 'block', text: 'More than 0.6 in below the sea-level chart scale (17 in)' })
    if (map > L.cruiseMapMax + 1e-9) flags.push({ kind: 'cruise', severity: 'warn', text: `Above ${L.cruiseMapMax} in (recommended-cruise area)` })
    if (ft && map >= ft.map - 0.02) flags.push({ kind: 'atFT', severity: 'warn', text: 'Full throttle' })
    else if (ft && map > ft.map - L.throttleMargin) flags.push({ kind: 'nearFT', severity: 'warn', text: `Within ${L.throttleMargin} in of full throttle` })
  }
  return { pct, altitude, rpm, isaDevC, hpTarget, hpChart, map, ft, maxPct, flags, ok: !flags.some((f) => f.severity === 'block') }
}

export function candidateRpms(L: Limits): number[] {
  const out: number[] = []
  for (let r = L.rpmMin; r <= L.rpmMax + 1e-9; r += L.autoStep) out.push(Math.round(r))
  if (out[out.length - 1] !== L.rpmMax) out.push(L.rpmMax)
  return out
}

/**
 * Auto: lowest RPM that is within all limits, preferring settings that stay
 * inside the recommended-cruise area and keep a margin below full throttle.
 */
export function recommend(pct: number, altitude: number, isaDevC: number, L: Limits): Setting {
  const all = candidateRpms(L).map((r) => evaluate(pct, altitude, r, isaDevC, L))
  const clean = all.find((s) => s.ok && s.flags.length === 0)
  if (clean) return clean
  const noCruise = all.find((s) => s.ok && !s.flags.some((f) => f.kind === 'cruise'))
  if (noCruise) return noCruise
  const anyOk = all.find((s) => s.ok)
  if (anyOk) return anyOk
  return all[all.length - 1] // highest RPM: shows the most power available
}
