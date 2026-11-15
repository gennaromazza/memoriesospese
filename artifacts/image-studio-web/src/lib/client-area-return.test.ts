import { beforeEach, describe, expect, it } from 'vitest';
import { clearClientAreaVisit, isClientAreaReturnPath, markClientAreaVisit, shouldOfferClientAreaReturn } from './client-area-return';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as any).sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
});

describe('ritorno all’area cliente', () => {
  it('riconosce solo le pagine aperte dall’area', () => {
    expect(isClientAreaReturnPath('/quote/abc')).toBe(true);
    expect(isClientAreaReturnPath('/consulenze/matrimonio/t1/prenota')).toBe(true);
    expect(isClientAreaReturnPath('/view/ABC123/')).toBe(true);
    expect(isClientAreaReturnPath('/fotolibro/tok')).toBe(true);
    expect(isClientAreaReturnPath('/portfolio')).toBe(false);
    expect(isClientAreaReturnPath('/area-cliente')).toBe(false);
  });

  it('compare solo dopo una visita recente all’area', () => {
    expect(shouldOfferClientAreaReturn('/quote/abc', 1000)).toBe(false);
    markClientAreaVisit(1000);
    expect(shouldOfferClientAreaReturn('/quote/abc', 2000)).toBe(true);
    expect(shouldOfferClientAreaReturn('/quote/abc', 1000 + 7 * 60 * 60 * 1000)).toBe(false);
    clearClientAreaVisit();
    expect(shouldOfferClientAreaReturn('/quote/abc', 2000)).toBe(false);
  });
});
