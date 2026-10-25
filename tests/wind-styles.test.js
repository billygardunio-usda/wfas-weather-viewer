import { describe, expect, it } from 'vitest';
import { getWindPresentation, isWindSpeed, WIND_MODES } from '../src/wind-styles.js';
describe('wind presentations',()=>{const layer={id:'urma:Wind_speed',model:'urma',variable:'Wind_speed'};
it('offers modes',()=>expect(WIND_MODES.map((x)=>x.id)).toEqual(['shaded','arrows','isotachs']));
it('pairs direction',()=>expect(getWindPresentation(layer,'arrows').layers).toEqual(['urma:Wind_speed','urma:Wind_direction']));
it('uses contours and mph conversion',()=>{const p=getWindPresentation(layer,'isotachs');expect(p.sld).toContain('ras:Contour');expect(p.sld).toContain('2.236936');});
it('uses native thresholds labeled mph',()=>expect(getWindPresentation(layer).sld).toContain('quantity="4.4704" label="10 mph"'));
it('ignores other variables',()=>expect(isWindSpeed({variable:'Temperature'})).toBe(false));});