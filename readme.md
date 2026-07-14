# Freefall Drift Explorer

A skydiving **wind-drift simulator**. Set the winds at each altitude, the
exit separation, and the jump order, then watch where each group ends up —
and, critically, how vertically stacked everyone is under canopy at ~2500 ft.

**Live:** <https://westcot.io/projects/freefall-drift/> · <https://base698.github.io/freefall-drift/>
A more robust take on the classic [omniskore drift sim](http://www.omniskore.com/freefall_drift2.html).

> Built ~2014. It still runs as-is (AngularJS 1.3, a hand-rolled heat map). Migrated to westcot.io intact.

---

## Why I built it — exit order and canopy traffic

There's a long-settled rule in skydiving: on a mixed load, **freefliers exit
last** because they fall faster. The usual justification is **horizontal
separation** — spacing the groups apart along the jump run so they don't end
up over the same patch of ground. The standard worry about putting freefliers
*first* is that the slower belly group drifts the most under canopy and could
drift **over the top of** the freefliers and collide.

I think that framing misses where people actually get hurt, and has the
congestion backwards. Here's the case this simulator was built to make:

- Belly fliers fall slower, so they spend **more time drifting** down the
  wind line. Freefliers fall faster and cover less ground.
- When freefliers go **last** (the conventional order), the faster fallers
  descend quickly and **catch up to the belly group's opening altitude** — so
  both groups reach deployment at roughly the same time and place.
- The result is a **congested opening band**: lots of canopies opening at
  similar altitudes, converging on the same landing area at once. That's a
  canopy-collision setup, and I believe a number of canopy-collision
  fatalities trace back to exactly this dynamic.

The mitigation the sim is meant to illustrate:

1. **Freefliers out first**, *and*
2. **More separation between groups** —

so the slower belly group drifts into clear air (the extra separation answers
the drift-over-the-top worry) and openings spread across altitude and ground
track instead of stacking on top of each other.

This is a **minority opinion** — most of the sport optimizes exit order for
freefall separation, not canopy traffic. The tool exists to let you set real
winds and *see* the under-canopy stacking for yourself rather than argue it in
the abstract. Set your own numbers and decide.

> ⚠️ This is a teaching/argument toy with simplified physics, not a dispatch
> planner. Follow your DZ's rules and your S&TA. Nothing here is jump advice.

## What it shows

- Per-altitude **wind speed** inputs (0 / 3k / 6k / 9k / 12k ft).
- **Manifest size**, **exit separation**, and a **fast-fall-first** toggle.
- A simplified **spot model**: the first group exits near green light, the spot is slightly down jump run, and canopies aim upwind of the spot until 1,000 ft before converging into a football-field-sized landing area.
- Different throw / horizontal drag by body type: belly fliers slow and reverse toward wind drift faster; freefliers retain aircraft throw longer.
- A **heat map** of vertical proximity under canopy at ~2500 ft — the congestion signal.
- Minimum horizontal distances between groups.
- Monte Carlo distributions for low-altitude landing exposure and estimated canopy-collision risk per 10,000 jumps.

## Compared with the previous version

The original version was mostly an argument visualizer: enter a simple wind
profile, choose exit order, and see whether groups stacked up near opening
altitude. The new version keeps that core argument, but turns it into a more
explicit risk-assessment sandbox:

- **Deterministic TypeScript physics core instead of the old AngularJS toy.**
  The simulation now uses SI units internally, seeded randomness, separate
  freefall / deploying / canopy / landed phases, and repeatable Monte Carlo
  runs.
- **Winds are first-class inputs.** The old README sample winds are still the
  default, but the UI now lets the user edit both speed and direction at each
  altitude and can load current AviationWeather winds-aloft forecasts.
- **Deployment is stochastic instead of a single fixed event.** Each jumper has
  a planned pull altitude, actual pull altitude, opening/snivel loss, fully-open
  altitude, and canopy descent rate. This matters because the risk is not just
  “where do they open?” but “how many are open, low, and converging at the same
  time?”
- **Body position affects horizontal drift.** Belly fliers slow/reverse aircraft
  throw faster; freefliers retain more throw before converging toward wind
  drift. This better models the freefly-vs-belly ordering question.
- **Landing is modeled as convergence around a spot, not a single point.**
  Canopies steer toward an upwind pattern target above 1,000 ft, then converge
  toward normally distributed landing targets around the spot. That creates a
  football-field-sized landing area instead of pretending every jumper lands on
  the exact same dot.

### The 500-ft landing exposure metric

The most important new risk-assessment metric is **500-ft landing exposure**.
Hermes introduced this metric during the rewrite as an original heuristic for
the canopy-congestion question; it was not part of the previous simulator.

The metric asks: once canopies are in the landing pattern, how much time do
pairs of jumpers spend close enough to matter?

For every simulation timestep, every pair of open canopies contributes exposure
when all of these are true:

- both canopies are below **1,000 ft AGL**,
- projected horizontal separation is under **500 ft**,
- vertical separation is under **200 ft**.

The score is measured in **weighted pair-seconds**. One close pair for ten
seconds is roughly ten pair-seconds; five close pairs for two seconds is also
roughly ten pair-seconds. Exposure is weighted higher as the lower canopy gets
closer to the ground, because the landing pattern compresses options and makes
avoidance harder near touchdown.

This is more useful than simply counting the maximum number of canopies below
500 ft. A peak count says “how crowded did it get at one instant?” Landing
exposure says “how many close conflicts existed, for how long, and how low?”
That makes it a better relative risk signal when comparing exit order, exit
separation, upper winds, spot, or landing-area assumptions.

The derived **estimated collisions / 10k jumps** value is intentionally labeled
as an estimate. It maps exposure through a placeholder probability curve so the
numbers are easier to reason about, but the defensible output is the exposure
metric itself. Treat it as a comparative risk score until it can be calibrated
against real incident data.

### Fatality data scrape and analysis

The rewrite also starts a supporting data project: collect USPA / *Parachutist*
fatality summaries and compare their reported causes against the simulator’s
canopy-congestion hypothesis.

- Modern article pages are being parsed directly where available.
- Older *Parachutist* issues are being scraped as rendered page images from the
  HTML5 back-issue archives into `/mnt/synology-backup/parachutist/` for OCR or
  vision-assisted extraction.
- The structured fatality-summary table lives in
  `data/uspa-fatality-summary.csv`; it now spans 1999-2025, with scanned
  *Parachutist* page references for the older annual summaries.
- `scripts/analyze_fatality_cause_trends.py` regenerates the supporting cause
  distribution analysis under `data/fatality-cause-analysis/`, including the
  annual canopy-collision share plot with Wilson confidence intervals and an
  exploratory cutoff scan across all eligible years.
- The current scan flags 2007 as the strongest canopy-collision cutoff, while
  2004 also points upward more weakly; this fits a gradual operational shift in
  fast/slow exit-order and landing-pattern practice better than a clean single
  step change.

That dataset is not yet proof of the model. It is the calibration layer: once
the historical causes are cleaner, the simulator’s landing-exposure metric can
be compared against real-world fatality categories such as canopy collision,
landing problems, no/low pull, freefall collision, equipment, and medical.

## Data artifacts

- `data/monte-carlo-default-1000.*` — quick default fixture derived from the first 1,000 runs of the larger sample.
- `data/monte-carlo-default-5000.*` — larger default Monte Carlo sample for analysis.
- `data/uspa-fatality-summary.csv` — primary-source fatality-summary table.
- `data/fatality-cause-analysis/` — generated pre/post tables, cutoff scan, standardized residuals, and SVG visualizations for fatality-cause shares.
- `docs/parachutist-image-pipeline.md` — process for scraping old Parachutist rendered-page images from HTML5 back issues for OCR/vision extraction.

## Example winds

**CA (4-8-14)** — 0:5 · 3000:15 · 6000:20 · 9000:25 · 12000:30
**NC (4-8-14)** — 0:15 · 3000:20 · 6000:45 · 9000:50 · 12000:65

(altitude in ft : wind in mph)

## Run it locally

The current version is a Vite / TypeScript app:

```bash
npm install
npm run dev     # then open the printed localhost URL
```

For a production build:

```bash
npm test
npm run build
```

## TODO

- Lots of physics improvements.
- More UI styling.
- Clouds.
- Persist simulation runs; shareable links for illustrative runs.
- Heat map for **horizontal** proximity too.
- Consistent SI units (meters).
