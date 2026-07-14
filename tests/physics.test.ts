import { describe, expect, it } from 'vitest';
import { FT_TO_M, MPH_TO_MPS, ft, mToFt, mph } from '../src/physics/units';
import { windAtAltitude } from '../src/physics/wind';
import { createScenario } from '../src/physics/scenario';
import { World } from '../src/physics/world';
import { createSeededRng, sampleDistribution } from '../src/physics/random';
import { summarizeRun } from '../src/physics/metrics';

describe('unit conversions', () => {
  it('converts feet and mph to SI units', () => {
    expect(ft(1)).toBeCloseTo(FT_TO_M);
    expect(mph(1)).toBeCloseTo(MPH_TO_MPS);
    expect(mToFt(ft(13000))).toBeCloseTo(13000);
  });
});

describe('seeded distributions', () => {
  it('samples reproducibly with clampable distributions', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const dist = { kind: 'normal' as const, mean: ft(3500), stdDev: ft(75), min: ft(3300), max: ft(3700) };
    const samplesA = Array.from({ length: 5 }, () => sampleDistribution(dist, a));
    const samplesB = Array.from({ length: 5 }, () => sampleDistribution(dist, b));
    expect(samplesA).toEqual(samplesB);
    expect(samplesA.every(v => v >= ft(3300) && v <= ft(3700))).toBe(true);
  });
});

describe('wind field', () => {
  it('interpolates vector winds by altitude', () => {
    const wind = windAtAltitude([
      { altitudeM: ft(0), speedMps: mph(0), directionDeg: 90 },
      { altitudeM: ft(10000), speedMps: mph(20), directionDeg: 90 },
    ], ft(5000));
    expect(wind.x).toBeCloseTo(-mph(10), 4);
    expect(Math.abs(wind.z)).toBeLessThan(1e-8);
  });
});

describe('world simulation', () => {
  it('separates planned pitch, actual pitch, fully-open canopy, and landed phases', () => {
    const scenario = createScenario({ seed: 7, numJumpers: 2, fastFallFirst: false });
    const world = new World(scenario);
    const snapshots = world.runUntilDone(900, 1 / 30);
    const first = snapshots.find(s => s.jumpers.some(j => j.phase === 'deploying'));
    const canopy = snapshots.find(s => s.jumpers.some(j => j.phase === 'canopy'));
    const final = snapshots.at(-1)!;

    expect(first).toBeTruthy();
    expect(canopy).toBeTruthy();
    expect(final.jumpers.every(j => j.phase === 'landed')).toBe(true);
    for (const jumper of scenario.jumpers) {
      expect(jumper.deployment.actualDeployAltitudeM).toBeLessThanOrEqual(jumper.deployment.maxDeployAltitudeM);
      expect(jumper.deployment.actualDeployAltitudeM).toBeGreaterThanOrEqual(jumper.deployment.minDeployAltitudeM);
      expect(jumper.deployment.fullyOpenAltitudeM).toBeLessThan(jumper.deployment.actualDeployAltitudeM);
    }
  });

  it('is deterministic for a shared seed', () => {
    const a = new World(createScenario({ seed: 99, numJumpers: 6 })).runUntilDone(900, 1 / 15);
    const b = new World(createScenario({ seed: 99, numJumpers: 6 })).runUntilDone(900, 1 / 15);
    expect(a.at(-1)).toEqual(b.at(-1));
  });

  it('converges landed canopies toward a football-field-sized spot', () => {
    const scenario = createScenario({ seed: 101, numJumpers: 10, exitSeparationS: 8 });
    const final = new World(scenario).runUntilDone(900, 1 / 20).at(-1)!;
    const maxLandingDistanceFt = Math.max(
      ...final.jumpers.map(j => Math.hypot(j.position.x - scenario.spotM.x, j.position.z - scenario.spotM.z)).map(mToFt),
    );

    expect(final.jumpers.every(j => j.phase === 'landed')).toBe(true);
    expect(maxLandingDistanceFt).toBeLessThanOrEqual(240);
  });

  it('samples landing targets as a normal cluster around the spot', () => {
    const scenario = createScenario({ seed: 123, numJumpers: 1000, landingAreaRadiusFt: 200 });
    const distancesFt = scenario.jumpers
      .map(j => Math.hypot(j.landingTargetM.x - scenario.spotM.x, j.landingTargetM.z - scenario.spotM.z))
      .map(mToFt)
      .sort((a, b) => a - b);
    const percentile = (p: number) => distancesFt[Math.floor((distancesFt.length - 1) * p)];

    expect(percentile(0.5)).toBeLessThan(110);
    expect(percentile(0.9)).toBeLessThan(175);
    expect(distancesFt.some(d => d > 25)).toBe(true);
    expect(distancesFt.every(d => d <= 200)).toBe(true);
  });
});

describe('metrics', () => {
  it('summarizes deployment, open-canopy altitude, and congestion', () => {
    const snapshots = new World(createScenario({ seed: 12, numJumpers: 8 })).runUntilDone(900, 1 / 20);
    const summary = summarizeRun(snapshots);
    expect(summary.deploymentEvents.length).toBe(8);
    expect(summary.maxOpenCanopiesBelow1000Ft).toBeGreaterThanOrEqual(0);
    expect(summary.minHorizontalSeparationFt).toBeGreaterThanOrEqual(0);
    expect(summary.fullyOpenAltitudeRangeFt.min).toBeLessThan(summary.fullyOpenAltitudeRangeFt.max);
  });
});
