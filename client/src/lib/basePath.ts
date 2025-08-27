/**
 * Sistema di gestione del base path per deployment in sottocartelle
 * Usa esclusivamente VITE_BASE_PATH per evitare duplicazioni URL
 */

/** Restituisce il base path dall'ambiente con configurazione produzione/sviluppo */
function getBasePath(): string {
  // In produzione usa automaticamente /memoriesospese/, in sviluppo usa quello configurato
  if (import.meta.env.PROD) {
    return "/memoriesospese/";
  } else {
    return import.meta.env.VITE_BASE_PATH || "/";
  }
}

/** Crea un URL assoluto completo di dominio e base path */
export function createAbsoluteUrl(relativePath: string): string {
  const basePath = getBasePath();
  const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;

  // In sviluppo usa l'origin del browser, in produzione usa l'URL configurato
  const origin = import.meta.env.PROD
    ? (import.meta.env.VITE_APP_URL?.replace(/\/+$/, "") || "https://gennaromazzacane.it")
    : window.location.origin;

  // Assicurati che il base path sia aggiunto solo una volta
  const normalizedBasePath = basePath.startsWith("/") ? basePath : `/${basePath}`;
  const cleanBasePath = normalizedBasePath.replace(/\/+$/, ""); // rimuove slash finali

  return `${origin}${cleanBasePath}/${cleanPath}`;
}

/** Crea un URL relativo al base path, utile per routing o link interni */
export const createUrl = (urlPath: string): string => {
  const basePath = getBasePath();
  const cleanPath = urlPath.startsWith("/") ? urlPath.slice(1) : urlPath;

  // Evita duplicazione se il path contiene già il basePath
  if (basePath !== "/" && cleanPath.startsWith(basePath.slice(1))) {
    return `/${cleanPath}`;
  }

  // Combina basePath (che già termina con /) e cleanPath (senza / iniziale)
  return `${basePath}${cleanPath}`;
};

/** Verifica se siamo in produzione */
export const isProduction = (): boolean => import.meta.env.PROD === true;

/** Verifica se l'app è caricata in sottocartella */
export const isInSubdirectory = (): boolean => {
  const base = getBasePath().replace(/^\/|\/$/g, "");
  return base !== "";
};

/** Forza il reset della cache del basePath (per test/debug) */
export const refreshBasePath = (): void => {
  // cachedBasePath = null; // Variabile non definita, rimossa per evitare errori
};

/** Rimuove il basepath da un URL per ottenere il path relativo */
export const removeBasePath = (fullPath: string): string => {
  const basePath = getBasePath();

  // Se siamo in root (/) non c'è nulla da rimuovere
  if (basePath === "/") return fullPath;

  // Rimuovi il basepath se presente
  const basePathClean = basePath.replace(/\/+$/, ""); // rimuove slash finali
  if (fullPath.startsWith(basePathClean)) {
    return fullPath.substring(basePathClean.length) || "/";
  }

  return fullPath;
};

/** Info di debug utili */
export const getPathDebugInfo = () => {
  if (typeof window === "undefined") return null;

  return {
    basePath: getBasePath(),
    isSubdirectory: isInSubdirectory(),
    envBasePath: import.meta.env.BASE_URL,
    viteBase: import.meta.env.VITE_BASE_PATH,
    appUrl: import.meta.env.VITE_APP_URL,
    isDev: import.meta.env.DEV,
  };
};