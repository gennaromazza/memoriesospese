import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MANAGED_ORDER_TYPES, isManagedOrderType } from '@shared/managed-order-types';

const rules = readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8');
const orderRoutes = readFileSync(new URL('./order-routes.ts', import.meta.url), 'utf8');

describe('tipi di ordine gestiti dal backend dedicato', () => {
  it('riconosce stampe e shop e nessun altro tipo', () => {
    expect(isManagedOrderType('print_shop')).toBe(true);
    expect(isManagedOrderType('shop')).toBe(true);
    for (const value of ['walk-in', '', undefined, null, 42, 'Shop']) {
      expect(isManagedOrderType(value)).toBe(false);
    }
  });

  it('le regole Firestore proteggono esattamente gli stessi tipi', () => {
    const helper = rules.match(/function isPrintShopOrder\(data\) \{[\s\S]*?\n    \}/)?.[0];
    expect(helper).toBeDefined();
    const listed = [...(helper as string).matchAll(/'([a-z_]+)'/g)]
      .map(match => match[1])
      .filter(value => value !== 'orderType');
    expect(listed.sort()).toEqual([...MANAGED_ORDER_TYPES].sort());
  });

  it('le route legacy degli ordini rifiutano ogni tipo gestito', () => {
    for (const type of MANAGED_ORDER_TYPES) {
      const occurrences = orderRoutes.match(new RegExp(`orderType === '${type}'`, 'g')) ?? [];
      expect(occurrences, `controlli per ${type}`).toHaveLength(4);
    }
  });
});
