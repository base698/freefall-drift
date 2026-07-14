import { ft, mToFt } from './units';
import { horizontalDistance } from './vector';
import type { WorldSnapshot } from './world';

export type RunSummary = {
  deploymentEvents: Array<{ id: string; actualDeployAltitudeFt: number; fullyOpenAltitudeFt: number }>;
  maxOpenCanopiesBelow1000Ft: number;
  maxOpenCanopiesBelow500Ft: number;
  minHorizontalSeparationFt: number;
  fullyOpenAltitudeRangeFt: { min: number; max: number };
  canopyCongestionScore: number;
};

const CONGESTION_HORIZONTAL_M = ft(300);
const CONGESTION_VERTICAL_M = ft(150);

export function summarizeRun(snapshots: WorldSnapshot[]): RunSummary {
  const first = snapshots[0];
  const deploymentEvents = first.jumpers.map(j => ({
    id: j.id,
    actualDeployAltitudeFt: mToFt(j.actualDeployAltitudeM),
    fullyOpenAltitudeFt: mToFt(j.fullyOpenAltitudeM),
  }));
  let maxOpenCanopiesBelow1000Ft = 0;
  let maxOpenCanopiesBelow500Ft = 0;
  let minHorizontalSeparationM = Infinity;
  let canopyCongestionPairSeconds = 0;

  for (let snapIndex = 0; snapIndex < snapshots.length; snapIndex++) {
    const snap = snapshots[snapIndex];
    const next = snapshots[snapIndex + 1];
    const dtS = next ? Math.max(0, next.timeS - snap.timeS) : 0;
    const openBelow1000 = snap.jumpers.filter(j => j.phase === 'canopy' && mToFt(j.position.y) <= 1000 && j.position.y > 0).length;
    const openBelow500 = snap.jumpers.filter(j => j.phase === 'canopy' && mToFt(j.position.y) <= 500 && j.position.y > 0).length;
    maxOpenCanopiesBelow1000Ft = Math.max(maxOpenCanopiesBelow1000Ft, openBelow1000);
    maxOpenCanopiesBelow500Ft = Math.max(maxOpenCanopiesBelow500Ft, openBelow500);
    const canopies = snap.jumpers.filter(j => j.phase === 'canopy');
    for (let i = 0; i < canopies.length; i++) {
      for (let k = i + 1; k < canopies.length; k++) {
        const h = horizontalDistance(canopies[i].position, canopies[k].position);
        minHorizontalSeparationM = Math.min(minHorizontalSeparationM, h);
        const verticallyClose = Math.abs(canopies[i].position.y - canopies[k].position.y) < CONGESTION_VERTICAL_M;
        if (h < CONGESTION_HORIZONTAL_M && verticallyClose) canopyCongestionPairSeconds += dtS;
      }
    }
  }
  const openAltitudes = deploymentEvents.map(e => e.fullyOpenAltitudeFt);
  return {
    deploymentEvents,
    maxOpenCanopiesBelow1000Ft,
    maxOpenCanopiesBelow500Ft,
    minHorizontalSeparationFt: Number.isFinite(minHorizontalSeparationM) ? mToFt(minHorizontalSeparationM) : 0,
    fullyOpenAltitudeRangeFt: { min: Math.min(...openAltitudes), max: Math.max(...openAltitudes) },
    canopyCongestionScore: Number(canopyCongestionPairSeconds.toFixed(2)),
  };
}
