import { db } from './server/firebase-admin';

async function verifySystem() {
  console.log('🔍 VERIFICA FINALE DEL SISTEMA\n');
  console.log('='.repeat(60));
  
  let issues = 0;
  
  // 1. Check quotes
  console.log('\n📋 Verifica Quote...');
  const quotesSnap = await db.collection('quotes').get();
  
  let quotesWithSignature = 0;
  let quotesSignedOk = 0;
  let quotesWithIssues = 0;
  
  for (const quoteDoc of quotesSnap.docs) {
    const quote = quoteDoc.data();
    
    if (quote.signature) {
      quotesWithSignature++;
      
      if (quote.status === 'firmato' && quote.signedAt) {
        quotesSignedOk++;
      } else {
        quotesWithIssues++;
        console.log(`   ⚠️ ${quoteDoc.id}: status=${quote.status}, signedAt=${!!quote.signedAt}`);
        issues++;
      }
    }
  }
  
  console.log(`   Totale quote: ${quotesSnap.size}`);
  console.log(`   Quote con firma: ${quotesWithSignature}`);
  console.log(`   Quote firmati OK: ${quotesSignedOk}`);
  console.log(`   Quote con problemi: ${quotesWithIssues}`);
  
  // 2. Check jobs financials
  console.log('\n📋 Verifica Job Financials...');
  const jobsSnap = await db.collection('jobs').get();
  
  let jobsWithFinancials = 0;
  let jobsFinancialsOk = 0;
  let jobsWithFinancialIssues = 0;
  
  for (const jobDoc of jobsSnap.docs) {
    const job = jobDoc.data();
    
    if (job.financials) {
      jobsWithFinancials++;
      
      const totalePreventivato = job.financials.totalePreventivato || 0;
      const totalePagato = job.financials.totalePagato || 0;
      const saldoResiduo = job.financials.saldoResiduo || 0;
      const expectedSaldo = totalePreventivato - totalePagato;
      
      if (Math.abs(expectedSaldo - saldoResiduo) <= 0.01) {
        jobsFinancialsOk++;
      } else {
        jobsWithFinancialIssues++;
        console.log(`   ⚠️ ${job.nomeEvento || jobDoc.id}:`);
        console.log(`      Preventivato: €${totalePreventivato}, Pagato: €${totalePagato}`);
        console.log(`      Saldo attuale: €${saldoResiduo}, Saldo atteso: €${expectedSaldo}`);
        issues++;
      }
    }
  }
  
  console.log(`   Totale job: ${jobsSnap.size}`);
  console.log(`   Job con financials: ${jobsWithFinancials}`);
  console.log(`   Job financials OK: ${jobsFinancialsOk}`);
  console.log(`   Job con problemi finanziari: ${jobsWithFinancialIssues}`);
  
  // 3. Check quote-job alignment
  console.log('\n📋 Verifica Allineamento Quote-Job...');
  
  let alignmentIssues = 0;
  
  for (const quoteDoc of quotesSnap.docs) {
    const quote = quoteDoc.data();
    
    if (quote.status === 'firmato' && quote.jobId) {
      const jobDoc = await db.collection('jobs').doc(quote.jobId).get();
      
      if (!jobDoc.exists) {
        console.log(`   ⚠️ Quote ${quoteDoc.id} punta a job inesistente: ${quote.jobId}`);
        alignmentIssues++;
        issues++;
        continue;
      }
      
      const job = jobDoc.data()!;
      const correctTotal = quote.totalAfterDiscount || quote.totaleSelezionato || quote.totaleBase || 0;
      const jobTotal = job.financials?.totalePreventivato || 0;
      
      if (Math.abs(correctTotal - jobTotal) > 0.01) {
        console.log(`   ⚠️ ${job.nomeEvento || quote.jobId}:`);
        console.log(`      Quote total: €${correctTotal}, Job total: €${jobTotal}`);
        alignmentIssues++;
        issues++;
      }
    }
  }
  
  console.log(`   Problemi di allineamento: ${alignmentIssues}`);
  
  // 4. Check for orphan references
  console.log('\n📋 Verifica Riferimenti Orfani...');
  
  let orphanRefs = 0;
  
  for (const jobDoc of jobsSnap.docs) {
    const job = jobDoc.data();
    
    // Check quoteIds
    if (job.quoteIds && Array.isArray(job.quoteIds)) {
      for (const qId of job.quoteIds) {
        const quoteDoc = await db.collection('quotes').doc(qId).get();
        if (!quoteDoc.exists) {
          console.log(`   ⚠️ Job ${job.nomeEvento || jobDoc.id}: quoteId orfano ${qId}`);
          orphanRefs++;
          issues++;
        }
      }
    }
    
    // Check orderIds
    if (job.orderIds && Array.isArray(job.orderIds)) {
      for (const oId of job.orderIds) {
        const orderDoc = await db.collection('orders').doc(oId).get();
        if (!orderDoc.exists) {
          console.log(`   ⚠️ Job ${job.nomeEvento || jobDoc.id}: orderId orfano ${oId}`);
          orphanRefs++;
          issues++;
        }
      }
    }
    
    // Check galleryIds
    if (job.galleryIds && Array.isArray(job.galleryIds)) {
      for (const gId of job.galleryIds) {
        const galleryDoc = await db.collection('galleries').doc(gId).get();
        if (!galleryDoc.exists) {
          console.log(`   ⚠️ Job ${job.nomeEvento || jobDoc.id}: galleryId orfano ${gId}`);
          orphanRefs++;
          issues++;
        }
      }
    }
  }
  
  console.log(`   Riferimenti orfani trovati: ${orphanRefs}`);
  
  // FINAL RESULT
  console.log('\n' + '='.repeat(60));
  if (issues === 0) {
    console.log('✅ SISTEMA PERFETTO! Nessun problema trovato.');
  } else {
    console.log(`⚠️ ATTENZIONE: Trovati ${issues} problemi residui.`);
  }
  console.log('='.repeat(60));
}

verifySystem().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
