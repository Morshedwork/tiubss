// A convenience username, never an authorization rule or a password check.
export function resolveLoginIdentifier(value) {
  const identifier = String(value || '').trim();
  if (identifier.toLowerCase() === 'admin') return 'farhanmorshedwork@gmail.com';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) throw new Error('Enter your email address or the username Admin.');
  return identifier;
}
