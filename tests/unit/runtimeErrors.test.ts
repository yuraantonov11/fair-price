import { describe, expect, it } from 'vitest';
import { runtimeFailure } from '@/utils/runtimeErrors';
import { canonicalProductUrl, validateProduct } from '@/utils/productValidation';
import { isPublicBackendKey } from '@/utils/backendConfig';

describe('runtime diagnostics', () => {
  it('refuses to expose privileged keys in a client build', () => {
    const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role }))}.signature`;
    expect(isPublicBackendKey(jwt('anon'))).toBe(true);
    expect(isPublicBackendKey(jwt('service_role'))).toBe(false);
    expect(isPublicBackendKey('sb_secret_private')).toBe(false);
    expect(isPublicBackendKey('sb_publishable_public')).toBe(true);
  });
  it.each(['42703', '42P01', 'PGRST202', 'PGRST203'])('preserves schema error %s without retrying', code => {
    const result = runtimeFailure({ code, message: 'Missing schema object', status: 400 });
    expect(result).toMatchObject({ error: 'Missing schema object', code: 'SCHEMA_MISMATCH', retryable: false, details: { causeCode: code, status: 400 } });
  });
  it.each([401, 403])('does not retry access failure %s', status => {
    expect(runtimeFailure({ status, message: 'Denied' })).toMatchObject({ code: 'ACCESS_DENIED', retryable: false });
  });
  it('retries network, timeout and server errors, redacting credentials', () => {
    expect(runtimeFailure(new TypeError('fetch failed: ENOTFOUND')).retryable).toBe(true);
    expect(runtimeFailure({ name: 'TimeoutError', message: 'timed out' }).retryable).toBe(true);
    expect(runtimeFailure({ status: 503, message: 'unavailable' }).retryable).toBe(true);
    expect(runtimeFailure(new Error('Bearer super-secret')).error).not.toContain('super-secret');
  });
  it('canonicalizes product identity and rejects unsupported hosts and malformed prices', () => {
    expect(canonicalProductUrl('https://www.dnipro-m.ua/tovar/drill?session=secret#tab')).toBe('https://dnipro-m.ua/tovar/drill/');
    expect(() => canonicalProductUrl('https://rozetka.com.ua.attacker.test/p123/')).toThrow();
    expect(() => validateProduct({ price: Infinity } as never)).toThrow();
  });
});
