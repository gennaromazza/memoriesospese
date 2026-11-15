export const queryClient = {};

export async function apiRequest(method: string, url: string, data?: unknown) {
  const response = await fetch(url, {
    method,
    headers: data === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`${response.status}: ${message || response.statusText}`);
  }
  return response;
}
