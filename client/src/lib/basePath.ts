// Utility per gestire il percorso base dell'applicazione
// Supporta sia installazione root che in sottocartella

/** 
 * Restituisce il path corretto combinando BASE_URL e path, evitando duplicazioni.
 * BASE_URL è '' in dev, '/wedgallery/' in prod.
 * 
 * Questa funzione previene problemi come /wedgallery/wedgallery/admin
 */
export const createUrl = (path: string): string => {
  // Otteniamo il base path senza slash finale
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  
  // Se path è vuoto o root, restituiamo solo il base path con uno slash
  if (path === '' || path === '/') {
    return base === '' ? '/' : `${base}/`;
  }
  
  // Rimuoviamo prefissi wedgallery duplicati
  // Questo risolve casi come /wedgallery/wedgallery/admin in produzione
  let cleanPath = path;
  
  // Se siamo in produzione e il path inizia con /wedgallery
  if (import.meta.env.PROD && base === '/wedgallery') {
    // Rimuovi /wedgallery all'inizio del path se presente
    cleanPath = cleanPath.replace(/^\/wedgallery\//, '/');
    
    // Rimuovi anche la versione senza slash iniziale
    cleanPath = cleanPath.replace(/^wedgallery\//, '/');
  }
  
  // Normalizziamo il percorso aggiungendo uno slash iniziale se mancante
  const normalizedPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
  
  // Output per debug
  if (!import.meta.env.PROD && path !== normalizedPath) {
    console.log(`[createUrl] path corretto: ${path} → ${normalizedPath}`);
  }
  
  // Combiniamo base path e percorso normalizzato
  return `${base}${normalizedPath}`;
};

/**
 * Crea un URL assoluto completo a partire da un percorso relativo.
 * Gestisce correttamente i percorsi quando l'app è in una sottocartella.
 * Rimuove eventuali slash duplicati nell'URL finale.
 * 
 * @param path Percorso relativo da convertire in URL assoluto
 * @returns URL assoluto completo con origin e base path
 */
export const createAbsoluteUrl = (path: string): string => {
  // Ottieni l'URL relativo con base path correttamente applicato
  const relativeUrl = createUrl(path);
  
  // Componi l'URL assoluto e rimuovi eventuali slash consecutivi duplicati
  // Il pattern ([^:]\/)\/+ trova slash duplicati non preceduti da :// (per non toccare https://)
  const absoluteUrl = `${window.location.origin}${relativeUrl}`.replace(/([^:]\/)\/+/g, '$1');
  
  // Log per debug (solo in sviluppo)
  if (!import.meta.env.PROD) {
    console.log(`[createAbsoluteUrl] path: ${path} → ${absoluteUrl}`);
  }
  
  return absoluteUrl;
};

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