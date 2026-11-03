import ImageLayer from 'ol/layer/Image.js';
import ImageStatic from 'ol/source/ImageStatic.js';
import { transformExtent } from 'ol/proj.js';

const COLOR_RAMPS = {
  temperature: [[250, '#2c7bb6'], [260, '#00a6ca'], [270, '#90eb9d'], [280, '#ffff8c'], [290, '#f9d057'], [300, '#e76818'], [310, '#d7191c']],
  precipitation: [[0, '#f7fbff'], [1, '#c6dbef'], [3, '#6baed6'], [8, '#2171b5'], [15, '#6a51a3'], [25, '#dd1c77']],
  wind: [[0, '#2c7bb6'], [2.2352, '#00a6ca'], [4.4704, '#00ccbc'], [8.9408, '#ffff8c'], [13.4112, '#f29e2e'], [17.8816, '#d7191c']],
};

function hexToRgb(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function interpolateColor(value, ramp) {
  if (value == null || Number.isNaN(value)) return [0, 0, 0, 0];
  const upperIndex = ramp.findIndex(([threshold]) => value <= threshold);
  if (upperIndex < 0) return [...hexToRgb(ramp.at(-1)[1]), 225];
  if (upperIndex === 0) return [...hexToRgb(ramp[0][1]), 205];
  const [lowValue, lowColor] = ramp[upperIndex - 1], [highValue, highColor] = ramp[upperIndex];
  const ratio = (value - lowValue) / (highValue - lowValue);
  const low = hexToRgb(lowColor), high = hexToRgb(highColor);
  return [...low.map((channel, index) => Math.round(channel + ((high[index] - channel) * ratio))), 215];
}

function fieldValues(grid, visualization) {
  if (visualization === 'wind-particles') {
    return grid.fields.u.values.map((u, index) => u == null || grid.fields.v.values[index] == null ? null : Math.hypot(u, grid.fields.v.values[index]));
  }
  return grid.fields[visualization].values;
}

export function renderGridImage(grid, visualization) {
  const canvas = document.createElement('canvas');
  canvas.width = grid.width;
  canvas.height = grid.height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(grid.width, grid.height);
  const ramp = COLOR_RAMPS[visualization === 'wind-particles' ? 'wind' : visualization];
  fieldValues(grid, visualization).forEach((value, index) => image.data.set(interpolateColor(value, ramp), index * 4));
  context.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

export function createNomadsLayer(metadata) {
  return new ImageLayer({ opacity: 0.72, extent: transformExtent(metadata.extent, 'EPSG:4326', 'EPSG:3857') });
}

export function updateNomadsLayer(layer, metadata, grid) {
  layer.setSource(new ImageStatic({
    url: renderGridImage(grid, metadata.visualization),
    imageExtent: transformExtent(grid.bounds, 'EPSG:4326', 'EPSG:3857'),
    projection: 'EPSG:3857',
    interpolate: true,
  }));
}

export function sampleGrid(grid, longitude, latitude, field) {
  const [west, south, east, north] = grid.bounds;
  if (longitude < west || longitude > east || latitude < south || latitude > north) return null;
  const x = (longitude - west) / grid.resolution;
  const y = (north - latitude) / grid.resolution;
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, grid.width - 1), y1 = Math.min(y0 + 1, grid.height - 1);
  const values = grid.fields[field].values;
  const corners = [values[(y0 * grid.width) + x0], values[(y0 * grid.width) + x1], values[(y1 * grid.width) + x0], values[(y1 * grid.width) + x1]];
  if (corners.some((value) => value == null)) return null;
  const dx = x - x0, dy = y - y0;
  return (corners[0] * (1 - dx) * (1 - dy)) + (corners[1] * dx * (1 - dy)) + (corners[2] * (1 - dx) * dy) + (corners[3] * dx * dy);
}

export function formatNomadsValue(metadata, grid, longitude, latitude) {
  if (metadata.visualization === 'wind-particles') {
    const u = sampleGrid(grid, longitude, latitude, 'u'), v = sampleGrid(grid, longitude, latitude, 'v');
    if (u == null || v == null) return 'No data';
    const mph = Math.hypot(u, v) * 2.236936;
    const direction = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
    return `${mph.toFixed(1)} mph · ${direction.toFixed(0)}°`;
  }
  const field = metadata.visualization;
  const value = sampleGrid(grid, longitude, latitude, field);
  if (value == null) return 'No data';
  if (field === 'temperature') return `${((value - 273.15) * 9 / 5 + 32).toFixed(1)} °F`;
  return `${(value / 25.4).toFixed(2)} in`;
}
