export const CONUS_EXTENT = [-125, 24, -66, 50];

export function intersectsConus(extent) {
  if (!Array.isArray(extent) || extent.length !== 4 || extent.some((value) => !Number.isFinite(value))) return false;
  const [west, south, east, north] = extent;
  return west < east && south < north && east >= CONUS_EXTENT[0] && west <= CONUS_EXTENT[2] && north >= CONUS_EXTENT[1] && south <= CONUS_EXTENT[3];
}

export function filterConusLayers(layers) {
  return layers.filter((layer) => intersectsConus(layer.extent));
}