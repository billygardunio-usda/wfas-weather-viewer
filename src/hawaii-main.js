import Map from 'ol/Map.js';
import View from 'ol/View.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import OSM from 'ol/source/OSM.js';
import VectorSource from 'ol/source/Vector.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js';
import ScaleLine from 'ol/control/ScaleLine.js';
import { defaults as defaultControls } from 'ol/control/defaults.js';
import { defaultHcdpDate, formatHcdpValue, HCDP_DATASETS, HCDP_EXTENTS } from './hcdp.js';
import { buildSharedTimeline, layerHasTime, normalizeTimestamp } from './timeline.js';
import 'ol/ol.css';
import './style.css';
import './hawaii.css';

document.querySelector('#app').innerHTML = `
<main class="viewer hawaii-viewer">
  <header class="topbar"><div><p class="eyebrow">Hawaii Climate Data Portal data</p><h1>Hawaii Climate Explorer</h1></div><span class="connection">Personal API access</span></header>
  <aside class="sidebar" aria-label="Hawaii map controls">
    <section class="control-section">
      <div class="section-heading"><div><p class="section-kicker">Rainfall &amp; temperature</p><h2>Add climate map</h2></div></div>
      <form id="hcdp-form">
        <p class="hcdp-help">Dates use Hawaii Standard Time (UTC-10). Recent maps may not yet be published; daily rainfall is experimental.</p>
        <label for="hcdp-token">Your HCDP API token</label><input id="hcdp-token" type="password" autocomplete="off" spellcheck="false" required aria-describedby="hcdp-token-note">
        <p id="hcdp-token-note" class="hcdp-help">Sent only to HCDP over HTTPS. Not saved; reload or clear to forget.</p>
        <button id="hcdp-clear" type="button">Clear token</button>
        <label for="hcdp-variable">Variable</label><select id="hcdp-variable">${HCDP_DATASETS.map((item) => `<option value="${item.id}">${item.label}</option>`).join('')}</select>
        <label for="hcdp-period">Period</label><select id="hcdp-period"><option value="day">Daily</option><option value="month">Monthly</option></select>
        <label for="hcdp-date">Date (Hawaii time)</label><input id="hcdp-date" type="date" value="${defaultHcdpDate('day')}" required>
        <label for="hcdp-extent">Spatial extent</label><select id="hcdp-extent">${HCDP_EXTENTS.map((item) => `<option value="${item.id}">${item.label}</option>`).join('')}</select>
        <button id="hcdp-load" class="primary-action" type="submit">Add HCDP map</button>
        <p id="hcdp-status" class="hcdp-help" role="status" aria-live="polite">Enter your token to begin.</p>
      </form>
    </section>
    <section class="control-section layer-section">
      <div class="section-heading"><div><p class="section-kicker">Map stack</p><h2>Active layers</h2></div><output class="count-badge">0</output></div>
      <div id="layer-list" class="layer-list" aria-live="polite"></div>
    </section>
  </aside>
  <section class="map-panel" aria-label="Interactive Hawaii climate map">
    <div id="map" class="map"></div>
    <div class="map-note">Data: HCDP &middot; Click map for values</div>
    <aside id="inspector" class="inspector" aria-labelledby="inspector-title" hidden>
      <div class="inspector-heading"><h2 id="inspector-title">Map values</h2><button id="close-inspector" class="remove-button" type="button" aria-label="Close map values">&times;</button></div>
      <p id="inspector-location" class="inspector-location"></p><p id="inspector-time" class="inspector-time"></p><div id="inspector-results" class="inspector-results" aria-live="polite"></div>
    </aside>
  </section>
  <footer class="timeline" aria-label="Snapshot time controls">
    <div class="timeline-actions"><button id="previous-time" class="icon-button" aria-label="Previous snapshot" disabled>&larr;</button><button id="play-time" class="icon-button" aria-label="Play snapshots" disabled>&#9654;</button><button id="next-time" class="icon-button" aria-label="Next snapshot" disabled>&rarr;</button></div>
    <div class="timeline-status"><strong id="selected-time">No maps loaded</strong><small id="timeline-summary">Add dates to compare snapshots</small></div>
    <div class="timeline-range"><input id="time-slider" type="range" min="0" max="0" value="0" aria-label="Selected snapshot" disabled></div>
  </footer>
</main>`;

const $ = (selector) => document.querySelector(selector);
const token = $('#hcdp-token'), period = $('#hcdp-period'), date = $('#hcdp-date');
const status = $('#hcdp-status'), loadButton = $('#hcdp-load'), layerList = $('#layer-list');
const slider = $('#time-slider'), previous = $('#previous-time'), next = $('#next-time'), play = $('#play-time');
const selection = new VectorSource();
const map = new Map({
  target: 'map',
  controls: defaultControls().extend([new ScaleLine()]),
  layers: [
    new TileLayer({ source: new OSM(), zIndex: 0 }),
    new VectorLayer({ source: selection, zIndex: 1000, style: new Style({ image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#fff' }), stroke: new Stroke({ color: '#d75d38', width: 4 }) }) }) }),
  ],
  view: new View({ center: fromLonLat([-157.3, 20.8]), zoom: 7, minZoom: 2 }),
});
const layers = [];
let times = [], timeIndex = -1, controller, timer, selectedCoordinate;

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function setStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}

function renderLayers() {
  $('.count-badge').value = layers.length;
  layerList.innerHTML = layers.length ? layers.map(({ metadata, layer, userVisible }, index) => {
    const dataset = HCDP_DATASETS.find((item) => item.id === metadata.datasetId);
    const stops = dataset.ramp.map(([value, color]) => `${color} ${(value - dataset.ramp[0][0]) / (dataset.ramp.at(-1)[0] - dataset.ramp[0][0]) * 100}%`).join(',');
    return `<article class="layer-card${layerHasTime(metadata, times[timeIndex]) ? '' : ' unavailable'}" data-layer-id="${escapeHtml(metadata.id)}">
      <div class="layer-heading"><label class="visibility"><input data-action="visibility" type="checkbox" ${userVisible ? 'checked' : ''}><span><strong>${escapeHtml(metadata.title)}</strong><small>${escapeHtml(metadata.modelLabel)}</small></span></label><button class="remove-button" data-action="remove" aria-label="Remove ${escapeHtml(metadata.title)}">&times;</button></div>
      <div class="layer-controls"><label>Opacity <output>${Math.round(layer.getOpacity() * 100)}%</output><input data-action="opacity" type="range" min="0" max="100" value="${Math.round(layer.getOpacity() * 100)}"></label><div class="order-controls"><button class="icon-button small" data-action="up" aria-label="Move layer up" ${index === 0 ? 'disabled' : ''}>&uarr;</button><button class="icon-button small" data-action="down" aria-label="Move layer down" ${index === layers.length - 1 ? 'disabled' : ''}>&darr;</button></div></div>
      <div class="hcdp-legend"><strong>${dataset.label} (${dataset.units === 'C' ? '&deg;C' : 'mm'})</strong><div class="hcdp-ramp" style="background:linear-gradient(90deg,${stops})"></div><div class="hcdp-labels"><span>${dataset.ramp[0][0]}</span><span>${dataset.ramp.at(-1)[0]}+</span></div><small>Colors saturate at scale limits; click for native values.</small></div>
    </article>`;
  }).join('') : '<div class="empty-state"><strong>No climate maps yet</strong><span>Choose a variable and date to begin.</span></div>';
}

function closeInspector() {
  selectedCoordinate = null;
  selection.clear();
  $('#inspector').hidden = true;
}

function inspect(coordinate) {
  selectedCoordinate = coordinate;
  const [lon, lat] = toLonLat(coordinate);
  selection.clear();
  selection.addFeature(new Feature(new Point(coordinate)));
  $('#inspector').hidden = false;
  $('#inspector-location').textContent = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
  $('#inspector-time').textContent = $('#selected-time').textContent;
  const visible = layers.filter(({ layer }) => layer.getVisible());
  $('#inspector-results').innerHTML = visible.length ? visible.map(({ metadata, layer }) => `<article class="inspection-result"><strong>${escapeHtml(metadata.title)}</strong><span class="value">${escapeHtml(formatHcdpValue(metadata.datasetId, layer.getData(map.getPixelFromCoordinate(coordinate))))}</span></article>`).join('') : '<p class="inspection-message">No visible maps at this snapshot.</p>';
}

function selectTime(index) {
  timeIndex = Math.max(0, Math.min(index, times.length - 1));
  slider.value = timeIndex;
  const timestamp = times[timeIndex];
  $('#selected-time').textContent = timestamp ? `${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'Pacific/Honolulu' }).format(new Date(timestamp))} HST` : 'No maps loaded';
  layers.forEach(({ metadata, layer, userVisible }, order) => {
    layer.setZIndex(layers.length - order);
    layer.setVisible(userVisible && layerHasTime(metadata, timestamp));
  });
  renderLayers();
  if (selectedCoordinate) closeInspector();
}

function stopPlayback() {
  clearInterval(timer);
  timer = null;
  play.innerHTML = '&#9654;';
  play.ariaLabel = 'Play snapshots';
}

function rebuildTimeline(preferred = times[timeIndex]) {
  times = buildSharedTimeline(layers.map(({ metadata }) => metadata));
  [slider, previous, next, play].forEach((element) => { element.disabled = !times.length; });
  slider.max = Math.max(0, times.length - 1);
  $('#timeline-summary').textContent = times.length ? `${times.length} snapshots; maps are visible only at their selected period` : 'Add dates to compare snapshots';
  if (!times.length) stopPlayback();
  const index = times.indexOf(normalizeTimestamp(preferred));
  selectTime(index >= 0 ? index : times.length - 1);
}

period.addEventListener('change', () => {
  date.type = period.value === 'month' ? 'month' : 'date';
  date.value = defaultHcdpDate(period.value);
});
$('#hcdp-clear').addEventListener('click', () => {
  token.value = '';
  controller?.abort();
  setStatus('Token cleared. Loaded maps remain until removed or the page is reloaded.');
});
$('#hcdp-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (controller) return;
  const options = { datasetId: $('#hcdp-variable').value, period: period.value, extent: $('#hcdp-extent').value, date: date.value };
  const id = `hcdp:${options.datasetId}:${options.period}:${options.extent}:${options.date}`;
  if (layers.some(({ metadata }) => metadata.id === id)) { setStatus('This map is already in Active layers.'); return; }
  controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(90000)]);
  loadButton.disabled = true;
  setStatus('Downloading and reading HCDP GeoTIFF...');
  try {
    const { createHcdpLayer } = await import('./hcdp-layer.js');
    signal.throwIfAborted();
    const { metadata, layer, extent } = await createHcdpLayer(options, token.value, signal);
    layer.getSource().on('tileloaderror', () => setStatus('HCDP raster tiles could not be rendered. Remove and reload the map.', true));
    layers.unshift({ metadata, layer, userVisible: true });
    map.addLayer(layer);
    stopPlayback();
    rebuildTimeline(metadata.defaultTime);
    map.getView().fit(extent, { padding: [35, 35, 35, 35], maxZoom: 11 });
    setStatus('Map added. Click the map for native values. Add other dates to compare snapshots.');
  } catch (error) {
    if (error.name !== 'AbortError') setStatus(error.name === 'TimeoutError' ? 'HCDP request timed out. Try again.' : error instanceof TypeError ? 'Could not reach HCDP. Check your connection and browser cross-origin access.' : error.message, true);
  } finally {
    controller = null;
    loadButton.disabled = false;
  }
});

function entryFor(event) {
  return layers.find(({ metadata }) => metadata.id === event.target.closest('[data-layer-id]')?.dataset.layerId);
}
layerList.addEventListener('input', (event) => {
  const entry = entryFor(event);
  if (!entry || event.target.dataset.action !== 'opacity') return;
  entry.layer.setOpacity(Number(event.target.value) / 100);
  event.target.closest('label').querySelector('output').value = `${event.target.value}%`;
});
layerList.addEventListener('change', (event) => {
  const entry = entryFor(event);
  if (!entry || event.target.dataset.action !== 'visibility') return;
  entry.userVisible = event.target.checked;
  entry.layer.setVisible(entry.userVisible && layerHasTime(entry.metadata, times[timeIndex]));
  closeInspector();
});
layerList.addEventListener('click', (event) => {
  const action = event.target.closest('button')?.dataset.action, entry = entryFor(event);
  if (!entry || !action) return;
  const index = layers.indexOf(entry);
  if (action === 'remove') {
    map.removeLayer(entry.layer);
    entry.layer.getSource().dispose();
    entry.layer.dispose();
    layers.splice(index, 1);
    rebuildTimeline();
    return;
  }
  const target = action === 'up' ? index - 1 : action === 'down' ? index + 1 : -1;
  if (target < 0 || target >= layers.length) return;
  [layers[index], layers[target]] = [layers[target], layers[index]];
  selectTime(timeIndex);
});
slider.addEventListener('input', () => selectTime(Number(slider.value)));
previous.addEventListener('click', () => selectTime(timeIndex - 1));
next.addEventListener('click', () => selectTime(timeIndex + 1));
play.addEventListener('click', () => {
  if (timer) { stopPlayback(); return; }
  play.innerHTML = '&#10074;&#10074;';
  play.ariaLabel = 'Pause snapshots';
  timer = setInterval(() => selectTime((timeIndex + 1) % times.length), 1000);
});
map.on('singleclick', (event) => inspect(event.coordinate));
$('#close-inspector').addEventListener('click', closeInspector);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeInspector(); });
renderLayers();
