import { db } from '../server/firebase-admin';

const JOB_ID = process.argv[2] || 'kcqcp4ta5ael16tpg86xh';

async function main() {
  const jobSnap = await db.collection('jobs').doc(JOB_ID).get();
  const job: any = jobSnap.data();
  console.log('\n=== job.financials ===');
  console.log(JSON.stringify(job.financials, null, 2));
  console.log('\n=== job.costi ===');
  console.log(JSON.stringify(job.costi, null, 2));
  console.log('\n=== job.importedFrom / importedAt / provenance ===');
  console.log('importedFrom:', job.importedFrom, 'importedAt:', job.importedAt, 'provenance:', job.provenance);

  if (job.orderIds) {
    console.log('\n=== ORDERS ===');
    for (const oid of job.orderIds) {
      const o = await db.collection('orders').doc(oid).get();
      if (!o.exists) { console.log(oid, 'NOT FOUND'); continue; }
      const od: any = o.data();
      console.log('---order', o.id);
      const k = Object.keys(od).sort();
      console.log('keys:', k.join(','));
      console.log('totale:', od.totale, 'totalAfterDiscount:', od.totalAfterDiscount, 'totaleSelezionato:', od.totaleSelezionato, 'subtotal:', od.subtotal, 'totalePagato:', od.totalePagato, 'saldoResiduo:', od.saldoResiduo);
      console.log('payments/scadenze/rate:', JSON.stringify(od.payments || od.scadenze || od.rate || od.installments || null, null, 2));
      console.log('paymentSchedule:', JSON.stringify(od.paymentSchedule || null, null, 2));
    }
  }

  // Search any payment-schedules referencing the quote
  const quoteId = job.quoteIds?.[0];
  if (quoteId) {
    console.log('\n=== payment-schedules by quoteId ===');
    const ps = await db.collection('payment-schedules').where('quoteId', '==', quoteId).get();
    console.log('count:', ps.size);
    ps.docs.forEach(d => console.log(d.id, JSON.stringify(d.data(), null, 2)));
  }

  // Check paymentSchedules (camelCase) collection too
  console.log('\n=== paymentSchedules (camel) by jobId ===');
  const ps2 = await db.collection('paymentSchedules').where('jobId', '==', JOB_ID).get();
  console.log('count:', ps2.size);
  ps2.docs.forEach(d => console.log(d.id, JSON.stringify(d.data(), null, 2)));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
