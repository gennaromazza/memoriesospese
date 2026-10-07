import { describe, expect, it } from 'vitest';
import type { Gallery } from '../../lib/api-hooks';
import type { GalleryClient } from '../../lib/gallery-associations';
import { getWhatsAppRecipients } from './whatsapp-share-button';

describe('gallery WhatsApp recipients', () => {
  it('includes only unique linked clients with a usable phone number', () => {
    const gallery = { clientIds: ['linked', 'linked', 'without-phone'] } as Gallery;
    const clients: GalleryClient[] = [
      { id: 'linked', nome: 'Ada', telefono: '327 123 4567' },
      { id: 'without-phone', nome: 'Grace', telefono: 'not a phone' },
      { id: 'unlinked', nome: 'Unlinked', telefono: '+39 333 444 5566' },
    ];

    expect(getWhatsAppRecipients(gallery, clients)).toEqual([
      { client: clients[0], phone: '393271234567' },
    ]);
  });

  it('supports the legacy single-client gallery association', () => {
    const gallery = { clienteId: 'legacy-client' } as Gallery;
    const client: GalleryClient = { id: 'legacy-client', telefono: '+1 (415) 555-0134' };

    expect(getWhatsAppRecipients(gallery, [client])).toEqual([
      { client, phone: '14155550134' },
    ]);
  });

  it('uses WhatsApp and mobile fields for all linked clients even when clientIds is empty', () => {
    const gallery = { clientIds: [], clientiIds: ['first'], clienteId: 'second' } as Gallery;
    const clients: GalleryClient[] = [
      { id: 'first', whatsapp: 'N/D', cellulare1: '327 123 4567' },
      { id: 'second', whatsapp: '+39 333 444 5566', cellulare1: '333 000 0000' },
      { id: 'unlinked', whatsapp: '+39 333 222 1111' },
    ];

    expect(getWhatsAppRecipients(gallery, clients)).toEqual([
      { client: clients[0], phone: '393271234567' },
      { client: clients[1], phone: '393334445566' },
    ]);
  });
});