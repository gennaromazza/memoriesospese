export interface DroppedFile {
  file: File;
  relativePath: string;
}

interface DroppedEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
  file?: (success: (file: File) => void, failure?: (error: DOMException) => void) => void;
  createReader?: () => {
    readEntries: (
      success: (entries: DroppedEntry[]) => void,
      failure?: (error: DOMException) => void,
    ) => void;
  };
}

interface DroppedItem {
  kind: string;
  getAsFile(): File | null;
  webkitGetAsEntry?: () => DroppedEntry | null;
}

function readEntryFile(entry: DroppedEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!entry.file) {
      reject(new Error(`Impossibile leggere il file ${entry.name}.`));
      return;
    }
    entry.file(resolve, reject);
  });
}

function readDirectoryBatch(reader: ReturnType<NonNullable<DroppedEntry['createReader']>>): Promise<DroppedEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function collectEntry(entry: DroppedEntry, parentPath = ''): Promise<DroppedFile[]> {
  const path = entry.fullPath?.replace(/^\/+/, '') || [parentPath, entry.name].filter(Boolean).join('/');
  if (entry.isFile) {
    return [{ file: await readEntryFile(entry), relativePath: path }];
  }
  if (!entry.isDirectory || !entry.createReader) return [];

  const reader = entry.createReader();
  const children: DroppedEntry[] = [];
  // Chromium returns directory contents in batches; read until exhausted.
  while (true) {
    const batch = await readDirectoryBatch(reader);
    if (!batch.length) break;
    children.push(...batch);
  }
  const nested = await Promise.all(children.map(child => collectEntry(child, path)));
  return nested.flat();
}

export async function collectDroppedFiles(items: ArrayLike<DroppedItem>): Promise<DroppedFile[]> {
  const droppedItems = Array.from(items);
  const entries = droppedItems
    .filter(item => item.kind === 'file')
    .map(item => item.webkitGetAsEntry?.())
    .filter((entry): entry is DroppedEntry => entry !== null && entry !== undefined);

  if (entries.length) {
    const groups = await Promise.all(entries.map(entry => collectEntry(entry)));
    return groups.flat();
  }

  return droppedItems
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null)
    .map(file => ({ file, relativePath: file.name }));
}
