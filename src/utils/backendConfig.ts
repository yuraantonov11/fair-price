/** Publishable keys are bundled in the extension. Privileged keys must never be. */
export function isPublicBackendKey(key: string): boolean {
  if (!key || key.startsWith('sb_secret_')) return false;
  if (key.startsWith('eyJ')) {
    try {
      const payload = key.split('.')[1];
      if (!payload) return false;
      return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon';
    } catch { return false; }
  }
  return true; // Publishable opaque keys and explicit local-test placeholders.
}
