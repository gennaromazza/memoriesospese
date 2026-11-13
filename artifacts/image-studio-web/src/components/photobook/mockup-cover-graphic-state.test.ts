import { describe, expect, it } from 'vitest';
import { mockupCoverGraphicBlock } from './mockup-cover-graphic-state';

describe('conferma mockup con grafica Quadrobook', () => {
  it('blocca la conferma finché la grafica è in caricamento o non è disponibile', () => {
    expect(mockupCoverGraphicBlock('loading')).toContain('Attendi il caricamento');
    expect(mockupCoverGraphicBlock('error')).toContain('Ricarica la proposta');
  });

  it('non blocca i modelli senza grafica o quando il file è disponibile', () => {
    expect(mockupCoverGraphicBlock('idle')).toBeNull();
    expect(mockupCoverGraphicBlock('ready')).toBeNull();
  });
});
