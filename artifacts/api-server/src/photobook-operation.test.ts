import { afterEach, describe, expect, it, vi } from 'vitest';
import { newPhotobookOperation, operationAbandoned, PHOTOBOOK_STALE_MS, photobookRecovery, watchPhotobookOperation } from './photobook-operation.js';

afterEach(() => vi.useRealTimers());

function service(shipment: any) {
  const ref = {};
  const db = { runTransaction: async (run: any) => run({
    get: async () => ({ data: () => shipment }),
    update: (_ref: any, patch: any) => {
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.split('.');
        let target = shipment;
        for (const part of parts.slice(0, -1)) target = target[part] ||= {};
        target[parts.at(-1)!] = value;
      }
    },
  }) };
  return { db, ref };
}

describe('persistent photobook operation ownership (no external services)', () => {
  it.each(['pageTransfer', 'photobookDispatch'] as const)('keeps a slow %s alive and exposes recovery only after crash', async kind => {
    vi.useFakeTimers();
    const shipment: any = { sourceType: 'photobook', mockupDispatching: true, [kind]: { ...newPhotobookOperation(), status: 'running' } };
    const { db, ref } = service(shipment);
    const operation = watchPhotobookOperation(db, ref, kind, shipment[kind].id);
    await vi.advanceTimersByTimeAsync(PHOTOBOOK_STALE_MS * 2);
    expect(operationAbandoned(shipment, kind)).toBe(false);
    expect(Date.now() - shipment[kind].heartbeatAt.getTime()).toBeLessThan(16_000);
    // Simulate killed process: no catch, no uncertain flag, no heartbeat.
    operation.stop();
    await vi.advanceTimersByTimeAsync(PHOTOBOOK_STALE_MS + 1);
    expect(operationAbandoned(shipment, kind)).toBe(true);
  });
  it('never releases a locally live send even with an old heartbeat or uncertainty marker', () => {
    const shipment: any = { mockupDispatching: true, photobookDispatchUncertain: true, photobookDispatch: { ...newPhotobookOperation(), heartbeatAt: new Date(1), settled: true } };
    const { db, ref } = service(shipment);
    const operation = watchPhotobookOperation(db, ref, 'photobookDispatch', shipment.photobookDispatch.id);
    try { expect(operationAbandoned(shipment, 'photobookDispatch')).toBe(false); }
    finally { operation.stop(); }
  });
  it('fences an old worker after recovery: no writes to the replacement operation', async () => {
    const shipment: any = { pageTransfer: { ...newPhotobookOperation(), status: 'running' } };
    const { db, ref } = service(shipment);
    const operation = watchPhotobookOperation(db, ref, 'pageTransfer', shipment.pageTransfer.id);
    shipment.pageTransfer = { ...newPhotobookOperation(), status: 'running' };
    try {
      await expect(operation.update({ files: ['old'] })).rejects.toThrow('blocco');
      expect(shipment.files).toBeUndefined();
    } finally { operation.stop(); }
  });
  it('handles legacy timestamp shapes conservatively and requires a dated lock', () => {
    const now = Date.now();
    for (const date of [{ _seconds: (now - 240_000) / 1000 }, { seconds: (now - 240_000) / 1000 }, new Date(now - 240_000).toISOString()]) {
      expect(photobookRecovery({ sourceType: 'photobook', mockupDispatching: true, updatedAt: date }).dispatchAbandoned).toBe(true);
    }
    expect(operationAbandoned({ mockupDispatching: true }, 'photobookDispatch')).toBe(false);
    expect(operationAbandoned({ mockupDispatching: true, updatedAt: 'invalid' }, 'photobookDispatch')).toBe(false);
    expect(operationAbandoned({ mockupDispatching: true, photobookDispatch: { heartbeatAt: new Date() } }, 'photobookDispatch')).toBe(false);
  });
});
