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
- A **heat map** of vertical proximity under canopy at ~2500 ft — the
  congestion signal.
- Minimum horizontal distances between groups.

## Example winds

**CA (4-8-14)** — 0:5 · 3000:15 · 6000:20 · 9000:25 · 12000:30
**NC (4-8-14)** — 0:15 · 3000:20 · 6000:45 · 9000:50 · 12000:65

(altitude in ft : wind in mph)

## Run it locally

It's a static page — no build step:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

(AngularJS loads from a CDN; `lib/` and `bower_components/lodash` are vendored.)

## TODO

- Lots of physics improvements.
- More UI styling.
- Clouds.
- Persist simulation runs; shareable links for illustrative runs.
- Heat map for **horizontal** proximity too.
- Consistent SI units (meters).
