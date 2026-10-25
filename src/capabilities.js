import { filterConusLayers } from './coverage.js';

const SUPPORTED_MODELS = new Map([
  ['urma', { label: 'URMA', kind: 'Observation' }], ['rtma', { label: 'RTMA', kind: 'Observation' }],
  ['gfs', { label: 'GFS', kind: 'Forecast' }], ['ndfd', { label: 'NDFD', kind: 'Forecast' }],
  ['nbm', { label: 'NBM', kind: 'Forecast' }], ['gmao', { label: 'GMAO', kind: 'Forecast' }],
  ['icon', { label: 'ICON', kind: 'Forecast' }], ['cfs', { label: 'CFS', kind: 'Forecast' }],
  ['rap', { label: 'RAP', kind: 'Forecast' }],
]);

function asArray(value) { return value == null ? [] : Array.isArray(value) ? value : [value]; }
function textValue(value) { return typeof value === 'string' ? value : value?.['#text'] ?? ''; }
function getTimeDimension(layer) { return asArray(layer.Dimension).find((dimension) => dimension?.name?.toLowerCase() === 'time'); }
function getLegendUrl(style) { return asArray(style?.LegendURL).map((legend) => legend?.OnlineResource?.href).find(Boolean) ?? null; }
function parseExtent(layer) {
  const extent = layer.EX_GeographicBoundingBox;
  return extent ? [Number(extent.westBoundLongitude), Number(extent.southBoundLatitude), Number(extent.eastBoundLongitude), Number(extent.northBoundLatitude)] : null;
}

function parseLayer(layer) {
  const [workspace, localName] = layer.Name.split(':');
  const model = SUPPORTED_MODELS.get(workspace.toLowerCase());
  if (!model || !localName) return null;
  const timeDimension = getTimeDimension(layer);
  return {
    id: layer.Name, title: textValue(layer.Title) || localName.replaceAll('_', ' '), variable: localName,
    model: workspace.toLowerCase(), modelLabel: model.label, modelKind: model.kind,
    times: textValue(timeDimension).split(',').map((time) => time.trim()).filter(Boolean),
    defaultTime: timeDimension?.default ?? null,
    styles: asArray(layer.Style).map((style) => ({ name: textValue(style.Name), title: textValue(style.Title) || textValue(style.Name), legendUrl: getLegendUrl(style) })),
    extent: parseExtent(layer), projections: asArray(layer.CRS).map(textValue).filter(Boolean),
  };
}

export function parseCapabilities(document) {
  const root = document.WMS_Capabilities ?? document.WMT_MS_Capabilities;
  const layers = filterConusLayers(asArray(root?.Capability?.Layer?.Layer).map(parseLayer).filter(Boolean));
  if (layers.length === 0) throw new Error('WFAS capabilities did not contain any supported weather layers.');
  const advertisedModels = new Set(layers.map((layer) => layer.model));
  return { serviceTitle: textValue(root?.Service?.Title) || 'WFAS GeoServer', layers, models: [...SUPPORTED_MODELS].map(([id, metadata]) => ({ id, ...metadata, available: advertisedModels.has(id) })) };
}