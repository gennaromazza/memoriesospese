// Utility per gestire il percorso base dell'applicazione
// Supporta sia installazione root che in sottocartella

/** 
 * Crea un URL corretto combinando BASE_URL e path, prevenendo qualsiasi duplicazione.
 * In sviluppo BASE_URL è '', in produzione è '/wedgallery/'.
 * 
 * RISOLVE IL BUG: /wedgallery/wedgallery/admin → /wedgallery/admin
 */
export const createUrl = (path: string): string => {
  // Otteniamo il base path pulito (senza slash finale)
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  
  // Se path è vuoto o root, restituisci solo il base path con uno slash finale
  if (!path || path === '/') {
    return basePath === '' ? '/' : `${basePath}/`;
  }
  
  // Normalizza il percorso richiesto rimuovendo eventuali slash iniziali
  let cleanPath = path.startsWith('/') ? path.substring(1) : path;
  
  // IMPORTANTE: Previeni la duplicazione di 'wedgallery' negli URL
  if (basePath === '/wedgallery') {
    // Rimuovi 'wedgallery/' se appare all'inizio del percorso
    if (cleanPath.startsWith('wedgallery/')) {
      cleanPath = cleanPath.substring('wedgallery/'.length);
    }
    
    // Rimuovi anche la versione con slash iniziale
    if (cleanPath.startsWith('/wedgallery/')) {
      cleanPath = cleanPath.substring('/wedgallery/'.length);
    }
  }
  
  // Assicurati che il percorso finale abbia sempre uno slash iniziale
  const finalPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
  
  // Componi l'URL finale: base + path senza duplicazioni
  const url = `${basePath}${finalPath}`;
  
  if (import.meta.env.DEV) {
    console.log(`[createUrl] ${path} → ${url}`);
  }
  
  return url;
};

/**
 * Crea un URL assoluto completo partendo da un percorso relativo.
 * Gestisce correttamente i percorsi in sottocartella /wedgallery/
 * e previene qualsiasi duplicazione di path.
 * 
 * @param path Percorso relativo da convertire in URL assoluto
 * @returns URL assoluto completo con origin e base path
 */
export const createAbsoluteUrl = (path: string): string => {
  // Ottieni l'URL relativo con base path già correttamente applicato
  // La funzione createUrl si occupa già di prevenire duplicazioni
  const relativeUrl = createUrl(path);
  
  // Componi l'URL assoluto con l'origine corrente
  let absoluteUrl = `${window.location.origin}${relativeUrl}`;
  
  // Rimuovi qualsiasi slash duplicato, preservando il protocollo http(s)://
  // Il pattern ([^:]\/)\/+ trova slash duplicati non preceduti da ://
  absoluteUrl = absoluteUrl.replace(/([^:]\/)\/+/g, '$1');
  
  // Ulteriore verifica per evitare duplicazioni specifiche di wedgallery
  if (import.meta.env.PROD) {
    // Rimuovi wedgallery duplicato nell'URL
    absoluteUrl = absoluteUrl.replace(/\/wedgallery\/wedgallery\//g, '/wedgallery/');
    
    // Assicurati che non ci sia doppio slash dopo gennaromazzacane.it
    absoluteUrl = absoluteUrl.replace(/(gennaromazzacane\.it)\/+/g, '$1/');
  }
  
  // Log per debug (solo in sviluppo)
  if (import.meta.env.DEV) {
    console.log(`[createAbsoluteUrl] ${path} → ${absoluteUrl}`);
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