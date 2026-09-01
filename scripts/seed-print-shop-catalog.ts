/**
 * Seed idempotente del catalogo stampe (3 categorie + 11 prodotti).
 *
 * Dry-run predefinito (sola lettura):
 *   npx tsx scripts/seed-print-shop-catalog.ts
 *
 * Applicazione, con guardia esplicita sul progetto Firebase:
 *   npx tsx scripts/seed-print-shop-catalog.ts --apply --project=<project_id>
 *
 * Lo script non cancella documenti e preserva i campi non gestiti dal seed.
 */

import type { Firestore } from 'firebase-admin/firestore';
import {
  buildPrintShopSeedPlan,
  type ExistingPrintShopSeedDocument,
  type PrintShopSeedOperation,
} from '../shared/print-shop-seed.js';

interface CliOptions {
  apply: boolean;
  projectId?: string;
  help: boolean;
}

function parseOptions(args: readonly string[]): CliOptions {
  const options: CliOptions = { apply: false, help: false };
  let explicitDryRun = false;
  for (const argument of args) {
    if (argument === '--apply') options.apply = true;
    else if (argument === '--dry-run') explicitDryRun = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument.startsWith('--project=')) options.projectId = argument.slice('--project='.length).trim();
    else throw new Error(`Argomento non riconosciuto: ${argument}`);
  }
  if (options.apply && !options.projectId) {
    throw new Error('Per scrivere devi indicare --project=<project_id> come conferma esplicita.');
  }
  if (options.apply && explicitDryRun) {
    throw new Error('Scegli una sola modalità: --dry-run oppure --apply.');
  }
  return options;
}

function printHelp(): void {
  console.log('Seed catalogo stampe online');
  console.log('  dry-run: npx tsx scripts/seed-print-shop-catalog.ts [--dry-run]');
  console.log('  apply:   npx tsx scripts/seed-print-shop-catalog.ts --apply --project=<project_id>');
}

async function readCollection(db: Firestore, collection: 'products' | 'productCategories'): Promise<ExistingPrintShopSeedDocument[]> {
  const snapshot = await db.collection(collection).get();
  return snapshot.docs.map(document => ({ id: document.id, data: document.data() }));
}

function describeOperation(operation: PrintShopSeedOperation): string {
  const target = `${operation.collection}/${operation.id}`;
  if (operation.action === 'unchanged') return `  = ${target}`;
  const fields = operation.changedFields.join(', ');
  return `  ${operation.action === 'create' ? '+' : '~'} ${target} (${fields})`;
}

async function run(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  // Import lazy: --help non inizializza Firebase e non richiede credenziali.
  const { db, FieldValue } = await import('../server/firebase-admin.js');
  const actualProjectId = (db as Firestore & { projectId: string }).projectId;
  if (options.projectId && options.projectId !== actualProjectId) {
    throw new Error(`Progetto non corrispondente: atteso ${options.projectId}, credenziali per ${actualProjectId}. Nessuna scrittura eseguita.`);
  }

  console.log(`Catalogo stampe — ${options.apply ? 'APPLY' : 'DRY RUN'} — progetto ${actualProjectId}`);
  if (!options.apply) console.log('Nessun documento verrà modificato.');

  const [existingProducts, existingCategories] = await Promise.all([
    readCollection(db, 'products'),
    readCollection(db, 'productCategories'),
  ]);
  const plan = buildPrintShopSeedPlan(existingProducts, existingCategories);

  for (const operation of plan.operations) console.log(describeOperation(operation));
  console.log(`Riepilogo: ${plan.summary.create} da creare, ${plan.summary.update} da aggiornare, ${plan.summary.unchanged} invariati.`);

  if (!options.apply) {
    console.log(`Per applicare: npx tsx scripts/seed-print-shop-catalog.ts --apply --project=${actualProjectId}`);
    return;
  }

  const writes = plan.operations.filter(operation => operation.action !== 'unchanged');
  if (writes.length === 0) {
    console.log('Catalogo già allineato: nessuna scrittura necessaria.');
    return;
  }

  const batch = db.batch();
  for (const operation of writes) {
    const reference = db.collection(operation.collection).doc(operation.id);
    const timestamps = operation.action === 'create'
      ? { createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }
      : { updatedAt: FieldValue.serverTimestamp() };
    batch.set(reference, { ...operation.data, ...timestamps }, { merge: true });
  }
  await batch.commit();
  console.log(`Seed completato: ${writes.length} documenti scritti, nessun documento eliminato.`);
}

run().catch(error => {
  console.error(`Seed catalogo non completato: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
