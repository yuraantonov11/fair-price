import type { RuntimeFailure } from '@/types/runtime';

export function runtimeFailure(error: unknown, fallbackCode = 'REQUEST_FAILED'): RuntimeFailure {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const message = typeof value.message === 'string' ? value.message
    : typeof error === 'string' ? error : 'Request failed';
  const causeCode = typeof value.code === 'string' ? value.code : undefined;
  const status = typeof value.status === 'number' ? value.status : undefined;
  const config = /Supabase configuration|Supabase URL|Invalid URL/.test(message);
  const schema = causeCode === '42703' || causeCode === '42P01' || causeCode?.startsWith('PGRST20');
  const auth = status === 401 || status === 403 || causeCode === '42501' || causeCode === 'PGRST301';
  const network = value.name === 'AbortError' || value.name === 'TimeoutError'
    || /fetch|network|ENOTFOUND|ECONN|timeout|timed out/i.test(message);
  return {
    success: false,
    code: config ? 'SUPABASE_CONFIG_ERROR' : schema ? 'SCHEMA_MISMATCH' : auth ? 'ACCESS_DENIED' : network ? 'BACKEND_UNREACHABLE' : fallbackCode,
    error: message.replace(/Bearer\s+\S+|eyJ[\w-]+\.[\w-]+\.[\w-]+|sb_secret_[\w-]+/g, '[redacted]'),
    retryable: !config && !schema && !auth && (network || (status !== undefined && (status >= 500 || status === 429))),
    details: { causeCode, status },
  };
}
