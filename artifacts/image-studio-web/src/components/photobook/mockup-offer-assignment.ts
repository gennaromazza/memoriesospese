/** A failed refresh must never turn an acknowledged write into a failed save. */
export async function assignMockupOffer<T>(
  save: () => Promise<unknown>,
  reload: () => Promise<T>,
): Promise<{ status: 'updated'; data: T } | { status: 'refresh-failed'; error: unknown }> {
  // Deliberately outside the catch: callers must show the server's save error.
  await save();
  try {
    return { status: 'updated', data: await reload() };
  } catch (error) {
    return { status: 'refresh-failed', error };
  }
}
