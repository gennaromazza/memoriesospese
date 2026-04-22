import { db } from '../server/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const JOB_ID = 'kcqcp4ta5ael16tpg86xh';
const QUOTE_DOC_ID = 'w3b4uovm3dpoqbptzvavbq';
const SCHEDULE_ID = 'ps_p1fe9xtbiwid2qg6z4egk';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  // Re-leggo i valori attuali per essere certo di non sovrascrivere dati cambiati
  const [jobSnap, quoteSnap, schedSnap] = await Promise.all([
    db.collection('jobs').doc(JOB_ID).get(),
    db.collection('quotes').doc(QUOTE_DOC_ID).get(),
    db.collection('paymentSchedules').doc(SCHEDULE_ID).get(),
  ]);

  if (!jobSnap.exists || !quoteSnap.exists || !schedSnap.exists) {
    throw new Error('Documento mancante: ' + JSON.stringify({
      job: jobSnap.exists, quote: quoteSnap.exists, sched: schedSnap.exists
    }));
  }

  const job: any = jobSnap.data();
  const quote: any = quoteSnap.data();
  const sched: any = schedSnap.data();

  const quoteTotal = (quote.totaleSelezionato > 0 ? quote.totaleSelezionato : 0)
    || quote.totalAfterDiscount || 0;

  const realPaid = (sched.payments || [])
    .filter((p: any) => p.stato === 'pagato')
    .reduce((s: number, p: any) => s + Number(p.importoPagato || p.importo || 0), 0);

  const newSaldo = Math.max(0, quoteTotal - realPaid);

  console.log('--- VALORI ATTUALI ---');
  console.log('schedule.totale:', sched.totale, '→ proposto:', quoteTotal);
  console.log('schedule.totalePagato:', sched.totalePagato, '→ confermato:', realPaid);
  console.log('schedule.saldoResiduo:', sched.saldoResiduo, '→ proposto:', newSaldo);
  console.log('job.financials.totalePagato:', job.financials?.totalePagato, '→ proposto:', realPaid);
  console.log('job.financials.saldoResiduo:', job.financials?.saldoResiduo, '→ proposto:', newSaldo);
  console.log('job.signedQuoteId:', job.signedQuoteId, '→ proposto:', QUOTE_DOC_ID);

  if (dryRun) {
    console.log('\n[DRY RUN] Nessuna modifica eseguita.');
    process.exit(0);
  }

  // Backup snapshot prima delle modifiche
  await db.collection('_backups').doc(`fix-${JOB_ID}-${Date.now()}`).set({
    createdAt: FieldValue.serverTimestamp(),
    reason: 'Fix discrepanza totale paymentSchedule legacy import',
    job: { id: JOB_ID, before: job },
    schedule: { id: SCHEDULE_ID, before: sched },
  });

  await db.collection('paymentSchedules').doc(SCHEDULE_ID).update({
    totale: quoteTotal,
    totalePagato: realPaid,
    saldoResiduo: newSaldo,
    quoteId: QUOTE_DOC_ID,
    updatedAt: FieldValue.serverTimestamp(),
    fixNote: `Auto-corretto ${new Date().toISOString()}: totale era ${sched.totale}, allineato a quote ${QUOTE_DOC_ID}`,
  });

  await db.collection('jobs').doc(JOB_ID).update({
    'financials.totalePreventivato': quoteTotal,
    'financials.totalePagato': realPaid,
    'financials.saldoResiduo': newSaldo,
    signedQuoteId: QUOTE_DOC_ID,
    updatedAt: FieldValue.serverTimestamp(),
  });

  console.log('\n✅ Fix applicata. Backup salvato in _backups.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
