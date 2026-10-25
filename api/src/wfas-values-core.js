const WFAS_WMS_URL = 'https://wfas.firenet.gov/geoserver/wms';
const ALLOWED_WORKSPACES = new Set(['cfs', 'gfs', 'gmao', 'icon', 'nbm', 'ndfd', 'rap', 'rtma', 'urma']);
const CONUS_3857 = [-13914936.35, 2753408.11, -7347086.39, 6446275.84];
const MAX_RESPONSE_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 5000;
const INPUT_KEYS = new Set(['layer', 'x', 'y', 'projection', 'resolution', 'width', 'height', 'time']);

export class RequestError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function finiteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RequestError(`${name} must be a finite number.`);
  return value;
}

function integerInRange(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RequestError(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

export function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RequestError('A JSON request body is required.');
  if (Object.keys(input).some((key) => !INPUT_KEYS.has(key))) throw new RequestError('The request contains an unsupported field.');
  if (typeof input.layer !== 'string' || !/^[a-z][a-z0-9_-]*:[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(input.layer)) {
    throw new RequestError('layer is not a valid WFAS layer identifier.');
  }
  const [workspace] = input.layer.split(':');
  if (!ALLOWED_WORKSPACES.has(workspace)) throw new RequestError('layer is not in an approved WFAS workspace.');
  if (input.projection !== 'EPSG:3857') throw new RequestError('projection must be EPSG:3857.');

  const x = finiteNumber(input.x, 'x');
  const y = finiteNumber(input.y, 'y');
  if (x < CONUS_3857[0] || x > CONUS_3857[2] || y < CONUS_3857[1] || y > CONUS_3857[3]) {
    throw new RequestError('Coordinates must be within the supported CONUS extent.');
  }
  const resolution = finiteNumber(input.resolution, 'resolution');
  if (resolution < 1 || resolution > 50000) throw new RequestError('resolution must be from 1 to 50000 map units per pixel.');
  const width = integerInRange(input.width, 'width', 3, 257);
  const height = integerInRange(input.height, 'height', 3, 257);

  let time;
  if (input.time !== undefined) {
    if (typeof input.time !== 'string' || input.time.length > 32 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(input.time)
      || Number.isNaN(Date.parse(input.time))) throw new RequestError('time must be an ISO 8601 UTC timestamp.');
    time = input.time;
  }
  return { layer: input.layer, x, y, projection: input.projection, resolution, width, height, time };
}

export function buildUpstreamUrl(input) {
  const { layer, x, y, projection, resolution, width, height, time } = validateInput(input);
  const halfWidth = width * resolution / 2;
  const halfHeight = height * resolution / 2;
  const parameters = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetFeatureInfo',
    LAYERS: layer,
    QUERY_LAYERS: layer,
    STYLES: '',
    CRS: projection,
    BBOX: [x - halfWidth, y - halfHeight, x + halfWidth, y + halfHeight].join(','),
    WIDTH: String(width),
    HEIGHT: String(height),
    I: String(Math.floor(width / 2)),
    J: String(Math.floor(height / 2)),
    INFO_FORMAT: 'application/json',
    FEATURE_COUNT: '1',
    EXCEPTIONS: 'application/json',
  });
  if (time) parameters.set('TIME', time);
  return `${WFAS_WMS_URL}?${parameters}`;
}

async function readJsonWithLimit(response) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) throw new RequestError('WFAS returned too much data.', 502, 'upstream_response_too_large');
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new RequestError('WFAS returned too much data.', 502, 'upstream_response_too_large');
    return JSON.parse(text);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new RequestError('WFAS returned too much data.', 502, 'upstream_response_too_large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function sampledValue(payload) {
  const properties = payload?.features?.[0]?.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return { value: null, property: null };
  const entry = Object.entries(properties).find(([, value]) => value === null || ['string', 'number', 'boolean'].includes(typeof value));
  if (!entry) return { value: null, property: null };
  const [property, rawValue] = entry;
  const value = typeof rawValue === 'string' ? rawValue.slice(0, 256) : rawValue;
  return { value, property: property.slice(0, 128) };
}

export async function handleWfasValues(request, fetchImpl = fetch) {
  if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Use POST for WFAS value requests.', { Allow: 'POST' });
  let input;
  try {
    input = validateInput(await request.json());
  } catch (error) {
    return errorResponse(error.status ?? 400, error.code ?? 'invalid_request', error instanceof SyntaxError ? 'A valid JSON request body is required.' : error.message);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetchImpl(buildUpstreamUrl(input), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return errorResponse(502, 'upstream_failure', 'WFAS could not provide a value.');
    let payload;
    try {
      payload = await readJsonWithLimit(response);
    } catch (error) {
      if (error instanceof RequestError) throw error;
      throw new RequestError('WFAS returned an invalid response.', 502, 'invalid_upstream_response');
    }
    return {
      status: 200,
      jsonBody: { ok: true, layer: input.layer, time: input.time ?? null, ...sampledValue(payload) },
    };
  } catch (error) {
    if (error.name === 'AbortError') return errorResponse(504, 'upstream_timeout', 'WFAS did not respond in time.');
    if (error instanceof RequestError) return errorResponse(error.status, error.code, error.message);
    return errorResponse(502, 'upstream_failure', 'WFAS could not provide a value.');
  } finally {
    clearTimeout(timeout);
  }
}

function errorResponse(status, code, message, headers) {
  return { status, headers, jsonBody: { ok: false, error: { code, message } } };
}
