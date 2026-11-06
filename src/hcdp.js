export const HCDP_API = 'https://api.hcdp.ikewai.org';
const TEMPERATURE_RAMP = [[-10, '#313695'], [0, '#74add1'], [15, '#ffffbf'], [25, '#f46d43'], [35, '#a50026']];

export const HCDP_DATASETS = [
  { id: 'rainfall', label: 'Rainfall', datatype: 'rainfall', production: 'new', units: 'mm', ramp: [[0, '#f7fbff'], [10, '#6baed6'], [50, '#2171b5'], [100, '#6a51a3'], [250, '#dd1c77']] },
  { id: 'temperature-mean', label: 'Mean temperature', datatype: 'temperature', aggregation: 'mean', units: 'C', ramp: TEMPERATURE_RAMP },
  { id: 'temperature-max', label: 'Maximum temperature', datatype: 'temperature', aggregation: 'max', units: 'C', ramp: TEMPERATURE_RAMP },
  { id: 'temperature-min', label: 'Minimum temperature', datatype: 'temperature', aggregation: 'min', units: 'C', ramp: TEMPERATURE_RAMP },
];

export const HCDP_EXTENTS = [
  { id: 'statewide', label: 'Statewide' },
  { id: 'bi', label: 'Hawaii County (Big Island)' },
  { id: 'mn', label: 'Maui County' },
  { id: 'oa', label: 'Honolulu County (Oahu)' },
  { id: 'ka', label: 'Kauai County' },
];

export function defaultHcdpDate(period, now = new Date()) {
  const hawaii = new Date(now.valueOf() - 10 * 60 * 60 * 1000);
  if (period === 'month') {
    hawaii.setUTCDate(1);
    hawaii.setUTCMonth(hawaii.getUTCMonth() - 1);
    return hawaii.toISOString().slice(0, 7);
  }
  hawaii.setUTCDate(hawaii.getUTCDate() - 1);
  return hawaii.toISOString().slice(0, 10);
}

export function hcdpRequest(options) {
  const { datasetId, period, extent, date } = options;
  const dataset = HCDP_DATASETS.find((item) => item.id === datasetId);
  if (!dataset || !['day', 'month'].includes(period) || !HCDP_EXTENTS.some((item) => item.id === extent)) {
    throw new Error('Choose a valid HCDP variable, period, and extent.');
  }
  const pattern = period === 'month' ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
  const day = period === 'month' ? `${date}-01` : date;
  const parsed = new Date(`${day}T00:00:00Z`);
  if (!pattern.test(date) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== day) {
    throw new Error('Choose a valid date for the selected period.');
  }
  const params = new URLSearchParams({ location: 'hawaii', datatype: dataset.datatype, period, extent, date, type: 'data_map', returnEmptyNotFound: 'false' });
  if (dataset.production) params.set('production', dataset.production);
  if (dataset.aggregation) params.set('aggregation', dataset.aggregation);
  return { url: `${HCDP_API}/raster?${params}`, dataset, timestamp: `${day}T00:00:00-10:00` };
}

export async function fetchHcdpRaster(options, token, signal) {
  const request = hcdpRequest(options);
  const key = token.trim().replace(/^Bearer(?:\s+|$)/i, '');
  if (!key || /\s/.test(key)) throw new Error('Enter your HCDP API token.');
  const response = await fetch(request.url, {
    headers: { Authorization: `Bearer ${key}` },
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    signal,
  });
  if (!response.ok) {
    const messages = {
      401: 'HCDP rejected the token. Check it and try again.',
      403: 'This token does not have permission to access HCDP raster data.',
      404: 'No HCDP map is available for this variable, date, and extent. Try an earlier date or another extent.',
      429: 'HCDP request limit reached. Wait before trying again.',
    };
    throw new Error(messages[response.status] ?? `HCDP request failed (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error('HCDP returned an empty raster.');
  return { ...request, blob };
}

export function formatHcdpValue(datasetId, data) {
  const dataset = HCDP_DATASETS.find((item) => item.id === datasetId);
  if (!data || !Number.isFinite(data[0]) || (data.length > 1 && data.at(-1) === 0)) return 'No data';
  return `${data[0].toFixed(1)} ${dataset.units === 'C' ? '\u00b0C' : dataset.units}`;
}
