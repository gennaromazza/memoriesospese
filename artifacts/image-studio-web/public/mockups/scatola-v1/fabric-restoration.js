/**
 * Restore the Quadrobook's two fabric roles without overwriting a distinct
 * album fabric with the box fabric.
 * @param {{materialId: string, albumMaterialId?: string}} configuration
 * @param {(id: string, targets: string[]) => Promise<unknown>} setFabric
 */
export async function restoreQuadrobookFabrics(configuration, setFabric) {
  const albumMaterialId = configuration.albumMaterialId || configuration.materialId;
  if (albumMaterialId === configuration.materialId) {
    await setFabric(configuration.materialId, ['box', 'album']);
    return;
  }

  await setFabric(configuration.materialId, ['box']);
  await setFabric(albumMaterialId, ['album']);
}
