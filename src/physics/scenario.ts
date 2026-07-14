import { ft, mph } from './units';
import { createSeededRng, sampleDistribution, type DistributionConfig } from './random';
import { headingVector, type Vec3 } from './vector';
import type { WindLayer } from './wind';

export type Phase = 'inAircraft' | 'freefall' | 'deploying' | 'canopy' | 'landed';

export type JumperProfile = {
  name: string;
  terminalVelocityMps: number;
  horizontalAirDragTauS: number;
  canopyAirSpeedMps: number;
};

export type DeploymentConfig = {
  targetAltitudeM: number;
  targetJitterM: DistributionConfig;
  openingLossM: DistributionConfig;
  canopyVerticalSpeedMps: DistributionConfig;
  minDeployAltitudeM: number;
  maxDeployAltitudeM: number;
  withinGroupSpreadM?: DistributionConfig;
};

export type SampledDeployment = {
  plannedDeployAltitudeM: number;
  actualDeployAltitudeM: number;
  fullyOpenAltitudeM: number;
  openingLossM: number;
  canopyVerticalSpeedMps: number;
  minDeployAltitudeM: number;
  maxDeployAltitudeM: number;
};

export type JumperInitialState = {
  id: string;
  groupId: string;
  phase: Phase;
  exitTimeS: number;
  position: Vec3;
  velocity: Vec3;
  profile: JumperProfile;
  deployment: SampledDeployment;
  landingTargetM: Vec3;
};

export type Scenario = {
  seed: number;
  exitAltitudeM: number;
  aircraftGroundSpeedMps: number;
  aircraftHeadingDeg: number;
  windLayers: WindLayer[];
  spotM: Vec3;
  landingAreaRadiusM: number;
  jumpers: JumperInitialState[];
};

export const profiles = {
  belly: { name: 'belly', terminalVelocityMps: mph(115), horizontalAirDragTauS: 5, canopyAirSpeedMps: mph(20) },
  freefly: { name: 'freefly', terminalVelocityMps: mph(180), horizontalAirDragTauS: 10, canopyAirSpeedMps: mph(22) },
};

export function defaultDeploymentConfig(targetFt: number): DeploymentConfig {
  return {
    targetAltitudeM: ft(targetFt),
    targetJitterM: { kind: 'normal', mean: 0, stdDev: ft(75), min: ft(-200), max: ft(200) },
    openingLossM: { kind: 'triangular', min: ft(300), mode: ft(550), max: ft(800) },
    canopyVerticalSpeedMps: { kind: 'triangular', min: mph(18), mode: mph(24), max: mph(35) },
    minDeployAltitudeM: ft(2500),
    maxDeployAltitudeM: ft(5000),
    withinGroupSpreadM: { kind: 'normal', mean: 0, stdDev: ft(50), min: ft(-150), max: ft(150) },
  };
}

export function createScenario(options: Partial<{ seed: number; numJumpers: number; groupSwitch: number; fastFallFirst: boolean; exitSeparationS: number; exitAltitudeFt: number; windLayers: WindLayer[]; spotOffsetFt: number; landingAreaRadiusFt: number }> = {}): Scenario {
  const seed = options.seed ?? 1;
  const rng = createSeededRng(seed);
  const numJumpers = options.numJumpers ?? 8;
  const groupSwitch = options.groupSwitch ?? Math.ceil(numJumpers / 2);
  const fastFallFirst = options.fastFallFirst ?? false;
  const exitSeparationS = options.exitSeparationS ?? 8;
  const exitAltitudeM = ft(options.exitAltitudeFt ?? 13000);
  const spotM = { x: 0, y: 0, z: ft(options.spotOffsetFt ?? 250) };
  const landingAreaRadiusM = ft(options.landingAreaRadiusFt ?? 200);
  const windLayers: WindLayer[] = options.windLayers ?? [
    { altitudeM: ft(0), speedMps: mph(5), directionDeg: 180 },
    { altitudeM: ft(3000), speedMps: mph(15), directionDeg: 180 },
    { altitudeM: ft(6000), speedMps: mph(20), directionDeg: 180 },
    { altitudeM: ft(9000), speedMps: mph(25), directionDeg: 180 },
    { altitudeM: ft(12000), speedMps: mph(30), directionDeg: 180 },
  ];
  const aircraftHeadingDeg = jumpRunHeadingIntoWind(windLayers);
  const jumpers: JumperInitialState[] = [];
  for (let i = 0; i < numJumpers; i++) {
    const firstBlock = i < groupSwitch;
    const profile = fastFallFirst ? (firstBlock ? profiles.freefly : profiles.belly) : (firstBlock ? profiles.belly : profiles.freefly);
    const groupIndex = i;
    const deploymentCfg = defaultDeploymentConfig(firstBlock ? 3500 : 3500);
    const spread = deploymentCfg.withinGroupSpreadM ? sampleDistribution(deploymentCfg.withinGroupSpreadM, rng) : 0;
    const jitter = sampleDistribution(deploymentCfg.targetJitterM, rng);
    const plannedDeployAltitudeM = deploymentCfg.targetAltitudeM + spread;
    const actualDeployAltitudeM = Math.max(deploymentCfg.minDeployAltitudeM, Math.min(deploymentCfg.maxDeployAltitudeM, plannedDeployAltitudeM + jitter));
    const openingLossM = sampleDistribution(deploymentCfg.openingLossM, rng);
    const fullyOpenAltitudeM = Math.max(0, actualDeployAltitudeM - openingLossM);
    const landingTargetM = sampleLandingTarget(spotM, landingAreaRadiusM, rng);
    jumpers.push({
      id: `J${i + 1}`,
      groupId: `G${i + 1}`,
      phase: 'inAircraft',
      exitTimeS: groupIndex * exitSeparationS,
      position: { x: 0, y: exitAltitudeM, z: 0 },
      velocity: { x: 0, y: 0, z: mph(98) },
      profile,
      deployment: {
        plannedDeployAltitudeM,
        actualDeployAltitudeM,
        fullyOpenAltitudeM,
        openingLossM,
        canopyVerticalSpeedMps: sampleDistribution(deploymentCfg.canopyVerticalSpeedMps, rng),
        minDeployAltitudeM: deploymentCfg.minDeployAltitudeM,
        maxDeployAltitudeM: deploymentCfg.maxDeployAltitudeM,
      },
      landingTargetM,
    });
  }
  return { seed, exitAltitudeM, aircraftGroundSpeedMps: mph(98), aircraftHeadingDeg, windLayers, spotM, landingAreaRadiusM, jumpers };
}

function jumpRunHeadingIntoWind(windLayers: WindLayer[]): number {
  const drift = windLayers.reduce((sum, layer) => {
    const vector = headingVector((layer.directionDeg + 180) % 360, layer.speedMps);
    return { x: sum.x + vector.x, y: 0, z: sum.z + vector.z };
  }, { x: 0, y: 0, z: 0 });
  if (Math.hypot(drift.x, drift.z) < 0.001) return 0;
  return ((Math.atan2(-drift.x, -drift.z) * 180) / Math.PI + 360) % 360;
}

function sampleLandingTarget(spotM: Vec3, radiusM: number, rng: () => number): Vec3 {
  const stdDevM = radiusM / 3;
  for (let attempt = 0; attempt < 16; attempt++) {
    const offset = sampleNormalPair(rng, stdDevM);
    if (Math.hypot(offset.x, offset.z) <= radiusM) {
      return { x: spotM.x + offset.x, y: 0, z: spotM.z + offset.z };
    }
  }

  const fallback = sampleNormalPair(rng, stdDevM);
  const distance = Math.hypot(fallback.x, fallback.z);
  if (distance <= radiusM) return { x: spotM.x + fallback.x, y: 0, z: spotM.z + fallback.z };
  const scale = radiusM / distance;
  return { x: spotM.x + fallback.x * scale, y: 0, z: spotM.z + fallback.z * scale };
}

function sampleNormalPair(rng: () => number, stdDev: number): { x: number; z: number } {
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  const magnitude = Math.sqrt(-2 * Math.log(u1)) * stdDev;
  const angle = 2 * Math.PI * u2;
  return { x: Math.cos(angle) * magnitude, z: Math.sin(angle) * magnitude };
}
