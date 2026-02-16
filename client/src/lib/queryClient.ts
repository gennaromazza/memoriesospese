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
  
  // Prepara headers
  const headers: Record<string, string> = enhancedData ? { "Content-Type": "application/json" } : {};
  
  // Endpoint consultations pubblici (NON richiedono auth) - SOLO GET
  const publicConsultationEndpoints = [
    '/api/consultations/v2/available-slots',
    '/api/consultations/v2/create',
    '/api/consultations/job-types' // Public job types endpoint
  ];
  
  // Template endpoints sono pubblici SOLO per GET, PATCH/PUT/DELETE richiedono auth
  const isTemplateEndpoint = url.includes('/api/consultations/templates/');
  const isPublicConsultationEndpoint = publicConsultationEndpoints.some(endpoint => url.includes(endpoint)) ||
                                        (isTemplateEndpoint && method === 'GET');
  
  // Aggiungi token Firebase per endpoint che lo richiedono
  const firebaseAuthEndpoints = [
    '/api/import/',
    '/api/email/',
    '/api/quote/',
    '/api/quotes/',
    '/api/booking/',
    '/api/calendar/',
    '/api/consultations/v2/', // All V2 consultation endpoints except public ones
    '/api/orders/', // Order management endpoints requiring auth
    '/api/payment-schedules/', // Payment schedule management endpoints requiring auth
    '/api/collaboratori', // Collaborator management endpoints requiring auth
    '/api/admin/', // Admin endpoints requiring auth
    '/api/bulk-email/', // Bulk email endpoints requiring auth
    '/api/receipts/', // Receipt endpoints requiring auth
    '/api/reminders/', // Reminder endpoints requiring auth
    '/api/jobs/', // Job management endpoints requiring auth
    '/api/jobs?', // Job listing endpoint requiring auth
    '/api/migrations/' // Migration endpoints requiring auth
  ];
  
  // Check specifico per consultations: tutti tranne i pubblici
  const isConsultationsEndpoint = url.includes('/api/consultations');
  const needsFirebaseAuth = (isConsultationsEndpoint && !isPublicConsultationEndpoint) || 
                            firebaseAuthEndpoints.some(endpoint => url.includes(endpoint));
  
  if (needsFirebaseAuth && auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    } catch (error) {
      console.error('Errore ottenimento token Firebase:', error);
    }
  }
  
  const res = await fetch(finalUrl, {
    method,
    headers,
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
    
    // Prepara headers con stesso logic di apiRequest
    const headers: Record<string, string> = {};
    
    // Endpoint consultations pubblici (NON richiedono auth) - SOLO V2
    const publicConsultationEndpoints = [
      '/api/consultations/v2/available-slots',
      '/api/consultations/v2/create',
      '/api/consultations/templates/', // Public template endpoints
      '/api/consultations/job-types' // Public job types endpoint
    ];
    
    const isPublicConsultationEndpoint = publicConsultationEndpoints.some(endpoint => url.includes(endpoint));
    
    // Aggiungi token Firebase per endpoint che lo richiedono
    const firebaseAuthEndpoints = [
      '/api/import/',
      '/api/email/',
      '/api/quote/',
      '/api/quotes/',
      '/api/booking/',
      '/api/calendar/',
      '/api/consultations/v2/' // All V2 consultation endpoints except public ones
    ];
    
    // Check specifico per consultations: tutti tranne i pubblici
    const isConsultationsEndpoint = url.includes('/api/consultations');
    const needsFirebaseAuth = (isConsultationsEndpoint && !isPublicConsultationEndpoint) || 
                              firebaseAuthEndpoints.some(endpoint => url.includes(endpoint));
    
    if (needsFirebaseAuth && auth.currentUser) {
      try {
        const token = await auth.currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      } catch (error) {
        console.error('Errore ottenimento token Firebase:', error);
      }
    }
    
    const res = await fetch(finalUrl, {
      headers,
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
      staleTime: 5 * 60 * 1000, // 5 minuti - dati considerati freschi per caching intelligente
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
