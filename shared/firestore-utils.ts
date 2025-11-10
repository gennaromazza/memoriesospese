/**
 * FIRESTORE UTILITIES
 * Utility functions per operazioni Firestore comuni
 */

import { Timestamp } from 'firebase/firestore';

/**
 * Rimuove ricorsivamente tutti i campi undefined da un oggetto
 * 
 * Firestore NON accetta undefined values - questa utility pulisce
 * ricorsivamente oggetti nested, arrays, preservando Timestamp e Date.
 * 
 * @example
 * ```typescript
 * const data = {
 *   name: "Test",
 *   optional: undefined,
 *   nested: {
 *     value: 123,
 *     empty: undefined
 *   }
 * };
 * 
 * const cleaned = removeUndefinedFields(data);
 * // Result: { name: "Test", nested: { value: 123 } }
 * ```
 */
export function removeUndefinedFields<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  
  // Preserva Timestamp e Date senza processarli
  if (obj instanceof Timestamp || obj instanceof Date) {
    return obj;
  }
  
  // Gestisci arrays ricorsivamente
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefinedFields(item)) as unknown as T;
  }
  
  // Gestisci plain objects, filtrando chiavi undefined
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = removeUndefinedFields(value);
      }
    }
    return cleaned as T;
  }
  
  return obj;
}
