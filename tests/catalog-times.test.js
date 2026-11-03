import { describe, expect, it } from 'vitest';
import { recentTimeCutoff, trimLayerTimes } from '../src/catalog-times.js';

describe('catalog time retention', () => {
  const now = new Date('2026-11-03T20:00:00Z');

  it('starts the rolling window at midnight five days ago', () => {
    expect(recentTimeCutoff(now).toISOString()).toBe('2026-10-29T00:00:00.000Z');
  });

  it('removes older history while retaining forecasts and the advertised default', () => {
    const layer = trimLayerTimes({
      times: ['2026-09-22T00:00:00Z', '2026-10-29T00:00:00Z', '2026-11-03T00:00:00Z', '2026-11-09T00:00:00Z'],
      defaultTime: '2026-11-03T00:00:00Z',
    }, now);
    expect(layer.times).toEqual(['2026-10-29T00:00:00Z', '2026-11-03T00:00:00Z', '2026-11-09T00:00:00Z']);
    expect(layer.defaultTime).toBe('2026-11-03T00:00:00Z');
  });
});
