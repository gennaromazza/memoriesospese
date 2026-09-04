export const IMAGE_EXPERIENCE_CONFIGURATOR_URL =
  'https://imagestudiofotografico.com/preventivo-rapido/pk0q0Jti6KQWzSsw';

const ALLOWED_ADV_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
] as const;

export function buildImageExperienceConfiguratorUrl(search: string): string {
  const incoming = new URLSearchParams(search);
  const kept = new URLSearchParams();

  ALLOWED_ADV_PARAMS.forEach((key) => {
    const value = incoming.get(key);
    if (value) kept.set(key, value);
  });

  const query = kept.toString();
  return query
    ? `${IMAGE_EXPERIENCE_CONFIGURATOR_URL}?${query}`
    : IMAGE_EXPERIENCE_CONFIGURATOR_URL;
}