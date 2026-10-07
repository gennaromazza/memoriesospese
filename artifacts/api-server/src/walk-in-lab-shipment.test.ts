import { describe, expect, it } from 'vitest';
import {
  buildWalkInLabManifest,
  createWalkInOrderSnapshot,
  WALK_IN_LAB_MANIFEST_FILENAME,
} from './walk-in-lab-shipment.js';

describe('walk-in laboratory shipment instructions', () => {
  it('snapshots the customer, order description, products and bundle components without payment data', () => {
    const snapshot = createWalkInOrderSnapshot('order-731', {
      nomeEvento: 'Ordine walk-in - Album x1',
      nomeCliente: 'Alda Granata',
      note: 'Copertina opaca, consegna in studio',
      totale: 120,
      emailCliente: 'private@example.com',
      prodotti: [
        { prodottoNome: 'Album', quantita: 1, isBundle: true, bundleItems: [
          { prodottoNome: 'Stampa 20x30', quantita: 2 },
        ] },
        { prodottoNome: 'Cornice', quantita: 2, isCustom: true },
      ],
    });

    expect(snapshot).toEqual({
      orderId: 'order-731',
      orderTitle: 'Ordine walk-in - Album x1',
      customerName: 'Alda Granata',
      orderDescription: 'Copertina opaca, consegna in studio',
      products: [
        {
          name: 'Album',
          quantity: 1,
          components: [{ name: 'Stampa 20x30', quantity: 2 }],
        },
        { name: 'Cornice', quantity: 2, isCustom: true },
      ],
    });
    expect(JSON.stringify(snapshot)).not.toContain('private@example.com');
    expect(JSON.stringify(snapshot)).not.toContain('120');
  });

  it('builds a readable lab manifest with the order description and uploaded files', () => {
    const snapshot = createWalkInOrderSnapshot('order-731', {
      nomeEvento: 'Ordine walk-in',
      nomeCliente: 'Alda Granata',
      note: 'Stampa senza bordo',
      prodotti: [{ prodottoNome: 'Foto 20x30', quantita: 3 }],
    });
    const manifest = buildWalkInLabManifest(snapshot, {
      descrizione: 'Ordine walk-in · Foto 20x30 ×3',
      labNote: '',
      files: [
        { name: 'materiale.zip', kind: 'supplemental' } as any,
        { name: WALK_IN_LAB_MANIFEST_FILENAME, kind: 'manifest' } as any,
      ],
    });

    expect(manifest).toContain('3 × Foto 20x30');
    expect(manifest).toContain('Stampa senza bordo');
    expect(manifest).toContain('- materiale.zip');
    expect(manifest).not.toContain('- DISTINTA-ORDINE.txt');
    expect(manifest).not.toContain('Nessun file allegato.');
  });
});
