/**
 * Sistema dinamico per la gestione del base path
 * Rileva automaticamente in quale sottocartella si trova l'applicazione
 */

/**
 * Rileva automaticamente il base path dall'URL corrente
 */
function detectBasePath(): string {
  // In sviluppo, usa sempre '/'
  if (import.meta.env.DEV) {
    return '/';
  }

  // Usa variabile d'ambiente se disponibile
  if (import.meta.env.VITE_BASE_PATH) {
    return import.meta.env.VITE_BASE_PATH;
  }

  // Rileva automaticamente dal pathname corrente solo se non siamo in produzione
  // In produzione con hosting esterno, forza il rilevamento del base path
  const pathname = window.location.pathname;
  const segments = pathname.split('/').filter(Boolean);

  // Se il primo segmento è "wedgallery", usa quello come base path
  if (segments.length > 0 && segments[0] === 'wedgallery') {
    return '/wedgallery/';
  }

  // Se il primo segmento è una delle route dell'app, non c'è base path
  if (segments.length > 0) {
    const appRoutes = ['gallery', 'admin', 'view', 'request-password', 'profile'];
    if (!appRoutes.includes(segments[0])) {
      return '/' + segments[0] + '/';
    }
  }

  return '/';
}

/**
 * Cache del base path per evitare rilevamenti multipli
 */
let cachedBasePath: string | null = null;

/**
 * Ottiene il base path con cache
 */
function getBasePath(): string {
  if (cachedBasePath === null) {
    // In sviluppo, usa sempre root
    if (import.meta.env.DEV) {
      cachedBasePath = '';
    } else {
      // In produzione, usa SOLO la variabile d'ambiente di Vite
      // Non fare rilevamento automatico per evitare duplicazioni
      const baseUrl = import.meta.env.BASE_URL;
      if (baseUrl && baseUrl !== '/') {
        cachedBasePath = baseUrl.replace(/\/$/, '');
      } else {
        cachedBasePath = '';
      }
    }
  }

  return cachedBasePath;
}

export function createUrl(urlPath: string): string {
  const basePath = getBasePath();

  // Gestione percorsi speciali
  if (urlPath === '' || urlPath === '/') {
    return basePath;
  }

  // Rimuovi slash iniziale dal path se presente
  const normalizedPath = urlPath.startsWith('/') ? urlPath.substring(1) : urlPath;

  // Protezione contro duplicazione del base path
  // Se il base path è "/wedgallery/" e il path inizia con "wedgallery/", 
  // non duplicare
  if (basePath !== '/' && normalizedPath.startsWith(basePath.substring(1))) {
    return `/${normalizedPath}`;
  }

  // Concatena il percorso base con il percorso relativo
  return `${basePath}${normalizedPath}`;
}

/**
 * Crea un URL assoluto per la condivisione
 */
export const createAbsoluteUrl = (path: string): string => {
  const relativePath = createUrl(path);
  const url = new URL(relativePath, window.location.origin);
  return url.toString();
};

/**
 * Verifica se l'applicazione è in produzione
 */
export const isProduction = (): boolean => {
  return import.meta.env.PROD === true;
};

/**
 * Verifica se siamo in una sottodirectory
 */
export const isInSubdirectory = (): boolean => {
  return getBasePath() !== '';
};

/**
 * Forza il refresh del base path (utile per test o cambi dinamici)
 */
export const refreshBasePath = (): void => {
  cachedBasePath = null;
};

/**
 * Debug: mostra informazioni sul base path corrente
 */
export const getPathDebugInfo = () => {
  if (typeof window === 'undefined') return null;

  return {
    pathname: window.location.pathname,
    basePath: getBasePath(),
    isSubdirectory: isInSubdirectory(),
    host: window.location.host,
    origin: window.location.origin,
    detectedBasePath: detectBasePath(),
    envBasePath: import.meta.env.BASE_URL,
    isDev: import.meta.env.DEV
  };
};