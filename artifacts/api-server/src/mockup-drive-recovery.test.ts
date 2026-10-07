import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ responses: [] as Response[], calls: [] as unknown[][] }));
vi.mock('@replit/connectors-sdk', () => ({ ReplitConnectors: class { async proxy(...args: unknown[]) { h.calls.push(args); return h.responses.shift(); } } }));
import { findMatchingShipmentFile } from './google-drive';
describe('Riconciliazione Drive: verifica reale dei byte, nessun upload', () => {
  beforeEach(() => { h.responses = []; h.calls = []; });
  const expected = Buffer.from('conferma');
  const metadata = (files: unknown[]) => new Response(JSON.stringify({ files }), { status: 200 });
  it('non crea file se non trova una copia precedente', async () => {
    h.responses.push(metadata([]));
    expect(await findMatchingShipmentFile('folder', 'MOCKUP.html', expected)).toBeNull();
    expect(h.calls).toHaveLength(1);
  });
  it('rifiuta più copie con lo stesso nome', async () => {
    h.responses.push(metadata([{ id: 'a' }, { id: 'b' }]));
    await expect(findMatchingShipmentFile('folder', 'MOCKUP.html', expected)).rejects.toThrow('Più file');
    expect(h.calls).toHaveLength(1);
  });
  it('rifiuta dimensioni diverse senza scaricare', async () => {
    h.responses.push(metadata([{ id: 'a', size: '999' }]));
    await expect(findMatchingShipmentFile('folder', 'MOCKUP.html', expected)).rejects.toThrow('non corrisponde');
    expect(h.calls).toHaveLength(1);
  });
  it('accetta solo byte identici ed esegue soltanto letture', async () => {
    h.responses.push(metadata([{ id: 'a', size: '8' }]), new Response(expected));
    expect(await findMatchingShipmentFile('folder', 'MOCKUP.html', expected)).toEqual({ fileId: 'a', size: 8 });
    expect(h.calls).toHaveLength(2);
    expect(h.calls.every(c => c[2] === undefined)).toBe(true);
    expect(decodeURIComponent(String(h.calls[0][1]))).toContain("'folder' in parents and name='MOCKUP.html'");
  });
  it('rifiuta file della stessa dimensione ma contenuto diverso', async () => {
    h.responses.push(metadata([{ id: 'a', size: '8' }]), new Response('diverso!'));
    await expect(findMatchingShipmentFile('folder', 'MOCKUP.html', expected)).rejects.toThrow('contenuto Drive è diverso');
  });
  it('interrompe lo scaricamento se il file cresce fra metadati e contenuto', async () => {
    h.responses.push(metadata([{ id: 'a', size: '8' }]), new Response('contenuto diventato troppo grande'));
    await expect(findMatchingShipmentFile('folder', 'MOCKUP.html', expected)).rejects.toThrow('cambiato durante');
  });
});
