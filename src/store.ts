import { reactive, watch } from 'vue'
import { DEFAULT_LIMITS, type Limits } from './engine/settings'

export type Mode = 'solve' | 'read'
export interface PowerRow { id: number; pct: number; rpm: 'auto' | number }

export interface State {
  mode: Mode
  pct: number          // single setting: target % of rated power
  altitude: number     // pressure altitude, ft
  rpmAuto: boolean
  rpm: number
  map: number          // read mode: MAP set by the pilot
  isaDev: number       // °C deviation from ISA (single setting)
  showAlternatives: boolean
  limits: Limits
  table: { from: number; to: number; step: number; isaDev: number; rows: PowerRow[] }
}

const KEY = 'io470-power-tool:v1'

function defaults(): State {
  return {
    mode: 'solve', pct: 55, altitude: 6000, rpmAuto: true, rpm: 2300, map: 21, isaDev: 0,
    showAlternatives: true,
    limits: { ...DEFAULT_LIMITS },
    table: {
      from: 0, to: 12000, step: 1000, isaDev: 0,
      rows: [
        { id: 1, pct: 45, rpm: 'auto' },
        { id: 2, pct: 55, rpm: 'auto' },
        { id: 3, pct: 65, rpm: 'auto' },
        { id: 4, pct: 75, rpm: 'auto' },
      ],
    },
  }
}

function load(): State {
  const d = defaults()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return d
    const s = JSON.parse(raw)
    return { ...d, ...s, limits: { ...d.limits, ...s.limits }, table: { ...d.table, ...s.table } }
  } catch {
    return d
  }
}

export const state = reactive<State>(load())

watch(state, (s) => {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage unavailable: keep working in memory */ }
}, { deep: true })

export function resetAll() {
  Object.assign(state, defaults())
}
