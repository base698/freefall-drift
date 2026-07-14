import { ft, mph } from './units';
import type { WindLayer } from './wind';

export type WindsAloftLayer = {
  altitudeFt: number;
  directionDeg: number;
  speedMph: number;
};

export type ParsedWindsAloft = {
  station: string;
  layers: WindsAloftLayer[];
  source: string;
};

const KNOT_TO_MPH = 1.15078;
const SIM_ALTS = [0, 3000, 6000, 9000, 12000];

export function windsAloftUrl(region = 'mia', fcst: '06' | '12' | '24' = '06'): string {
  const params = new URLSearchParams({ region, level: 'low', fcst });
  return `https://aviationweather.gov/api/data/windtemp?${params.toString()}`;
}

export function fdCodeToWind(raw: string): { directionDeg: number; speedMph: number } {
  const code = raw.trim().slice(0, 4);
  if (!code || code === '9900') return { directionDeg: 0, speedMph: 0 };
  const directionTens = Number(code.slice(0, 2));
  const speedKt = Number(code.slice(2, 4));
  if (!Number.isFinite(directionTens) || !Number.isFinite(speedKt)) return { directionDeg: 0, speedMph: 0 };
  return { directionDeg: directionTens * 10, speedMph: speedKt * KNOT_TO_MPH };
}

export function parseFdWindTempText(text: string, station = 'RDU'): ParsedWindsAloft {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const row = lines.find(line => line.startsWith(`${station.toUpperCase()} `));
  if (!row) throw new Error(`Station ${station.toUpperCase()} not found in winds aloft forecast`);
  const parts = row.split(/\s+/);
  const codes = parts.slice(1, 5);
  if (codes.length < 4) throw new Error(`Station ${station.toUpperCase()} row did not include low-level winds`);
  const layers: WindsAloftLayer[] = [{ altitudeFt: 0, directionDeg: 0, speedMph: 0 }];
  for (let i = 0; i < codes.length; i++) {
    layers.push({ altitudeFt: SIM_ALTS[i + 1], ...fdCodeToWind(codes[i]) });
  }
  return { station: station.toUpperCase(), layers, source: 'AviationWeather FD wind/temp point data' };
}

export function layersToWindLayers(layers: WindsAloftLayer[]): WindLayer[] {
  return layers.map(layer => ({
    altitudeM: ft(layer.altitudeFt),
    speedMps: mph(layer.speedMph),
    directionDeg: layer.directionDeg,
  }));
}
