/**
 * Sistema dinamico per la gestione del base path
 * Rileva automaticamente in quale sottocartella si trova l'applicazione
 */

/**
 * Rileva automaticamente il base path dall'URL corrente
 */
function detectBasePath(): string {
  // Usa sempre la variabile d'ambiente se disponibile
  if (import.meta.env.VITE_BASE_PATH) {
    return import.meta.env.VITE_BASE_PATH;
  }

  // In sviluppo, usa sempre '/'
  if (import.meta.env.DEV) {
    return '/';
  }

  // Fallback - non usare auto-rilevamento per evitare duplicazioni
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
    cachedBasePath = detectBasePath();
  }
  return cachedBasePath;
}

export function createUrl(urlPath: string): string {
  const basePath = getBasePath();
  // console.log('createUrl debug:', { urlPath, basePath, result: basePath || '/' }); // Debug disabilitato

  // Gestione percorsi speciali
  if (urlPath === '' || urlPath === '/') {
    return basePath || '/';
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
  const basePath = getBasePath();
  const fullPath = basePath === '/' ? path : `${basePath}${path}`;
  return import.meta.env.VITE_APP_URL ? `${import.meta.env.VITE_APP_URL}${fullPath}` : fullPath;
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
    basePath: getBasePath(),
    isSubdirectory: isInSubdirectory(),
    envBasePath: import.meta.env.BASE_URL,
    isDev: import.meta.env.DEV
  };
};