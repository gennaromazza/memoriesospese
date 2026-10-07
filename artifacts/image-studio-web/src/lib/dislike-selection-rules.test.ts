import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
const galleryId = 'inverse-selection';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'inverse-selection-rules-test',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync('../../firestore.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'galleries', galleryId), {
      userId: 'owner',
      selectionEnabled: true,
      selectionMode: 'dislike',
      selectionStatus: 'pending',
      selectedPhotoIds: [],
    });
  });
});

afterAll(async () => { await env.cleanup(); });

describe('non-admin inverse selection confirmation rules', () => {
  it.each([0, 2])('allows a non-owner client to confirm %i dislikes, then keeps them on read', async count => {
    const client = env.authenticatedContext('client', { email: 'client@example.com' }).firestore();
    const ref = doc(client, 'galleries', galleryId);
    await assertSucceeds(updateDoc(ref, {
      selectedPhotoIds: ['kept'],
      selectionStatus: 'completed',
      dislikedPhotoCount: count,
    }));
    expect((await getDoc(ref)).data()?.dislikedPhotoCount).toBe(count);
    await assertFails(updateDoc(ref, { dislikedPhotoCount: count + 1 }));
    await assertFails(updateDoc(ref, { name: 'tampered' }));
  });

  it('does not allow an invalid count or a count on a regular selection', async () => {
    const client = env.unauthenticatedContext().firestore();
    const ref = doc(client, 'galleries', galleryId);
    await assertFails(updateDoc(ref, { selectionStatus: 'completed', dislikedPhotoCount: -1 }));
    await assertFails(updateDoc(ref, { selectionStatus: 'completed', dislikedPhotoCount: '2' }));
    await env.withSecurityRulesDisabled(async context => {
      await updateDoc(doc(context.firestore(), 'galleries', galleryId), { selectionMode: 'like' });
    });
    await assertFails(updateDoc(ref, { selectionStatus: 'completed', dislikedPhotoCount: 1 }));
  });

  it('lets the owner reset and remove the old count before a new client confirmation', async () => {
    const client = env.authenticatedContext('client', { email: 'client@example.com' }).firestore();
    const owner = env.authenticatedContext('owner', { email: 'owner@example.com' }).firestore();
    const clientRef = doc(client, 'galleries', galleryId);
    await assertSucceeds(updateDoc(clientRef, { selectionStatus: 'completed', dislikedPhotoCount: 2 }));
    await assertSucceeds(updateDoc(doc(owner, 'galleries', galleryId), {
      selectionStatus: 'pending',
      dislikedPhotoCount: deleteField(),
      selectedPhotoIds: [],
    }));
    await assertSucceeds(updateDoc(clientRef, { selectionStatus: 'completed', dislikedPhotoCount: 0 }));
    expect((await getDoc(clientRef)).data()?.dislikedPhotoCount).toBe(0);
  });
});