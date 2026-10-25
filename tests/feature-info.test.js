import { describe, expect, it } from 'vitest';
import { buildProxyUrl, convertFeatureInfoValue, formatFeatureInfoValue, readFeatureInfoValue, resolveFeatureInfoProxy } from '../src/feature-info.js';
describe('feature info',()=>{
it('reads raster values',()=>{expect(readFeatureInfoValue({features:[{properties:{GRAY_INDEX:297}}]})).toBe(297);expect(readFeatureInfoValue({features:[]})).toBeNull();});
it('converts US units',()=>{expect(convertFeatureInfoValue('Temperature',273.15)).toEqual({value:32,unit:'°F'});expect(convertFeatureInfoValue('Wind_speed',10)).toEqual({value:22.36936,unit:'mph'});expect(convertFeatureInfoValue('Total_precipitation',25.4)).toEqual({value:1,unit:'in'});});
it('preserves familiar units',()=>{expect(convertFeatureInfoValue('Relative_humidity',50).unit).toBe('%');expect(convertFeatureInfoValue('Wind_direction',270).unit).toBe('°');});
it('formats values',()=>expect(formatFeatureInfoValue(43.7000007)).toBe('43.7'));
it('encodes proxy targets',()=>expect(new URL(buildProxyUrl('https://proxy.example/','https://wfas.firenet.gov/geoserver/wms?x=2')).searchParams.get('url')).toContain('x=2'));
it('discovers local worker',()=>expect(resolveFeatureInfoProxy('',{protocol:'http:',hostname:'127.0.0.1'})).toBe('http://127.0.0.1:8787'));
});