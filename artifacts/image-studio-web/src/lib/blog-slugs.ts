import {
  collection,
  doc,
  runTransaction,
  Timestamp,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

const POSTS_COLLECTION = 'blogPosts';
const SLUGS_COLLECTION = 'blogSlugs';

export class BlogSlugConflictError extends Error {
  constructor() {
    super('Questo slug è già in uso. Scegline uno diverso.');
    this.name = 'BlogSlugConflictError';
  }
}

export const normalizeBlogSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export async function writeBlogPostWithSlugReservation(options: {
  postId: string;
  slug: string;
  previousSlug?: string;
  data: DocumentData;
  mode: 'create' | 'update';
}): Promise<void> {
  const slug = normalizeBlogSlug(options.slug);
  if (!slug) throw new Error('Slug non valido');

  const postRef = doc(db, POSTS_COLLECTION, options.postId);
  const slugRef = doc(db, SLUGS_COLLECTION, slug);
  const previousSlug = normalizeBlogSlug(options.previousSlug || '');
  const previousSlugRef = previousSlug && previousSlug !== slug
    ? doc(db, SLUGS_COLLECTION, previousSlug)
    : null;

  await runTransaction(db, async transaction => {
    const slugSnapshot = await transaction.get(slugRef);
    const previousSlugSnapshot = previousSlugRef
      ? await transaction.get(previousSlugRef)
      : null;
    const conflictingPostId = slugSnapshot.exists() &&
      slugSnapshot.data().postId !== options.postId
      ? String(slugSnapshot.data().postId || '')
      : '';
    const conflictingPostSnapshot = conflictingPostId
      ? await transaction.get(doc(db, POSTS_COLLECTION, conflictingPostId))
      : null;

    if (conflictingPostSnapshot?.exists()) {
      throw new BlogSlugConflictError();
    }

    if (options.mode === 'create') {
      transaction.set(postRef, options.data);
    } else {
      transaction.update(postRef, options.data);
    }
    transaction.set(slugRef, {
      postId: options.postId,
      slug,
      updatedAt: Timestamp.now(),
    });

    if (
      previousSlugRef &&
      previousSlugSnapshot?.exists() &&
      previousSlugSnapshot.data().postId === options.postId
    ) {
      transaction.delete(previousSlugRef);
    }
  });
}

export async function deleteBlogPostsWithSlugReservations(
  posts: Array<{ id: string; slug?: string }>,
): Promise<void> {
  const uniquePosts = [...new Map(posts.map(post => [post.id, post])).values()];

  await runTransaction(db, async transaction => {
    const reservations = await Promise.all(uniquePosts.map(async post => {
      const slug = normalizeBlogSlug(post.slug || '');
      if (!slug) return { post, ref: null, snapshot: null };
      const ref = doc(db, SLUGS_COLLECTION, slug);
      const snapshot = await transaction.get(ref);
      return { post, ref, snapshot };
    }));

    reservations.forEach(({ post, ref, snapshot }) => {
      transaction.delete(doc(db, POSTS_COLLECTION, post.id));
      if (ref && snapshot?.exists() && snapshot.data().postId === post.id) {
        transaction.delete(ref);
      }
    });
  });
}