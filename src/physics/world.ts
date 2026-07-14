import { headingVector, relax, type Vec3 } from './vector';
import { windAtAltitude } from './wind';
import type { JumperInitialState, Phase, Scenario } from './scenario';

export type JumperSnapshot = {
  id: string;
  groupId: string;
  phase: Phase;
  position: Vec3;
  velocity: Vec3;
  plannedDeployAltitudeM: number;
  actualDeployAltitudeM: number;
  fullyOpenAltitudeM: number;
};

export type WorldSnapshot = { timeS: number; jumpers: JumperSnapshot[] };

type MutableJumper = JumperInitialState;

export class World {
  private timeS = 0;
  private aircraftPosition: Vec3;
  private jumpers: MutableJumper[];

  constructor(private readonly scenario: Scenario) {
    this.aircraftPosition = { x: 0, y: scenario.exitAltitudeM, z: 0 };
    this.jumpers = scenario.jumpers.map(j => ({ ...j, position: { ...j.position }, velocity: { ...j.velocity }, deployment: { ...j.deployment } }));
  }

  step(dtS: number): void {
    this.timeS += dtS;
    const aircraftVelocity = headingVector(this.scenario.aircraftHeadingDeg, this.scenario.aircraftGroundSpeedMps);
    this.aircraftPosition.x += aircraftVelocity.x * dtS;
    this.aircraftPosition.z += aircraftVelocity.z * dtS;

    for (const jumper of this.jumpers) {
      if (jumper.phase === 'landed') continue;
      if (this.timeS < jumper.exitTimeS) {
        jumper.phase = 'inAircraft';
        jumper.position = { ...this.aircraftPosition };
        jumper.velocity = { ...aircraftVelocity };
        continue;
      }
      if (jumper.phase === 'inAircraft') jumper.phase = 'freefall';

      const wind = windAtAltitude(this.scenario.windLayers, jumper.position.y);
      if (jumper.phase === 'freefall' && jumper.position.y <= jumper.deployment.actualDeployAltitudeM) jumper.phase = 'deploying';
      if (jumper.phase === 'deploying' && jumper.position.y <= jumper.deployment.fullyOpenAltitudeM) jumper.phase = 'canopy';

      if (jumper.phase === 'freefall') {
        const targetVelocity = { x: wind.x, y: -jumper.profile.terminalVelocityMps, z: wind.z };
        jumper.velocity = relax(jumper.velocity, targetVelocity, jumper.profile.horizontalAirDragTauS, dtS);
        jumper.velocity.y = Math.max(jumper.velocity.y - 9.80665 * dtS, -jumper.profile.terminalVelocityMps);
      } else if (jumper.phase === 'deploying') {
        const progress = 1 - Math.max(0, (jumper.position.y - jumper.deployment.fullyOpenAltitudeM) / Math.max(1, jumper.deployment.openingLossM));
        const tau = 1.5 + (1 - progress) * 2.5;
        const targetVelocity = { x: wind.x, y: -jumper.deployment.canopyVerticalSpeedMps, z: wind.z + jumper.profile.canopyAirSpeedMps * 0.35 };
        jumper.velocity = relax(jumper.velocity, targetVelocity, tau, dtS);
      } else if (jumper.phase === 'canopy') {
        const target = canopyNavigationTarget(jumper, this.scenario, wind);
        const steering = steerToward(jumper.position, target, jumper.profile.canopyAirSpeedMps);
        const targetVelocity = { x: wind.x + steering.x, y: -jumper.deployment.canopyVerticalSpeedMps, z: wind.z + steering.z };
        jumper.velocity = relax(jumper.velocity, targetVelocity, 4, dtS);
      }

      jumper.position.x += jumper.velocity.x * dtS;
      jumper.position.y += jumper.velocity.y * dtS;
      jumper.position.z += jumper.velocity.z * dtS;
      if (jumper.position.y <= 0) {
        jumper.position = { ...jumper.landingTargetM };
        jumper.velocity = { x: 0, y: 0, z: 0 };
        jumper.phase = 'landed';
      }
    }
  }

  snapshot(): WorldSnapshot {
    return {
      timeS: Number(this.timeS.toFixed(4)),
      jumpers: this.jumpers.map(j => ({
        id: j.id,
        groupId: j.groupId,
        phase: j.phase,
        position: { ...j.position },
        velocity: { ...j.velocity },
        plannedDeployAltitudeM: j.deployment.plannedDeployAltitudeM,
        actualDeployAltitudeM: j.deployment.actualDeployAltitudeM,
        fullyOpenAltitudeM: j.deployment.fullyOpenAltitudeM,
      })),
    };
  }

  runUntilDone(maxSeconds = 900, dtS = 1 / 60): WorldSnapshot[] {
    const snapshots: WorldSnapshot[] = [this.snapshot()];
    while (this.timeS < maxSeconds && !this.snapshot().jumpers.every(j => j.phase === 'landed')) {
      this.step(dtS);
      snapshots.push(this.snapshot());
    }
    return snapshots;
  }
}

function canopyNavigationTarget(jumper: MutableJumper, scenario: Scenario, wind: Vec3): Vec3 {
  if (jumper.position.y <= 304.8) return jumper.landingTargetM;
  const windMagnitude = Math.hypot(wind.x, wind.z);
  if (windMagnitude < 0.01) return scenario.spotM;
  const upwindDistanceM = 243.84;
  return {
    x: scenario.spotM.x - (wind.x / windMagnitude) * upwindDistanceM,
    y: 0,
    z: scenario.spotM.z - (wind.z / windMagnitude) * upwindDistanceM,
  };
}

function steerToward(position: Vec3, target: Vec3, airSpeedMps: number): Vec3 {
  const dx = target.x - position.x;
  const dz = target.z - position.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1) return { x: 0, y: 0, z: 0 };
  return { x: (dx / distance) * airSpeedMps, y: 0, z: (dz / distance) * airSpeedMps };
}
