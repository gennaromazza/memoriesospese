/**
 * Sistema robusto per gestione del base path e generazione URL sicuri
 * - Usa solo VITE_BASE_PATH per evitare duplicazioni
 * - Normalizza gli slash per evitare problemi come //
 * - Gestisce correttamente sviluppo e produzione
 */

/** Restituisce il base path normalizzato */
function getBasePath(): string {
  return __VITE_BASE_PATH__ || "/";
}

/** Crea un URL assoluto completo (dominio + base path + route) */
export function createAbsoluteUrl(relativePath: string): string {
  // Separa path, query parameters e fragment per gestirli correttamente
  const urlParts = relativePath.split('?');
  const pathPart = urlParts[0];
  const queryAndFragment = urlParts.length > 1 ? '?' + urlParts.slice(1).join('?') : '';

  // Pulisce solo la parte del path (senza slash iniziale)
  const cleanPath = pathPart.startsWith("/")
    ? pathPart.slice(1)
    : pathPart;

  // Dominio di partenza — NON toccare mai questa parte con replace sugli slash
  // perché verrebbe corrotto https:// → https:/
  const origin = window.location.origin;

  let normalizedPath: string;

  // Normalizza SOLO il path (non l'URL completo) per evitare di corrompere il protocollo
  if (import.meta.env.DEV) {
    normalizedPath = `/${cleanPath}`.replace(/\/+/g, "/");
  } else {
    const viteBasePath = getBasePath();
    const normalizedBasePath = viteBasePath.endsWith("/")
      ? viteBasePath
      : `${viteBasePath}/`;
    normalizedPath = `${normalizedBasePath}${cleanPath}`.replace(/\/+/g, "/");
  }

  // Riattacca query parameters e fragment preservandoli intatti
  return `${origin}${normalizedPath}${queryAndFragment}`;
}

/** Crea un URL relativo corretto, utile per routing o link interni */
export const createUrl = (urlPath: string): string => {
  // Con Vite <base href> attivo, tutti i link relativi funzionano automaticamente
  const cleanPath = urlPath.startsWith("/") ? urlPath : `/${urlPath}`;
  return cleanPath.replace(/\/+/g, "/");
};

/** Verifica se siamo in produzione */
export const isProduction = (): boolean => import.meta.env.PROD === true;

/** Verifica se l'app è caricata in sottocartella */
export const isInSubdirectory = (): boolean => {
  const base = getBasePath().replace(/^\/|\/$/g, "");
  return base !== "";
};

/** Rimuove il basePath da un URL per ottenere il path relativo */
export const removeBasePath = (fullPath: string): string => {
  const basePath = getBasePath().replace(/\/+$/, "");
  if (basePath === "" || basePath === "/") return fullPath;
  return fullPath.startsWith(basePath)
    ? fullPath.substring(basePath.length) || "/"
    : fullPath;
};

/** Info di debug utili */
export const getPathDebugInfo = () => {
  if (typeof window === "undefined") return null;

  return {
    basePath: getBasePath(),
    viteBase: getBasePath(),
    isSubdirectory: isInSubdirectory(),
    isProduction: import.meta.env.PROD,
    isDev: import.meta.env.DEV,
    origin: window.location.origin,
  };
};
