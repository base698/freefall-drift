export type Vec3 = { x: number; y: number; z: number };

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});
export const horizontalDistance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);
export const relax = (current: Vec3, target: Vec3, tauS: number, dtS: number): Vec3 => {
  const alpha = tauS <= 0 ? 1 : 1 - Math.exp(-dtS / tauS);
  return lerp(current, target, Math.max(0, Math.min(1, alpha)));
};
export const headingVector = (directionDeg: number, magnitude: number): Vec3 => {
  const rad = (directionDeg * Math.PI) / 180;
  return { x: Math.sin(rad) * magnitude, y: 0, z: Math.cos(rad) * magnitude };
};
