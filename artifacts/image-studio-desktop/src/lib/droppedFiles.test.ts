import { describe, expect, it, vi } from 'vitest';
import { collectDroppedFiles } from './droppedFiles';

function fileEntry(name: string, fullPath: string, file: File) {
  return {
    isFile: true,
    isDirectory: false,
    name,
    fullPath,
    file: (resolve: (file: File) => void) => resolve(file),
  };
}

function directoryEntry(name: string, fullPath: string, batches: ReturnType<typeof fileEntry>[][]) {
  let batchIndex = 0;
  return {
    isFile: false,
    isDirectory: true,
    name,
    fullPath,
    createReader: () => ({
      readEntries: (resolve: (entries: ReturnType<typeof fileEntry>[]) => void) => {
        resolve(batches[batchIndex++] || []);
      },
    }),
  };
}

describe('drag-and-drop gallery file collection', () => {
  it('recursively collects supported files and keeps nested folder paths across batches', async () => {
    const first = new File(['one'], 'one.jpg');
    const second = new File(['two'], 'two.heic');
    const nested = directoryEntry('Cerimonia', '/Matrimonio/Cerimonia', [
      [fileEntry('one.jpg', '/Matrimonio/Cerimonia/one.jpg', first)],
      [fileEntry('two.heic', '/Matrimonio/Cerimonia/two.heic', second)],
      [],
    ]);
    const dropped = await collectDroppedFiles([{
      kind: 'file',
      getAsFile: () => null,
      webkitGetAsEntry: () => nested,
    }]);

    expect(dropped).toEqual([
      { file: first, relativePath: 'Matrimonio/Cerimonia/one.jpg' },
      { file: second, relativePath: 'Matrimonio/Cerimonia/two.heic' },
    ]);
  });

  it('falls back to ordinary dropped files when directory entries are unavailable', async () => {
    const image = new File(['image'], 'foto.jpg');
    const dropped = await collectDroppedFiles([{ kind: 'file', getAsFile: () => image }]);
    expect(dropped).toEqual([{ file: image, relativePath: 'foto.jpg' }]);
  });

  it('does not treat non-file drag data as an upload', async () => {
    const getAsFile = vi.fn(() => new File(['text'], 'text.txt'));
    expect(await collectDroppedFiles([{ kind: 'string', getAsFile }])).toEqual([]);
    expect(getAsFile).not.toHaveBeenCalled();
  });
});
