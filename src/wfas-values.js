export class WfasValuesError extends Error {
  constructor(message, code = 'request_failed') {
    super(message);
    this.code = code;
  }
}

export async function requestWfasValue(input, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl('/api/wfas-values', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    throw new WfasValuesError('The value service is unavailable.');
  }
  if (response.status === 401 || response.status === 403 || response.redirected || response.url?.includes('/.auth/login/')) {
    throw new WfasValuesError('Sign in is required to inspect WFAS values.', 'authentication_required');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new WfasValuesError('The value service returned an invalid response.', 'invalid_response');
  }
  if (!response.ok || payload?.ok !== true) {
    const messages = {
      upstream_timeout: 'WFAS did not respond in time. Try again.',
      upstream_failure: 'WFAS could not provide this value. Try again.',
      invalid_upstream_response: 'WFAS returned an invalid value response.',
      invalid_request: 'This map value request was not valid.',
    };
    throw new WfasValuesError(messages[payload?.error?.code] ?? 'The value service could not complete this request.', payload?.error?.code);
  }
  const validValue = payload?.value === null || ['string', 'number', 'boolean'].includes(typeof payload?.value);
  if (!Object.hasOwn(payload, 'value') || !validValue || (typeof payload.value === 'number' && !Number.isFinite(payload.value))) {
    throw new WfasValuesError('The value service returned an invalid response.', 'invalid_response');
  }
  return payload;
}

export function formatWfasValue(value) {
  if (value === null) return 'No value';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : 'No value';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
