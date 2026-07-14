import { describe, expect, it } from 'vitest';
import { fdCodeToWind, parseFdWindTempText, windsAloftUrl } from '../src/physics/windsAloft';

describe('FD winds aloft parser', () => {
  it('decodes calm and direction/speed groups', () => {
    expect(fdCodeToWind('9900')).toEqual({ directionDeg: 0, speedMph: 0 });
    expect(fdCodeToWind('0817')).toEqual({ directionDeg: 80, speedMph: expect.closeTo(19.6, 1) });
    expect(fdCodeToWind('1020+14')).toEqual({ directionDeg: 100, speedMph: expect.closeTo(23.0, 1) });
  });

  it('extracts RDU low-level forecast altitudes used by the simulator', () => {
    const text = `
FT  3000    6000    9000   12000   18000   24000  30000  34000  39000
RDU 0817 1020+14 1209+10 1106+05 9900-06 2410-16 271932 263243 254356
`;
    const result = parseFdWindTempText(text, 'RDU');
    expect(result.station).toBe('RDU');
    expect(result.layers.map(l => l.altitudeFt)).toEqual([0, 3000, 6000, 9000, 12000]);
    expect(result.layers[1].speedMph).toBeCloseTo(19.6, 1);
    expect(result.layers[2].speedMph).toBeCloseTo(23.0, 1);
    expect(result.layers[4].directionDeg).toBe(110);
  });

  it('builds AviationWeather low-level URL for southeast/RDU', () => {
    expect(windsAloftUrl('mia', '06')).toContain('region=mia');
    expect(windsAloftUrl('mia', '06')).toContain('level=low');
    expect(windsAloftUrl('mia', '06')).toContain('fcst=06');
  });
});
