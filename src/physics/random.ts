export type Rng = () => number;

export type DistributionConfig =
  | { kind: 'constant'; value: number }
  | { kind: 'uniform'; min: number; max: number }
  | { kind: 'normal'; mean: number; stdDev: number; min?: number; max?: number }
  | { kind: 'triangular'; min: number; mode: number; max: number };

export function createSeededRng(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value: number, min = -Infinity, max = Infinity): number {
  return Math.max(min, Math.min(max, value));
}

export function sampleDistribution(dist: DistributionConfig, rng: Rng): number {
  switch (dist.kind) {
    case 'constant': return dist.value;
    case 'uniform': return dist.min + (dist.max - dist.min) * rng();
    case 'triangular': {
      const u = rng();
      const c = (dist.mode - dist.min) / (dist.max - dist.min);
      if (u < c) return dist.min + Math.sqrt(u * (dist.max - dist.min) * (dist.mode - dist.min));
      return dist.max - Math.sqrt((1 - u) * (dist.max - dist.min) * (dist.max - dist.mode));
    }
    case 'normal': {
      const u1 = Math.max(rng(), Number.EPSILON);
      const u2 = rng();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return clamp(dist.mean + z * dist.stdDev, dist.min, dist.max);
    }
  }
}
