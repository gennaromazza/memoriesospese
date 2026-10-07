export async function selectFolderNative(): Promise<DesktopSelectedFile[] | null> {
  if (window.imageStudioDesktop && typeof window.imageStudioDesktop.selectFolder === 'function') {
    return await window.imageStudioDesktop.selectFolder();
  }
  return null;
}
