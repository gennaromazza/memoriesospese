import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 0, refetchOnWindowFocus: false }, mutations: { retry: false } },
});
export async function apiRequest(method: string, url: string, data?: unknown) {
  const response = await fetch(url, { method, headers: {
    'content-type': 'application/json', authorization: 'Bearer fixture-admin',
  }, body: data === undefined ? undefined : JSON.stringify(data) });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response;
}
