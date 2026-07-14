import { createScenario, type Scenario } from './scenario';
import { summarizeRun, type RunSummary } from './metrics';
import { mToFt } from './units';
import { World } from './world';

export type DistributionSummary = {
  count: number;
  min: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  p95: number;
  max: number;
  mean: number;
};

export type MonteCarloResult = {
  runs: number;
  summaries: RunSummary[];
  distributions: Record<string, DistributionSummary>;
};

export type MonteCarloOptions = {
  baseScenario: Scenario;
  runs?: number;
  seedStart?: number;
  dtS?: number;
  maxSeconds?: number;
};

export function summarizeDistribution(values: number[]): DistributionSummary {
  if (values.length === 0) throw new Error('Cannot summarize an empty distribution');
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => {
    const index = (sorted.length - 1) * p;
    const lo = Math.floor(index);
    const hi = Math.ceil(index);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
  };
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return {
    count: sorted.length,
    min: sorted[0],
    p10: percentile(0.1),
    p25: percentile(0.25),
    median: percentile(0.5),
    p75: percentile(0.75),
    p90: percentile(0.9),
    p95: percentile(0.95),
    max: sorted[sorted.length - 1],
    mean,
  };
}

export function runMonteCarlo(options: MonteCarloOptions): MonteCarloResult {
  const runs = options.runs ?? 1000;
  const seedStart = options.seedStart ?? options.baseScenario.seed;
  const dtS = options.dtS ?? 1 / 20;
  const maxSeconds = options.maxSeconds ?? 900;
  const summaries: RunSummary[] = [];

  for (let i = 0; i < runs; i++) {
    const scenario = createScenario({
      seed: seedStart + i,
      numJumpers: options.baseScenario.jumpers.length,
      groupSwitch: inferGroupSwitch(options.baseScenario),
      fastFallFirst: inferFastFallFirst(options.baseScenario),
      exitSeparationS: inferExitSeparation(options.baseScenario),
      exitAltitudeFt: mToFt(options.baseScenario.exitAltitudeM),
      windLayers: options.baseScenario.windLayers,
      spotOffsetFt: mToFt(options.baseScenario.spotM.z),
      landingAreaRadiusFt: mToFt(options.baseScenario.landingAreaRadiusM),
    });
    summaries.push(summarizeRun(new World(scenario).runUntilDone(maxSeconds, dtS)));
  }

  return {
    runs,
    summaries,
    distributions: distributionsFromSummaries(summaries),
  };
}

export function distributionsFromSummaries(summaries: RunSummary[]): Record<string, DistributionSummary> {
  const numericStats: Record<string, number[]> = {
    maxOpenCanopiesBelow1000Ft: summaries.map(s => s.maxOpenCanopiesBelow1000Ft),
    maxOpenCanopiesBelow500Ft: summaries.map(s => s.maxOpenCanopiesBelow500Ft),
    minHorizontalSeparationFt: summaries.map(s => s.minHorizontalSeparationFt),
    fullyOpenAltitudeMinFt: summaries.map(s => s.fullyOpenAltitudeRangeFt.min),
    fullyOpenAltitudeMaxFt: summaries.map(s => s.fullyOpenAltitudeRangeFt.max),
    fullyOpenAltitudeSpreadFt: summaries.map(s => s.fullyOpenAltitudeRangeFt.max - s.fullyOpenAltitudeRangeFt.min),
    canopyCongestionScore: summaries.map(s => s.canopyCongestionScore),
    canopyCollisionExposurePairSeconds: summaries.map(s => s.canopyCollisionExposurePairSeconds),
    estimatedCanopyCollisionRiskPer10k: summaries.map(s => s.estimatedCanopyCollisionRiskPer10k),
  };
  return Object.fromEntries(Object.entries(numericStats).map(([key, values]) => [key, summarizeDistribution(values)]));
}

function inferExitSeparation(scenario: Scenario): number {
  const exitTimes = scenario.jumpers.map(j => j.exitTimeS).sort((a, b) => a - b);
  if (exitTimes.length < 2) return 8;
  return exitTimes[1] - exitTimes[0];
}

function inferGroupSwitch(scenario: Scenario): number {
  const firstName = scenario.jumpers[0]?.profile.name;
  const switchIndex = scenario.jumpers.findIndex(j => j.profile.name !== firstName);
  return switchIndex === -1 ? scenario.jumpers.length : switchIndex;
}

function inferFastFallFirst(scenario: Scenario): boolean {
  return scenario.jumpers[0]?.profile.name === 'freefly';
}
