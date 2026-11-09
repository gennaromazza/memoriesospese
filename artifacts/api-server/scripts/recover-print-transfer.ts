/**
 * Read-only by default. --execute resumes only the specified existing shipment.
 * Does not send email, create shipments or delete files.
 */
import { ReplitConnectors } from '@replit/connectors-sdk';
import { db, storage } from '../src/firebase-admin.js';
import { PrintShopService } from '../src/print-shop/service.js';
import * as drive from '../src/google-drive.js';

async function main() {
  const [orderId, shipmentId, mode] = process.argv.slice(2);
  if (!/^ps_[a-z0-9]+$/.test(orderId || '') || !/^pslab_[a-z0-9]+$/.test(shipmentId || '') ||
      (mode && mode !== '--execute')) {
    throw new Error('Usage: recover-print-transfer <orderId> <shipmentId> [--execute]');
  }
  const ref = db.collection('labShipments').doc(shipmentId);
  const snapshot = await ref.get();
  const shipment = snapshot.data();
  if (!shipment || shipment.orderId !== orderId || shipment.sourceType !== 'print_shop' ||
      !shipment.driveFolderId || shipment.sentAt || shipment.status !== 'da_inviare') {
    throw new Error('Shipment identity or unsent state does not match; no changes made.');
  }
  const heartbeat = shipment.transfer?.heartbeatAt?.toMillis?.() || 0;
  if (shipment.transfer?.status === 'running' && heartbeat > Date.now() - 15 * 60_000) {
    throw new Error('Transfer still active; no changes made.');
  }
  const proxyFetch = new ReplitConnectors().createProxyFetch('google-drive');
  const params = new URLSearchParams({
    q: `'${shipment.driveFolderId.replace(/'/g, "\\'")}' in parents and trashed=false`,
    fields: 'nextPageToken,files(id,name,size)', pageSize: '1000',
    supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
  });
  const remote: Array<{ id: string; name: string; size?: string }> = [];
  let pageToken: string | undefined;
  do {
    if (pageToken) params.set('pageToken', pageToken);
    const response = await proxyFetch(`/drive/v3/files?${params}`, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Drive verification failed: HTTP ${response.status}`);
    const page = await response.json();
    remote.push(...(page.files || []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  const recorded = shipment.files || [];
  for (const file of recorded) {
    const matches = remote.filter(item => item.name === file.name);
    if (matches.length !== 1 || matches[0].id !== file.driveFileId ||
        (file.size && Number(matches[0].size) !== file.size)) {
      throw new Error('Recorded files do not match Drive; manual reconciliation required. No changes made.');
    }
  }
  console.info(JSON.stringify({
    verified: true, recordedFiles: recorded.length, remoteFiles: remote.length,
    transferred: shipment.transfer?.transferred, total: shipment.transfer?.total,
    execute: mode === '--execute',
  }));
  if (mode !== '--execute') return;
  const service = new PrintShopService({
    db, storage, drive,
    // Recovery never uses payments or email.
    paypal: {} as any,
  });
  await service.transferLabShipment(shipmentId);
  const finished = (await ref.get()).data();
  console.info(JSON.stringify({
    status: finished?.transfer?.status,
    transferred: finished?.transfer?.transferred, total: finished?.transfer?.total,
    files: finished?.files?.length,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Recovery failed');
  process.exitCode = 1;
});
