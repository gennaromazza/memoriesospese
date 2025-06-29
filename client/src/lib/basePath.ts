
/**
 * Sistema dinamico per la gestione del base path
 * Rileva automaticamente in quale sottocartella si trova l'applicazione
 */

/**
 * Rileva automaticamente il base path dall'URL corrente
 */
function detectBasePath(): string {
  if (typeof window === 'undefined') return '';
  
  const pathname = window.location.pathname;
  
  // Se siamo nella root del dominio
  if (pathname === '/' || pathname === '') {
    return '';
  }
  
  // Cerca index.html nell'URL per determinare il base path
  if (pathname.includes('/index.html')) {
    const basePath = pathname.replace('/index.html', '');
    return basePath || '';
  }
  
  // Rileva da script o asset caricati
  const scripts = document.querySelectorAll('script[src]');
  for (const script of scripts) {
    const src = (script as HTMLScriptElement).src;
    if (src.includes('/src/main.tsx') || src.includes('/assets/')) {
      try {
        const url = new URL(src);
        const pathParts = url.pathname.split('/').filter(Boolean);
        
        // Rimuovi le parti finali (assets, src, etc.)
        const assetIndex = pathParts.findIndex(part => 
          part === 'assets' || part === 'src' || part.endsWith('.js') || part.endsWith('.tsx')
        );
        
        if (assetIndex > 0) {
          return '/' + pathParts.slice(0, assetIndex).join('/');
        }
      } catch (e) {
        // Ignora errori di parsing URL
      }
    }
  }
  
  // Fallback: usa il primo segmento del path se sembra essere una sottocartella
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0) {
    // Controlla se il primo segmento non è una route dell'app
    const appRoutes = ['gallery', 'admin', 'view', 'request-password', 'profile'];
    if (!appRoutes.includes(segments[0])) {
      return '/' + segments[0];
    }
  }
  
  return '';
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
      // In produzione, usa variabile d'ambiente o rilevamento automatico
      cachedBasePath = import.meta.env.BASE_URL?.replace(/\/$/, '') || detectBasePath();
    }
  }
  
  return cachedBasePath;
}

/**
 * Crea un URL corretto combinando base path e path
 */
export const createUrl = (path: string): string => {
  // Se path è vuoto o root, restituisci solo il base path + '/'
  if (!path || path === '/') {
    const basePath = getBasePath();
    return basePath ? basePath + '/' : '/';
  }

  // Normalizza il percorso richiesto
  let cleanPath = path.startsWith('/') ? path : `/${path}`;
  const basePath = getBasePath();
  
  if (basePath) {
    return basePath + cleanPath;
  }
  
  return cleanPath;
};

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
