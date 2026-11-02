# IO-470-F Power Planner

Interactive power-setting tool for the Continental IO-470-F (260 BHP @ 2625 RPM).
It runs the manufacturer's own A–B–C–D procedure from the
**Sea Level vs Altitude Performance Curve, IO-470-F** (Operator's Manual, printed p. 35),
forwards (RPM + MAP → power) or in reverse (power + altitude + RPM → MAP).

> Derived from the manufacturer's chart. Not approved flight-manual data — cross-check against the aircraft's POH.

## Run

```bash
npm install
npm run dev              # http://localhost:5173
npm test                 # engine tests (manual example + 52 reference cells)
npm run build            # static site in dist/
npm run build:artifact   # single HTML page in dist-artifact/ (Vue from cdnjs, image inlined)
```

## What it does

| Area | Function |
| --- | --- |
| **Find MAP** | Target %, pressure altitude, RPM (Auto or 2200–2500, interpolated between drawn lines), ISA deviation → required MAP, B/A/D values, full-throttle MAP, limit flags |
| **Read power** | RPM + MAP + altitude → % power / BHP (or "MAP not available") |
| **Chart** | Drag the altitude line, the target-power line, point D, or (read mode) the MAP marker. Click anywhere on the altitude chart to move D there |
| **Table** | Power levels with Auto or fixed RPM per level, altitude range/step, ISA deviation → table; click a cell to load it into the chart; copy as CSV |
| **Limits** | RPM and MAP green arcs, recommended-cruise MAP (24 in), Hartzell rule (max 23 in below 2300 RPM), throttle margin, Auto RPM step |

Settings are kept in `localStorage`.

## How it works

```
src/engine/chartData.json   digitized chart (600 dpi scan): calibration, RPM lines, MAP lines
src/engine/model.ts         chart geometry + forward/reverse procedure
src/engine/settings.ts      limits, flags, Auto-RPM recommendation
src/components/ChartView.vue   SVG overlay in the scan's pixel space (drag handles)
src/components/TableGenerator.vue
```

- **B**: sea-level chart, straight RPM lines `HP = a·MAP + b`.
- **A**: MAP line (cubic `x(HP)`, fractional MAP interpolated between whole-inch lines) meets the
  RPM line (quadratic `HP(x)`) on the altitude chart.
- **D**: `HP_D = HP_B + (HP_A − HP_B)·(x_h − x_SL)/(x_A − x_SL)`. The altitude axis is linear in
  standard density, so `x_h` comes from the chart's own gridline positions.
- **Reverse**: bisection on MAP until D equals the target (chart HP); full throttle is the highest
  MAP whose A still lies at or above the altitude.
- **Temperature** (chart rule): −1 % per 6 °F (3.3 °C) above ISA, +1 % below. The tool solves for
  the chart HP that yields the wanted actual HP.
- RPMs between the drawn lines (2200/2300/2400/2500; 2450 also on the sea-level chart) are
  interpolated linearly.

Accuracy: the engine reproduces the manual's printed example within 0.5 HP (≈0.05 in Hg).
Allow ±0.1–0.2 in Hg for printing tolerances.

Auto RPM = lowest RPM (step from Limits) that is inside every limit, preferring settings below the
recommended-cruise MAP and with the throttle margin; otherwise the highest RPM is shown with its
maximum available power.
