// Configurazione per gestire base path automaticamente
// Funziona sia in sottocartella che come dominio principale

function getBasePath(): string {
  if (typeof window === 'undefined') return '';
  
  // Controlla se è definita una variabile d'ambiente per il base path
  const envBasePath = import.meta.env.VITE_BASE_PATH;
  if (envBasePath) {
    return envBasePath.startsWith('/') ? envBasePath : `/${envBasePath}`;
  }
  
  const pathname = window.location.pathname;
  
  // Se siamo nella root del dominio (es: https://dominio.com/)
  if (pathname === '/' || pathname === '') {
    return '';
  }
  
  // Se siamo in una sottocartella (es: https://dominio.com/wedgallery/)
  // Estrai il primo segmento del path
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0) {
    // Controlla se il primo segmento è una sottocartella dell'app
    const potentialBasePath = `/${segments[0]}`;
    
    // Lista delle sottocartelle note dell'app
    const knownSubfolders = ['wedgallery', 'gallery', 'app'];
    
    if (knownSubfolders.includes(segments[0])) {
      return potentialBasePath;
    }
  }
  
  return '';
}

// Crea URL completo con base path
export function createUrl(path: string): string {
  const basePath = getBasePath();
  
  // Rimuovi slash iniziale dal path se presente
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  // Costruisci URL finale
  if (basePath) {
    return `${basePath}/${cleanPath}`;
  }
  
  return `/${cleanPath}`;
}

// Crea URL assoluto per navigazione
export function createAbsoluteUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  
  const basePath = getBasePath();
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  if (basePath) {
    return `${basePath}/${cleanPath}`;
  }
  
  return `/${cleanPath}`;
}

// Ottieni il base path corrente
export function getCurrentBasePath(): string {
  return getBasePath();
}

// Controlla se siamo in una sottocartella
export function isSubdirectory(): boolean {
  return getBasePath() !== '';
}

// Debug info per sviluppo
export function getPathInfo() {
  if (typeof window === 'undefined') return null;
  
  return {
    pathname: window.location.pathname,
    basePath: getBasePath(),
    isSubdirectory: isSubdirectory(),
    host: window.location.host,
    origin: window.location.origin
  };
}