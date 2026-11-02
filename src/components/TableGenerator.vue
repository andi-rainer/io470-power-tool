<script setup lang="ts">
import { computed, ref } from 'vue'
import { state } from '../store'
import { evaluate, recommend, FLAG_SHORT, type Setting } from '../engine/settings'
import { isaC } from '../engine/model'

const emit = defineEmits<{ (e: 'pick', s: Setting, auto: boolean): void }>()

const rpmOptions = computed(() => {
  const out: number[] = []
  for (let r = 2200; r <= 2500; r += 50) out.push(r)
  return out
})
const altitudes = computed(() => {
  const t = state.table
  const out: number[] = []
  const step = Math.max(100, t.step)
  for (let h = t.from; h <= t.to + 1e-9 && out.length < 60; h += step) out.push(h)
  return out
})
const grid = computed(() =>
  altitudes.value.map((h) => ({
    h,
    cells: state.table.rows.map((r) =>
      r.rpm === 'auto'
        ? recommend(r.pct, h, state.table.isaDev, state.limits)
        : evaluate(r.pct, h, r.rpm, state.table.isaDev, state.limits)),
  })),
)

let nextId = 100
function addRow() {
  const last = state.table.rows[state.table.rows.length - 1]
  state.table.rows.push({ id: nextId++ + Date.now(), pct: Math.min(85, (last?.pct ?? 55) + 5), rpm: 'auto' })
}
function removeRow(id: number) {
  state.table.rows = state.table.rows.filter((r) => r.id !== id)
}

const cellText = (s: Setting) => (s.map === null ? `— max ${s.maxPct !== null ? s.maxPct.toFixed(0) + ' %' : 'n/a'}` : `${s.rpm} / ${s.map.toFixed(1)}`)
const cellClass = (s: Setting) => (s.map === null ? 'na' : !s.ok ? 'block' : s.flags.length ? 'warn' : 'clean')
const cellTitle = (s: Setting) =>
  [`${s.pct} % = ${s.hpTarget.toFixed(0)} BHP at ${s.altitude.toLocaleString('en-US')} ft`,
   s.map !== null ? `${s.rpm} RPM, ${s.map.toFixed(2)} in Hg` : '',
   s.ft ? `Full throttle: ${s.ft.map.toFixed(1)} in → ${s.maxPct!.toFixed(0)} %` : '',
   ...s.flags.map((f) => '• ' + f.text)].filter(Boolean).join('\n')

const copied = ref('')
async function copyCsv() {
  const head = ['Pressure altitude (ft)', 'ISA °C', ...state.table.rows.map((r) => `${r.pct} % ${r.rpm === 'auto' ? '(auto)' : r.rpm + ' RPM'}`)]
  const lines = [head.join(';')]
  for (const row of grid.value) {
    lines.push([row.h, Math.round(isaC(row.h) + state.table.isaDev),
      ...row.cells.map((s) => (s.map === null ? 'n/a' : `${s.rpm} / ${s.map.toFixed(1)}${s.flags.length ? ' [' + s.flags.map((f) => FLAG_SHORT[f.kind]).join(',') + ']' : ''}`))].join(';'))
  }
  const text = lines.join('\n')
  try {
    await navigator.clipboard.writeText(text)
    copied.value = 'Table copied as CSV (semicolon-separated)'
  } catch {
    copied.value = 'Clipboard blocked here: select the table and copy it manually'
  }
  setTimeout(() => (copied.value = ''), 4000)
}
</script>

<template>
  <section class="tablegen" aria-labelledby="tg-h">
    <header class="tg-head">
      <div>
        <h2 id="tg-h">Power-setting table</h2>
        <p class="sub">Pick the RPM for each power level yourself, or leave it on Auto (lowest RPM inside all limits). Click a cell to see its construction on the chart.</p>
      </div>
      <button type="button" class="btn" @click="copyCsv">Copy as CSV</button>
    </header>
    <p v-if="copied" class="toast" role="status">{{ copied }}</p>

    <div class="tg-config">
      <fieldset class="levels">
        <legend>Power levels</legend>
        <div v-for="r in state.table.rows" :key="r.id" class="level">
          <label :for="`pct-${r.id}`" class="sr">Power percent</label>
          <input :id="`pct-${r.id}`" v-model.number="r.pct" type="number" min="30" max="90" step="1" class="num" />
          <span class="unit">%</span>
          <label :for="`rpm-${r.id}`" class="sr">RPM</label>
          <select :id="`rpm-${r.id}`" v-model="r.rpm">
            <option value="auto">Auto RPM</option>
            <option v-for="o in rpmOptions" :key="o" :value="o">{{ o }} RPM</option>
          </select>
          <button type="button" class="icon" :aria-label="`Remove ${r.pct} %`" @click="removeRow(r.id)">×</button>
        </div>
        <button type="button" class="btn ghost" @click="addRow">Add power level</button>
      </fieldset>
      <fieldset class="range">
        <legend>Altitudes &amp; temperature</legend>
        <label for="tg-from">From (ft)</label><input id="tg-from" v-model.number="state.table.from" type="number" step="500" min="0" max="16000" class="num" />
        <label for="tg-to">To (ft)</label><input id="tg-to" v-model.number="state.table.to" type="number" step="500" min="0" max="16000" class="num" />
        <label for="tg-step">Step (ft)</label><input id="tg-step" v-model.number="state.table.step" type="number" step="500" min="500" class="num" />
        <label for="tg-isa">ISA dev. (°C)</label><input id="tg-isa" v-model.number="state.table.isaDev" type="number" step="1" min="-30" max="30" class="num" />
      </fieldset>
    </div>

    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Press. alt.</th>
            <th scope="col">OAT °C</th>
            <th v-for="r in state.table.rows" :key="r.id" scope="col">
              {{ r.pct }} % <span class="hp">{{ (2.6 * r.pct).toFixed(0) }} HP</span>
              <span class="rpmtag">{{ r.rpm === 'auto' ? 'auto' : r.rpm }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in grid" :key="row.h">
            <th scope="row">{{ row.h === 0 ? 'SL' : row.h.toLocaleString('en-US') }}</th>
            <td class="oat">{{ Math.round(isaC(row.h) + state.table.isaDev) }}</td>
            <td v-for="(s, i) in row.cells" :key="i" :class="cellClass(s)">
              <button type="button" class="cell" :title="cellTitle(s)" @click="emit('pick', s, state.table.rows[i].rpm === 'auto')">
                <span class="val">{{ cellText(s) }}</span>
                <span v-for="f in s.flags.filter((f) => f.kind !== 'unattainable')" :key="f.kind" class="flag" :class="f.severity">{{ FLAG_SHORT[f.kind] }}</span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="legend">
      Cells read <b>RPM / MAP in Hg</b>. Flags:
      <span class="flag warn">FT</span> full throttle,
      <span class="flag warn">FT~</span> within {{ state.limits.throttleMargin }} in of full throttle,
      <span class="flag warn">&gt;CR</span> above the {{ state.limits.cruiseMapMax }}-in recommended-cruise edge,
      <span class="flag block">HZ</span> Hartzell limit,
      <span class="flag block">MAP</span> outside MAP green arc,
      <span class="flag block">RPM</span> outside RPM green arc,
      <span class="flag block">SCL</span> off the chart scale.
      The temperature column and MAP values include the ISA deviation set above.
    </p>
  </section>
</template>

<style scoped>
.tablegen { display: grid; gap: 14px }
.tg-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: end; gap: 12px }
h2 { margin: 0; font: 700 1.35rem/1.2 var(--font-display); letter-spacing: .01em; text-wrap: balance }
.sub { margin: 4px 0 0; color: var(--muted); max-width: 62ch }
.toast { margin: 0; color: var(--ok); font-size: .9rem }
.tg-config { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 14px }
@media (max-width: 760px) { .tg-config { grid-template-columns: 1fr } }
fieldset { border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px 12px; margin: 0; display: grid; gap: 8px; min-width: 0 }
legend { font: 600 .74rem var(--font-ui); text-transform: uppercase; letter-spacing: .08em; color: var(--muted); padding: 0 4px }
.level { display: flex; align-items: center; gap: 6px; flex-wrap: wrap }
.range { grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: 10px }
.range label { font-size: .88rem; color: var(--muted) }
.unit { color: var(--muted); margin-right: 6px }
.scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: 6px }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; min-width: 560px }
th, td { padding: 0; border-bottom: 1px solid var(--line); text-align: left }
thead th { font: 600 .82rem var(--font-ui); padding: 8px 10px; background: var(--panel); color: var(--fg); white-space: nowrap }
thead .hp { color: var(--muted); font-weight: 500; margin-left: 4px }
.rpmtag { display: inline-block; margin-left: 6px; font: 600 .7rem var(--font-mono); color: var(--accent); border: 1px solid var(--accent); border-radius: 3px; padding: 0 4px }
tbody th { font: 600 .9rem var(--font-mono); padding: 6px 10px; white-space: nowrap }
.oat { font: .85rem var(--font-mono); color: var(--muted); padding: 6px 10px }
.cell { all: unset; box-sizing: border-box; display: flex; gap: 6px; align-items: center; width: 100%; padding: 7px 10px; cursor: pointer; font: 500 .95rem var(--font-mono); white-space: nowrap }
.cell:hover { background: var(--hover) }
.cell:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px }
td.na .val { color: var(--muted); font-family: var(--font-ui); font-size: .85rem }
td.block .val { color: var(--bad); text-decoration: line-through }
.flag { font: 700 .66rem var(--font-ui); letter-spacing: .04em; border-radius: 3px; padding: 1px 4px }
.flag.warn { background: var(--warn-bg); color: var(--warn) }
.flag.block { background: var(--bad-bg); color: var(--bad) }
.legend { font-size: .82rem; color: var(--muted); margin: 0; line-height: 1.9 }
</style>
