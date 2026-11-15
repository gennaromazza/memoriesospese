import { describe, expect, it } from "vitest";
import type { QuoteProduct } from "@shared/quotes-types";
import {
  getQuoteProductSelectionKey,
  getSelectedQuoteProductNames,
  isQuoteProductSelected,
  isQuoteProductSelectedForAcceptance,
} from "@shared/quote-product-selection";

const products: QuoteProduct[] = [
  {
    customProductId: "mini",
    nome: "Album aggiuntivo",
    descrizione: "Versione mini",
    prezzo: 120,
    selectable: true,
    sezione: "Album",
  },
  {
    customProductId: "grande",
    nome: "Album aggiuntivo",
    descrizione: "Versione grande",
    prezzo: 240,
    selectable: true,
    sezione: "Stampe",
  },
];

describe("quote product row selections", () => {
  it("keeps same-name rows independently selected and priced", () => {
    const miniKey = getQuoteProductSelectionKey(products[0], 0);
    const largeKey = getQuoteProductSelectionKey(products[1], 1);
    const selectedKeys = [miniKey];

    expect(miniKey).not.toBe(largeKey);
    expect(isQuoteProductSelected(products[0], 0, selectedKeys)).toBe(true);
    expect(isQuoteProductSelected(products[1], 1, selectedKeys)).toBe(false);
    expect(
      products.map((product, index) =>
        isQuoteProductSelectedForAcceptance(product, index, selectedKeys),
      ),
    ).toEqual([true, false]);
    expect(getSelectedQuoteProductNames(products, selectedKeys)).toEqual([
      "Album aggiuntivo",
    ]);
    expect(
      products.reduce(
        (total, product, index) =>
          total +
          (isQuoteProductSelected(product, index, selectedKeys) ? product.prezzo : 0),
        0,
      ),
    ).toBe(120);

    const bothSelected = [miniKey, largeKey];
    expect(getSelectedQuoteProductNames(products, bothSelected)).toEqual([
      "Album aggiuntivo",
      "Album aggiuntivo",
    ]);
    expect(
      products.reduce(
        (total, product, index) =>
          total +
          (isQuoteProductSelected(product, index, bothSelected) ? product.prezzo : 0),
        0,
      ),
    ).toBe(360);
  });

  it("uses row position to disambiguate repeated or legacy product identities", () => {
    const repeatedProductId: QuoteProduct = {
      productId: "catalog-album",
      nome: "Album",
      descrizione: "",
      prezzo: 1,
      selectable: true,
    };
    expect(getQuoteProductSelectionKey(repeatedProductId, 0)).not.toBe(
      getQuoteProductSelectionKey(repeatedProductId, 1),
    );
  });
});
