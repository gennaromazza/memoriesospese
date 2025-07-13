/**
 * Sistema di gestione del base path per deployment in sottocartelle
 * Usa esclusivamente VITE_BASE_PATH per evitare duplicazioni URL
 */

/** Restituisce il base path dall'ambiente (no auto-detection) */
function getBasePath(): string {
  // Usa solo VITE_BASE_PATH, default "/" se non definito
  return import.meta.env.VITE_BASE_PATH || "/";
}

/** Crea un URL assoluto completo di dominio e base path */
export const createAbsoluteUrl = (path: string): string => {
  const basePath = getBasePath().replace(/\/+$/, ""); // rimuove slash finali
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const fullPath = `${basePath}${cleanPath}`;

  const origin =
    import.meta.env.VITE_APP_URL?.replace(/\/+$/, "") || window.location.origin;
  return `${origin}${fullPath}`;
};

/** Crea un URL relativo al base path, utile per routing o link interni */
export const createUrl = (urlPath: string): string => {
  const basePath = getBasePath().replace(/\/+$/, "");
  const cleanPath = urlPath.startsWith("/") ? urlPath.slice(1) : urlPath;

  // Evita duplicazione se il path contiene già il basePath
  if (basePath !== "/" && cleanPath.startsWith(basePath.slice(1))) {
    return `/${cleanPath}`;
  }

  return `${basePath}/${cleanPath}`;
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
