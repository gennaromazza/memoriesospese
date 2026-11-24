export function ref(_storage: unknown, path: string) {
  return { path };
}

export async function uploadBytes(_ref: unknown, file: Blob) {
  return { metadata: { size: file.size } };
}

export async function getDownloadURL(uploaded: { metadata: { size: number } }) {
  return `https://fixture.invalid/image-${uploaded.metadata.size}`;
}

export async function deleteObject() {
  return undefined;
}
