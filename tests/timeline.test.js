import { describe, expect, it } from 'vitest';
import { buildSharedTimeline, classifyTimestamp, findNearestFutureIndex, layerHasTime, normalizeTimestamp } from '../src/timeline.js';
describe('shared timeline', () => {
  const observation={times:['2026-10-20T00:00:00Z','2026-10-20T01:00:00Z']}; const forecast={times:['2026-10-20T01:00:00.000Z','2026-10-20T03:00:00Z']};
  it('builds a sorted union',()=>expect(buildSharedTimeline([forecast,observation])).toEqual(['2026-10-20T00:00:00.000Z','2026-10-20T01:00:00.000Z','2026-10-20T03:00:00.000Z']));
  it('requires exact dimensional times',()=>{expect(layerHasTime(observation,normalizeTimestamp('2026-10-20T01:00:00Z'))).toBe(true);expect(layerHasTime(observation,normalizeTimestamp('2026-10-20T03:00:00Z'))).toBe(false);});
  it('keeps timeless layers available',()=>expect(layerHasTime({times:[]},'x')).toBe(true));
  it('classifies past and forecast',()=>{const now=new Date('2026-10-20T02:00:00Z');expect(classifyTimestamp('2026-10-20T01:00:00Z',now)).toBe('Past');expect(classifyTimestamp('2026-10-20T03:00:00Z',now)).toBe('Forecast');});
  it('finds nearest future',()=>expect(findNearestFutureIndex(buildSharedTimeline([observation,forecast]),new Date('2026-10-20T02:00:00Z'))).toBe(2));
});