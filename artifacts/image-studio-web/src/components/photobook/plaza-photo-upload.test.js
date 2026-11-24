import { afterEach, describe, expect, it, vi } from 'vitest';
import { installPlazaPhotoUpload } from '../../../public/mockups/plaza-photo-upload.js';

afterEach(() => vi.unstubAllGlobals());

function setup({ embedded = true, allowed = true, error } = {}) {
  const nodes = Object.fromEntries(['coverUpload', 'backUpload', 'photoStatus', 'backPhotoStatus', 'status'].map(id => [
    id, { textContent: '', value: '', files: [], click: vi.fn() },
  ]));
  const tools = { prepend: vi.fn() };
  vi.stubGlobal('document', {
    getElementById: id => nodes[id],
    querySelector: () => tools,
    createElement: () => ({ style: {} }),
  });
  const callbacks = {
    embedded, canUpload: () => allowed, fail: vi.fn(),
    setPhoto: error ? vi.fn().mockRejectedValue(error) : vi.fn().mockImplementation(async (photo, side) => {
      nodes[side === 'back' ? 'backPhotoStatus' : 'photoStatus'].textContent = photo.name;
    }),
    viewBack: vi.fn(), openBackPanel: vi.fn(),
  };
  installPlazaPhotoUpload(callbacks);
  return { nodes, tools, callbacks };
}

describe('caricamento foto Plaza', () => {
  it('segnala formati non supportati senza avviare il caricamento', async () => {
    const { nodes, callbacks } = setup();
    nodes.backUpload.files = [{ name: 'foto.heic', type: 'image/heic' }];
    await nodes.backUpload.onchange();
    expect(callbacks.setPhoto).not.toHaveBeenCalled();
    expect(nodes.backPhotoStatus.textContent).toContain('JPEG, PNG o WebP');
    expect(callbacks.fail).toHaveBeenCalled();
    expect(nodes.backUpload.value).toBe('');
  });

  it('carica sul retro, mostra il nome e orienta il modello', async () => {
    const { nodes, callbacks } = setup();
    nodes.backUpload.files = [{ name: 'retro.png', type: 'image/png' }];
    await nodes.backUpload.onchange();
    expect(callbacks.setPhoto).toHaveBeenCalledWith(expect.objectContaining({ name: 'retro.png' }), 'back');
    expect(nodes.backPhotoStatus.textContent).toBe('retro.png');
    expect(callbacks.viewBack).toHaveBeenCalledOnce();
  });

  it('mostra gli errori di caricamento vicino al campo foto', async () => {
    const { nodes, callbacks } = setup({ error: new Error('Foto superiore a 20 MB') });
    nodes.coverUpload.files = [{ name: 'copertina.jpg', type: 'image/jpeg' }];
    await nodes.coverUpload.onchange();
    expect(nodes.photoStatus.textContent).toBe('Foto superiore a 20 MB');
    expect(callbacks.fail).toHaveBeenCalled();
  });

  it('non crea un secondo uploader quando è incorporato nel pannello admin', () => {
    expect(setup().tools.prepend).not.toHaveBeenCalled();
  });

  it('il comando diretto apre il selettore del retro, non quello della copertina', () => {
    const { nodes, tools, callbacks } = setup({ embedded: false });
    tools.prepend.mock.calls[0][0].onclick();
    expect(callbacks.openBackPanel).toHaveBeenCalledOnce();
    expect(nodes.backUpload.click).toHaveBeenCalledOnce();
    expect(nodes.coverUpload.click).not.toHaveBeenCalled();
  });

  it('non carica foto quando il modello è bloccato', async () => {
    const { nodes, callbacks } = setup({ allowed: false });
    nodes.backUpload.files = [{ name: 'retro.png', type: 'image/png' }];
    await nodes.backUpload.onchange();
    expect(callbacks.setPhoto).not.toHaveBeenCalled();
  });
});
