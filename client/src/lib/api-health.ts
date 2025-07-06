/**
 * Sistema di diagnostica per verificare la salute delle API
 * e gestire i fallback quando il server non è disponibile
 */

import { createUrl } from './basePath';

interface ApiHealthStatus {
  isServerAvailable: boolean;
  availableEndpoints: string[];
  unavailableEndpoints: string[];
  lastChecked: Date;
}

let cachedHealthStatus: ApiHealthStatus | null = null;
const HEALTH_CHECK_CACHE_TIME = 5 * 60 * 1000; // 5 minuti

const criticalEndpoints = [
  '/api/health',
  '/api/galleries/test/stats/photo/test',
  '/api/galleries/test/likes/photo/test',
  '/api/galleries/test/comments/photo/test',
  '/api/galleries/test/voice-memos/recent'
];

export async function checkApiHealth(): Promise<ApiHealthStatus> {
  // Usa cache se disponibile e recente
  if (cachedHealthStatus && 
      (Date.now() - cachedHealthStatus.lastChecked.getTime()) < HEALTH_CHECK_CACHE_TIME) {
    return cachedHealthStatus;
  }

  const availableEndpoints: string[] = [];
  const unavailableEndpoints: string[] = [];

  // Test rapido per vedere se il server risponde
  let isServerAvailable = false;
  
  try {
    // Test endpoint base per verificare se il server è in funzione
    const baseResponse = await fetch(createUrl('/api/health'), {
      method: 'GET',
      signal: AbortSignal.timeout(3000) // Timeout di 3 secondi
    });
    
    if (baseResponse.status !== 404) {
      isServerAvailable = true;
      availableEndpoints.push('/api/health');
    } else {
      unavailableEndpoints.push('/api/health');
    }
  } catch (error) {
    console.warn('Server API non disponibile:', error);
    unavailableEndpoints.push('/api/health');
  }

  const status: ApiHealthStatus = {
    isServerAvailable,
    availableEndpoints,
    unavailableEndpoints,
    lastChecked: new Date()
  };

  cachedHealthStatus = status;
  return status;
}

export async function isApiEndpointAvailable(endpoint: string): Promise<boolean> {
  const health = await checkApiHealth();
  
  // Se il server non è disponibile, considera tutti gli endpoint non disponibili
  if (!health.isServerAvailable) {
    return false;
  }

  // Per ora considera disponibili tutti gli endpoint se il server risponde
  return true;
}

export function clearApiHealthCache(): void {
  cachedHealthStatus = null;
}

/**
 * Wrapper per fetch che gestisce automaticamente i fallback quando l'API non è disponibile
 */
export async function safeFetch(url: string, options?: RequestInit): Promise<Response | null> {
  try {
    const isAvailable = await isApiEndpointAvailable(url);
    
    if (!isAvailable) {
      console.warn(`Endpoint ${url} non disponibile, saltando richiesta`);
      return null;
    }

    const response = await fetch(createUrl(url), {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers
      }
    });

    return response;
  } catch (error) {
    console.warn(`Errore nella richiesta a ${url}:`, error);
    return null;
  }
}

/**
 * Versione semplificata per GET che restituisce i dati o null
 */
export async function safeApiGet<T>(url: string): Promise<T | null> {
  const response = await safeFetch(url);
  
  if (!response || !response.ok) {
    return null;
  }

  try {
    const data = await response.json();
    return data.success ? data.data : data;
  } catch (error) {
    console.warn(`Errore nel parsing della risposta da ${url}:`, error);
    return null;
  }
}

/**
 * Versione semplificata per POST che gestisce i fallback
 */
export async function safeApiPost<T>(url: string, data: any): Promise<T | null> {
  const response = await safeFetch(url, {
    method: 'POST',
    body: JSON.stringify(data)
  });

  if (!response || !response.ok) {
    return null;
  }

  try {
    const result = await response.json();
    return result.success ? result.data : result;
  } catch (error) {
    console.warn(`Errore nel parsing della risposta da ${url}:`, error);
    return null;
  }
}