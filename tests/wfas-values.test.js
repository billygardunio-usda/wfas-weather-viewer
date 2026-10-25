import { describe, expect, it, vi } from 'vitest';
import { buildUpstreamUrl, handleWfasValues, validateInput } from '../api/src/wfas-values-core.js';
import { formatWfasValue, requestWfasValue, WfasValuesError } from '../src/wfas-values.js';

const validInput = {
  layer: 'gfs:Temperature',
  x: -10900000,
  y: 4800000,
  projection: 'EPSG:3857',
  resolution: 1000,
  width: 101,
  height: 101,
  time: '2026-10-25T12:00:00.000Z',
};

describe('WFAS values API validation', () => {
  it('constructs only the fixed WFAS GetFeatureInfo request', () => {
    const url = new URL(buildUpstreamUrl(validInput));
    expect(url.origin + url.pathname).toBe('https://wfas.firenet.gov/geoserver/wms');
    expect(url.searchParams.get('REQUEST')).toBe('GetFeatureInfo');
    expect(url.searchParams.get('QUERY_LAYERS')).toBe(validInput.layer);
    expect(url.searchParams.get('INFO_FORMAT')).toBe('application/json');
    expect(url.searchParams.get('I')).toBe('50');
    expect(url.searchParams.get('TIME')).toBe(validInput.time);
  });

  it.each([
    [{ ...validInput, layer: 'unknown:Temperature' }, 'approved WFAS workspace'],
    [{ ...validInput, x: 0 }, 'CONUS'],
    [{ ...validInput, projection: 'EPSG:4326' }, 'EPSG:3857'],
    [{ ...validInput, resolution: 50001 }, 'resolution'],
    [{ ...validInput, width: 1000 }, 'width'],
    [{ ...validInput, time: 'tomorrow' }, 'ISO 8601'],
    [{ ...validInput, targetUrl: 'https://example.com' }, 'unsupported field'],
  ])('rejects unsafe or malformed input', (input, message) => {
    expect(() => validateInput(input)).toThrow(message);
  });

  it('returns one structured primitive value from WFAS', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      features: [{ properties: { GRAY_INDEX: 72.5 } }],
    }), { headers: { 'Content-Type': 'application/json' } }));
    const response = await handleWfasValues(new Request('https://app/api/wfas-values', {
      method: 'POST',
      body: JSON.stringify(validInput),
    }), fetchImpl);
    expect(response).toMatchObject({
      status: 200,
      jsonBody: { ok: true, layer: validInput.layer, property: 'GRAY_INDEX', value: 72.5 },
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('controls invalid upstream responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<html>failure</html>'));
    const response = await handleWfasValues(new Request('https://app/api/wfas-values', {
      method: 'POST',
      body: JSON.stringify(validInput),
    }), fetchImpl);
    expect(response).toMatchObject({ status: 502, jsonBody: { error: { code: 'invalid_upstream_response' } } });
  });
});

describe('WFAS values frontend client', () => {
  it('posts the request and formats a successful value', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, value: 12.34567, property: 'value' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const result = await requestWfasValue(validInput, fetchImpl);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual(validInput);
    expect(formatWfasValue(result.value)).toBe('12.3457');
  });

  it('reports authentication and timeout failures safely', async () => {
    const unauthorized = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    await expect(requestWfasValue(validInput, unauthorized)).rejects.toMatchObject({ code: 'authentication_required' });

    const timeout = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error: { code: 'upstream_timeout', message: '<unsafe>' },
    }), { status: 504, headers: { 'Content-Type': 'application/json' } }));
    await expect(requestWfasValue(validInput, timeout)).rejects.toEqual(expect.objectContaining({
      message: 'WFAS did not respond in time. Try again.',
    }));
  });

  it('rejects invalid success payloads', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    await expect(requestWfasValue(validInput, fetchImpl)).rejects.toBeInstanceOf(WfasValuesError);
  });
});
