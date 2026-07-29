/**
 * AUDIT SUITE — Preventivi variabili
 * Copre: regole di esclusione (requirements), benefit, calcolo totali e loro interazione.
 * Eseguire con: npx vitest run shared/quote-requirements.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  RequirementRule,
  migrateRequirementRules,
  computeBlockedProducts,
  sanitizeSelection,
  findInvalidSelections,
  formatRequiredNames,
} from './quote-requirements';
import { computeBenefitStates, BenefitRule } from './quote-benefits';
import { calculateQuoteTotals } from './quote-utils';

const rule = (over: Partial<RequirementRule> = {}): RequirementRule => ({
  id: 'r1',
  enabled: true,
  type: 'requires',
  blockedProductNames: ['Anteprima Video', 'Permanenza al ristorante del videomaker'],
  requiredProductNames: ['Videomaker a casa'],
  ...over,
});

const exclusion = (over: Partial<RequirementRule> = {}): RequirementRule => ({
  id: 'x1',
  enabled: true,
  type: 'excludes',
  blockedProductNames: ['Album', 'Album Big'],
  requiredProductNames: [],
  ...over,
});

describe('regole di mutua esclusione (excludes)', () => {
  it('nessun blocco quando nessun membro del gruppo è selezionato', () => {
    expect(computeBlockedProducts([exclusion()], []).size).toBe(0);
    expect(computeBlockedProducts([exclusion()], ['Drone']).size).toBe(0);
  });

  it('selezionando Album blocca Album Big (e viceversa)', () => {
    const b1 = computeBlockedProducts([exclusion()], ['Album']);
    expect(b1.has('Album Big')).toBe(true);
    expect(b1.has('Album')).toBe(false);
    expect(b1.get('Album Big')!.message).toBe('Non compatibile con: Album');

    const b2 = computeBlockedProducts([exclusion()], ['Album Big']);
    expect(b2.has('Album')).toBe(true);
    expect(b2.has('Album Big')).toBe(false);
  });

  it('gruppo con 3+ prodotti: uno selezionato blocca tutti gli altri', () => {
    const r = exclusion({ blockedProductNames: ['Album', 'Album Big', 'Album Deluxe'] });
    const blocked = computeBlockedProducts([r], ['Album Big']);
    expect(blocked.has('Album')).toBe(true);
    expect(blocked.has('Album Deluxe')).toBe(true);
    expect(blocked.has('Album Big')).toBe(false);
  });

  it('deselezionando il membro scelto, gli altri tornano liberi', () => {
    expect(computeBlockedProducts([exclusion()], []).size).toBe(0);
  });

  it('stato sporco (entrambi selezionati): sanitizeSelection tiene il primo e rimuove gli altri', () => {
    const { selection, removed } = sanitizeSelection([exclusion()], ['Album', 'Album Big']);
    expect(selection).toEqual(['Album']);
    expect(removed).toEqual(['Album Big']);
  });

  it('findInvalidSelections segnala il doppione (validazione server)', () => {
    const invalid = findInvalidSelections([exclusion()], ['Album', 'Album Big']);
    expect(invalid.map(i => i.productName)).toEqual(['Album Big']);
    expect(invalid[0].message).toBe('Non compatibile con: Album');
  });

  it('ignora gruppi con meno di 2 prodotti (mai bloccare per errore)', () => {
    expect(computeBlockedProducts([exclusion({ blockedProductNames: ['Album'] })], ['Album']).size).toBe(0);
  });

  it('ignora regole excludes disabilitate', () => {
    expect(computeBlockedProducts([exclusion({ enabled: false })], ['Album']).size).toBe(0);
  });

  it('convive con le regole requires (Album esclude Album Big + Anteprima richiede Videomaker)', () => {
    const rules = [rule(), exclusion()];
    const blocked = computeBlockedProducts(rules, ['Album', 'Videomaker a casa']);
    expect(blocked.has('Album Big')).toBe(true);
    expect(blocked.has('Anteprima Video')).toBe(false);
  });

  it('migrazione: regole senza type diventano requires, type excludes preservato', () => {
    const migrated = migrateRequirementRules([
      { id: 'a', blockedProductNames: ['X'], requiredProductNames: ['Y'] },
      { id: 'b', type: 'excludes', blockedProductNames: ['Album', 'Album Big'] },
    ]);
    expect(migrated[0].type).toBe('requires');
    expect(migrated[1].type).toBe('excludes');
    expect(migrated[1].requiredProductNames).toEqual([]);
  });
});

describe('computeBlockedProducts', () => {
  it('blocca i prodotti quando il trigger non è selezionato', () => {
    const blocked = computeBlockedProducts([rule()], []);
    expect(blocked.has('Anteprima Video')).toBe(true);
    expect(blocked.has('Permanenza al ristorante del videomaker')).toBe(true);
    expect(blocked.get('Anteprima Video')!.message).toBe('Richiede: Videomaker a casa');
  });

  it('sblocca i prodotti quando il trigger è selezionato', () => {
    const blocked = computeBlockedProducts([rule()], ['Videomaker a casa']);
    expect(blocked.size).toBe(0);
  });

  it('richiede TUTTI i trigger (logica AND, come i benefit)', () => {
    const r = rule({ requiredProductNames: ['Videomaker a casa', 'Drone'] });
    expect(computeBlockedProducts([r], ['Videomaker a casa']).size).toBe(2);
    expect(computeBlockedProducts([r], ['Videomaker a casa', 'Drone']).size).toBe(0);
  });

  it('ignora regole disabilitate', () => {
    expect(computeBlockedProducts([rule({ enabled: false })], []).size).toBe(0);
  });

  it('ignora regole senza trigger o senza prodotti bloccati (mai bloccare per errore)', () => {
    expect(computeBlockedProducts([rule({ requiredProductNames: [] })], []).size).toBe(0);
    expect(computeBlockedProducts([rule({ blockedProductNames: [] })], []).size).toBe(0);
  });

  it('unisce i trigger mancanti quando più regole bloccano lo stesso prodotto', () => {
    const r2 = rule({ id: 'r2', blockedProductNames: ['Anteprima Video'], requiredProductNames: ['Drone'] });
    const blocked = computeBlockedProducts([rule(), r2], []);
    const state = blocked.get('Anteprima Video')!;
    expect(state.missingProductNames.sort()).toEqual(['Drone', 'Videomaker a casa']);
    expect(state.message).toContain('Richiede: ');
  });

  it('i prodotti Fissi (sempre inclusi) contano come selezionati se passati', () => {
    // Il chiamante include i nomi dei prodotti fissi nella selezione
    const blocked = computeBlockedProducts([rule()], ['Videomaker a casa' /* fisso */]);
    expect(blocked.size).toBe(0);
  });
});

describe('sanitizeSelection (deselezione automatica a cascata)', () => {
  it('rimuove i prodotti bloccati quando il trigger viene tolto', () => {
    const { selection, removed } = sanitizeSelection([rule()], ['Anteprima Video']);
    expect(selection).toEqual([]);
    expect(removed).toEqual(['Anteprima Video']);
  });

  it('non tocca selezioni valide', () => {
    const { selection, removed } = sanitizeSelection([rule()], ['Videomaker a casa', 'Anteprima Video']);
    expect(selection).toEqual(['Videomaker a casa', 'Anteprima Video']);
    expect(removed).toEqual([]);
  });

  it('cascata: rimuovere un prodotto ne fa cadere altri a catena', () => {
    // Permanenza richiede Anteprima Video, che richiede Videomaker a casa
    const r1 = rule({ id: 'a', blockedProductNames: ['Anteprima Video'], requiredProductNames: ['Videomaker a casa'] });
    const r2 = rule({ id: 'b', blockedProductNames: ['Permanenza'], requiredProductNames: ['Anteprima Video'] });
    const { selection, removed } = sanitizeSelection([r1, r2], ['Anteprima Video', 'Permanenza']);
    expect(selection).toEqual([]);
    expect(removed).toContain('Anteprima Video');
    expect(removed).toContain('Permanenza');
  });

  it('non entra in loop con regole circolari', () => {
    const r1 = rule({ id: 'a', blockedProductNames: ['X'], requiredProductNames: ['Y'] });
    const r2 = rule({ id: 'b', blockedProductNames: ['Y'], requiredProductNames: ['X'] });
    const { selection } = sanitizeSelection([r1, r2], ['X', 'Y']);
    // X e Y si sostengono a vicenda: selezione con entrambi è valida
    expect(selection.sort()).toEqual(['X', 'Y']);
    // Ma uno solo dei due cade
    expect(sanitizeSelection([r1, r2], ['X']).selection).toEqual([]);
  });
});

describe('findInvalidSelections (validazione server)', () => {
  it('segnala prodotti bloccati presenti nella selezione', () => {
    const invalid = findInvalidSelections([rule()], ['Anteprima Video']);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].productName).toBe('Anteprima Video');
  });

  it('selezione valida → nessun errore', () => {
    expect(findInvalidSelections([rule()], ['Videomaker a casa', 'Anteprima Video'])).toEqual([]);
  });
});

describe('migrateRequirementRules', () => {
  it('normalizza dati sporchi da Firestore', () => {
    const out = migrateRequirementRules([
      { id: 1, blockedProductNames: ['A', null], requiredProductNames: null },
      null,
      { id: 'x', enabled: false, blockedProductNames: ['B'], requiredProductNames: ['C'] },
    ] as any);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ id: '1', enabled: true, type: 'requires', blockedProductNames: ['A'], requiredProductNames: [] });
    expect(out[1].enabled).toBe(false);
  });

  it('input non-array → array vuoto', () => {
    expect(migrateRequirementRules(undefined as any)).toEqual([]);
  });
});

describe('formatRequiredNames', () => {
  it('formatta 1, 2 e 3+ nomi', () => {
    expect(formatRequiredNames(['A'])).toBe('A');
    expect(formatRequiredNames(['A', 'B'])).toBe('A e B');
    expect(formatRequiredNames(['A', 'B', 'C'])).toBe('A, B e C');
  });
});

describe('AUDIT: interazione requirements + benefit + totali', () => {
  const benefitRule: BenefitRule = {
    id: 'b1',
    enabled: true,
    benefitProductNames: ['Album Omaggio'],
    requiredProductNames: ['Videomaker a casa'],
  };

  it('totali: la deselezione a cascata riduce il subtotale correttamente', () => {
    const prices: Record<string, number> = {
      'Videomaker a casa': 500,
      'Anteprima Video': 200,
      'Servizio Base': 1000,
    };
    const before = ['Servizio Base', 'Videomaker a casa', 'Anteprima Video'];
    const subBefore = before.reduce((s, n) => s + prices[n], 0);
    expect(calculateQuoteTotals(subBefore).totalAfterDiscount).toBe(1700);

    // Cliente toglie "Videomaker a casa" → cascata rimuove "Anteprima Video"
    const afterToggle = before.filter(n => n !== 'Videomaker a casa');
    const { selection } = sanitizeSelection([rule()], afterToggle);
    expect(selection).toEqual(['Servizio Base']);
    const subAfter = selection.reduce((s, n) => s + prices[n], 0);
    expect(calculateQuoteTotals(subAfter).totalAfterDiscount).toBe(1000);
  });

  it('totali: sconto percentuale e fisso restano coerenti dopo la cascata', () => {
    const t1 = calculateQuoteTotals(1000, 'percent', 10);
    expect(t1.discountAmount).toBe(100);
    expect(t1.totalAfterDiscount).toBe(900);
    const t2 = calculateQuoteTotals(1000, 'amount', 150);
    expect(t2.totalAfterDiscount).toBe(850);
  });

  it('benefit e requirement sullo stesso trigger: togliendo il trigger si perdono entrambi', () => {
    // Con trigger selezionato: benefit sbloccato, nessun blocco
    const withTrigger = ['Videomaker a casa', 'Anteprima Video'];
    expect(computeBenefitStates([benefitRule], withTrigger, withTrigger)[0].isUnlocked).toBe(true);
    expect(computeBlockedProducts([rule()], withTrigger).size).toBe(0);

    // Senza trigger: benefit bloccato E Anteprima Video rimossa dalla cascata
    const { selection } = sanitizeSelection([rule()], ['Anteprima Video']);
    expect(selection).toEqual([]);
    expect(computeBenefitStates([benefitRule], selection, withTrigger)[0].isUnlocked).toBe(false);
  });

  it('il prodotto benefit (omaggio) non deve mai essere conteggiato nel totale', () => {
    // Regola di sistema già in vigore: subtotale = solo prodotti selezionati non-omaggio
    const products = [
      { nome: 'Servizio Base', prezzo: 1000, selected: true, isOmaggio: false },
      { nome: 'Album Omaggio', prezzo: 0, selected: true, isOmaggio: true },
    ];
    const sub = products.reduce((s, p) => s + (p.isOmaggio ? 0 : p.selected ? p.prezzo : 0), 0);
    expect(calculateQuoteTotals(sub).totalAfterDiscount).toBe(1000);
  });
});
