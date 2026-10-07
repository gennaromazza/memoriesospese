import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface FirestoreFieldOverride {
  collectionGroup?: string;
  fieldPath?: string;
  indexes?: Array<{
    order?: string;
    queryScope?: string;
  }>;
}

describe('print shop deployment configuration', () => {
  it('indexes expiring assets for the collection-group retention query', () => {
    const config = JSON.parse(
      readFileSync('firestore.indexes.json', 'utf8'),
    ) as { fieldOverrides?: FirestoreFieldOverride[] };

    const expiresAt = config.fieldOverrides?.find(
      override =>
        override.collectionGroup === 'assets' &&
        override.fieldPath === 'expiresAt',
    );

    expect(expiresAt?.indexes).toContainEqual({
      order: 'ASCENDING',
      queryScope: 'COLLECTION_GROUP',
    });
  });
});
