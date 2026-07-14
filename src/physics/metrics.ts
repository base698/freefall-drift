import { mToFt } from './units';
import { horizontalDistance } from './vector';
import type { WorldSnapshot } from './world';

export type RunSummary = {
  deploymentEvents: Array<{ id: string; actualDeployAltitudeFt: number; fullyOpenAltitudeFt: number }>;
  maxOpenCanopiesBelow1000Ft: number;
  minHorizontalSeparationFt: number;
  fullyOpenAltitudeRangeFt: { min: number; max: number };
  canopyCongestionScore: number;
};

export function summarizeRun(snapshots: WorldSnapshot[]): RunSummary {
  const first = snapshots[0];
  const deploymentEvents = first.jumpers.map(j => ({
    id: j.id,
    actualDeployAltitudeFt: mToFt(j.actualDeployAltitudeM),
    fullyOpenAltitudeFt: mToFt(j.fullyOpenAltitudeM),
  }));
  let maxOpenCanopiesBelow1000Ft = 0;
  let minHorizontalSeparationM = Infinity;
  let canopyCongestionScore = 0;

  for (const snap of snapshots) {
    const openBelow = snap.jumpers.filter(j => j.phase === 'canopy' && mToFt(j.position.y) <= 1000 && j.position.y > 0).length;
    maxOpenCanopiesBelow1000Ft = Math.max(maxOpenCanopiesBelow1000Ft, openBelow);
    const canopies = snap.jumpers.filter(j => j.phase === 'canopy');
    for (let i = 0; i < canopies.length; i++) {
      for (let k = i + 1; k < canopies.length; k++) {
        const h = horizontalDistance(canopies[i].position, canopies[k].position);
        minHorizontalSeparationM = Math.min(minHorizontalSeparationM, h);
        if (h < 300 && Math.abs(canopies[i].position.y - canopies[k].position.y) < 150) canopyCongestionScore += 1;
      }
    }
  }
  const openAltitudes = deploymentEvents.map(e => e.fullyOpenAltitudeFt);
  return {
    deploymentEvents,
    maxOpenCanopiesBelow1000Ft,
    minHorizontalSeparationFt: Number.isFinite(minHorizontalSeparationM) ? mToFt(minHorizontalSeparationM) : 0,
    fullyOpenAltitudeRangeFt: { min: Math.min(...openAltitudes), max: Math.max(...openAltitudes) },
    canopyCongestionScore,
  };
}
