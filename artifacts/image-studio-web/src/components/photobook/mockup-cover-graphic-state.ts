export type MockupCoverGraphicState = 'idle' | 'loading' | 'ready' | 'error';

export function mockupCoverGraphicBlock(state: MockupCoverGraphicState): string | null {
  if (state === 'loading') return 'Attendi il caricamento della grafica di copertina prima di confermare.';
  if (state === 'error') return 'Grafica di copertina non disponibile. Ricarica la proposta per riprovare.';
  return null;
}
