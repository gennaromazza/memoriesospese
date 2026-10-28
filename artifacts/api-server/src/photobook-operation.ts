import { randomUUID } from 'node:crypto';

export const PHOTOBOOK_STALE_MS = 3 * 60 * 1000;
const active = new Set<string>();

function millis(value: any): number {
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?._seconds === 'number') return value._seconds * 1000;
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'string') return Date.parse(value);
  return value instanceof Date ? value.getTime() : 0;
}

export function operationAbandoned(shipment: any, kind: 'pageTransfer' | 'photobookDispatch', now = Date.now()): boolean {
  const operation = shipment[kind];
  const running = kind === 'pageTransfer' ? operation?.status === 'running' : shipment.mockupDispatching;
  if (!running || (operation?.id && active.has(operation.id))) return false;
  if (kind === 'photobookDispatch' && operation?.settled === true) return true;
  // Legacy claims have no dedicated heartbeat. A missing date is not proof of
  // abandonment: keep those fail-closed rather than guessing.
  const last = millis(operation?.heartbeatAt || operation?.startedAt || shipment.updatedAt);
  return last > 0 && now - last >= PHOTOBOOK_STALE_MS;
}

export function photobookRecovery(shipment: any) {
  return {
    pageTransferAbandoned: shipment.sourceType === 'photobook' && operationAbandoned(shipment, 'pageTransfer'),
    dispatchAbandoned: shipment.sourceType === 'photobook' && operationAbandoned(shipment, 'photobookDispatch'),
  };
}

export function newPhotobookOperation() {
  return { id: randomUUID(), startedAt: new Date(), heartbeatAt: new Date() };
}

/** Persistent ownership fences old workers after explicit recovery. A periodic
 * heartbeat also covers a single slow Drive upload / email transport. */
export function watchPhotobookOperation(db: any, ref: any, kind: 'pageTransfer' | 'photobookDispatch', id: string) {
  active.add(id);
  let stopped = false;
  let ticking = false;
  const update = async (patch: Record<string, any> = {}) => {
    if (stopped) throw new Error('Operazione non più attiva');
    await db.runTransaction(async (tx: any) => {
      const data = (await tx.get(ref)).data();
      const running = kind === 'pageTransfer' ? data?.pageTransfer?.status === 'running' : data?.mockupDispatching;
      if (!running || data?.[kind]?.id !== id) throw new Error('Il blocco dell’operazione è cambiato');
      tx.update(ref, { [`${kind}.heartbeatAt`]: new Date(), ...patch });
    });
  };
  const timer = setInterval(() => {
    if (ticking) return;
    ticking = true;
    void update().catch(error => console.warn('[photobook heartbeat]', error.message))
      .finally(() => { ticking = false; });
  }, 15_000);
  timer.unref();
  return {
    update,
    stop() { stopped = true; clearInterval(timer); active.delete(id); },
  };
}
