// A convenience username, never an authorization rule or a password check.
export const ADMIN_LOGIN_EMAIL = 'tiu.bss.admin@gmail.com';

export function resolveLoginIdentifier(value) {
  const identifier = String(value || '').trim();
  if (identifier.toLowerCase() === 'admin') return ADMIN_LOGIN_EMAIL;
  throw new Error('Enter your administrator username.');
}
