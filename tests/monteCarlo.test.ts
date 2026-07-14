import { describe, expect, it } from 'vitest';
import { createScenario } from '../src/physics/scenario';
import { summarizeRun } from '../src/physics/metrics';
import { runMonteCarlo, summarizeDistribution } from '../src/physics/monteCarlo';
import type { WorldSnapshot } from '../src/physics/world';
import { ft } from '../src/physics/units';

function snapshot(timeS: number, phase: 'canopy' | 'landed', aFt: number, bFt: number, sepFt: number): WorldSnapshot {
  const base = {
    groupId: 'G1',
    velocity: { x: 0, y: 0, z: 0 },
    plannedDeployAltitudeM: ft(3500),
    actualDeployAltitudeM: ft(3500),
    fullyOpenAltitudeM: ft(3000),
  };
  return {
    timeS,
    jumpers: [
      { ...base, id: 'J1', phase, position: { x: 0, y: ft(aFt), z: 0 } },
      { ...base, id: 'J2', phase, position: { x: ft(sepFt), y: ft(bFt), z: 0 } },
    ],
  };
}

describe('canopy risk metrics', () => {
  it('tracks max open canopies below both 1000 ft and 500 ft', () => {
    const summary = summarizeRun([
      snapshot(0, 'canopy', 900, 600, 400),
      snapshot(1, 'canopy', 450, 350, 400),
    ]);
    expect(summary.maxOpenCanopiesBelow1000Ft).toBe(2);
    expect(summary.maxOpenCanopiesBelow500Ft).toBe(2);
  });

  it('uses projected horizontal ground distance in feet for congestion thresholds', () => {
    const close = summarizeRun([snapshot(0, 'canopy', 800, 790, 299), snapshot(1, 'canopy', 790, 780, 299)]);
    const far = summarizeRun([snapshot(0, 'canopy', 800, 790, 301), snapshot(1, 'canopy', 790, 780, 301)]);
    expect(close.minHorizontalSeparationFt).toBeCloseTo(299, 1);
    expect(close.canopyCongestionScore).toBeGreaterThan(0);
    expect(far.canopyCongestionScore).toBe(0);
  });
});

describe('monte carlo summaries', () => {
  it('runs seeded repeated simulations and returns distributions for kept stats', () => {
    const result = runMonteCarlo({ baseScenario: createScenario({ seed: 5, numJumpers: 4 }), runs: 20, seedStart: 100, dtS: 1 / 20 });
    expect(result.runs).toBe(20);
    expect(result.distributions.maxOpenCanopiesBelow1000Ft.count).toBe(20);
    expect(result.distributions.maxOpenCanopiesBelow500Ft.count).toBe(20);
    expect(result.distributions.canopyCongestionScore.p90).toBeGreaterThanOrEqual(result.distributions.canopyCongestionScore.median);
  });

  it('computes percentile distributions', () => {
    expect(summarizeDistribution([1, 2, 3, 4, 100])).toMatchObject({ count: 5, min: 1, median: 3, max: 100 });
  });
});
