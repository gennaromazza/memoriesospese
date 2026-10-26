export function useToast() {
  return {
    toast: (message: unknown) => {
      window.dispatchEvent(new CustomEvent("campaign-selection-harness-toast", { detail: message }));
    },
  };
}
