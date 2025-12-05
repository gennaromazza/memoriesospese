import { db } from './server/firebase-admin';

interface Issue {
  type: string;
  quoteId?: string;
  jobId?: string;
  jobName?: string;
  description: string;
  currentValue?: any;
  expectedValue?: any;
}

async function analyzeJobs() {
  const issues: Issue[] = [];
  const processedQuotes = new Set<string>();
  
  console.log('🔍 Analisi del sistema Jobs/Quotes (PARTE 2 - problemi finanziari)...\n');
  
  // Get all quotes with signatures
  const quotesSnap = await db.collection('quotes').get();
  console.log(`Analizzando ${quotesSnap.size} preventivi per discrepanze finanziarie...\n`);
  
  for (const quoteDoc of quotesSnap.docs) {
    const quote = quoteDoc.data();
    const quoteId = quoteDoc.id;
    
    // Skip quotes without jobId or not signed
    if (!quote.jobId || quote.status !== 'firmato') continue;
    
    // Check financial discrepancies
    const jobDoc = await db.collection('jobs').doc(quote.jobId).get();
    if (!jobDoc.exists) continue;
    
    const job = jobDoc.data()!;
    const correctTotal = quote.totalAfterDiscount || quote.totaleSelezionato || quote.totaleBase || 0;
    const jobTotal = job.financials?.totalePreventivato || 0;
    
    // Issue: Job con totalePreventivato errato
    if (Math.abs(correctTotal - jobTotal) > 0.01) {
      issues.push({
        type: 'JOB_WRONG_TOTALE_PREVENTIVATO',
        quoteId,
        jobId: quote.jobId,
        jobName: job.nomeEvento,
        description: 'Job con totalePreventivato diverso dal preventivo firmato',
        currentValue: `€${jobTotal}`,
        expectedValue: `€${correctTotal}`
      });
    }
    
    // Issue: Discrepanza tra totalePagato e somma transazioni
    if (job.transactions && Array.isArray(job.transactions)) {
      const sumTransactions = job.transactions
        .filter((t: any) => t.type === 'entrata')
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
      
      if (Math.abs(sumTransactions - (job.financials?.totalePagato || 0)) > 0.01) {
        issues.push({
          type: 'JOB_PAGATO_MISMATCH',
          jobId: quote.jobId,
          jobName: job.nomeEvento,
          description: 'totalePagato non corrisponde alla somma delle transazioni',
          currentValue: `totalePagato: €${job.financials?.totalePagato || 0}`,
          expectedValue: `Somma transazioni: €${sumTransactions}`
        });
      }
    }
    
    // Issue: saldoResiduo calcolato male
    const expectedSaldo = (job.financials?.totalePreventivato || 0) - (job.financials?.totalePagato || 0);
    if (Math.abs(expectedSaldo - (job.financials?.saldoResiduo || 0)) > 0.01) {
      issues.push({
        type: 'JOB_SALDO_MISMATCH',
        jobId: quote.jobId,
        jobName: job.nomeEvento,
        description: 'saldoResiduo non corrisponde al calcolo (preventivato - pagato)',
        currentValue: `saldoResiduo: €${job.financials?.saldoResiduo || 0}`,
        expectedValue: `Calcolo: €${expectedSaldo}`
      });
    }
    
    if (issues.length >= 10) break;
  }
  
  // Check for orphan references in jobs
  if (issues.length < 10) {
    console.log('Verificando riferimenti orfani nei jobs...\n');
    const jobsSnap = await db.collection('jobs').get();
    
    for (const jobDoc of jobsSnap.docs) {
      if (issues.length >= 10) break;
      
      const job = jobDoc.data();
      const jobId = jobDoc.id;
      
      // Check orphan quoteIds
      if (job.quoteIds && Array.isArray(job.quoteIds)) {
        for (const qId of job.quoteIds) {
          const quoteDoc = await db.collection('quotes').doc(qId).get();
          if (!quoteDoc.exists) {
            issues.push({
              type: 'JOB_ORPHAN_QUOTEID',
              jobId,
              jobName: job.nomeEvento,
              quoteId: qId,
              description: 'Job con riferimento a preventivo inesistente',
              currentValue: qId,
              expectedValue: 'Rimuovere da quoteIds'
            });
            if (issues.length >= 10) break;
          }
        }
      }
      
      // Check orphan orderIds
      if (issues.length < 10 && job.orderIds && Array.isArray(job.orderIds)) {
        for (const oId of job.orderIds) {
          const orderDoc = await db.collection('orders').doc(oId).get();
          if (!orderDoc.exists) {
            issues.push({
              type: 'JOB_ORPHAN_ORDERID',
              jobId,
              jobName: job.nomeEvento,
              description: 'Job con riferimento a ordine inesistente',
              currentValue: oId,
              expectedValue: 'Rimuovere da orderIds'
            });
            if (issues.length >= 10) break;
          }
        }
      }
      
      // Check orphan galleryIds
      if (issues.length < 10 && job.galleryIds && Array.isArray(job.galleryIds)) {
        for (const gId of job.galleryIds) {
          const galleryDoc = await db.collection('galleries').doc(gId).get();
          if (!galleryDoc.exists) {
            issues.push({
              type: 'JOB_ORPHAN_GALLERYID',
              jobId,
              jobName: job.nomeEvento,
              description: 'Job con riferimento a galleria inesistente',
              currentValue: gId,
              expectedValue: 'Rimuovere da galleryIds'
            });
            if (issues.length >= 10) break;
          }
        }
      }
    }
  }
  
  // Print results
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TROVATI ${issues.length} PROBLEMI (FINANZIARI E RIFERIMENTI)`);
  console.log(`${'='.repeat(60)}\n`);
  
  if (issues.length === 0) {
    console.log('✅ Nessun problema finanziario o di riferimenti orfani trovato!');
  } else {
    issues.forEach((issue, i) => {
      console.log(`${i + 1}. [${issue.type}]`);
      if (issue.jobName) console.log(`   Job: ${issue.jobName}`);
      if (issue.jobId) console.log(`   JobId: ${issue.jobId}`);
      if (issue.quoteId) console.log(`   QuoteId: ${issue.quoteId}`);
      console.log(`   Problema: ${issue.description}`);
      console.log(`   Valore attuale: ${issue.currentValue}`);
      console.log(`   Valore atteso: ${issue.expectedValue}`);
      console.log('');
    });
  }
}

analyzeJobs().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
