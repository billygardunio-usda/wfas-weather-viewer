import Feature from 'ol/Feature.js';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import ScaleLine from 'ol/control/ScaleLine.js';
import { defaults as defaultControls } from 'ol/control/defaults.js';
import Point from 'ol/geom/Point.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj.js';
import OSM from 'ol/source/OSM.js';
import TileWMS from 'ol/source/TileWMS.js';
import VectorSource from 'ol/source/Vector.js';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js';
import 'ol/ol.css';
import { CONUS_EXTENT } from './coverage.js';
import { buildProxyUrl, convertFeatureInfoValue, formatFeatureInfoValue, readFeatureInfoValue, resolveFeatureInfoProxy } from './feature-info.js';
import { buildSharedTimeline, classifyTimestamp, findNearestFutureIndex, layerHasTime } from './timeline.js';
import { getWindPresentation, isWindSpeed, WIND_MODES } from './wind-styles.js';
import './style.css';

document.querySelector('#app').innerHTML = `
<main class="viewer">
  <header class="topbar"><div><p class="eyebrow">Wildland Fire Assessment System</p><h1>Weather Viewer</h1></div><div class="connection" role="status"><span class="status-dot"></span><span>Preparing weather catalog</span></div></header>
  <aside class="sidebar" aria-label="Weather layer controls">
    <section class="control-section catalog-section">
      <div class="section-heading"><div><p class="section-kicker">Catalog</p><h2>Add weather layer</h2></div></div>
      <label for="model-select">Model</label><select id="model-select" disabled><option>Loading models...</option></select>
      <p id="model-time-status" class="model-time-status"></p>
      <label for="variable-select">Variable</label><select id="variable-select" disabled><option>Select a model first</option></select>
      <div id="wind-mode-control" hidden><label for="wind-mode-select">Wind visualization</label><select id="wind-mode-select">${WIND_MODES.map((mode) => `<option value="${mode.id}">${mode.label}</option>`).join('')}</select></div>
      <button id="add-layer" class="primary-action" type="button" disabled>Add layer</button>
    </section>
    <section class="control-section layer-section">
      <div class="section-heading"><div><p class="section-kicker">Map stack</p><h2>Active layers</h2></div><output class="count-badge">0</output></div>
      <div id="layer-list" class="layer-list" aria-live="polite"></div>
    </section>
  </aside>
  <section class="map-panel" aria-label="Interactive weather map">
    <div id="map" class="map"></div>
    <div class="map-note"><span>Weather data: WFAS GeoServer</span><span id="value-service-status" class="value-service-status">Values checking...</span></div>
    <aside id="inspector" class="inspector" aria-labelledby="inspector-title" hidden>
      <div class="inspector-heading"><div><p class="section-kicker">Selected location</p><h2 id="inspector-title">Map values</h2></div><button id="close-inspector" class="remove-button" type="button" aria-label="Close map values">&times;</button></div>
      <p id="inspector-location" class="inspector-location"></p><p id="inspector-time" class="inspector-time"></p><div id="inspector-results" class="inspector-results" aria-live="polite"></div>
    </aside>
  </section>
  <footer class="timeline" aria-label="Shared time controls">
    <div class="timeline-actions"><button id="previous-time" class="icon-button" aria-label="Previous time" disabled>&larr;</button><button id="play-time" class="icon-button" aria-label="Play timeline" disabled>&#9654;</button><button id="next-time" class="icon-button" aria-label="Next time" disabled>&rarr;</button></div>
    <div class="timeline-status"><span class="section-kicker">Shared timestamp</span><div class="timeline-selection"><strong id="selected-time">Waiting for layer data</strong><span id="time-kind" class="time-kind" hidden></span></div><small id="timeline-summary">Add a time-enabled layer</small></div>
    <div class="timeline-range"><input id="time-slider" type="range" min="0" max="0" value="0" aria-label="Selected timestamp" disabled><span id="now-marker" class="now-marker" hidden>Now</span></div>
  </footer>
</main>`;

const selectionSource = new VectorSource();
const map = new Map({
  target: 'map', controls: defaultControls().extend([new ScaleLine()]),
  layers: [new TileLayer({ source: new OSM(), zIndex: 0 }), new VectorLayer({ source: selectionSource, zIndex: 1000, style: new Style({ image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#fff' }), stroke: new Stroke({ color: '#d75d38', width: 4 }) }) }) })],
  view: new View({ center: fromLonLat([-98.5, 39.5]), zoom: 4, minZoom: 2 }),
});

const $ = (selector) => document.querySelector(selector);
const modelSelect=$('#model-select'), variableSelect=$('#variable-select'), windModeControl=$('#wind-mode-control'), windModeSelect=$('#wind-mode-select'), addButton=$('#add-layer');
const layerList=$('#layer-list'), layerCount=$('.count-badge'), connection=$('.connection'), modelTimeStatus=$('#model-time-status');
const previousButton=$('#previous-time'), playButton=$('#play-time'), nextButton=$('#next-time'), timeSlider=$('#time-slider'), selectedTime=$('#selected-time'), timeKind=$('#time-kind'), timelineSummary=$('#timeline-summary'), nowMarker=$('#now-marker');
const inspector=$('#inspector'), inspectorLocation=$('#inspector-location'), inspectorTime=$('#inspector-time'), inspectorResults=$('#inspector-results'), valueServiceStatus=$('#value-service-status');
const activeLayers=[]; const timeline={times:[],index:-1,timer:null}; let catalog; let featureInfoReady=false;
const featureInfoProxy=resolveFeatureInfoProxy(import.meta.env.VITE_FEATURE_INFO_PROXY ?? '',globalThis.location);

function escapeHtml(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function formatTimestamp(value){return new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(value));}
function formatDate(value){return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(value);}
function emptyLayers(){layerList.innerHTML='<div class="empty-state"><strong>No weather layers yet</strong><span>Choose a model and variable to begin.</span></div>';}

function updateModelStatus(modelId){
  const model=catalog?.models.find((item)=>item.id===modelId); const raw=[...new Set(catalog?.layers.filter((layer)=>layer.model===modelId).flatMap((layer)=>layer.times) ?? [])];
  const times=raw.map((time)=>new Date(time)).filter((time)=>!Number.isNaN(time.valueOf())).sort((a,b)=>a-b);
  if(!model?.available||!times.length){modelTimeStatus.textContent=model?.available?'No time dimension advertised':'Model is not currently advertised';return;}
  const future=times.filter((time)=>time>new Date()).length;
  modelTimeStatus.textContent=`${formatDate(times[0])} – ${formatDate(times.at(-1))} UTC${future?` · ${future.toLocaleString()} future times`:' · historical only'}`;
}
function renderVariables(modelId){
  const layers=catalog.layers.filter((layer)=>layer.model===modelId); variableSelect.innerHTML=layers.map((layer)=>`<option value="${escapeHtml(layer.id)}">${escapeHtml(layer.title)}</option>`).join('');
  variableSelect.disabled=!layers.length; addButton.disabled=!layers.length; updateWindMode(); updateModelStatus(modelId);
}
function updateWindMode(){windModeControl.hidden=!isWindSpeed(catalog?.layers.find((layer)=>layer.id===variableSelect.value));}
function syncOrder(){activeLayers.forEach(({layer},index)=>layer.setZIndex(100-index));}

function windLegend(presentation){
  if(!presentation)return '';
  return `<div class="wind-legend">${presentation.mode==='isotachs'?'<span class="wind-line"></span><span>10 mph contour intervals</span>':'<span class="wind-ramp"></span><span class="wind-labels"><b>0</b><b>10</b><b>20</b><b>30</b><b>40+ mph</b></span>'}${presentation.mode==='arrows'?'<span class="wind-arrow">→ direction</span>':''}</div>`;
}
function renderLayers(){
  layerCount.value=activeLayers.length; if(!activeLayers.length){emptyLayers();return;}
  layerList.innerHTML=activeLayers.map((entry,index)=>{
    const {metadata,layer,userVisible,hasData,windPresentation}=entry; const legend=windPresentation?null:metadata.styles.find((style)=>style.legendUrl)?.legendUrl;
    return `<article class="layer-card${hasData===false?' unavailable':''}" data-layer-id="${escapeHtml(metadata.id)}"><div class="layer-heading"><label class="visibility"><input data-action="visibility" type="checkbox" ${userVisible?'checked':''}><span><strong>${escapeHtml(metadata.title)}</strong><small>${metadata.modelLabel} · ${metadata.modelKind}${windPresentation?` · ${windPresentation.label}`:''}${hasData===false?' · No data at this time':''}</small></span></label><button class="remove-button" data-action="remove" aria-label="Remove ${escapeHtml(metadata.title)}">&times;</button></div><div class="layer-controls"><label>Opacity <output>${Math.round(layer.getOpacity()*100)}%</output><input data-action="opacity" type="range" min="0" max="100" value="${Math.round(layer.getOpacity()*100)}"></label><div class="order-controls"><button class="icon-button small" data-action="up" ${index===0?'disabled':''}>&uarr;</button><button class="icon-button small" data-action="down" ${index===activeLayers.length-1?'disabled':''}>&darr;</button></div></div>${windLegend(windPresentation)}${legend?`<div class="legend"><span>Legend</span><img src="${escapeHtml(legend)}" alt="Legend for ${escapeHtml(metadata.title)}"></div>`:''}</article>`;
  }).join('');
}

function stopPlayback(){if(timeline.timer)clearInterval(timeline.timer);timeline.timer=null;playButton.innerHTML='&#9654;';playButton.ariaLabel='Play timeline';}
function selectTime(index){
  if(!timeline.times.length)return; timeline.index=Math.max(0,Math.min(index,timeline.times.length-1)); const timestamp=timeline.times[timeline.index]; timeSlider.value=timeline.index; selectedTime.textContent=`${formatTimestamp(timestamp)} UTC`;
  const kind=classifyTimestamp(timestamp); timeKind.hidden=false;timeKind.textContent=kind;timeKind.className=`time-kind ${kind.toLowerCase()}`;
  activeLayers.forEach((entry)=>{entry.hasData=layerHasTime(entry.metadata,timestamp);entry.layer.setVisible(entry.userVisible&&entry.hasData);if(entry.hasData&&entry.metadata.times.length)entry.layer.getSource().updateParams({TIME:timestamp});});renderLayers();
}
function rebuildTimeline({preferFuture=false}={}){
  const previous=timeline.times[timeline.index];timeline.times=buildSharedTimeline(activeLayers.map((entry)=>entry.metadata));const exact=timeline.times.indexOf(previous);timeline.index=exact>=0?exact:timeline.times.length-1;const future=findNearestFutureIndex(timeline.times);if(preferFuture&&future>=0)timeline.index=future;
  const enabled=timeline.times.length>0;[timeSlider,previousButton,playButton,nextButton].forEach((control)=>control.disabled=!enabled);timeSlider.max=Math.max(0,timeline.times.length-1);
  nowMarker.hidden=!(future>=0&&timeline.times.length>1);if(!nowMarker.hidden)nowMarker.style.left=`${future/(timeline.times.length-1)*100}%`;
  const observations=activeLayers.filter((entry)=>entry.metadata.modelKind==='Observation').length, forecasts=activeLayers.filter((entry)=>entry.metadata.modelKind==='Forecast').length;
  timelineSummary.textContent=enabled?`${timeline.times.length.toLocaleString()} times · ${observations} observation · ${forecasts} forecast`:'Add a time-enabled layer';
  if(enabled)selectTime(timeline.index);else{stopPlayback();selectedTime.textContent='Waiting for layer data';timeKind.hidden=true;renderLayers();}
}

function addWeatherLayer(metadata,windMode='shaded'){
  if(!metadata||activeLayers.some((entry)=>entry.metadata.id===metadata.id))return;
  const presentation=getWindPresentation(metadata,windMode);const params={LAYERS:presentation?.layers.join(',')??metadata.id,TILED:true,FORMAT:'image/png',TRANSPARENT:true};if(presentation)params.SLD_BODY=presentation.sld;if(metadata.times.at(-1))params.TIME=metadata.times.at(-1);
  const source=new TileWMS({url:'https://wfas.firenet.gov/geoserver/wms',params,serverType:'geoserver',transition:0});const layer=new TileLayer({source,opacity:.72,extent:transformExtent(CONUS_EXTENT,'EPSG:4326','EPSG:3857')});
  source.on('tileloaderror',()=>{connection.classList.add('error');connection.innerHTML='<span class="status-dot"></span><span>Some WFAS tiles failed</span>';});
  activeLayers.unshift({metadata,layer,userVisible:true,hasData:true,windPresentation:presentation});map.addLayer(layer);syncOrder();rebuildTimeline({preferFuture:metadata.modelKind==='Forecast'});
}

function closeInspector(){inspector.hidden=true;selectionSource.clear();}
function inspectionRow(entry,state){
  const title=`${entry.metadata.modelLabel} · ${entry.metadata.title}`;
  if(state.status==='loading')return `<article class="inspection-result"><strong>${title}</strong><span>Loading value...</span></article>`;
  if(state.status==='error')return `<article class="inspection-result error"><strong>${title}</strong><span>${escapeHtml(state.message)}</span></article>`;
  if(state.value==null)return `<article class="inspection-result"><strong>${title}</strong><span>No data at this location</span></article>`;
  const display=convertFeatureInfoValue(entry.metadata.variable,state.value);return `<article class="inspection-result"><strong>${title}</strong><span class="value">${formatFeatureInfoValue(display.value)} <small>${display.unit}</small></span></article>`;
}
async function inspectMap(coordinate){
  const timestamp=timeline.times[timeline.index], visible=activeLayers.filter((entry)=>entry.userVisible&&entry.hasData), [lon,lat]=toLonLat(coordinate);selectionSource.clear();selectionSource.addFeature(new Feature(new Point(coordinate)));inspector.hidden=false;inspectorLocation.textContent=`${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;inspectorTime.textContent=timestamp?`${formatTimestamp(timestamp)} UTC`:'No timestamp selected';
  if(!visible.length){inspectorResults.innerHTML='<p class="inspection-message">No visible weather layers to inspect.</p>';return;}if(!featureInfoReady){inspectorResults.innerHTML='<p class="inspection-message">Layer values are unavailable. Coordinates and time remain available.</p>';return;}
  const states=visible.map(()=>({status:'loading'}));const render=()=>inspectorResults.innerHTML=visible.map((entry,index)=>inspectionRow(entry,states[index])).join('');render();
  await Promise.all(visible.map(async(entry,index)=>{try{const url=entry.layer.getSource().getFeatureInfoUrl(coordinate,map.getView().getResolution(),map.getView().getProjection(),{INFO_FORMAT:'application/json',FEATURE_COUNT:1,QUERY_LAYERS:entry.metadata.id,LAYERS:entry.metadata.id,STYLES:'',SLD_BODY:undefined});const response=await fetch(buildProxyUrl(featureInfoProxy,url));if(!response.ok)throw new Error(`Request failed (${response.status})`);states[index]={status:'ready',value:readFeatureInfoValue(await response.json())};}catch(error){states[index]={status:'error',message:error.message??'Value unavailable'};}render();}));
}
async function checkValueService(){
  if(!featureInfoProxy){valueServiceStatus.textContent='Values unavailable';valueServiceStatus.classList.add('unavailable');return;}try{const url=new URL(featureInfoProxy);url.searchParams.set('health','1');const response=await fetch(url);featureInfoReady=response.ok&&(await response.json()).status==='ready';}catch{featureInfoReady=false;}valueServiceStatus.textContent=featureInfoReady?'Values ready · click map':'Values unavailable';valueServiceStatus.className=`value-service-status ${featureInfoReady?'ready':'unavailable'}`;
}

addButton.addEventListener('click',()=>addWeatherLayer(catalog?.layers.find((layer)=>layer.id===variableSelect.value),windModeSelect.value));variableSelect.addEventListener('change',updateWindMode);
layerList.addEventListener('input',(event)=>{if(event.target.dataset.action!=='opacity')return;const entry=activeLayers.find((item)=>item.metadata.id===event.target.closest('[data-layer-id]')?.dataset.layerId);if(entry){entry.layer.setOpacity(Number(event.target.value)/100);event.target.closest('label').querySelector('output').value=`${event.target.value}%`;}});
layerList.addEventListener('change',(event)=>{if(event.target.dataset.action!=='visibility')return;const entry=activeLayers.find((item)=>item.metadata.id===event.target.closest('[data-layer-id]')?.dataset.layerId);if(entry){entry.userVisible=event.target.checked;entry.layer.setVisible(entry.userVisible&&entry.hasData);}});
layerList.addEventListener('click',(event)=>{const action=event.target.closest('button')?.dataset.action,id=event.target.closest('[data-layer-id]')?.dataset.layerId,index=activeLayers.findIndex((item)=>item.metadata.id===id);if(!action||index<0)return;if(action==='remove'){map.removeLayer(activeLayers[index].layer);activeLayers.splice(index,1);rebuildTimeline();return;}if(action==='up'&&index>0)[activeLayers[index-1],activeLayers[index]]=[activeLayers[index],activeLayers[index-1]];if(action==='down'&&index<activeLayers.length-1)[activeLayers[index+1],activeLayers[index]]=[activeLayers[index],activeLayers[index+1]];syncOrder();renderLayers();});
timeSlider.addEventListener('input',()=>selectTime(Number(timeSlider.value)));previousButton.addEventListener('click',()=>selectTime(timeline.index-1));nextButton.addEventListener('click',()=>selectTime(timeline.index+1));playButton.addEventListener('click',()=>{if(timeline.timer){stopPlayback();return;}playButton.innerHTML='&#10074;&#10074;';playButton.ariaLabel='Pause timeline';timeline.timer=setInterval(()=>selectTime((timeline.index+1)%timeline.times.length),900);});
map.on('singleclick',(event)=>inspectMap(event.coordinate));$('#close-inspector').addEventListener('click',closeInspector);document.addEventListener('keydown',(event)=>{if(event.key==='Escape')closeInspector();});

async function loadCatalog(){
  try{const response=await fetch('./catalog.json');if(!response.ok)throw new Error(`HTTP ${response.status}`);catalog=await response.json();const available=catalog.models.filter((model)=>model.available);modelSelect.innerHTML=catalog.models.map((model)=>`<option value="${model.id}" ${model.available?'':'disabled'}>${model.label} - ${model.available?model.kind:'not advertised'}</option>`).join('');modelSelect.disabled=!available.length;modelSelect.value=available.some((model)=>model.id==='urma')?'urma':available[0]?.id;renderVariables(modelSelect.value);modelSelect.addEventListener('change',()=>renderVariables(modelSelect.value));connection.classList.add('ready');connection.innerHTML=`<span class="status-dot"></span><span>${catalog.layers.length} layers ready</span>`;const initial=catalog.layers.find((layer)=>layer.model==='urma'&&layer.variable.toLowerCase()==='temperature')??catalog.layers.find((layer)=>layer.model==='urma');addWeatherLayer(initial);}catch(error){connection.classList.add('error');connection.innerHTML='<span class="status-dot"></span><span>Catalog unavailable</span>';emptyLayers();console.error(error);}
}
emptyLayers();loadCatalog();checkValueService();