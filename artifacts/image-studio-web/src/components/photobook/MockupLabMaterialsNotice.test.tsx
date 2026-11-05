import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MockupPayload } from '@shared/mockup-types';
import MockupLabMaterialsNotice from './MockupLabMaterialsNotice';

const payload = {
  saved: { status: 'confirmed', revision: 2, configuration: {
    modelId: 'album-girevole', coverLayout: 'plaque',
    backCover: 'photo', backPhotoAssetId: 'rear', engravingNames: { first: 'Anna', second: 'Luca' },
  } },
} as MockupPayload;

describe('Feedback allegati dopo la conferma mockup', () => {
  it('mostra solo i materiali del layout scelto e il collegamento al fotolibro corretto', () => {
    const html = renderToStaticMarkup(<MockupLabMaterialsNotice photobookId="book" payload={payload} />);
    expect(html).toContain('Foto plexiglass posteriore');
    expect(html).toContain('Nomi dell’incisione già salvati');
    expect(html).not.toContain('Foto copertina album.');
    expect(html).toContain('/admin/dashboard?tab=photobooks&amp;photobook=book');
    expect(html).toContain('anteprime delle foto');
    expect(html).toContain('carica gli originali ad alta risoluzione');
    expect(html).toContain('Carica i file originali per la stampa');
  });
  it('distingue allegati pronti dall’email al laboratorio', () => {
    const html = renderToStaticMarkup(<MockupLabMaterialsNotice photobookId="book" payload={{ ...payload, labAttachment: { status: 'attached' } }} />);
    expect(html).toContain('Materiali mockup allegati alla spedizione');
    expect(html).toContain('non indica che l’email sia stata inviata');
    expect(html).toContain('anteprime delle foto del mockup');
  });
  it('mostra il problema senza annunciare un completamento falso', () => {
    const html = renderToStaticMarkup(<MockupLabMaterialsNotice photobookId="book" payload={{ ...payload, labAttachment: { status: 'needs_review', message: 'File non disponibile' } }} />);
    expect(html).toContain('File non disponibile');
    expect(html).not.toContain('Materiali mockup allegati alla spedizione');
  });
  it('nel recupero richiede l’azione manuale e non promette un nuovo invio automatico', () => {
    const html = renderToStaticMarkup(<MockupLabMaterialsNotice photobookId="book" payload={{ ...payload, deliveryRecoveryAvailable: true }} />);
    expect(html).toContain('Recupera mockup per laboratorio');
    expect(html).toContain('non viene reinviata alcuna email');
    expect(html).not.toContain('vengono allegati automaticamente');
  });
  it('non mostra il feedback per una bozza non confermata', () => {
    expect(renderToStaticMarkup(<MockupLabMaterialsNotice photobookId="book" payload={{ ...payload, saved: { ...payload.saved!, status: 'draft' } }} />)).toBe('');
  });
});
