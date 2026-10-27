/** A saved choice always wins over a sign-in provider's default picture. */
export function safePhotoURL(value) {
  if (typeof value !== 'string' || value.length > 2000 || /\s/.test(value)) return '';
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}

export function googlePhotoURL(user) {
  const google = Array.isArray(user?.providerData) ? user.providerData.find(provider => provider.providerId === 'google.com') : null;
  return safePhotoURL(google?.photoURL);
}

export function resolveProfilePhoto(profile = {}, user = null) {
  const hasURL = Object.hasOwn(profile, 'photoURL');
  const hasAvatar = Object.hasOwn(profile, 'avatar');
  const saved = safePhotoURL(hasURL ? profile.photoURL : profile.avatar);
  const google = googlePhotoURL(user);
  let photoSource = profile.photoSource, photoURL = saved;
  if (photoSource === 'none') photoURL = '';
  else if (photoSource === 'google') photoURL = google || saved;
  else if (photoSource !== 'custom') {
    // An explicit legacy empty string may be a prior removal. Respect it.
    if (hasURL || hasAvatar) photoSource = saved ? 'custom' : 'none';
    else if (google) { photoSource = 'google'; photoURL = google; }
    else { photoURL = safePhotoURL(user?.photoURL); photoSource = photoURL ? 'custom' : ''; }
  }
  return { photoURL, avatar: photoURL, photoSource };
}

export function mergeGoogleSignupDraft(draft, user) {
  const profile = { ...draft?.profile };
  if (!draft?.photo && !['google', 'custom', 'none'].includes(profile.photoSource) && !profile.photoURL && !profile.avatar) {
    delete profile.photoURL; delete profile.avatar;
  }
  const photo = resolveProfilePhoto(profile, user);
  return { ...draft, profile: { ...profile, ...photo, ...(draft?.photo ? {photoSource: 'custom'} : {}), name: profile.name || user?.displayName || '', email: user?.email || profile.email || '' } };
}
