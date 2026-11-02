import { describe, it, expect } from 'vitest'
import ref from './python-reference.json'
import { solveMap, construct, fullThrottle } from '../src/engine/model'
import { recommend, DEFAULT_LIMITS } from '../src/engine/settings'

describe('manual example (23 in, 2400 RPM)', () => {
  it('reproduces B, A and D within 0.7 HP of the printed chart', () => {
    const c = construct(2400, 23, 4530)!
    expect(Math.abs(c.hpB - 179)).toBeLessThan(0.7)
    expect(Math.abs(c.A.hp - 193.4)).toBeLessThan(0.7)
    expect(Math.abs(c.hpD - 189.4)).toBeLessThan(0.7)
  })
})

describe('matches the Python reference used for the document', () => {
  for (const r of ref as any[]) {
    it(`${r.pct} % at ${r.h} ft`, () => {
      for (const rpm of [2200, 2300, 2400]) {
        const py = r.rpm[String(rpm)]
        const ts = solveMap(rpm, 2.6 * r.pct, r.h).map
        if (py !== null && ts !== null) expect(Math.abs(ts - py)).toBeLessThan(0.06)
      }
      if (r.h > 0) expect(Math.abs(fullThrottle(2400, r.h)!.map - r.mft)).toBeLessThan(0.06)
      const rec = recommend(r.pct, r.h, 0, DEFAULT_LIMITS)
      if (r.rec) expect(rec.rpm).toBe(r.rec)
      else expect(rec.ok).toBe(false)
    })
  }
})
