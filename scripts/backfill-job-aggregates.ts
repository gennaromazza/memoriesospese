/**
 * Script di backfill: popola i campi denormalizzati quoteStatus e transactionCount
 * su tutti i documenti 'jobs' esistenti.
 *
 * Logica (identica agli helper server-side in server/job-aggregates.ts):
 *  - quoteStatus = OR logico sui preventivi collegati (hasQuote/isSigned/isEmailSent)
 *  - transactionCount = somma delle transazioni sugli ordini collegati
 *    (fallback legacy: acconto > 0 conta come 1 transazione)
 *
 * Trattandosi di un'operazione una-tantum, le collezioni 'quotes' e 'orders' vengono
 * lette per intero UNA volta e raggruppate per jobId in memoria (no scansioni ripetute).
 *
 * IMPORTANTE: Richiede Firebase Admin SDK.
 * Eseguire con: npx tsx scripts/backfill-job-aggregates.ts
 */

import * as admin from 'firebase-admin';

if (!admin.apps?.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

interface JobQuoteStatus {
  hasQuote: boolean;
  isSigned: boolean;
  isEmailSent: boolean;
}

/** Stato preventivo aggregato a partire dai preventivi di un job. */
function computeQuoteStatusFromQuotes(quotes: any[]): JobQuoteStatus {
  const status: JobQuoteStatus = { hasQuote: false, isSigned: false, isEmailSent: false };
  for (const quote of quotes) {
    status.hasQuote = true;
    const quoteIsSigned = !!quote.signature || quote.status === 'firmato';
    const quoteIsEmailSent = !!quote.emailSentAt || !!quote.sentTo ||
      (!!quote.status && quote.status !== 'bozza');
    if (quoteIsSigned) status.isSigned = true;
    if (quoteIsEmailSent) status.isEmailSent = true;
  }
  return status;
}

/** Numero transazioni di un singolo ordine (con fallback legacy 'acconto'). */
function computeOrderTransactionCount(order: any): number {
  if (Array.isArray(order?.transactions) && order.transactions.length > 0) {
    return order.transactions.length;
  }
  if (order?.acconto && order.acconto > 0) {
    return 1;
  }
  return 0;
}

interface BackfillStats {
  jobsProcessed: number;
  jobsUpdated: number;
  errors: string[];
}

async function runBackfill(): Promise<void> {
  console.log('🚀 Avvio backfill aggregati job (quoteStatus + transactionCount)...\n');

  const stats: BackfillStats = { jobsProcessed: 0, jobsUpdated: 0, errors: [] };

  // 1. Leggi quotes e orders una sola volta e raggruppa per jobId
  console.log('📥 Caricamento preventivi e ordini...');
  const [quotesSnap, ordersSnap] = await Promise.all([
    db.collection('quotes').get(),
    db.collection('orders').get(),
  ]);

  const quotesByJob = new Map<string, any[]>();
  quotesSnap.docs.forEach(doc => {
    const data = doc.data();
    if (!data.jobId) return;
    const list = quotesByJob.get(data.jobId) || [];
    list.push(data);
    quotesByJob.set(data.jobId, list);
  });

  const txCountByJob = new Map<string, number>();
  ordersSnap.docs.forEach(doc => {
    const data = doc.data();
    if (!data.jobId) return;
    const prev = txCountByJob.get(data.jobId) || 0;
    txCountByJob.set(data.jobId, prev + computeOrderTransactionCount(data));
  });

  console.log(`  → ${quotesSnap.size} preventivi, ${ordersSnap.size} ordini caricati.\n`);

  // 2. Itera i jobs e scrivi gli aggregati con batch
  console.log('🔄 Aggiornamento jobs...');
  const jobsSnap = await db.collection('jobs').get();

  let batch = db.batch();
  let batchCount = 0;
  const BATCH_LIMIT = 400;

  for (const jobDoc of jobsSnap.docs) {
    stats.jobsProcessed++;
    try {
      const quoteStatus = computeQuoteStatusFromQuotes(quotesByJob.get(jobDoc.id) || []);
      const transactionCount = txCountByJob.get(jobDoc.id) || 0;

      batch.update(jobDoc.ref, {
        quoteStatus,
        transactionCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      stats.jobsUpdated++;
      batchCount++;

      if (batchCount >= BATCH_LIMIT) {
        await batch.commit();
        console.log(`  ✅ Commit batch di ${batchCount} job`);
        batch = db.batch();
        batchCount = 0;
      }
    } catch (error: any) {
      const msg = `Job ${jobDoc.id}: ${error.message}`;
      stats.errors.push(msg);
      console.error(`  ❌ ${msg}`);
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log(`  ✅ Commit batch finale di ${batchCount} job`);
  }

  // 3. Report finale
  console.log('\n' + '='.repeat(60));
  console.log('📊 REPORT BACKFILL');
  console.log('='.repeat(60));
  console.log(`Jobs processati: ${stats.jobsProcessed}`);
  console.log(`Jobs aggiornati: ${stats.jobsUpdated}`);
  console.log(`Errori: ${stats.errors.length}`);
  if (stats.errors.length > 0) {
    console.log('\n⚠️  ERRORI RISCONTRATI:');
    stats.errors.forEach((err, idx) => console.log(`  ${idx + 1}. ${err}`));
  }
  console.log('='.repeat(60));
  console.log('✅ Backfill completato!');
}

runBackfill()
  .then(() => {
    console.log('\n👋 Script terminato con successo');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script terminato con errore:', error);
    process.exit(1);
  });
