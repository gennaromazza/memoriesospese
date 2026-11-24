import { describe, expect, it } from "vitest";
import type { QuoteProduct } from "@shared/quotes-types";
import { mergeQuoteProducts } from "./quote-mappers";

describe("mergeQuoteProducts custom product identity", () => {
  it("keeps separately configured products with the same name distinct", () => {
    const products: QuoteProduct[] = [
      {
        customProductId: "custom-a",
        nome: "Album extra",
        descrizione: "Versione piccola",
        prezzo: 120,
        selectable: true,
        sezione: "Album",
      },
      {
        customProductId: "custom-b",
        nome: "Album extra",
        descrizione: "Versione grande",
        prezzo: 240,
        selectable: false,
        sezione: "Stampe",
      },
    ];

    const merged = mergeQuoteProducts([], products, [], "variabile");

    expect(merged.map(product => product.customProductId)).toEqual(["custom-a", "custom-b"]);
    expect(merged.map(product => product.prezzo)).toEqual([120, 240]);
    expect(merged.map(product => product.selectable)).toEqual([true, false]);
    expect(merged.map(product => product.sezione)).toEqual(["Album", "Stampe"]);
  });

  it("adds unique stable identifiers while saving legacy custom products", () => {
    const legacyProducts: QuoteProduct[] = [
      { nome: "Servizio custom", descrizione: "", prezzo: 50, selectable: true },
      { nome: "Servizio custom", descrizione: "", prezzo: 75, selectable: false },
    ];

    const merged = mergeQuoteProducts([], legacyProducts, [], "variabile");
    const identifiers = merged.map(product => product.customProductId);

    expect(identifiers.every(Boolean)).toBe(true);
    expect(new Set(identifiers).size).toBe(2);
    expect(merged.map(product => product.prezzo)).toEqual([50, 75]);
  });
});
