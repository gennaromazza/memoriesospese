import { db } from '../server/firebase-admin.js';
(async () => {
  const snap = await db.collection('bookings').where('cliente.email', '==', 'giuseppe_ricciardi@hotmail.it').get();
  for (const d of snap.docs) {
    const b: any = d.data();
    console.log(d.id, '|', b.stato, '|', b.cliente?.nome, b.cliente?.cognome, '|', b.dataShootingInizio?.toDate?.()?.toISOString(), '->', b.dataShootingFine?.toDate?.()?.toISOString(), '| campagna:', b.campaignId, '| gcalEvent:', b.googleCalendarEventId);
  }
  console.log('tot:', snap.size);
})();
