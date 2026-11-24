import { QueryClient } from '@tanstack/react-query';
export const queryClient = new QueryClient({ defaultOptions: {
  queries: { retry: false, refetchOnWindowFocus: false },
  mutations: { retry: false },
} });
export async function apiRequest(method: string, url: string, data?: unknown) {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  if (!response.ok) throw new Error((await response.json()).error || 'Errore richiesta');
  return response;
}
