/** Pure validation for onboarding data; never trusts a submitted completion flag. */
type Profile = Record<string, unknown>;

export function validContactPhone(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const phone = value.trim();
  const digits = phone.replace(/\D/g, '');
  return /^\+?[\d\s().-]+$/.test(phone) && digits.length >= 7 && digits.length <= 15;
}

export function safeProfileURL(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || /[\s\u0000-\u001f\u007f]/.test(value.trim())) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

export function onboardingMissing(profile: Profile): string[] {
  const text = (field: string) => typeof profile[field] === 'string' ? (profile[field] as string).trim() : '';
  const missing: string[] = [];
  if (!text('name') || text('name').length > 80) missing.push('full name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text('email'))) missing.push('account email');
  if (!validContactPhone(profile.phone)) missing.push('contact phone');
  if (text('bio').length < 10 || text('bio').length > 500) missing.push('short bio (10–500 characters)');
  const kind = text('membershipType');
  if (!['student', 'alumni', 'professional', 'community', 'volunteer', 'committee'].includes(kind)) missing.push('membership type');
  if (kind === 'student' || kind === 'alumni') {
    if (!text('university')) missing.push('university');
  }
  if (kind === 'student') {
    if (!text('major')) missing.push('field of study');
    if (!Number.isInteger(profile.semester) || Number(profile.semester) < 1 || Number(profile.semester) > 13) missing.push('current semester');
  }
  if (kind === 'alumni' && (!Number.isInteger(profile.graduationYear) || Number(profile.graduationYear) < 1950 || Number(profile.graduationYear) > 2100)) missing.push('graduation year');
  for (const field of ['linkedin', 'instagram', 'facebook', 'website']) {
    if (profile[field] && !safeProfileURL(profile[field])) missing.push(`${field} HTTPS link`);
  }
  return missing;
}

export function isDirectoryOptOut(data: Profile): boolean {
  return data.directoryOptIn === false && Object.keys(data).every(key => ['directoryOptIn', 'publicFields'].includes(key));
}
