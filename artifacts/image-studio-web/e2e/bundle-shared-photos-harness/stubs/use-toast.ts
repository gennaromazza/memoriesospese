const toast = (detail: unknown) =>
  window.dispatchEvent(new CustomEvent("bundle-harness-toast", { detail }));

export function useToast() {
  return { toast };
}
