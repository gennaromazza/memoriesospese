/**
 * Crea un URL corretto combinando BASE_URL e path
 */
export const createUrl = (path: string): string => {
  // Se path è vuoto o root, restituisci solo '/'
  if (!path || path === '/') {
    return '/';
  }

  // Normalizza il percorso richiesto rimuovendo eventuali slash iniziali
  let cleanPath = path.startsWith('/') ? path : `/${path}`;

  if (import.meta.env.DEV) {
    console.log(`[createUrl] ${path} → ${cleanPath}`);
  }

  return cleanPath;
}

/**
 * Crea un URL assoluto per la condivisione
 */
export const createAbsoluteUrl = (path: string): string => {
  const url = new URL(path, window.location.origin);
  return url.toString();
}

/**
 * Verifica se l'applicazione è in esecuzione in ambiente di produzione
 * @returns true se in produzione, false se in sviluppo
 */
export const isProduction = (): boolean => {
  return import.meta.env.PROD === true;
};

/**
 * Verifica se siamo in sottodirectory
 * @returns true se in produzione e PRODUCTION_BASE_PATH non è '/'
 */
export const isInSubdirectory = (): boolean => {
  // Durante lo sviluppo è false, in produzione verifica il percorso
  if (!import.meta.env.PROD) return false;
  // Verifica se il percorso base in produzione non è la root
  return import.meta.env.BASE_URL.length > 1;
};