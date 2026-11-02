<script setup lang="ts">
import { computed, ref } from 'vue'
import chartUrl from '../assets/chart.jpg'
import {
  CROP, alt, sl, slMapX, slMapFromX, slY, altX, xToAlt, atY, atHp, mapX, mapLineTop,
  type Construction,
} from '../engine/model'

const props = defineProps<{
  mode: 'solve' | 'read'
  cons: Construction | null          // active construction (thick magenta)
  alts: Construction[]               // alternative RPMs (thin)
  altitude: number
  hpTarget: number | null            // chart BHP of the target line (solve mode)
  targetLabel: string
  map: number                        // read mode MAP
  failed: boolean                    // target not reachable: construction shows full throttle
}>()
const emit = defineEmits<{
  (e: 'altitude', v: number): void
  (e: 'hp', v: number): void
  (e: 'map', v: number): void
}>()

const W = CROP.x1 - CROP.x0
const H = CROP.y1 - CROP.y0
const X = (x: number) => x - CROP.x0
const Y = (y: number) => y - CROP.y0
const ALT_MAX = 16000

const svg = ref<SVGSVGElement | null>(null)
const dragging = ref<null | 'alt' | 'hp' | 'd' | 'map'>(null)

function toChart(ev: PointerEvent) {
  const el = svg.value!
  const pt = el.createSVGPoint()
  pt.x = ev.clientX; pt.y = ev.clientY
  const p = pt.matrixTransform(el.getScreenCTM()!.inverse())
  return { x: p.x + CROP.x0, y: p.y + CROP.y0 }
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
function apply(ev: PointerEvent) {
  const p = toChart(ev)
  if (dragging.value === 'alt' || dragging.value === 'd') emit('altitude', Math.round(clamp(xToAlt(p.x), 0, ALT_MAX) / 100) * 100)
  if (dragging.value === 'hp' || dragging.value === 'd') emit('hp', clamp(atHp(p.y), 80, 240))
  if (dragging.value === 'map') emit('map', Math.round(clamp(slMapFromX(p.x), 14, 28.8) * 10) / 10)
}
function start(kind: 'alt' | 'hp' | 'd' | 'map', ev: PointerEvent) {
  dragging.value = kind
  ;(ev.currentTarget as Element).setPointerCapture?.(ev.pointerId)
  apply(ev)
}
function move(ev: PointerEvent) { if (dragging.value) apply(ev) }
function end() { dragging.value = null }

/** Click on the altitude chart: move D (solve) or the altitude (read) there. */
function chartDown(ev: PointerEvent) {
  const p = toChart(ev)
  if (p.x < alt.xSL || p.y > alt.axisBottomY) return
  start(props.mode === 'solve' ? 'd' : 'alt', ev)
}

const xh = computed(() => altX(props.altitude))
const fmt = (n: number, d = 1) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
const ft = (n: number) => Math.round(n).toLocaleString('en-US')

function geom(c: Construction) {
  const bx = slMapX(c.map), by = slY(c.hpB), cy = atY(c.hpB)
  const ax = c.A.x, ay = atY(c.A.hp)
  const k = 1.05
  const ex = alt.xSL + (ax - alt.xSL) * k, ey = atY(c.hpB + (c.A.hp - c.hpB) * k)
  const top = mapLineTop(c.map)
  const mapPts: string[] = []
  for (let i = 0; i <= 30; i++) {
    const hp = c.A.hp + ((top - c.A.hp) * i) / 30
    mapPts.push(`${X(mapX(c.map, hp))},${Y(atY(hp))}`)
  }
  return {
    drop: `M${X(bx)},${Y(sl.axisY)} V${Y(by)}`,
    across: `M${X(bx)},${Y(by)} H${X(sl.rightX)} L${X(alt.xSL)},${Y(cy)}`,
    ca: `M${X(alt.xSL)},${Y(cy)} L${X(ex)},${Y(ey)}`,
    mapLine: mapPts.join(' '),
    B: [X(bx), Y(by)], C: [X(alt.xSL), Y(cy)], A: [X(ax), Y(ay)], D: [X(c.xh), Y(atY(c.hpD))],
    same: Math.abs(ax - c.xh) < 25,
  }
}
const g = computed(() => (props.cons ? geom(props.cons) : null))
const ga = computed(() => props.alts.map((c) => ({ c, g: geom(c) })))
const yT = computed(() => (props.hpTarget === null ? null : Y(atY(props.hpTarget))))
const altTicks = [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000]
</script>

<template>
  <figure class="chart-plate">
    <svg
      ref="svg" :viewBox="`0 0 ${W} ${H}`" role="img"
      aria-label="IO-470-F sea level vs altitude performance curve with the current construction"
      @pointermove="move" @pointerup="end" @pointercancel="end"
    >
      <image :href="chartUrl" x="0" y="0" :width="W" :height="H" />
      <!-- clickable altitude-chart area -->
      <rect :x="X(alt.xSL)" :y="Y(alt.y260)" :width="W - X(alt.xSL)" :height="Y(alt.axisBottomY) - Y(alt.y260)"
            fill="transparent" class="hit-area" @pointerdown="chartDown" />

      <!-- own altitude scale (the scan's rotated labels are cropped) -->
      <rect :x="X(2600)" :y="Y(3868)" :width="W - X(2600)" :height="H - Y(3868)" fill="#fff" />
      <g class="tick-labels">
        <text v-for="t in altTicks" :key="t" :x="X(altX(t))" :y="Y(3935)" text-anchor="middle">{{ t === 0 ? 'SL' : t / 1000 + 'k' }}</text>
      </g>

      <!-- target power line -->
      <g v-if="mode === 'solve' && yT !== null" class="target">
        <line :x1="X(alt.xSL)" :x2="W" :y1="yT" :y2="yT" class="dash" />
        <line :x1="X(alt.xSL)" :x2="W" :y1="yT" :y2="yT" class="hit" style="cursor: ns-resize" @pointerdown.stop="start('hp', $event)" />
        <text :x="W - 30" :y="yT - 40" text-anchor="end" class="lbl">{{ targetLabel }}</text>
        <circle :cx="W - 110" :cy="yT" r="34" class="handle" style="cursor: ns-resize" @pointerdown.stop="start('hp', $event)" />
      </g>

      <!-- altitude line -->
      <g class="altline">
        <line :x1="X(xh)" :x2="X(xh)" :y1="Y(alt.y260)" :y2="Y(3800)" class="dash" />
        <line :x1="X(xh)" :x2="X(xh)" :y1="Y(alt.y260)" :y2="Y(3800)" class="hit" style="cursor: ew-resize" @pointerdown.stop="start('alt', $event)" />
        <circle :cx="X(xh)" :cy="Y(3700)" r="34" class="handle" style="cursor: ew-resize" @pointerdown.stop="start('alt', $event)" />
        <text :x="X(xh)" :y="Y(3935)" text-anchor="middle" class="lbl">{{ altitude === 0 ? 'Sea level' : ft(altitude) + ' ft' }}</text>
      </g>

      <!-- alternatives -->
      <g v-for="a in ga" :key="a.c.rpm" class="alt-cons">
        <path :d="a.g.drop" /><path :d="a.g.across" /><path :d="a.g.ca" />
        <polyline :points="a.g.mapLine" class="mapline" />
        <circle :cx="a.g.B[0]" :cy="a.g.B[1]" r="18" />
        <circle :cx="a.g.A[0]" :cy="a.g.A[1]" r="18" />
        <text :x="a.g.B[0]" :y="Y(3880)" text-anchor="middle" class="alt-lbl">{{ a.c.rpm }}</text>
      </g>

      <!-- active construction -->
      <g v-if="g && cons" class="cons" :class="{ failed }">
        <path :d="g.drop" /><path :d="g.across" /><path :d="g.ca" />
        <polyline :points="g.mapLine" class="mapline" />
        <circle :cx="g.B[0]" :cy="g.B[1]" r="30" class="pt" />
        <circle :cx="g.C[0]" :cy="g.C[1]" r="30" class="pt" />
        <circle :cx="g.A[0]" :cy="g.A[1]" r="30" class="pt" />
        <circle :cx="g.D[0]" :cy="g.D[1]" r="40" class="pt d" @pointerdown.stop="mode === 'solve' ? start('d', $event) : start('alt', $event)" />
        <text :x="g.B[0] + 50" :y="g.B[1] + 80" class="lbl">B {{ fmt(cons.hpB) }} HP</text>
        <text :x="g.C[0] + 50" :y="g.C[1] + 85" class="lbl">C</text>
        <template v-if="!g.same">
          <text :x="g.A[0] + 50" :y="g.A[1] - 60" class="lbl">A {{ fmt(cons.A.hp) }} HP · {{ ft(cons.A.alt) }} ft</text>
          <text :x="g.D[0] - 60" :y="g.D[1] - 70" text-anchor="end" class="lbl">D {{ fmt(cons.hpD) }} HP</text>
        </template>
        <text v-else :x="g.D[0] + 60" :y="g.D[1] + 90" class="lbl">A = D {{ fmt(cons.hpD) }} HP (full throttle)</text>
        <text :x="g.B[0]" :y="Y(3880)" text-anchor="middle" class="lbl">{{ fmt(cons.map) }}"</text>
      </g>

      <!-- read mode: MAP handle on the sea-level chart axis -->
      <g v-if="mode === 'read'" class="maphandle">
        <line :x1="X(slMapX(map))" :x2="X(slMapX(map))" :y1="Y(1300)" :y2="Y(sl.axisY)" class="hit" style="cursor: ew-resize" @pointerdown.stop="start('map', $event)" />
        <circle :cx="X(slMapX(map))" :cy="Y(sl.axisY - 60)" r="34" class="handle" style="cursor: ew-resize" @pointerdown.stop="start('map', $event)" />
      </g>
    </svg>
    <figcaption>
      Drag the <b class="k-alt">altitude line</b><template v-if="mode === 'solve'">, the <b class="k-tgt">target power line</b> or point <b class="k-cons">D</b></template><template v-else> or the <b class="k-cons">MAP marker</b> on the sea-level chart</template>.
      Grey A/B/C/D circles are the manual's own printed example.
    </figcaption>
  </figure>
</template>

<style scoped>
.chart-plate { margin: 0; background: #fff; border: 1px solid var(--line); border-radius: 6px; padding: 8px; }
svg { display: block; width: 100%; height: auto; touch-action: pan-x pan-y; user-select: none; }
.handle, .hit, .pt.d, .hit-area { touch-action: none }
@media (max-width: 640px) { .chart-plate { min-width: 720px } }
figcaption { font-size: 0.82rem; color: #4a5260; padding: 6px 4px 2px; }
.k-alt { color: #0b6e8a } .k-tgt { color: #b45309 } .k-cons { color: #b0128c }
.hit-area { cursor: crosshair }
.tick-labels text { font: 600 56px var(--font-ui); fill: #5b6270 }
.dash { stroke-width: 9; stroke-dasharray: 46 28; fill: none }
.hit { stroke: transparent; stroke-width: 70 }
.handle { stroke: #fff; stroke-width: 10 }
.target .dash { stroke: #b45309 } .target .handle { fill: #b45309 } .target .lbl { fill: #b45309 }
.altline .dash { stroke: #0b6e8a } .altline .handle { fill: #0b6e8a } .altline .lbl { fill: #0b6e8a }
.maphandle .handle { fill: #b0128c }
.lbl { font: 700 62px var(--font-ui); paint-order: stroke; stroke: #fff; stroke-width: 16px; stroke-linejoin: round }
.cons path { stroke: #b0128c; stroke-width: 13; fill: none; stroke-linejoin: round }
.cons .mapline { stroke: #b0128c; stroke-width: 8; stroke-dasharray: 12 14; fill: none }
.cons .pt { fill: #fff; stroke: #b0128c; stroke-width: 10 }
.cons .pt.d { cursor: move; fill: #b0128c }
.cons .lbl { fill: #b0128c }
.cons.failed path, .cons.failed .pt { stroke: #c2262e } .cons.failed .pt.d { fill: #c2262e } .cons.failed .lbl { fill: #c2262e }
.alt-cons path { stroke: #6b7a90; stroke-width: 6; fill: none; stroke-dasharray: 30 18; opacity: .85 }
.alt-cons .mapline { stroke: #6b7a90; stroke-width: 5; fill: none; stroke-dasharray: 8 12 }
.alt-cons circle { fill: #fff; stroke: #6b7a90; stroke-width: 7 }
.alt-lbl { font: 600 46px var(--font-ui); fill: #6b7a90; paint-order: stroke; stroke: #fff; stroke-width: 12px }
</style>
