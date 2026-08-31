const EXACT_UPLOAD_ORIGINS = new Set([
  'https://imagestudiofotografico.com',
  'https://www.imagestudiofotografico.com',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5173',
]);

const REPLIT_UPLOAD_ORIGIN = /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:replit\.dev|replit\.app)$/i;

export function isAllowedPrintUploadOrigin(origin: string): boolean {
  return EXACT_UPLOAD_ORIGINS.has(origin) || REPLIT_UPLOAD_ORIGIN.test(origin);
}

export function resolvePrintUploadOrigin(input: {
  origin?: string;
  protocol?: string;
  host?: string;
}): string | undefined {
  const supplied = input.origin?.trim();
  if (supplied) return isAllowedPrintUploadOrigin(supplied) ? supplied : undefined;
  const protocol = input.protocol?.trim();
  const host = input.host?.trim();
  if (!protocol || !host) return undefined;
  const inferred = `${protocol}://${host}`;
  return isAllowedPrintUploadOrigin(inferred) ? inferred : undefined;
}
