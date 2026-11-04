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
import { directFeatureInfoOptions } from './direct-feature-info.js';
import { assetForTime, createNomadsLayer, formatNomadsValue, updateNomadsLayer } from './nomads-grid.js';
import { buildSharedTimeline, classifyTimestamp, findNearestFutureIndex, layerHasTime } from './timeline.js';
import { WindParticles } from './wind-particles.js';
import { getWindPresentation, isWindSpeed, WIND_MODES } from './wind-styles.js';
import './style.css';

document.querySelector('#app').innerHTML = `
<main class="viewer">
  <header class="topbar"><div><p class="eyebrow">Wildland Fire Assessment System</p><h1>Weather Viewer</h1></div><div class="connection" role="status"><span class="status-dot"></span><span>Preparing weather catalog</span></div></header>
  <aside class="sidebar" aria-label="Weather layer controls">
    <section class="control-section catalog-section">
      <div class="section-heading"><div><p class="section-kicker">Catalog</p><h2>Add weather layer</h2></div></div>
      <label for="source-select">Data source</label><select id="source-select" disabled><option>Loading sources...</option></select>
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
    <div class="map-note"><span>Weather data: WFAS + NOMADS</span><span class="value-service-status ready">Values · click map</span></div>
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
const windParticles = new WindParticles(map, document.querySelector('.map-panel'));

const $ = (selector) => document.querySelector(selector);
const sourceSelect=$('#source-select'), modelSelect=$('#model-select'), variableSelect=$('#variable-select'), windModeControl=$('#wind-mode-control'), windModeSelect=$('#wind-mode-select'), addButton=$('#add-layer');
const layerList=$('#layer-list'), layerCount=$('.count-badge'), connection=$('.connection'), modelTimeStatus=$('#model-time-status');
const previousButton=$('#previous-time'), playButton=$('#play-time'), nextButton=$('#next-time'), timeSlider=$('#time-slider'), selectedTime=$('#selected-time'), timeKind=$('#time-kind'), timelineSummary=$('#timeline-summary'), nowMarker=$('#now-marker');
const inspector=$('#inspector'), inspectorLocation=$('#inspector-location'), inspectorTime=$('#inspector-time'), inspectorResults=$('#inspector-results');
const activeLayers=[]; const timeline={times:[],index:-1,timer:null}; const catalogs=new globalThis.Map(), gridCache=new globalThis.Map(); let catalog;

function escapeHtml(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function formatTimestamp(value){return new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(value));}
function formatDate(value){return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(value);}
function fireDayLabel(timestamp){
  if(!activeLayers.some((entry)=>entry.metadata.model==='wfas-fire'))return '';
  const today=new Date();today.setUTCHours(0,0,0,0);const selected=new Date(timestamp);selected.setUTCHours(0,0,0,0);const day=Math.round((selected-today)/(24*60*60*1000));
  return day>=0&&day<=6?` · Day ${day}${day===0?' (Today)':''}`:'';
}
function emptyLayers(){layerList.innerHTML='<div class="empty-state"><strong>No weather layers yet</strong><span>Choose a model and variable to begin.</span></div>';}

function updateModelStatus(modelId){
  const model=catalog?.models.find((item)=>item.id===modelId); const raw=[...new Set(catalog?.layers.filter((layer)=>layer.model===modelId).flatMap((layer)=>layer.times) ?? [])];
  const times=raw.map((time)=>new Date(time)).filter((time)=>!Number.isNaN(time.valueOf())).sort((a,b)=>a-b);
  if(!model?.available||!times.length){modelTimeStatus.textContent=model?.available?'No time dimension advertised':'Model is not currently advertised';return;}
  const future=times.filter((time)=>time>new Date()).length;
  modelTimeStatus.textContent=`${formatDate(times[0])} – ${formatDate(times.at(-1))} UTC${future?` · ${future.toLocaleString()} future times`:' · historical only'}`;
}
function renderModels(){
  catalog=catalogs.get(sourceSelect.value);const available=catalog?.models.filter((model)=>model.available)??[];
  modelSelect.innerHTML=(catalog?.models??[]).map((model)=>`<option value="${model.id}" ${model.available?'':'disabled'}>${model.label} - ${model.available?model.kind:'not available'}</option>`).join('');
  modelSelect.disabled=!available.length;modelSelect.value=available[0]?.id??'';renderVariables(modelSelect.value);
}
function renderVariables(modelId){
  const layers=catalog.layers.filter((layer)=>layer.model===modelId); variableSelect.innerHTML=layers.map((layer)=>`<option value="${escapeHtml(layer.id)}">${escapeHtml(layer.title)}</option>`).join('');
  variableSelect.disabled=!layers.length; addButton.disabled=!layers.length; updateWindMode(); updateModelStatus(modelId);
}
function updateWindMode(){const layer=catalog?.layers.find((item)=>item.id===variableSelect.value);windModeControl.hidden=!(layer?.source==='wfas'&&isWindSpeed(layer));}
function syncOrder(){activeLayers.forEach(({layer},index)=>layer.setZIndex(100-index));}
function syncParticleGrid(){const entry=activeLayers.find((item)=>item.userVisible&&item.hasData&&item.metadata.visualization==='wind-particles'&&item.grid);windParticles.setGrid(entry?.grid??null);}

function windLegend(presentation){
  if(!presentation)return '';
  if(presentation.mode==='animated')return '<div class="wind-legend"><span class="wind-particle-key">•••</span><span>Animated particles show wind flow</span><span class="wind-ramp"></span><span class="wind-labels"><b>0</b><b>10</b><b>20</b><b>30</b><b>40+ mph</b></span></div>';
  return `<div class="wind-legend">${presentation.mode==='isotachs'?'<span class="wind-line"></span><span>10 mph contour intervals</span>':'<span class="wind-ramp"></span><span class="wind-labels"><b>0</b><b>10</b><b>20</b><b>30</b><b>40+ mph</b></span>'}${presentation.mode==='arrows'?'<span class="wind-arrow">→ direction</span>':''}</div>`;
}
function renderLayers(){
  layerCount.value=activeLayers.length; if(!activeLayers.length){emptyLayers();return;}
  layerList.innerHTML=activeLayers.map((entry,index)=>{
    const {metadata,layer,userVisible,hasData,windPresentation}=entry; const legend=windPresentation?null:metadata.styles?.find((style)=>style.legendUrl)?.legendUrl;
    return `<article class="layer-card${hasData===false?' unavailable':''}" data-layer-id="${escapeHtml(metadata.id)}"><div class="layer-heading"><label class="visibility"><input data-action="visibility" type="checkbox" ${userVisible?'checked':''}><span><strong>${escapeHtml(metadata.title)}</strong><small>${metadata.sourceLabel} · ${metadata.modelLabel} · ${metadata.modelKind}${windPresentation?` · ${windPresentation.label}`:''}${hasData===false?' · No data at this time':''}</small></span></label><button class="remove-button" data-action="remove" aria-label="Remove ${escapeHtml(metadata.title)}">&times;</button></div><div class="layer-controls"><label>Opacity <output>${Math.round(layer.getOpacity()*100)}%</output><input data-action="opacity" type="range" min="0" max="100" value="${Math.round(layer.getOpacity()*100)}"></label><div class="order-controls"><button class="icon-button small" data-action="up" ${index===0?'disabled':''}>&uarr;</button><button class="icon-button small" data-action="down" ${index===activeLayers.length-1?'disabled':''}>&darr;</button></div></div>${windLegend(windPresentation)}${legend?`<div class="legend"><span>Legend</span><img src="${escapeHtml(legend)}" alt="Legend for ${escapeHtml(metadata.title)}"></div>`:''}</article>`;
  }).join('');
}

function stopPlayback(){if(timeline.timer)clearInterval(timeline.timer);timeline.timer=null;playButton.innerHTML='&#9654;';playButton.ariaLabel='Play timeline';}
async function loadStaticGrid(entry,timestamp){
  const asset=assetForTime(entry.metadata,timestamp);if(!asset)return;
  const requestId=(entry.requestId??0)+1;entry.requestId=requestId;
  try{
    let grid=gridCache.get(asset);if(!grid){const response=await fetch(asset);if(!response.ok)throw new Error(`HTTP ${response.status}`);grid=await response.json();gridCache.set(asset,grid);}
    if(entry.requestId!==requestId||assetForTime(entry.metadata,timeline.times[timeline.index])!==asset)return;
    entry.grid=grid;entry.gridAsset=asset;updateNomadsLayer(entry.layer,entry.metadata,grid);syncParticleGrid();
  }catch(error){connection.classList.add('error');connection.innerHTML='<span class="status-dot"></span><span>Static grid unavailable</span>';console.error(error);}
}
function selectTime(index){
  if(!timeline.times.length)return; timeline.index=Math.max(0,Math.min(index,timeline.times.length-1)); const timestamp=timeline.times[timeline.index]; timeSlider.value=timeline.index; selectedTime.textContent=`${formatTimestamp(timestamp)} UTC${fireDayLabel(timestamp)}`;
  const kind=classifyTimestamp(timestamp); timeKind.hidden=false;timeKind.textContent=kind;timeKind.className=`time-kind ${kind.toLowerCase()}`;
  activeLayers.forEach((entry)=>{entry.hasData=layerHasTime(entry.metadata,timestamp);entry.layer.setVisible(entry.userVisible&&entry.hasData);if(entry.hasData&&entry.metadata.source==='wfas'&&entry.metadata.times.length)entry.layer.getSource().updateParams({TIME:timestamp});if(entry.hasData&&entry.metadata.source!=='wfas'){const asset=assetForTime(entry.metadata,timestamp);if(entry.gridAsset!==asset){entry.grid=null;entry.gridAsset=asset;entry.layer.setSource(null);}loadStaticGrid(entry,timestamp);}});syncParticleGrid();renderLayers();
}
function rebuildTimeline({preferFuture=false,preferTimestamp=null}={}){
  const previous=timeline.times[timeline.index];timeline.times=buildSharedTimeline(activeLayers.map((entry)=>entry.metadata));const exact=timeline.times.indexOf(previous),preferred=timeline.times.findIndex((time)=>new Date(time).valueOf()===new Date(preferTimestamp).valueOf());timeline.index=preferred>=0?preferred:exact>=0?exact:timeline.times.length-1;const future=findNearestFutureIndex(timeline.times);if(preferred<0&&preferFuture&&future>=0)timeline.index=future;
  const enabled=timeline.times.length>0;[timeSlider,previousButton,playButton,nextButton].forEach((control)=>control.disabled=!enabled);timeSlider.max=Math.max(0,timeline.times.length-1);
  nowMarker.hidden=!(future>=0&&timeline.times.length>1);if(!nowMarker.hidden)nowMarker.style.left=`${future/(timeline.times.length-1)*100}%`;
  const observations=activeLayers.filter((entry)=>entry.metadata.modelKind==='Observation').length, forecasts=activeLayers.filter((entry)=>entry.metadata.modelKind==='Forecast').length;
  timelineSummary.textContent=enabled?`${timeline.times.length.toLocaleString()} times · ${observations} observation · ${forecasts} forecast`:'Add a time-enabled layer';
  if(enabled)selectTime(timeline.index);else{stopPlayback();selectedTime.textContent='Waiting for layer data';timeKind.hidden=true;renderLayers();}
}

function addWeatherLayer(metadata,windMode='shaded'){
  if(!metadata||activeLayers.some((entry)=>entry.metadata.id===metadata.id))return;
  const presentation=metadata.source==='nomads'&&metadata.visualization==='wind-particles'?{mode:'animated',label:'Animated particles'}:getWindPresentation(metadata,windMode);
  let layer;
  if(metadata.source!=='wfas')layer=createNomadsLayer(metadata);
  else{const params={LAYERS:presentation?.layers.join(',')??metadata.id,TILED:true,FORMAT:'image/png',TRANSPARENT:true};if(presentation)params.SLD_BODY=presentation.sld;if(metadata.times.at(-1))params.TIME=metadata.times.at(-1);const source=new TileWMS({url:'https://wfas.firenet.gov/geoserver/wms',params,serverType:'geoserver',transition:0});layer=new TileLayer({source,opacity:.72,extent:transformExtent(CONUS_EXTENT,'EPSG:4326','EPSG:3857')});source.on('tileloaderror',()=>{connection.classList.add('error');connection.innerHTML='<span class="status-dot"></span><span>Some WFAS tiles failed</span>';});}
  activeLayers.unshift({metadata,layer,userVisible:true,hasData:true,windPresentation:presentation});map.addLayer(layer);syncOrder();rebuildTimeline({preferFuture:metadata.modelKind==='Forecast',preferTimestamp:metadata.defaultTime});
}

function closeInspector(){inspector.hidden=true;selectionSource.clear();}
function inspectMap(coordinate){
  const timestamp=timeline.times[timeline.index], visible=activeLayers.filter((entry)=>entry.userVisible&&entry.hasData), [lon,lat]=toLonLat(coordinate);selectionSource.clear();selectionSource.addFeature(new Feature(new Point(coordinate)));inspector.hidden=false;inspectorLocation.textContent=`${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;inspectorTime.textContent=timestamp?`${formatTimestamp(timestamp)} UTC`:'No timestamp selected';
  if(!visible.length){inspectorResults.innerHTML='<p class="inspection-message">No visible weather layers to inspect.</p>';return;}
  inspectorResults.innerHTML=visible.map((entry)=>{
    const title=`${entry.metadata.modelLabel} · ${entry.metadata.title}`;
    if(entry.metadata.source!=='wfas')return `<article class="inspection-result"><strong>${escapeHtml(title)}</strong><span class="value">${escapeHtml(entry.grid?formatNomadsValue(entry.metadata,entry.grid,lon,lat):'Loading…')}</span></article>`;
    const url=entry.layer.getSource().getFeatureInfoUrl(coordinate,map.getView().getResolution(),map.getView().getProjection(),directFeatureInfoOptions(entry.metadata.id));
    return `<article class="inspection-result"><strong>${escapeHtml(title)}</strong><a class="value-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open WFAS value ↗</a></article>`;
  }).join('');
}

addButton.addEventListener('click',()=>addWeatherLayer(catalog?.layers.find((layer)=>layer.id===variableSelect.value),windModeSelect.value));variableSelect.addEventListener('change',updateWindMode);
layerList.addEventListener('input',(event)=>{if(event.target.dataset.action!=='opacity')return;const entry=activeLayers.find((item)=>item.metadata.id===event.target.closest('[data-layer-id]')?.dataset.layerId);if(entry){entry.layer.setOpacity(Number(event.target.value)/100);event.target.closest('label').querySelector('output').value=`${event.target.value}%`;}});
layerList.addEventListener('change',(event)=>{if(event.target.dataset.action!=='visibility')return;const entry=activeLayers.find((item)=>item.metadata.id===event.target.closest('[data-layer-id]')?.dataset.layerId);if(entry){entry.userVisible=event.target.checked;entry.layer.setVisible(entry.userVisible&&entry.hasData);syncParticleGrid();}});
layerList.addEventListener('click',(event)=>{const action=event.target.closest('button')?.dataset.action,id=event.target.closest('[data-layer-id]')?.dataset.layerId,index=activeLayers.findIndex((item)=>item.metadata.id===id);if(!action||index<0)return;if(action==='remove'){map.removeLayer(activeLayers[index].layer);activeLayers.splice(index,1);rebuildTimeline();syncParticleGrid();return;}if(action==='up'&&index>0)[activeLayers[index-1],activeLayers[index]]=[activeLayers[index],activeLayers[index-1]];if(action==='down'&&index<activeLayers.length-1)[activeLayers[index+1],activeLayers[index]]=[activeLayers[index],activeLayers[index+1]];syncOrder();syncParticleGrid();renderLayers();});
timeSlider.addEventListener('input',()=>selectTime(Number(timeSlider.value)));previousButton.addEventListener('click',()=>selectTime(timeline.index-1));nextButton.addEventListener('click',()=>selectTime(timeline.index+1));playButton.addEventListener('click',()=>{if(timeline.timer){stopPlayback();return;}playButton.innerHTML='&#10074;&#10074;';playButton.ariaLabel='Pause timeline';timeline.timer=setInterval(()=>selectTime((timeline.index+1)%timeline.times.length),900);});
map.on('singleclick',(event)=>inspectMap(event.coordinate));$('#close-inspector').addEventListener('click',closeInspector);document.addEventListener('keydown',(event)=>{if(event.key==='Escape')closeInspector();});

async function loadCatalog(){
  try{
    const [wfasResponse,nomadsResponse,urmaDailyResponse]=await Promise.all([fetch('./catalog.json'),fetch('./nomads/catalog.json'),fetch('./urma-daily/catalog.json')]);if(!wfasResponse.ok)throw new Error(`WFAS catalog HTTP ${wfasResponse.status}`);
    const wfas=await wfasResponse.json();wfas.source={id:'wfas',label:'WFAS gridded'};wfas.layers=wfas.layers.map((layer)=>({...layer,source:'wfas',sourceLabel:'WFAS'}));catalogs.set('wfas',wfas);
    if(nomadsResponse.ok){const nomads=await nomadsResponse.json();nomads.layers=nomads.layers.map((layer)=>({...layer,source:'nomads',sourceLabel:'NOMADS'}));catalogs.set('nomads',nomads);}
    if(urmaDailyResponse.ok){const urmaDaily=await urmaDailyResponse.json();urmaDaily.layers=urmaDaily.layers.map((layer)=>({...layer,source:'urma-daily',sourceLabel:'WFAS derived'}));catalogs.set('urma-daily',urmaDaily);}
    sourceSelect.innerHTML=[...catalogs].map(([id,item])=>`<option value="${id}" ${item.layers.length?'':'disabled'}>${item.source.label}${item.layers.length?'':' - awaiting refresh'}</option>`).join('');sourceSelect.disabled=false;sourceSelect.value='wfas';renderModels();
    sourceSelect.addEventListener('change',renderModels);modelSelect.addEventListener('change',()=>renderVariables(modelSelect.value));
    const layerCount=[...catalogs.values()].reduce((total,item)=>total+item.layers.length,0);connection.classList.add('ready');connection.innerHTML=`<span class="status-dot"></span><span>${layerCount} layers ready</span>`;
    const initial=wfas.layers.find((layer)=>layer.model==='urma'&&layer.variable.toLowerCase()==='temperature')??wfas.layers.find((layer)=>layer.model==='urma');addWeatherLayer(initial);
  }catch(error){connection.classList.add('error');connection.innerHTML='<span class="status-dot"></span><span>Catalog unavailable</span>';emptyLayers();console.error(error);}
}
emptyLayers();loadCatalog();