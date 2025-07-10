import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { createUrl } from "./config";
import { auth } from "./firebase";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Helper per ottenere credenziali utente autenticato
export async function getAuthCredentials(): Promise<{ userEmail: string; userName: string } | null> {
  const user = auth.currentUser;
  if (!user) return null;

  return {
    userEmail: user.email || '',
    userName: user.displayName || ''
  };
}

// Helper per includere automaticamente credenziali auth nelle richieste che lo richiedono
async function enhanceRequestWithAuth(url: string, data?: unknown): Promise<unknown> {
  // Aggiungi credenziali solo per endpoint che richiedono autenticazione
  const authRequiredEndpoints = [
    '/likes/',
    '/comments/',
    '/voice-memos',
    '/notify',
    '/check-unlocks'
  ];
  
  const needsAuth = authRequiredEndpoints.some(endpoint => url.includes(endpoint));
  
  if (!needsAuth) {
    return data;
  }

  const credentials = await getAuthCredentials();
  
  if (!credentials || !credentials.userEmail) {
    return data;
  }

  // Se i dati sono un oggetto, aggiungi le credenziali
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return { ...data, ...credentials };
  }
  
  // Se non ci sono dati, restituisci solo le credenziali per endpoint auth
  if (!data) {
    return credentials;
  }
  
  // Per altri tipi di dati, restituisci i dati originali
  return data;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Se l'app è in sottocartella, anche le API devono avere il base path
  const finalUrl = url.startsWith('/api') ? createUrl(url) : url;
  
  // Includi automaticamente credenziali auth per richieste che lo richiedono
  const enhancedData = await enhanceRequestWithAuth(url, data);
  
  const res = await fetch(finalUrl, {
    method,
    headers: enhancedData ? { "Content-Type": "application/json" } : {},
    body: enhancedData ? JSON.stringify(enhancedData) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;
    // Se l'app è in sottocartella, anche le API devono avere il base path
    const finalUrl = url.startsWith('/api') ? createUrl(url) : url;
    
    const res = await fetch(finalUrl, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
