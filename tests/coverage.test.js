import { describe, expect, it } from 'vitest';
import { CONUS_EXTENT, filterConusLayers, intersectsConus } from '../src/coverage.js';
describe('CONUS coverage', () => {
  it('accepts global and CONUS extents', () => { expect(intersectsConus([-180,-90,180,90])).toBe(true); expect(intersectsConus(CONUS_EXTENT)).toBe(true); });
  it('rejects displaced and malformed extents', () => { expect(intersectsConus([-109.375,-55.875,-28.875,15.625])).toBe(false); expect(intersectsConus(null)).toBe(false); });
  it('filters displaced products', () => { expect(filterConusLayers([{id:'good',extent:CONUS_EXTENT},{id:'bad',extent:[-109,-55,-28,15]}]).map((x)=>x.id)).toEqual(['good']); });
});