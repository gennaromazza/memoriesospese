// Re-export da basePath.ts per compatibilità
export { createUrl, createAbsoluteUrl, isInSubdirectory as isSubdirectory, getPathDebugInfo as getPathInfo } from './basePath';

// Mantieni solo le funzioni specifiche di config
export function getCurrentBasePath(): string {
  return '';
}