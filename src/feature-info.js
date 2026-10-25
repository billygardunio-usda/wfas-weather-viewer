const DISPLAY_RULES = new Map([
  ['temperature', { unit: '°F', convert: (value) => (value - 273.15) * 1.8 + 32 }],
  ['relative_humidity', { unit: '%', convert: (value) => value }],
  ['wind_speed', { unit: 'mph', convert: (value) => value * 2.236936 }],
  ['wind_direction', { unit: '°', convert: (value) => value }],
  ['cloud_cover', { unit: '%', convert: (value) => value }],
  ['solar_radiation', { unit: 'W/m²', convert: (value) => value }],
  ['total_precipitation', { unit: 'in', convert: (value) => value / 25.4 }],
]);

export function convertFeatureInfoValue(variable, value) {
  const rule = DISPLAY_RULES.get(variable.toLowerCase());
  return { value: typeof value === 'number' && rule ? rule.convert(value) : value, unit: rule?.unit ?? 'native units' };
}

export function readFeatureInfoValue(payload) {
  const properties = payload?.features?.[0]?.properties;
  if (!properties) return null;
  const key = Object.keys(properties).find((name) => name !== 'fid' && properties[name] !== null);
  return key ? properties[key] : null;
}

export function formatFeatureInfoValue(value) {
  if (typeof value !== 'number') return value;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

export function buildProxyUrl(proxyUrl, featureInfoUrl) {
  if (!proxyUrl) return null;
  const url = new URL(proxyUrl, globalThis.location?.href ?? 'http://localhost');
  url.searchParams.set('url', featureInfoUrl);
  return url.toString();
}

export function resolveFeatureInfoProxy(configuredUrl, location) {
  if (configuredUrl) return configuredUrl;
  if (['localhost', '127.0.0.1'].includes(location?.hostname)) return `${location.protocol}//${location.hostname}:8787`;
  return '';
}