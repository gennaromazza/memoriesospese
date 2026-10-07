/**
 * Origini consentite per le cerimonie WebAuthn.
 *
 * L'origin viene sempre confrontato con una allow-list costruita lato server:
 * il dominio di produzione, i domini Replit dell'ambiente corrente e
 * l'eventuale variabile `ADMIN_PASSKEY_ALLOWED_ORIGINS` (lista separata da
 * virgole). L'RP ID è l'host senza il prefisso `www.` così che la stessa
 * passkey funzioni su apex e www.
 */

const PRODUCTION_ORIGINS = [
  'https://imagestudiofotografico.com',
  'https://www.imagestudiofotografico.com',
];

export function isProductionPasskeyOrigin(origin: string): boolean {
  return PRODUCTION_ORIGINS.includes(origin);
}

export interface ResolvedRelyingParty {
  origin: string;
  rpId: string;
}

export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const origins = new Set<string>(PRODUCTION_ORIGINS);
  for (const raw of (env.ADMIN_PASSKEY_ALLOWED_ORIGINS ?? '').split(',')) {
    const trimmed = raw.trim();
    if (trimmed) origins.add(trimmed.replace(/\/$/, ''));
  }
  if (env.REPLIT_DEV_DOMAIN) origins.add(`https://${env.REPLIT_DEV_DOMAIN}`);
  for (const domain of (env.REPLIT_DOMAINS ?? '').split(',')) {
    const trimmed = domain.trim();
    if (trimmed) origins.add(`https://${trimmed}`);
  }
  if (env.NODE_ENV !== 'production') {
    origins.add('http://localhost:5173');
    origins.add('http://localhost:5000');
  }
  return origins;
}

export function rpIdForOrigin(origin: string): string {
  const host = new URL(origin).hostname;
  return host.startsWith('www.') ? host.slice(4) : host;
}

export function resolveRelyingParty(
  originHeader: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedRelyingParty | null {
  if (!originHeader) return null;
  const origin = originHeader.trim().replace(/\/$/, '');
  if (!allowedOrigins(env).has(origin)) return null;
  try {
    return { origin, rpId: rpIdForOrigin(origin) };
  } catch {
    return null;
  }
}
