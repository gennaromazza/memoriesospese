import { db } from './server/firebase-admin';

interface FixResult {
  type: string;
  id: string;
  description: string;
  success: boolean;
  error?: string;
}

async function fixAllIssues() {
  const results: FixResult[] = [];
  
  console.log('🔧 CORREZIONE AUTOMATICA DI TUTTI I PROBLEMI\n');
  console.log('='.repeat(60));
  
  // ============================================
  // FIX 1: Quote firmati senza signedAt a livello root
  // ============================================
  console.log('\n📋 FIX 1: Quote firmati senza signedAt a livello root\n');
  
  const quotesSnap = await db.collection('quotes').get();
  let fixedSignedAt = 0;
  
  for (const quoteDoc of quotesSnap.docs) {
    const quote = quoteDoc.data();
    const quoteId = quoteDoc.id;
    
    // Check if signed but missing root signedAt
    if (quote.status === 'firmato' && !quote.signedAt && quote.signature?.signedAt) {
      try {
        await db.collection('quotes').doc(quoteId).update({
          signedAt: quote.signature.signedAt,
          updatedAt: new Date()
        });
        fixedSignedAt++;
        console.log(`   ✅ ${quoteId}: signedAt aggiunto`);
        results.push({
          type: 'QUOTE_SIGNEDAT_FIXED',
          id: quoteId,
          description: 'Aggiunto signedAt a livello root',
          success: true
        });
      } catch (e: any) {
        console.log(`   ❌ ${quoteId}: Errore - ${e.message}`);
        results.push({
          type: 'QUOTE_SIGNEDAT_FIXED',
          id: quoteId,
          description: 'Errore aggiunta signedAt',
          success: false,
          error: e.message
        });
      }
    }
    
    // Also check for quotes with signature but wrong status
    if (quote.signature && quote.status !== 'firmato') {
      try {
        const signedAtValue = quote.signature.signedAt || new Date();
        await db.collection('quotes').doc(quoteId).update({
          status: 'firmato',
          signedAt: signedAtValue,
          updatedAt: new Date()
        });
        console.log(`   ✅ ${quoteId}: status cambiato a "firmato" e signedAt aggiunto`);
        results.push({
          type: 'QUOTE_STATUS_FIXED',
          id: quoteId,
          description: 'Status corretto da ' + quote.status + ' a firmato',
          success: true
        });
      } catch (e: any) {
        console.log(`   ❌ ${quoteId}: Errore - ${e.message}`);
        results.push({
          type: 'QUOTE_STATUS_FIXED',
          id: quoteId,
          description: 'Errore correzione status',
          success: false,
          error: e.message
        });
      }
    }
  }
  
  console.log(`\n   Totale quote signedAt corretti: ${fixedSignedAt}`);
  
  // ============================================
  // FIX 2: Job con saldoResiduo errato
  // ============================================
  console.log('\n📋 FIX 2: Job con saldoResiduo errato\n');
  
  const jobsSnap = await db.collection('jobs').get();
  let fixedSaldo = 0;
  
  for (const jobDoc of jobsSnap.docs) {
    const job = jobDoc.data();
    const jobId = jobDoc.id;
    
    if (!job.financials) continue;
    
    const totalePreventivato = job.financials.totalePreventivato || 0;
    const totalePagato = job.financials.totalePagato || 0;
    const expectedSaldo = totalePreventivato - totalePagato;
    const currentSaldo = job.financials.saldoResiduo || 0;
    
    if (Math.abs(expectedSaldo - currentSaldo) > 0.01) {
      try {
        await db.collection('jobs').doc(jobId).update({
          'financials.saldoResiduo': expectedSaldo,
          updatedAt: new Date()
        });
        fixedSaldo++;
        console.log(`   ✅ ${job.nomeEvento || jobId}`);
        console.log(`      saldoResiduo: €${currentSaldo} → €${expectedSaldo}`);
        results.push({
          type: 'JOB_SALDO_FIXED',
          id: jobId,
          description: `saldoResiduo: €${currentSaldo} → €${expectedSaldo}`,
          success: true
        });
      } catch (e: any) {
        console.log(`   ❌ ${jobId}: Errore - ${e.message}`);
        results.push({
          type: 'JOB_SALDO_FIXED',
          id: jobId,
          description: 'Errore correzione saldoResiduo',
          success: false,
          error: e.message
        });
      }
    }
  }
  
  console.log(`\n   Totale job saldoResiduo corretti: ${fixedSaldo}`);
  
  // ============================================
  // FIX 3: Job con totalePreventivato errato (da quote firmato)
  // ============================================
  console.log('\n📋 FIX 3: Job con totalePreventivato errato\n');
  
  let fixedTotale = 0;
  
  for (const quoteDoc of quotesSnap.docs) {
    const quote = quoteDoc.data();
    const quoteId = quoteDoc.id;
    
    if (!quote.jobId || quote.status !== 'firmato') continue;
    
    const jobDoc = await db.collection('jobs').doc(quote.jobId).get();
    if (!jobDoc.exists) continue;
    
    const job = jobDoc.data()!;
    const correctTotal = quote.totalAfterDiscount || quote.totaleSelezionato || quote.totaleBase || 0;
    const jobTotal = job.financials?.totalePreventivato || 0;
    
    if (Math.abs(correctTotal - jobTotal) > 0.01) {
      try {
        const totalePagato = job.financials?.totalePagato || 0;
        const newSaldo = correctTotal - totalePagato;
        
        await db.collection('jobs').doc(quote.jobId).update({
          'financials.totalePreventivato': correctTotal,
          'financials.saldoResiduo': newSaldo,
          updatedAt: new Date()
        });
        fixedTotale++;
        console.log(`   ✅ ${job.nomeEvento || quote.jobId}`);
        console.log(`      totalePreventivato: €${jobTotal} → €${correctTotal}`);
        console.log(`      saldoResiduo: €${job.financials?.saldoResiduo || 0} → €${newSaldo}`);
        results.push({
          type: 'JOB_TOTALE_FIXED',
          id: quote.jobId,
          description: `totalePreventivato: €${jobTotal} → €${correctTotal}`,
          success: true
        });
      } catch (e: any) {
        console.log(`   ❌ ${quote.jobId}: Errore - ${e.message}`);
        results.push({
          type: 'JOB_TOTALE_FIXED',
          id: quote.jobId,
          description: 'Errore correzione totalePreventivato',
          success: false,
          error: e.message
        });
      }
    }
  }
  
  console.log(`\n   Totale job totalePreventivato corretti: ${fixedTotale}`);
  
  // ============================================
  // FIX 4: Rimuovi riferimenti orfani
  // ============================================
  console.log('\n📋 FIX 4: Rimozione riferimenti orfani\n');
  
  let fixedOrphans = 0;
  
  for (const jobDoc of jobsSnap.docs) {
    const job = jobDoc.data();
    const jobId = jobDoc.id;
    let updates: any = {};
    let hasChanges = false;
    
    // Check orphan quoteIds
    if (job.quoteIds && Array.isArray(job.quoteIds)) {
      const validQuoteIds = [];
      for (const qId of job.quoteIds) {
        const quoteDoc = await db.collection('quotes').doc(qId).get();
        if (quoteDoc.exists) {
          validQuoteIds.push(qId);
        } else {
          console.log(`   🗑️  ${job.nomeEvento || jobId}: rimosso quoteId orfano ${qId}`);
          hasChanges = true;
        }
      }
      if (validQuoteIds.length !== job.quoteIds.length) {
        updates.quoteIds = validQuoteIds;
      }
    }
    
    // Check orphan orderIds
    if (job.orderIds && Array.isArray(job.orderIds)) {
      const validOrderIds = [];
      for (const oId of job.orderIds) {
        const orderDoc = await db.collection('orders').doc(oId).get();
        if (orderDoc.exists) {
          validOrderIds.push(oId);
        } else {
          console.log(`   🗑️  ${job.nomeEvento || jobId}: rimosso orderId orfano ${oId}`);
          hasChanges = true;
        }
      }
      if (validOrderIds.length !== job.orderIds.length) {
        updates.orderIds = validOrderIds;
      }
    }
    
    // Check orphan galleryIds
    if (job.galleryIds && Array.isArray(job.galleryIds)) {
      const validGalleryIds = [];
      for (const gId of job.galleryIds) {
        const galleryDoc = await db.collection('galleries').doc(gId).get();
        if (galleryDoc.exists) {
          validGalleryIds.push(gId);
        } else {
          console.log(`   🗑️  ${job.nomeEvento || jobId}: rimosso galleryId orfano ${gId}`);
          hasChanges = true;
        }
      }
      if (validGalleryIds.length !== job.galleryIds.length) {
        updates.galleryIds = validGalleryIds;
      }
    }
    
    if (hasChanges && Object.keys(updates).length > 0) {
      try {
        updates.updatedAt = new Date();
        await db.collection('jobs').doc(jobId).update(updates);
        fixedOrphans++;
        results.push({
          type: 'JOB_ORPHANS_FIXED',
          id: jobId,
          description: 'Rimossi riferimenti orfani',
          success: true
        });
      } catch (e: any) {
        results.push({
          type: 'JOB_ORPHANS_FIXED',
          id: jobId,
          description: 'Errore rimozione riferimenti',
          success: false,
          error: e.message
        });
      }
    }
  }
  
  console.log(`\n   Totale job con riferimenti orfani corretti: ${fixedOrphans}`);
  
  // ============================================
  // RIEPILOGO FINALE
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 RIEPILOGO CORREZIONI');
  console.log('='.repeat(60));
  
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  
  console.log(`\n✅ Correzioni riuscite: ${successCount}`);
  console.log(`❌ Correzioni fallite: ${failCount}`);
  
  if (failCount > 0) {
    console.log('\nErrori:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.type} (${r.id}): ${r.error}`);
    });
  }
  
  console.log('\n✨ Correzione completata!');
}

fixAllIssues().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
