import { filterConusLayers } from './coverage.js';

const SUPPORTED_MODELS = new Map([
  ['wfas-fire', { label: 'WFAS Fire Danger', kind: 'Index' }],
  ['urma', { label: 'URMA', kind: 'Observation' }], ['rtma', { label: 'RTMA', kind: 'Observation' }],
  ['gfs', { label: 'GFS', kind: 'Forecast' }], ['ndfd', { label: 'NDFD', kind: 'Forecast' }],
  ['nbm', { label: 'NBM', kind: 'Forecast' }], ['gmao', { label: 'GMAO', kind: 'Forecast' }],
  ['icon', { label: 'ICON', kind: 'Forecast' }], ['cfs', { label: 'CFS', kind: 'Forecast' }],
  ['rap', { label: 'RAP', kind: 'Forecast' }],
]);

const FIRE_DANGER_LAYERS = new Set([
  'wfas:1000-hour Fuel Moisture',
  'gfs:BI_Percentile',
  'wfas:BI_Percentile_7Band',
  'wfas:BI_Percentiles',
  'gfs:ERC_Percentile',
  'wfas:ERC_Percentile_7Band',
  'wfas:ERC_Percentiles',
  'gfs:SFDI_Percentile',
  'wfas:Severe_Fire_Danger_Index',
  'wfas:erc0percnew',
]);

function asArray(value) { return value == null ? [] : Array.isArray(value) ? value : [value]; }
function textValue(value) { return typeof value === 'string' ? value : value?.['#text'] ?? ''; }
function getTimeDimension(layer) { return asArray(layer?.Dimension).find((dimension) => dimension?.name?.toLowerCase() === 'time'); }
function getLegendUrl(style) { return asArray(style?.LegendURL).map((legend) => legend?.OnlineResource?.href).find(Boolean) ?? null; }
function parseExtent(layer, parent) {
  const extent = layer.EX_GeographicBoundingBox ?? parent?.EX_GeographicBoundingBox;
  return extent ? [Number(extent.westBoundLongitude), Number(extent.southBoundLatitude), Number(extent.eastBoundLongitude), Number(extent.northBoundLatitude)] : null;
}

function parseLayer(layer, parent) {
  const name = textValue(layer.Name);
  const [workspace, localName] = name.split(':');
  const modelId = FIRE_DANGER_LAYERS.has(name) ? 'wfas-fire' : workspace?.toLowerCase();
  const model = SUPPORTED_MODELS.get(modelId);
  if (!model || !localName) return null;
  const timeDimension = getTimeDimension(layer) ?? getTimeDimension(parent);
  const styles = asArray(layer.Style).length ? asArray(layer.Style) : asArray(parent?.Style);
  return {
    id: name, title: textValue(layer.Title) || localName.replaceAll('_', ' '), variable: localName,
    model: modelId, modelLabel: model.label, modelKind: model.kind,
    times: textValue(timeDimension).split(',').map((time) => time.trim()).filter(Boolean),
    defaultTime: timeDimension?.default ?? null,
    styles: styles.map((style) => ({ name: textValue(style.Name), title: textValue(style.Title) || textValue(style.Name), legendUrl: getLegendUrl(style) })),
    extent: parseExtent(layer, parent), projections: asArray(layer.CRS ?? parent?.CRS).map(textValue).filter(Boolean),
  };
}

function candidateLayers(rootLayer) {
  const candidates = [];
  const visit = (layer, inherited, depth) => {
    const name = textValue(layer?.Name);
    if (depth === 1 || FIRE_DANGER_LAYERS.has(name)) candidates.push([layer, inherited]);
    const childInherited = {
      CRS: layer.CRS ?? inherited?.CRS,
      Dimension: layer.Dimension ?? inherited?.Dimension,
      EX_GeographicBoundingBox: layer.EX_GeographicBoundingBox ?? inherited?.EX_GeographicBoundingBox,
      Style: layer.Style ?? inherited?.Style,
    };
    asArray(layer?.Layer).forEach((child) => visit(child, childInherited, depth + 1));
  };
  asArray(rootLayer?.Layer).forEach((layer) => visit(layer, rootLayer, 1));
  return candidates;
}

export function parseCapabilities(document) {
  const root = document.WMS_Capabilities ?? document.WMT_MS_Capabilities;
  const layers = filterConusLayers(candidateLayers(root?.Capability?.Layer).map(([layer, parent]) => parseLayer(layer, parent)).filter(Boolean));
  if (layers.length === 0) throw new Error('WFAS capabilities did not contain any supported weather layers.');
  const advertisedModels = new Set(layers.map((layer) => layer.model));
  return { serviceTitle: textValue(root?.Service?.Title) || 'WFAS GeoServer', layers, models: [...SUPPORTED_MODELS].map(([id, metadata]) => ({ id, ...metadata, available: advertisedModels.has(id) })) };
}