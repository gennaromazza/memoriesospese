export type SocialPlatform = 'instagram' | 'facebook' | 'twitter';

export function instagramHandle(value?: string): string {
  if (!value) return '';
  return value.trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '');
}

export function normalizeSocialUrl(platform: SocialPlatform, value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const username = trimmed.replace(/^@/, '');
  const base = platform === 'instagram'
    ? 'https://www.instagram.com/'
    : platform === 'facebook'
      ? 'https://www.facebook.com/'
      : 'https://x.com/';
  return `${base}${username}`;
}
