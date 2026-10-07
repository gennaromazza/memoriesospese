import { describe, expect, it } from 'vitest';
import { formatClienteAddress, getIndirizzoFiscale } from './clienti-address';
import { buildClienteFiscaleSnapshot } from './receipt-utils';

describe('indirizzo fiscale cliente', () => {
  const indirizzoOperativo = {
    via: 'Via Operativa 10',
    citta: 'Napoli',
    cap: '80100',
    provincia: 'NA',
  };

  it('mantiene l’indirizzo operativo per i clienti esistenti senza flag', () => {
    expect(getIndirizzoFiscale(indirizzoOperativo)).toEqual({
      ...indirizzoOperativo,
      isAlternativo: false,
    });
  });

  it('usa l’indirizzo fiscale distinto senza sovrascrivere quello operativo', () => {
    const cliente = {
      ...indirizzoOperativo,
      indirizzoFiscaleUguale: false,
      viaFiscale: 'Via Fiscale 42',
      cittaFiscale: 'Roma',
      capFiscale: '00100',
      provinciaFiscale: 'RM',
    };

    expect(getIndirizzoFiscale(cliente)).toEqual({
      via: 'Via Fiscale 42',
      citta: 'Roma',
      cap: '00100',
      provincia: 'RM',
      isAlternativo: true,
    });
    expect(cliente.via).toBe('Via Operativa 10');
    expect(formatClienteAddress(getIndirizzoFiscale(cliente))).toBe('Via Fiscale 42, 00100 Roma, RM');
  });

  it('torna all’indirizzo operativo se un’alternativa è assente o incompleta', () => {
    const alternativaIncompleta = {
      ...indirizzoOperativo,
      indirizzoFiscaleUguale: false,
      viaFiscale: 'Via fiscale senza CAP',
    };

    expect(getIndirizzoFiscale(alternativaIncompleta)).toEqual({
      ...indirizzoOperativo,
      isAlternativo: false,
    });
    expect(buildClienteFiscaleSnapshot(alternativaIncompleta).indirizzo)
      .toBe('Via Operativa 10, 80100 Napoli, NA');
  });

  it('prepara la ricevuta con l’indirizzo fiscale effettivo', () => {
    expect(buildClienteFiscaleSnapshot({
      ...indirizzoOperativo,
      indirizzoFiscaleUguale: false,
      viaFiscale: 'Corso Italia 5',
      cittaFiscale: 'Milano',
      capFiscale: '20100',
      provinciaFiscale: 'MI',
      codiceFiscale: 'RSSMRA85M01H501Q',
    })).toMatchObject({
      codiceFiscale: 'RSSMRA85M01H501Q',
      indirizzo: 'Corso Italia 5, 20100 Milano, MI',
    });
  });
});