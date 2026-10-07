import { QueryClient } from "@tanstack/react-query";
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } });
export async function apiRequest(method: string, url: string, data?: unknown) {
  const response = await fetch(url, { method, headers: data ? { "Content-Type": "application/json" } : undefined, body: data ? JSON.stringify(data) : undefined });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response;
}