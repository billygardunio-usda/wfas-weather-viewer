import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultHcdpDate, fetchHcdpRaster, formatHcdpValue, hcdpRequest, HCDP_DATASETS, HCDP_EXTENTS } from '../src/hcdp.js';
import { buildSharedTimeline, layerHasTime } from '../src/timeline.js';

afterEach(() => vi.unstubAllGlobals());

const options = { datasetId: 'rainfall', period: 'day', extent: 'statewide', date: '2026-11-05' };

describe('HCDP maps', () => {
  it('uses the documented rainfall raster filters and Hawaii midnight', () => {
    const { url, timestamp } = hcdpRequest(options);
    expect(new URL(url).origin).toBe('https://api.hcdp.ikewai.org');
    expect(Object.fromEntries(new URL(url).searchParams)).toEqual({
      location: 'hawaii', datatype: 'rainfall', production: 'new', period: 'day',
      extent: 'statewide', date: '2026-11-05', type: 'data_map', returnEmptyNotFound: 'false',
    });
    expect(timestamp).toBe('2026-11-05T00:00:00-10:00');
    const metadata = { times: [timestamp] };
    const times = buildSharedTimeline([metadata]);
    expect(times).toEqual(['2026-11-05T10:00:00.000Z']);
    expect(layerHasTime(metadata, times[0])).toBe(true);
    expect(layerHasTime(metadata, '2026-11-06T10:00:00.000Z')).toBe(false);
  });

  it('supports all temperature aggregations and island extents for both periods', () => {
    for (const dataset of HCDP_DATASETS.filter((item) => item.datatype === 'temperature')) {
      for (const extent of HCDP_EXTENTS) {
        for (const period of ['day', 'month']) {
          const date = period === 'month' ? '2026-10' : '2026-10-31';
          const { url, timestamp } = hcdpRequest({ datasetId: dataset.id, period, extent: extent.id, date });
          const params = new URL(url).searchParams;
          expect(params.get('aggregation')).toBe(dataset.aggregation);
          expect(params.has('production')).toBe(false);
          expect(params.get('extent')).toBe(extent.id);
          expect(timestamp).toBe(`${period === 'month' ? '2026-10-01' : date}T00:00:00-10:00`);
        }
      }
    }
  });

  it.each([
    { date: '2026-02-30' }, { date: '2026-13-01' }, { date: '' },
    { date: '2026-02-05', period: 'month' }, { datasetId: 'unknown' },
    { extent: 'conus' }, { period: 'year' },
  ])('rejects invalid selection %j', (invalid) => {
    expect(() => hcdpRequest({ ...options, ...invalid })).toThrow(/valid/);
  });

  it('defaults to the previous completed Hawaii day or month, including year boundaries', () => {
    const now = new Date('2026-01-01T05:00:00Z');
    expect(defaultHcdpDate('day', now)).toBe('2025-12-30');
    expect(defaultHcdpDate('month', now)).toBe('2025-11');
    expect(defaultHcdpDate('month', new Date('2026-01-02T12:00:00Z'))).toBe('2025-12');
  });

  it('sends a token only in the authorization header without credentials, redirects or caching', async () => {
    const blob = new Blob(['test-raster'], { type: 'image/tiff' });
    const fetch = vi.fn().mockResolvedValue(new Response(blob));
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    expect((await fetchHcdpRaster(options, ' Bearer example-token ', signal)).blob.size).toBe(blob.size);
    const [url, init] = fetch.mock.calls[0];
    expect(url).not.toContain('example-token');
    expect(init).toEqual({
      headers: { Authorization: 'Bearer example-token' }, credentials: 'omit',
      cache: 'no-store', redirect: 'error', signal,
    });
  });

  it.each(['', ' ', 'Bearer ', 'bad token'])('does not request data without a valid token input', async (token) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(fetchHcdpRaster(options, token)).rejects.toThrow('token');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'rejected the token'], [403, 'permission'], [404, 'No HCDP map'],
    [429, 'limit'], [500, 'HTTP 500'],
  ])('surfaces HTTP %s without reflecting response content', async (status, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private response', { status })));
    await expect(fetchHcdpRaster(options, 'example-token')).rejects.toThrow(message);
  });

  it('surfaces network failures and empty responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network error')));
    await expect(fetchHcdpRaster(options, 'example-token')).rejects.toThrow('Network error');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('')));
    await expect(fetchHcdpRaster(options, 'example-token')).rejects.toThrow('empty raster');
  });

  it('passes cancellation through to the request', async () => {
    const controller = new AbortController();
    const fetch = vi.fn((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetch);
    const request = fetchHcdpRaster(options, 'example-token', controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('formats native units and respects missing pixels and the GeoTIFF alpha band', () => {
    expect(formatHcdpValue('rainfall', new Float32Array([25.4, 255]))).toBe('25.4 mm');
    expect(formatHcdpValue('temperature-max', new Float32Array([20, 255]))).toBe('20.0 \u00b0C');
    expect(formatHcdpValue('temperature-min', new Float32Array([-5]))).toBe('-5.0 \u00b0C');
    expect(formatHcdpValue('rainfall', [0, 255])).toBe('0.0 mm');
    expect(formatHcdpValue('rainfall', [0, 0])).toBe('No data');
    expect(formatHcdpValue('rainfall', [NaN])).toBe('No data');
    expect(formatHcdpValue('rainfall', null)).toBe('No data');
  });
});
