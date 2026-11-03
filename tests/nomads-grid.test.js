import { describe, expect, it } from 'vitest';
import { assetForTime, formatNomadsValue, sampleGrid } from '../src/nomads-grid.js';
import { particleDelta } from '../src/wind-particles.js';

const grid = {
  bounds: [-1, 0, 1, 2],
  width: 3,
  height: 3,
  resolution: 1,
  fields: {
    u: { values: [1, 1, 1, 1, 1, 1, 1, 1, 1] },
    v: { values: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
    temperature: { values: [273.15, 274.15, 275.15, 276.15, 277.15, 278.15, 279.15, 280.15, 281.15] },
    precipitation: { values: [25.4, 25.4, 25.4, 25.4, 25.4, 25.4, 25.4, 25.4, 25.4] },
  },
};

describe('NOMADS grids', () => {
  it('bilinearly samples a regular north-to-south grid', () => {
    expect(sampleGrid(grid, -0.5, 1.5, 'temperature')).toBeCloseTo(275.15);
  });

  it('formats browser-visible units', () => {
    expect(formatNomadsValue({ visualization: 'wind-particles' }, grid, 0, 1)).toBe('2.2 mph · 270°');
    expect(formatNomadsValue({ visualization: 'precipitation' }, grid, 0, 1)).toBe('1.00 in');
  });

  it('matches normalized timeline timestamps to published assets', () => {
    const metadata = { assets: { '2026-11-03T12:00:00Z': './nomads/gfs.json' } };
    expect(assetForTime(metadata, '2026-11-03T12:00:00.000Z')).toBe('./nomads/gfs.json');
  });

  it('advects particles in screen coordinates', () => {
    expect(particleDelta(10, 5, 0)).toEqual([3.2, -1.6]);
    expect(particleDelta(10, 0, 60)[0]).toBeCloseTo(6.4);
  });
});
