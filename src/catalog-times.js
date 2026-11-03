const DAY_MS = 24 * 60 * 60 * 1000;

export function recentTimeCutoff(now = new Date(), pastDays = 5) {
  const cutoff = new Date(now);
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - pastDays);
  return cutoff;
}

export function trimLayerTimes(layer, now = new Date(), pastDays = 5) {
  const cutoff = recentTimeCutoff(now, pastDays);
  const times = layer.times.filter((time) => {
    const timestamp = new Date(time);
    return Number.isNaN(timestamp.valueOf()) || timestamp >= cutoff;
  });
  const defaultTime = times.some((time) => new Date(time).valueOf() === new Date(layer.defaultTime).valueOf())
    ? layer.defaultTime
    : times[0] ?? null;
  return { ...layer, times, defaultTime };
}

export function trimCatalogTimes(catalog, now = new Date(), pastDays = 5) {
  return { ...catalog, layers: catalog.layers.map((layer) => trimLayerTimes(layer, now, pastDays)) };
}
