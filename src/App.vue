<script setup lang="ts">
import { computed, ref } from 'vue'
import { state, resetAll } from './store'
import ChartView from './components/ChartView.vue'
import TableGenerator from './components/TableGenerator.vue'
import { RATED_HP, construct, fullThrottle, isaC, chartHpForActual, actualFromChartHp, type Construction } from './engine/model'
import { evaluate, recommend, candidateRpms, type Setting } from './engine/settings'

/* ---------- solve mode ---------- */
const setting = computed<Setting>(() =>
  state.rpmAuto
    ? recommend(state.pct, state.altitude, state.isaDev, state.limits)
    : evaluate(state.pct, state.altitude, state.rpm, state.isaDev, state.limits))

const activeCons = computed<Construction | null>(() => {
  if (state.mode === 'read') return construct(state.rpm, state.map, state.altitude)
  const s = setting.value
  const m = s.map ?? s.ft?.map ?? null
  return m === null ? null : construct(s.rpm, m, state.altitude)
})
const altCons = computed<Construction[]>(() => {
  if (state.mode !== 'solve' || !state.showAlternatives) return []
  return candidateRpms(state.limits)
    .filter((r) => r !== setting.value.rpm)
    .map((r) => evaluate(state.pct, state.altitude, r, state.isaDev, state.limits))
    .filter((s) => s.ok && s.map !== null)
    .map((s) => construct(s.rpm, s.map!, state.altitude)!)
    .filter(Boolean)
})
const alternatives = computed(() =>
  candidateRpms(state.limits)
    .filter((r) => r !== setting.value.rpm)
    .map((r) => evaluate(state.pct, state.altitude, r, state.isaDev, state.limits)))

const hpTargetChart = computed(() => chartHpForActual((RATED_HP * state.pct) / 100, state.isaDev))
function onHp(hpChart: number) {
  state.pct = Math.round((actualFromChartHp(hpChart, state.isaDev) / RATED_HP) * 1000) / 10
}
function onAltitude(h: number) { state.altitude = h }
function onMap(m: number) { state.map = m }

/* ---------- read mode ---------- */
const readFT = computed(() => fullThrottle(state.rpm, state.altitude))
const readHp = computed(() => {
  const c = construct(state.rpm, state.map, state.altitude)
  return c ? actualFromChartHp(c.hpD, state.isaDev) : null
})

const fmt = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? '—' : n.toFixed(d))
const ft = (n: number) => (n === 0 ? 'sea level' : n.toLocaleString('en-US') + ' ft')
const oat = computed(() => isaC(state.altitude) + state.isaDev)

const chartEl = ref<HTMLElement | null>(null)
function pick(s: Setting, auto: boolean) {
  state.mode = 'solve'
  state.pct = s.pct
  state.altitude = s.altitude
  state.isaDev = s.isaDevC
  state.rpmAuto = auto
  state.rpm = s.rpm
  chartEl.value?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
}
</script>

<template>
  <div class="page">
    <header class="masthead">
      <div class="id">
        <span class="eyebrow">Continental IO-470-F · 260 BHP @ 2625 RPM</span>
        <h1>IO-470-F Power Planner</h1>
      </div>
      <p class="intro">
        Runs the manual's own A–B–C–D procedure from the Sea Level vs Altitude Performance Curve, forwards or in reverse.
        Values are chart BHP corrected for temperature. They are not approved flight-manual data.
      </p>
    </header>

    <main class="workspace">
      <aside class="controls" aria-label="Setting">
        <div class="tabs" role="tablist">
          <button type="button" role="tab" :aria-selected="state.mode === 'solve'" :class="{ on: state.mode === 'solve' }" @click="state.mode = 'solve'">Find MAP</button>
          <button type="button" role="tab" :aria-selected="state.mode === 'read'" :class="{ on: state.mode === 'read' }" @click="state.mode = 'read'">Read power</button>
        </div>

        <div v-if="state.mode === 'solve'" class="field">
          <label for="pct">Target power <output>{{ fmt(state.pct, 1) }} %</output></label>
          <input id="pct" v-model.number="state.pct" type="range" min="35" max="85" step="0.5" />
          <small>{{ fmt((RATED_HP * state.pct) / 100, 0) }} BHP of 260</small>
        </div>
        <div v-else class="field">
          <label for="map">Manifold pressure <output>{{ fmt(state.map) }} in Hg</output></label>
          <input id="map" v-model.number="state.map" type="range" min="15" max="28.8" step="0.1" />
        </div>

        <div class="field">
          <label for="alt">Pressure altitude <output>{{ ft(state.altitude) }}</output></label>
          <input id="alt" v-model.number="state.altitude" type="range" min="0" max="16000" step="100" />
        </div>

        <div class="field">
          <label for="rpm">RPM <output>{{ state.mode === 'solve' && state.rpmAuto ? 'Auto · ' + setting.rpm : state.rpm }}</output></label>
          <input id="rpm" v-model.number="state.rpm" type="range" min="2200" max="2500" step="10"
                 :disabled="state.mode === 'solve' && state.rpmAuto" @input="state.rpmAuto = false" />
          <label v-if="state.mode === 'solve'" class="check" for="auto">
            <input id="auto" v-model="state.rpmAuto" type="checkbox" /> Auto (lowest RPM inside all limits)
          </label>
          <small v-if="![2200, 2300, 2400, 2500].includes(state.mode === 'solve' && state.rpmAuto ? setting.rpm : state.rpm)">Between drawn RPM lines: interpolated.</small>
        </div>

        <div class="field">
          <label for="isa">Temperature <output>ISA {{ state.isaDev >= 0 ? '+' : '' }}{{ state.isaDev }} °C · OAT {{ fmt(oat, 0) }} °C</output></label>
          <input id="isa" v-model.number="state.isaDev" type="range" min="-25" max="30" step="1" />
        </div>

        <!-- result -->
        <section v-if="state.mode === 'solve'" class="result" aria-live="polite">
          <template v-if="setting.map !== null">
            <span class="r-label">Set</span>
            <p class="r-main"><span>{{ setting.rpm }}</span> RPM <span>{{ setting.map.toFixed(1) }}</span> in&nbsp;Hg</p>
          </template>
          <template v-else>
            <span class="r-label">Not attainable</span>
            <p class="r-main fail">max {{ fmt(setting.maxPct, 0) }} %</p>
          </template>
          <dl class="facts">
            <dt>Actual / chart BHP</dt><dd>{{ fmt(setting.hpTarget) }} / {{ fmt(setting.hpChart) }}</dd>
            <template v-if="activeCons">
              <dt>B sea level</dt><dd>{{ fmt(activeCons.hpB) }} HP</dd>
              <dt>A full throttle</dt><dd>{{ fmt(activeCons.A.hp) }} HP · {{ Math.round(activeCons.A.alt).toLocaleString('en-US') }} ft</dd>
              <dt>D at altitude</dt><dd>{{ fmt(activeCons.hpD) }} HP</dd>
            </template>
            <dt>Full throttle here</dt><dd>{{ setting.ft ? `${setting.ft.map.toFixed(1)} in → ${fmt(setting.maxPct, 0)} %` : '—' }}</dd>
          </dl>
          <ul v-if="setting.flags.length" class="flags">
            <li v-for="f in setting.flags" :key="f.kind" :class="f.severity">{{ f.text }}</li>
          </ul>
          <ul v-else class="flags"><li class="ok">Inside all limits</li></ul>
          <details class="altlist">
            <summary>Other RPMs</summary>
            <ul>
              <li v-for="a in alternatives" :key="a.rpm">
                <b>{{ a.rpm }}</b>
                <span>{{ a.map === null ? 'n/a' : a.map.toFixed(1) + ' in' }}</span>
                <em v-if="a.flags.length">{{ a.flags.map((f) => f.text).join('; ') }}</em>
              </li>
            </ul>
          </details>
          <label class="check" for="showalt"><input id="showalt" v-model="state.showAlternatives" type="checkbox" /> Show other RPMs on the chart</label>
        </section>

        <section v-else class="result" aria-live="polite">
          <template v-if="readHp !== null">
            <span class="r-label">Power</span>
            <p class="r-main"><span>{{ fmt((readHp / RATED_HP) * 100, 1) }}</span> % <span>{{ fmt(readHp, 0) }}</span> BHP</p>
          </template>
          <template v-else>
            <span class="r-label">MAP not available</span>
            <p class="r-main fail">max {{ fmt(readFT?.map) }} in</p>
          </template>
          <dl class="facts">
            <template v-if="activeCons">
              <dt>B sea level</dt><dd>{{ fmt(activeCons.hpB) }} HP</dd>
              <dt>A full throttle</dt><dd>{{ fmt(activeCons.A.hp) }} HP · {{ Math.round(activeCons.A.alt).toLocaleString('en-US') }} ft</dd>
            </template>
            <dt>Full throttle here</dt><dd>{{ readFT ? `${readFT.map.toFixed(1)} in` : '—' }}</dd>
          </dl>
        </section>

        <details class="limits">
          <summary>Limits</summary>
          <div class="lim-grid">
            <label for="l-rmin">RPM green arc from</label><input id="l-rmin" v-model.number="state.limits.rpmMin" type="number" step="50" class="num" />
            <label for="l-rmax">to</label><input id="l-rmax" v-model.number="state.limits.rpmMax" type="number" step="50" class="num" />
            <label for="l-mmin">MAP green arc from</label><input id="l-mmin" v-model.number="state.limits.mapMin" type="number" step="0.5" class="num" />
            <label for="l-mmax">to</label><input id="l-mmax" v-model.number="state.limits.mapMax" type="number" step="0.5" class="num" />
            <label for="l-cr">Recommended cruise up to (in)</label><input id="l-cr" v-model.number="state.limits.cruiseMapMax" type="number" step="0.5" class="num" />
            <label for="l-fm">Margin below full throttle (in)</label><input id="l-fm" v-model.number="state.limits.throttleMargin" type="number" step="0.1" min="0" class="num" />
            <label for="l-step">Auto RPM step</label><input id="l-step" v-model.number="state.limits.autoStep" type="number" step="50" min="50" class="num" />
          </div>
          <label class="check" for="l-hz"><input id="l-hz" v-model="state.limits.hartzell" type="checkbox" /> Hartzell propeller: max 23 in below 2300 RPM</label>
          <button type="button" class="btn ghost" @click="resetAll">Reset everything</button>
        </details>
      </aside>

      <div ref="chartEl" class="chartcol">
        <ChartView
          :mode="state.mode"
          :cons="activeCons"
          :alts="altCons"
          :altitude="state.altitude"
          :hp-target="state.mode === 'solve' ? hpTargetChart : null"
          :target-label="`${fmt(state.pct, 1)} % · ${fmt(hpTargetChart, 0)} chart HP`"
          :map="state.map"
          :failed="state.mode === 'solve' && setting.map === null"
          @altitude="onAltitude" @hp="onHp" @map="onMap"
        />
      </div>
    </main>

    <TableGenerator @pick="pick" />

    <footer class="foot">
      Source: Continental IO-470 Operator's Manual, Sea Level vs Altitude Performance Curve IO-470-F (printed p. 35), digitized at 600 dpi.
      Limits from the IO-470-F STC supplement (Cessna 182). Temperature rule from the chart: 1 % per 6 °F (3.3 °C) from standard.
      Cross-check every setting against the aircraft's approved POH.
    </footer>
  </div>
</template>

<style scoped>
.page { max-width: 1440px; margin: 0 auto; padding-block: 20px 40px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 22px }
.masthead { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 10px 32px; border-bottom: 2px solid var(--fg); padding-bottom: 12px }
.eyebrow { font: 600 .74rem var(--font-ui); letter-spacing: .12em; text-transform: uppercase; color: var(--accent) }
h1 { margin: 2px 0 0; font: 700 clamp(1.7rem, 3.2vw, 2.4rem)/1.05 var(--font-display); letter-spacing: .01em; text-wrap: balance }
.intro { margin: 0; max-width: 60ch; color: var(--muted); font-size: .92rem }
.workspace { display: grid; grid-template-columns: minmax(0, 330px) minmax(0, 1fr); gap: 20px; align-items: start }
@media (max-width: 900px) { .workspace { grid-template-columns: 1fr } .chartcol { order: -1 } }
.controls { display: grid; gap: 14px; min-width: 0 }
.chartcol { min-width: 0; scroll-margin-top: 12px; overflow-x: auto }
.tabs { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--line); border-radius: 6px; overflow: hidden }
.tabs button { all: unset; text-align: center; padding: 8px; cursor: pointer; font: 600 .9rem var(--font-ui); color: var(--muted) }
.tabs button.on { background: var(--fg); color: var(--bg) }
.tabs button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px }
.field { display: grid; gap: 4px }
.field > label { display: flex; justify-content: space-between; gap: 8px; font: 600 .8rem var(--font-ui); text-transform: uppercase; letter-spacing: .06em; color: var(--muted) }
.field output { font: 600 .92rem var(--font-mono); text-transform: none; letter-spacing: 0; color: var(--fg) }
.field small { color: var(--muted); font-size: .8rem }
input[type='range'] { width: 100%; accent-color: var(--accent) }
.field > label.check, .check { display: flex; justify-content: flex-start; gap: 8px; align-items: center; font-size: .86rem; color: var(--fg); text-transform: none; letter-spacing: 0; font-weight: 400 }
.result { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 12px 14px; display: grid; gap: 8px }
.r-label { font: 600 .72rem var(--font-ui); text-transform: uppercase; letter-spacing: .1em; color: var(--muted) }
.r-main { margin: 0; font: 500 1rem var(--font-ui); color: var(--muted) }
.r-main span { font: 700 2rem/1 var(--font-mono); color: var(--accent); margin-right: 2px }
.r-main span + span { margin-left: 10px }
.r-main.fail { font: 700 1.6rem var(--font-mono); color: var(--bad) }
.facts { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; margin: 0; font-size: .86rem }
.facts dt { color: var(--muted) }
.facts dd { margin: 0; font-family: var(--font-mono); text-align: right; font-variant-numeric: tabular-nums }
.flags { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: .84rem }
.flags li { padding: 3px 8px; border-radius: 4px }
.flags .block { background: var(--bad-bg); color: var(--bad) }
.flags .warn { background: var(--warn-bg); color: var(--warn) }
.flags .ok { background: var(--ok-bg); color: var(--ok) }
.altlist summary, .limits summary { cursor: pointer; font: 600 .84rem var(--font-ui) }
.altlist ul { list-style: none; padding: 0; margin: 6px 0 0; display: grid; gap: 4px; font-size: .84rem }
.altlist li { display: grid; grid-template-columns: 3.2em 4.2em 1fr; gap: 6px; font-family: var(--font-mono) }
.altlist em { font: italic .78rem var(--font-ui); color: var(--muted) }
.limits { border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; display: grid; gap: 10px }
.limits[open] { display: grid }
.lim-grid { display: grid; grid-template-columns: 1fr 5.5em; gap: 6px 10px; align-items: center; font-size: .84rem; margin: 10px 0 }
.foot { font-size: .78rem; color: var(--muted); border-top: 1px solid var(--line); padding-top: 12px; max-width: 110ch }
</style>
