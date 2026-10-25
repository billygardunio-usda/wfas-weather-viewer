const WFAS_ORIGIN = 'https://wfas.firenet.gov';
const WFAS_WMS_PATH = '/geoserver/wms';

function corsHeaders(request, env) {
  const requestOrigin = request.headers.get('Origin') ?? '';
  const allowedOrigins = (env.ALLOWED_ORIGINS ?? '*').split(',').map((origin) => origin.trim());
  const allowOrigin = allowedOrigins.includes('*') || allowedOrigins.includes(requestOrigin) ? requestOrigin || '*' : allowedOrigins[0];
  return { 'Access-Control-Allow-Origin': allowOrigin, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
}

function validateTarget(value) {
  const target = new URL(value);
  const parameters = new Map([...target.searchParams].map(([key, parameterValue]) => [key.toLowerCase(), parameterValue]));
  if (target.origin !== WFAS_ORIGIN || target.pathname !== WFAS_WMS_PATH || parameters.get('service')?.toUpperCase() !== 'WMS' || parameters.get('request')?.toUpperCase() !== 'GETFEATUREINFO') throw new Error('Only WFAS WMS GetFeatureInfo requests are allowed.');
  const key = [...target.searchParams.keys()].find((name) => name.toLowerCase() === 'info_format');
  target.searchParams.set(key ?? 'info_format', 'application/json');
  return target;
}

export default { async fetch(request, env = {}) {
  const headers = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers });
  try {
    const requestUrl = new URL(request.url);
    if (requestUrl.searchParams.get('health') === '1') return Response.json({ status: 'ready' }, { headers });
    const upstream = await fetch(validateTarget(requestUrl.searchParams.get('url')), { headers: { Accept: 'application/json' } });
    return new Response(await upstream.text(), { status: upstream.status, headers: { ...headers, 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Invalid request.' }, { status: 400, headers });
  }
} };