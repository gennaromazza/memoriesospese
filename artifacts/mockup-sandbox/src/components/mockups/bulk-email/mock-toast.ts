export function useToast() {
  return {
    toast: (_message: { title?: string; description?: string; variant?: string }) => undefined,
  };
}
