/** Curated reel links only. This helper does not fetch or synchronize a feed. */
export const REEL_CATEGORIES = Object.freeze(['Community', 'Gatherings', 'Food & mela', 'Bangladesh × Japan']);

export function normalizeInstagramReelURL(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  const input = value.trim();
  if (!input || /[\s\\]/.test(input)) return '';
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.username || url.password || url.port) return '';
    const match = url.pathname.match(/^\/reels?\/([A-Za-z0-9_-]{5,64})\/?$/);
    return match ? `https://www.instagram.com/reel/${match[1]}/` : '';
  } catch { return ''; }
}
