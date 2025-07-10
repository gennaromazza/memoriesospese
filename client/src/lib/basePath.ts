/**
 * Sistema dinamico per la gestione del base path
 * Compatibile con ambienti locali, produzione e sottocartelle.
 */

/** Rileva automaticamente il base path dall'ambiente o fallback */
function detectBasePath(): string {
  // In produzione su Replit, usa sempre root path
  if (import.meta.env.PROD) return "/";
  if (import.meta.env.VITE_BASE_PATH) return import.meta.env.VITE_BASE_PATH;
  if (import.meta.env.BASE_URL) return import.meta.env.BASE_URL;
  return "/";
}

/** Cache del base path per evitarne il ricalcolo */
let cachedBasePath: string | null = null;

/** Restituisce il base path corrente (con cache) */
function getBasePath(): string {
  if (cachedBasePath === null) {
    cachedBasePath = detectBasePath();
  }
  return cachedBasePath;
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
  cachedBasePath = null;
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
