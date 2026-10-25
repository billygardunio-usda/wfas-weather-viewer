export function directFeatureInfoOptions(layerId) {
  return {
    INFO_FORMAT: 'text/html',
    FEATURE_COUNT: 1,
    QUERY_LAYERS: layerId,
    LAYERS: layerId,
    STYLES: '',
    SLD_BODY: undefined,
  };
}