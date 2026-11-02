import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  request: vi.fn(),
  alert: vi.fn(async () => undefined),
}));

vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ default: { request: mocks.request } }));
vi.mock('./firebase-admin.js', () => ({ db: {} }));
vi.mock('./wedding-seo.js', () => ({
  loadGallery: vi.fn(),
  loadSelectedPhotos: vi.fn(),
  storyFromDocument: vi.fn(),
}));
vi.mock('./system-alerts.js', () => ({ sendAdminSystemAlert: mocks.alert }));

import {
  MAX_SOCIAL_COVER_PROBES_PER_RUN,
  probeSocialCover,
  runSocialCoverHealthCheck,
  type SocialCoverCandidate,
} from './social-cover-health.js';

function candidate(index: number): SocialCoverCandidate {
  return {
    key: `article:post-${index}`,
    kind: 'article',
    title: `Article ${index}`,
    pageUrl: `/blog/post-${index}`,
    imageUrl: `https://images.example.test/${index}.jpg`,
  };
}

function fakeDatabase() {
  const documents = new Map<string, Record<string, any>>();
  const reference = (collectionName: string, id: string) => ({
    key: `${collectionName}/${id}`,
    get: async () => {
      const data = documents.get(`${collectionName}/${id}`);
      return { exists: Boolean(data), data: () => data };
    },
    set: async (data: Record<string, any>, options?: { merge?: boolean }) => {
      const key = `${collectionName}/${id}`;
      documents.set(key, options?.merge ? { ...(documents.get(key) || {}), ...data } : data);
    },
  });
  return {
    documents,
    collection: (name: string) => ({ doc: (id: string) => reference(name, id) }),
    runTransaction: async (callback: (transaction: any) => Promise<any>) => callback({
      get: async (ref: ReturnType<typeof reference>) => {
        const data = documents.get(ref.key);
        return { exists: Boolean(data), data: () => data };
      },
      set: (ref: ReturnType<typeof reference>, data: Record<string, any>) => {
        documents.set(ref.key, data);
      },
      create: (ref: ReturnType<typeof reference>, data: Record<string, any>) => {
        if (documents.has(ref.key)) throw new Error('document already exists');
        documents.set(ref.key, data);
      },
    }),
  };
}

describe('social cover health checker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records a broken cover once, then alerts again only after recovery', async () => {
    const database = fakeDatabase();
    const onlyCandidate = [candidate(1)];
    let now = 1_800_000_000_000;
    let reachable = false;
    const deps = {
      db: database,
      now: () => now++,
      loadCandidates: async () => onlyCandidate,
      probe: async () => reachable ? { ok: true } : { ok: false, reason: 'Risposta HTTP 404' },
      notify: mocks.alert,
    };

    const first = await runSocialCoverHealthCheck(deps);
    const repeated = await runSocialCoverHealthCheck(deps);
    reachable = true;
    const recovered = await runSocialCoverHealthCheck(deps);
    reachable = false;
    const brokenAgain = await runSocialCoverHealthCheck(deps);

    expect(first).toMatchObject({ checked: 1, unavailable: 1, newFailures: 1 });
    expect(repeated).toMatchObject({ checked: 1, unavailable: 1, newFailures: 0 });
    expect(recovered).toMatchObject({ checked: 1, unavailable: 0, newFailures: 0 });
    expect(brokenAgain).toMatchObject({ checked: 1, unavailable: 1, newFailures: 1 });
    expect(mocks.alert).toHaveBeenCalledTimes(2);
    expect([...database.documents.values()].filter(value => value.type === 'social_cover_unavailable')).toHaveLength(2);
    expect([...database.documents.values()].find(value => value.key === 'article:post-1')).toMatchObject({
      isBroken: true,
      reason: 'Risposta HTTP 404',
    });
  });

  it('caps each scheduled batch and rotates through the candidate set', async () => {
    const database = fakeDatabase();
    const candidates = Array.from({ length: MAX_SOCIAL_COVER_PROBES_PER_RUN + 5 }, (_, index) => candidate(index));
    const checked: string[] = [];
    const deps = {
      db: database,
      loadCandidates: async () => candidates,
      probe: async (url: string) => {
        checked.push(url);
        return { ok: true };
      },
      notify: mocks.alert,
    };

    const first = await runSocialCoverHealthCheck(deps);
    const second = await runSocialCoverHealthCheck(deps);

    expect(first.checked).toBe(MAX_SOCIAL_COVER_PROBES_PER_RUN);
    expect(second.checked).toBe(5);
    expect(checked).toHaveLength(MAX_SOCIAL_COVER_PROBES_PER_RUN + 5);
    expect(new Set(checked).size).toBe(checked.length);
    expect(mocks.alert).not.toHaveBeenCalled();
  });

  it('rejects non-HTTPS, IP-literal, and private-DNS targets before connecting', async () => {
    mocks.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    await expect(probeSocialCover('http://images.example.test/photo.jpg'))
      .resolves.toMatchObject({ ok: false });
    await expect(probeSocialCover('https://127.0.0.1/photo.jpg'))
      .resolves.toMatchObject({ ok: false });
    await expect(probeSocialCover('https://images.example.test/photo.jpg'))
      .resolves.toMatchObject({ ok: false, reason: 'Host senza soli indirizzi IP pubblici' });
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('pins HTTPS to the validated public DNS answer and verifies image bytes', async () => {
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    let requestOptions: any;
    mocks.request.mockImplementation((_url: URL, options: any, callback: (response: any) => void) => {
      requestOptions = options;
      const request = new EventEmitter() as EventEmitter & {
        setTimeout: () => void;
        destroy: () => void;
        end: () => void;
      };
      request.setTimeout = () => undefined;
      request.destroy = () => undefined;
      request.end = () => {
        const response = Object.assign(new EventEmitter(), {
          statusCode: 200,
          headers: { 'content-type': 'image/png' },
        });
        callback(response);
        setImmediate(() => {
          response.emit('data', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
          response.emit('end');
        });
      };
      return request;
    });

    await expect(probeSocialCover('https://images.example.test/cover.png?token=private'))
      .resolves.toEqual({ ok: true });
    expect(requestOptions.servername).toBe('images.example.test');
    expect(requestOptions.headers.Range).toMatch(/^bytes=0-/);
    expect(typeof requestOptions.lookup).toBe('function');
    const pinnedAnswer = await new Promise<any>((resolve, reject) => {
      requestOptions.lookup('images.example.test', { all: true }, (error: Error | null, addresses: any[]) => {
        if (error) reject(error);
        else resolve(addresses);
      });
    });
    expect(pinnedAnswer).toEqual([{ address: '93.184.216.34', family: 4 }]);
    expect(mocks.alert).not.toHaveBeenCalled();
  });
});
