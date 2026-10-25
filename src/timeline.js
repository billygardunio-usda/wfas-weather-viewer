export function normalizeTimestamp(value) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.valueOf()) ? value : timestamp.toISOString();
}

export function buildSharedTimeline(layers) {
  return [...new Set(layers.flatMap((layer) => layer.times.map(normalizeTimestamp)))].sort((left, right) => new Date(left) - new Date(right));
}

export function layerHasTime(layer, timestamp) {
  if (layer.times.length === 0) return true;
  return layer.times.some((time) => normalizeTimestamp(time) === timestamp);
}

export function classifyTimestamp(timestamp, now = new Date()) {
  return new Date(timestamp) > now ? 'Forecast' : 'Past';
}

export function findNearestFutureIndex(times, now = new Date()) {
  return times.findIndex((timestamp) => new Date(timestamp) >= now);
}