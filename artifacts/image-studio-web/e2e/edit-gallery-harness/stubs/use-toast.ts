// Match the production hook's stable callback identity: unstable mocks would
// hide missing useCallback dependencies in EditGalleryModal.
const toast = (value: any) =>
  window.dispatchEvent(new CustomEvent("edit-gallery-toast", { detail: value }));
export function useToast() { return { toast }; }