import WebGLTileLayer from 'ol/layer/WebGLTile.js';
import GeoTIFF from 'ol/source/GeoTIFF.js';
import { transformExtent } from 'ol/proj.js';
import { fetchHcdpRaster, HCDP_EXTENTS } from './hcdp.js';

export async function createHcdpLayer(options, token, signal) {
  const { blob, dataset, timestamp } = await fetchHcdpRaster(options, token, signal);
  signal.throwIfAborted();
  const source = new GeoTIFF({ sources: [{ blob, bands: [1] }], normalize: false, interpolate: false });
  try {
    const view = await source.getView();
    signal.throwIfAborted();
    const extent = transformExtent(view.extent, view.projection, 'EPSG:3857');
    const layer = new WebGLTileLayer({
      source,
      opacity: 0.72,
      extent,
      style: { color: ['interpolate', ['linear'], ['band', 1], ...dataset.ramp.flat()] },
    });
    const extentLabel = HCDP_EXTENTS.find((item) => item.id === options.extent).label;
    return {
      layer,
      extent,
      metadata: {
        id: `hcdp:${options.datasetId}:${options.period}:${options.extent}:${options.date}`,
        title: `${dataset.label} (${dataset.units === 'C' ? '\u00b0C' : dataset.units}) - ${options.date}`,
        source: 'hcdp',
        sourceLabel: 'HCDP',
        modelLabel: `${options.period === 'day' ? 'Daily' : 'Monthly'} \u00b7 ${extentLabel}`,
        modelKind: 'Observation',
        datasetId: dataset.id,
        times: [timestamp],
        defaultTime: timestamp,
      },
    };
  } catch (error) {
    source.dispose();
    throw error;
  }
}
