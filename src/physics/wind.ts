import { headingVector, lerp, type Vec3 } from './vector';

export type WindLayer = {
  altitudeM: number;
  speedMps: number;
  /** Direction the wind blows toward. 0 = +z, 90 = +x. */
  directionDeg: number;
};

function layerVector(layer: WindLayer): Vec3 {
  return headingVector(layer.directionDeg, layer.speedMps);
}

export function windAtAltitude(layers: WindLayer[], altitudeM: number): Vec3 {
  if (!layers.length) return { x: 0, y: 0, z: 0 };
  const sorted = [...layers].sort((a, b) => a.altitudeM - b.altitudeM);
  if (altitudeM <= sorted[0].altitudeM) return layerVector(sorted[0]);
  const top = sorted[sorted.length - 1];
  if (altitudeM >= top.altitudeM) return layerVector(top);
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i];
    const hi = sorted[i + 1];
    if (altitudeM >= lo.altitudeM && altitudeM <= hi.altitudeM) {
      const t = (altitudeM - lo.altitudeM) / (hi.altitudeM - lo.altitudeM);
      return lerp(layerVector(lo), layerVector(hi), t);
    }
  }
  return layerVector(top);
}
