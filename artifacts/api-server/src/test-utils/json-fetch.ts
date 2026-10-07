type FetchResponse = Awaited<ReturnType<typeof globalThis.fetch>>;
type JsonResponse<T> = Omit<FetchResponse, 'json'> & { json(): Promise<T> };

/**
 * Type the JSON boundary of an isolated HTTP test. This uses the real fetch and
 * does not change parsing or validate a response in place of the test assertions.
 */
export function jsonFetch<T>(
  ...args: Parameters<typeof globalThis.fetch>
): Promise<JsonResponse<T>> {
  return globalThis.fetch(...args) as Promise<JsonResponse<T>>;
}