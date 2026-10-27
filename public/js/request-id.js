export function requestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // getRandomValues remains available in local HTTP previews. Never use Math.random for checkout IDs.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}
