import { describe, expect, it } from 'vitest';
import { directFeatureInfoOptions } from '../src/direct-feature-info.js';

describe('direct feature info', () => {
  it('requests an inline HTML value page for exactly one active layer', () => {
    expect(directFeatureInfoOptions('gfs:Temperature')).toEqual({
      INFO_FORMAT: 'text/html',
      FEATURE_COUNT: 1,
      QUERY_LAYERS: 'gfs:Temperature',
      LAYERS: 'gfs:Temperature',
      STYLES: '',
      SLD_BODY: undefined,
    });
  });
});