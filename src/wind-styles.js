const COLOR_MAP = `<ColorMap type="ramp">
<ColorMapEntry color="#2c7bb6" quantity="0" label="0 mph"/><ColorMapEntry color="#00a6ca" quantity="2.2352" label="5 mph"/>
<ColorMapEntry color="#00ccbc" quantity="4.4704" label="10 mph"/><ColorMapEntry color="#90eb9d" quantity="6.7056" label="15 mph"/>
<ColorMapEntry color="#ffff8c" quantity="8.9408" label="20 mph"/><ColorMapEntry color="#f9d057" quantity="11.176" label="25 mph"/>
<ColorMapEntry color="#f29e2e" quantity="13.4112" label="30 mph"/><ColorMapEntry color="#e76818" quantity="15.6464" label="35 mph"/>
<ColorMapEntry color="#d7191c" quantity="17.8816" label="40+ mph"/></ColorMap>`;
const SPEED_STYLE = `<NamedLayer><Name>__SPEED__</Name><UserStyle><FeatureTypeStyle><Rule><RasterSymbolizer><Opacity>0.86</Opacity>${COLOR_MAP}</RasterSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer>`;
const ARROW_STYLE = `<NamedLayer><Name>__DIRECTION__</Name><UserStyle><FeatureTypeStyle><Transformation><ogc:Function name="ras:RasterAsPointCollection"><ogc:Function name="parameter"><ogc:Literal>data</ogc:Literal></ogc:Function><ogc:Function name="parameter"><ogc:Literal>scale</ogc:Literal><ogc:Literal>0.08</ogc:Literal></ogc:Function></ogc:Function></Transformation><Rule><PointSymbolizer><Graphic><Mark><WellKnownName>shape://oarrow</WellKnownName><Stroke><CssParameter name="stroke">#17231c</CssParameter><CssParameter name="stroke-width">1.5</CssParameter></Stroke></Mark><Size>14</Size><Rotation><ogc:PropertyName>Band1</ogc:PropertyName></Rotation></Graphic></PointSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer>`;
const CONTOUR_STYLE = `<NamedLayer><Name>__SPEED__</Name><UserStyle><FeatureTypeStyle><Transformation><ogc:Function name="ras:Contour"><ogc:Function name="parameter"><ogc:Literal>data</ogc:Literal></ogc:Function><ogc:Function name="parameter"><ogc:Literal>levels</ogc:Literal><ogc:Literal>0</ogc:Literal><ogc:Literal>4.4704</ogc:Literal><ogc:Literal>8.9408</ogc:Literal><ogc:Literal>13.4112</ogc:Literal><ogc:Literal>17.8816</ogc:Literal><ogc:Literal>22.352</ogc:Literal></ogc:Function></ogc:Function></Transformation><Rule><LineSymbolizer><Stroke><CssParameter name="stroke">#17231c</CssParameter><CssParameter name="stroke-width">1.2</CssParameter></Stroke></LineSymbolizer><TextSymbolizer><Label><ogc:Mul><ogc:PropertyName>value</ogc:PropertyName><ogc:Literal>2.236936</ogc:Literal></ogc:Mul></Label><Font><CssParameter name="font-size">10</CssParameter></Font><LabelPlacement><LinePlacement/></LabelPlacement><Halo><Radius>1.5</Radius><Fill><CssParameter name="fill">#ffffff</CssParameter></Fill></Halo><Fill><CssParameter name="fill">#17231c</CssParameter></Fill></TextSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer>`;
const SLD_START = '<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc">';
const SLD_END = '</StyledLayerDescriptor>';

export const WIND_MODES = [{ id: 'shaded', label: 'Shaded wind speed' }, { id: 'arrows', label: 'Shaded speed + direction arrows' }, { id: 'isotachs', label: 'Speed contours (isotachs)' }];
export function isWindSpeed(layer) { return layer?.variable?.toLowerCase() === 'wind_speed'; }
export function getWindPresentation(layer, mode = 'shaded') {
  if (!isWindSpeed(layer)) return null;
  const directionLayer = `${layer.model}:Wind_direction`;
  const replaceLayers = (style) => style.replaceAll('__SPEED__', layer.id).replaceAll('__DIRECTION__', directionLayer);
  const styles = mode === 'isotachs' ? CONTOUR_STYLE : `${SPEED_STYLE}${mode === 'arrows' ? ARROW_STYLE : ''}`;
  return { mode, label: WIND_MODES.find((item) => item.id === mode)?.label ?? WIND_MODES[0].label, layers: mode === 'arrows' ? [layer.id, directionLayer] : [layer.id], sld: `${SLD_START}${replaceLayers(styles)}${SLD_END}`.replace(/\s+/g, ' ').trim() };
}