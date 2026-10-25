import { app } from '@azure/functions';
import { handleWfasValues } from '../wfas-values-core.js';

app.http('wfas-values', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'wfas-values',
  handler: handleWfasValues,
});
