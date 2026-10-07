/**
 * LEGACY JOBS ANALYZER
 * Script di analisi e fix per jobs importati dal vecchio gestionale
 * 
 * Verifica:
 * - Integrità riferimenti (clienti, ordini, preventivi, gallerie)
 * - Correttezza campi obbligatori
 * - Coerenza dati finanziari
 * - Timestamp validi
 * - Sincronizzazione sourceRefs clienti
 */

import { db } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  Timestamp,
  arrayUnion,
  writeBatch
} from 'firebase/firestore';
import type { Job, JobStatus, JobFinancials } from '@shared/jobs-types';
import type { Cliente } from '@shared/clienti-types';

export interface AnalysisIssue {
  type: 'error' | 'warning' | 'info';
  category: 
    | 'missing_client' 
    | 'orphan_order' 
    | 'orphan_quote' 
    | 'orphan_gallery'
    | 'client_sourceref_missing'
    | 'invalid_timestamp'
    | 'missing_field'
    | 'financial_mismatch'
    | 'duplicate_reference'
    | 'invalid_status'
    | 'order_jobid_mismatch'
    | 'quote_jobid_mismatch'
    | 'gallery_jobid_mismatch';
  message: string;
  field?: string;
  expectedValue?: any;
  actualValue?: any;
  resourceId?: string;
  fixable: boolean;
  fixDescription?: string;
}

export interface JobAnalysisResult {
  jobId: string;
  jobName: string;
  eventDate: Date | null;
  jobSource: string;
  status: JobStatus;
  issues: AnalysisIssue[];
  issueCount: {
    errors: number;
    warnings: number;
    info: number;
  };
  fixableCount: number;
}

export interface FullAnalysisReport {
  timestamp: Date;
  totalJobsAnalyzed: number;
  legacyJobsCount: number;
  jobsWithIssues: number;
  jobsClean: number;
  totalIssues: number;
  issuesByCategory: Record<string, number>;
  issuesByType: {
    errors: number;
    warnings: number;
    info: number;
  };
  fixableIssues: number;
  results: JobAnalysisResult[];
}

export interface FixResult {
  jobId: string;
  fixesApplied: string[];
  fixesFailed: string[];
  success: boolean;
}

export interface FullFixReport {
  timestamp: Date;
  totalJobsFixed: number;
  totalFixesApplied: number;
  totalFixesFailed: number;
  results: FixResult[];
}

const isValidTimestamp = (value: any): boolean => {
  if (!value) return false;
  if (value instanceof Timestamp) return true;
  if (typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value) return true;
  return false;
};

const timestampToDate = (ts: any): Date | null => {
  if (!ts) return null;
  if (ts instanceof Timestamp) return ts.toDate();
  if (typeof ts === 'object' && 'seconds' in ts) {
    return new Timestamp(ts.seconds, ts.nanoseconds).toDate();
  }
  return null;
};

export async function analyzeAllLegacyJobs(
  onProgress?: (current: number, total: number, jobName: string) => void
): Promise<FullAnalysisReport> {
  console.log('🔍 Avvio analisi jobs importati dal vecchio gestionale...');
  
  const report: FullAnalysisReport = {
    timestamp: new Date(),
    totalJobsAnalyzed: 0,
    legacyJobsCount: 0,
    jobsWithIssues: 0,
    jobsClean: 0,
    totalIssues: 0,
    issuesByCategory: {},
    issuesByType: { errors: 0, warnings: 0, info: 0 },
    fixableIssues: 0,
    results: []
  };

  try {
    const jobsSnapshot = await getDocs(collection(db, 'jobs'));
    const allJobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Job[];
    
    const legacyJobs = allJobs.filter(job => 
      job.jobSource === 'legacy_import' || 
      (job as any).importedFrom === 'legacy_json' ||
      (job as any).importedAt
    );
    
    report.totalJobsAnalyzed = allJobs.length;
    report.legacyJobsCount = legacyJobs.length;
    
    console.log(`📊 Trovati ${legacyJobs.length} jobs legacy su ${allJobs.length} totali`);

    const clientiSnapshot = await getDocs(collection(db, 'clienti'));
    const clientiMap = new Map<string, Cliente>();
    clientiSnapshot.docs.forEach(doc => {
      clientiMap.set(doc.id, { id: doc.id, ...doc.data() } as Cliente);
    });

    const ordersSnapshot = await getDocs(collection(db, 'orders'));
    const ordersMap = new Map<string, any>();
    ordersSnapshot.docs.forEach(doc => {
      ordersMap.set(doc.id, { id: doc.id, ...doc.data() });
    });

    const quotesSnapshot = await getDocs(collection(db, 'quotes'));
    const quotesMap = new Map<string, any>();
    quotesSnapshot.docs.forEach(doc => {
      quotesMap.set(doc.id, { id: doc.id, ...doc.data() });
    });

    const galleriesSnapshot = await getDocs(collection(db, 'galleries'));
    const galleriesMap = new Map<string, any>();
    galleriesSnapshot.docs.forEach(doc => {
      galleriesMap.set(doc.id, { id: doc.id, ...doc.data() });
    });

    for (let i = 0; i < legacyJobs.length; i++) {
      const job = legacyJobs[i];
      
      if (onProgress) {
        onProgress(i + 1, legacyJobs.length, job.nomeEvento || job.id);
      }

      const result = analyzeJob(job, clientiMap, ordersMap, quotesMap, galleriesMap);
      report.results.push(result);

      if (result.issues.length > 0) {
        report.jobsWithIssues++;
      } else {
        report.jobsClean++;
      }

      report.totalIssues += result.issues.length;
      report.issuesByType.errors += result.issueCount.errors;
      report.issuesByType.warnings += result.issueCount.warnings;
      report.issuesByType.info += result.issueCount.info;
      report.fixableIssues += result.fixableCount;

      for (const issue of result.issues) {
        report.issuesByCategory[issue.category] = (report.issuesByCategory[issue.category] || 0) + 1;
      }
    }

    report.results.sort((a, b) => b.issueCount.errors - a.issueCount.errors);

    console.log('✅ Analisi completata');
    console.log(`   Jobs con problemi: ${report.jobsWithIssues}`);
    console.log(`   Problemi totali: ${report.totalIssues}`);
    console.log(`   Problemi risolvibili: ${report.fixableIssues}`);

    return report;

  } catch (error) {
    console.error('❌ Errore durante analisi:', error);
    throw error;
  }
}

function analyzeJob(
  job: Job,
  clientiMap: Map<string, Cliente>,
  ordersMap: Map<string, any>,
  quotesMap: Map<string, any>,
  galleriesMap: Map<string, any>
): JobAnalysisResult {
  const issues: AnalysisIssue[] = [];

  if (!job.nomeEvento || job.nomeEvento.trim() === '') {
    issues.push({
      type: 'error',
      category: 'missing_field',
      message: 'Campo nomeEvento mancante o vuoto',
      field: 'nomeEvento',
      fixable: false
    });
  }

  if (!job.jobType || job.jobType.trim() === '') {
    issues.push({
      type: 'error',
      category: 'missing_field',
      message: 'Campo jobType mancante o vuoto',
      field: 'jobType',
      fixable: true,
      fixDescription: 'Imposta jobType a "matrimonio" (default)'
    });
  }

  const validStatuses: JobStatus[] = [
    'lead', 'preventivo_inviato', 'confermato', 'shooting_fatto',
    'selezione_pending', 'produzione', 'consegnato', 'archiviato'
  ];
  if (!job.status || !validStatuses.includes(job.status)) {
    issues.push({
      type: 'error',
      category: 'invalid_status',
      message: `Status non valido: "${job.status}"`,
      field: 'status',
      actualValue: job.status,
      expectedValue: validStatuses,
      fixable: true,
      fixDescription: 'Imposta status a "lead" (default)'
    });
  }

  if (!job.provenance || job.provenance.trim() === '') {
    issues.push({
      type: 'warning',
      category: 'missing_field',
      message: 'Campo provenance mancante',
      field: 'provenance',
      fixable: true,
      fixDescription: 'Imposta provenance a "altro"'
    });
  }

  if (!isValidTimestamp(job.eventDate)) {
    issues.push({
      type: 'error',
      category: 'invalid_timestamp',
      message: 'eventDate non è un Timestamp valido',
      field: 'eventDate',
      actualValue: job.eventDate,
      fixable: false
    });
  }

  if (!isValidTimestamp(job.createdAt)) {
    issues.push({
      type: 'warning',
      category: 'invalid_timestamp',
      message: 'createdAt non è un Timestamp valido',
      field: 'createdAt',
      fixable: true,
      fixDescription: 'Imposta createdAt a ora attuale'
    });
  }

  if (!isValidTimestamp(job.updatedAt)) {
    issues.push({
      type: 'warning',
      category: 'invalid_timestamp',
      message: 'updatedAt non è un Timestamp valido',
      field: 'updatedAt',
      fixable: true,
      fixDescription: 'Imposta updatedAt a ora attuale'
    });
  }

  if (!job.clientiIds || job.clientiIds.length === 0) {
    issues.push({
      type: 'error',
      category: 'missing_field',
      message: 'Nessun cliente collegato (clientiIds vuoto)',
      field: 'clientiIds',
      fixable: false
    });
  } else {
    const uniqueClientIds = [...new Set(job.clientiIds)];
    if (uniqueClientIds.length < job.clientiIds.length) {
      issues.push({
        type: 'warning',
        category: 'duplicate_reference',
        message: `clientiIds contiene ${job.clientiIds.length - uniqueClientIds.length} duplicati`,
        field: 'clientiIds',
        fixable: true,
        fixDescription: 'Rimuovi ID clienti duplicati'
      });
    }

    for (const clienteId of uniqueClientIds) {
      const cliente = clientiMap.get(clienteId);
      
      if (!cliente) {
        issues.push({
          type: 'error',
          category: 'missing_client',
          message: `Cliente ${clienteId} non esiste nel database`,
          field: 'clientiIds',
          actualValue: clienteId,
          fixable: false
        });
      } else {
        const jobIds = cliente.sourceRefs?.jobIds || [];
        if (!jobIds.includes(job.id)) {
          issues.push({
            type: 'warning',
            category: 'client_sourceref_missing',
            message: `Cliente "${cliente.nome} ${cliente.cognome}" non ha jobId ${job.id} in sourceRefs`,
            field: 'sourceRefs.jobIds',
            actualValue: cliente.id,
            fixable: true,
            fixDescription: `Aggiungi jobId a sourceRefs del cliente`
          });
        }
      }
    }
  }

  const orderIds = job.orderIds || [];
  const uniqueOrderIds = [...new Set(orderIds)];
  if (uniqueOrderIds.length < orderIds.length) {
    issues.push({
      type: 'warning',
      category: 'duplicate_reference',
      message: `orderIds contiene ${orderIds.length - uniqueOrderIds.length} duplicati`,
      field: 'orderIds',
      fixable: true,
      fixDescription: 'Rimuovi ID ordini duplicati'
    });
  }

  let totalOrdiniCalcolato = 0;
  let totalePagatoCalcolato = 0;

  for (const orderId of uniqueOrderIds) {
    const order = ordersMap.get(orderId);
    
    if (!order) {
      issues.push({
        type: 'error',
        category: 'orphan_order',
        message: `Ordine ${orderId} referenziato ma non esiste`,
        field: 'orderIds',
        actualValue: orderId,
        fixable: true,
        fixDescription: 'Rimuovi orderId inesistente da orderIds'
      });
    } else {
      if (order.jobId && order.jobId !== job.id) {
        issues.push({
          type: 'warning',
          category: 'order_jobid_mismatch',
          message: `Ordine ${orderId} ha jobId diverso: "${order.jobId}" invece di "${job.id}"`,
          field: 'order.jobId',
          expectedValue: job.id,
          actualValue: order.jobId,
          resourceId: orderId,
          fixable: true,
          fixDescription: 'Correggi jobId nell\'ordine'
        });
      } else if (!order.jobId) {
        issues.push({
          type: 'warning',
          category: 'order_jobid_mismatch',
          message: `Ordine ${orderId} non ha jobId impostato`,
          field: 'order.jobId',
          expectedValue: job.id,
          actualValue: null,
          resourceId: orderId,
          fixable: true,
          fixDescription: 'Imposta jobId nell\'ordine'
        });
      }

      totalOrdiniCalcolato += order.totale || 0;
      
      if (order.transactions && Array.isArray(order.transactions)) {
        for (const tx of order.transactions) {
          if (tx.pagato || tx.isPaid || tx.stato === 'pagato') {
            totalePagatoCalcolato += tx.importo || tx.amount || 0;
          }
        }
      }
      
      if (typeof order.acconto === 'number' && order.acconto > 0) {
        totalePagatoCalcolato += order.acconto;
      }
    }
  }

  const quoteIds = job.quoteIds || [];
  const uniqueQuoteIds = [...new Set(quoteIds)];
  if (uniqueQuoteIds.length < quoteIds.length) {
    issues.push({
      type: 'warning',
      category: 'duplicate_reference',
      message: `quoteIds contiene ${quoteIds.length - uniqueQuoteIds.length} duplicati`,
      field: 'quoteIds',
      fixable: true,
      fixDescription: 'Rimuovi ID preventivi duplicati'
    });
  }

  for (const quoteId of uniqueQuoteIds) {
    const quote = quotesMap.get(quoteId);
    
    if (!quote) {
      issues.push({
        type: 'error',
        category: 'orphan_quote',
        message: `Preventivo ${quoteId} referenziato ma non esiste`,
        field: 'quoteIds',
        actualValue: quoteId,
        fixable: true,
        fixDescription: 'Rimuovi quoteId inesistente da quoteIds'
      });
    } else {
      if (quote.jobId && quote.jobId !== job.id) {
        issues.push({
          type: 'warning',
          category: 'quote_jobid_mismatch',
          message: `Preventivo ${quoteId} ha jobId diverso: "${quote.jobId}"`,
          field: 'quote.jobId',
          expectedValue: job.id,
          actualValue: quote.jobId,
          resourceId: quoteId,
          fixable: true,
          fixDescription: 'Correggi jobId nel preventivo'
        });
      } else if (!quote.jobId) {
        issues.push({
          type: 'warning',
          category: 'quote_jobid_mismatch',
          message: `Preventivo ${quoteId} non ha jobId impostato`,
          field: 'quote.jobId',
          expectedValue: job.id,
          actualValue: null,
          resourceId: quoteId,
          fixable: true,
          fixDescription: 'Imposta jobId nel preventivo'
        });
      }
    }
  }

  const galleryIds = job.galleryIds || [];
  const uniqueGalleryIds = [...new Set(galleryIds)];
  if (uniqueGalleryIds.length < galleryIds.length) {
    issues.push({
      type: 'warning',
      category: 'duplicate_reference',
      message: `galleryIds contiene ${galleryIds.length - uniqueGalleryIds.length} duplicati`,
      field: 'galleryIds',
      fixable: true,
      fixDescription: 'Rimuovi ID gallerie duplicati'
    });
  }

  for (const galleryId of uniqueGalleryIds) {
    const gallery = galleriesMap.get(galleryId);
    
    if (!gallery) {
      issues.push({
        type: 'error',
        category: 'orphan_gallery',
        message: `Galleria ${galleryId} referenziata ma non esiste`,
        field: 'galleryIds',
        actualValue: galleryId,
        fixable: true,
        fixDescription: 'Rimuovi galleryId inesistente da galleryIds'
      });
    } else {
      if (gallery.jobId && gallery.jobId !== job.id) {
        issues.push({
          type: 'warning',
          category: 'gallery_jobid_mismatch',
          message: `Galleria ${galleryId} ha jobId diverso: "${gallery.jobId}"`,
          field: 'gallery.jobId',
          expectedValue: job.id,
          actualValue: gallery.jobId,
          resourceId: galleryId,
          fixable: true,
          fixDescription: 'Correggi jobId nella galleria'
        });
      } else if (!gallery.jobId) {
        issues.push({
          type: 'warning',
          category: 'gallery_jobid_mismatch',
          message: `Galleria ${galleryId} non ha jobId impostato`,
          field: 'gallery.jobId',
          expectedValue: job.id,
          actualValue: null,
          resourceId: galleryId,
          fixable: true,
          fixDescription: 'Imposta jobId nella galleria'
        });
      }
    }
  }

  const financials = job.financials || { totalePreventivato: 0, totaleOrdini: 0, totalePagato: 0, saldoResiduo: 0 };
  
  if (uniqueOrderIds.length > 0) {
    if (Math.abs(financials.totaleOrdini - totalOrdiniCalcolato) > 0.01) {
      issues.push({
        type: 'warning',
        category: 'financial_mismatch',
        message: `totaleOrdini non corrisponde: job=${financials.totaleOrdini}, calcolato=${totalOrdiniCalcolato}`,
        field: 'financials.totaleOrdini',
        expectedValue: totalOrdiniCalcolato,
        actualValue: financials.totaleOrdini,
        fixable: true,
        fixDescription: 'Ricalcola totaleOrdini dagli ordini'
      });
    }

    const saldoCalcolato = totalOrdiniCalcolato - totalePagatoCalcolato;
    if (Math.abs(financials.saldoResiduo - saldoCalcolato) > 0.01) {
      issues.push({
        type: 'info',
        category: 'financial_mismatch',
        message: `saldoResiduo potrebbe non essere aggiornato: job=${financials.saldoResiduo}, calcolato=${saldoCalcolato}`,
        field: 'financials.saldoResiduo',
        expectedValue: saldoCalcolato,
        actualValue: financials.saldoResiduo,
        fixable: true,
        fixDescription: 'Ricalcola saldoResiduo'
      });
    }
  }

  return {
    jobId: job.id,
    jobName: job.nomeEvento || 'Senza nome',
    eventDate: timestampToDate(job.eventDate),
    jobSource: job.jobSource || (job as any).importedFrom || 'unknown',
    status: job.status,
    issues,
    issueCount: {
      errors: issues.filter(i => i.type === 'error').length,
      warnings: issues.filter(i => i.type === 'warning').length,
      info: issues.filter(i => i.type === 'info').length
    },
    fixableCount: issues.filter(i => i.fixable).length
  };
}

export async function fixJobIssues(
  jobId: string,
  issuesToFix: AnalysisIssue[],
  onProgress?: (fixDescription: string) => void
): Promise<FixResult> {
  const result: FixResult = {
    jobId,
    fixesApplied: [],
    fixesFailed: [],
    success: true
  };

  try {
    const jobRef = doc(db, 'jobs', jobId);
    const jobSnap = await getDoc(jobRef);
    
    if (!jobSnap.exists()) {
      result.fixesFailed.push('Job non trovato');
      result.success = false;
      return result;
    }

    const job = { id: jobSnap.id, ...jobSnap.data() } as Job;
    const updates: Record<string, any> = {};

    for (const issue of issuesToFix) {
      if (!issue.fixable) continue;

      const fixDesc = issue.fixDescription || issue.message;
      if (onProgress) onProgress(fixDesc);

      try {
        switch (issue.category) {
          case 'missing_field':
            if (issue.field === 'jobType') {
              updates.jobType = 'matrimonio';
              result.fixesApplied.push('jobType impostato a "matrimonio"');
            }
            if (issue.field === 'provenance') {
              updates.provenance = 'altro';
              result.fixesApplied.push('provenance impostato a "altro"');
            }
            break;

          case 'invalid_status':
            updates.status = 'lead';
            result.fixesApplied.push('status impostato a "lead"');
            break;

          case 'invalid_timestamp':
            if (issue.field === 'createdAt') {
              updates.createdAt = Timestamp.now();
              result.fixesApplied.push('createdAt impostato a ora attuale');
            }
            if (issue.field === 'updatedAt') {
              updates.updatedAt = Timestamp.now();
              result.fixesApplied.push('updatedAt impostato a ora attuale');
            }
            break;

          case 'duplicate_reference':
            if (issue.field === 'clientiIds') {
              updates.clientiIds = [...new Set(job.clientiIds || [])];
              result.fixesApplied.push('Rimossi clientiIds duplicati');
            }
            if (issue.field === 'orderIds') {
              updates.orderIds = [...new Set(job.orderIds || [])];
              result.fixesApplied.push('Rimossi orderIds duplicati');
            }
            if (issue.field === 'quoteIds') {
              updates.quoteIds = [...new Set(job.quoteIds || [])];
              result.fixesApplied.push('Rimossi quoteIds duplicati');
            }
            if (issue.field === 'galleryIds') {
              updates.galleryIds = [...new Set(job.galleryIds || [])];
              result.fixesApplied.push('Rimossi galleryIds duplicati');
            }
            break;

          case 'client_sourceref_missing':
            if (issue.actualValue) {
              const clienteRef = doc(db, 'clienti', issue.actualValue);
              await updateDoc(clienteRef, {
                'sourceRefs.jobIds': arrayUnion(jobId),
                updatedAt: Timestamp.now()
              });
              result.fixesApplied.push(`Aggiunto jobId a cliente ${issue.actualValue}`);
            }
            break;

          case 'orphan_order':
            if (issue.actualValue) {
              const currentOrderIds = job.orderIds || [];
              updates.orderIds = currentOrderIds.filter(id => id !== issue.actualValue);
              result.fixesApplied.push(`Rimosso orderId inesistente: ${issue.actualValue}`);
            }
            break;

          case 'orphan_quote':
            if (issue.actualValue) {
              const currentQuoteIds = job.quoteIds || [];
              updates.quoteIds = currentQuoteIds.filter(id => id !== issue.actualValue);
              result.fixesApplied.push(`Rimosso quoteId inesistente: ${issue.actualValue}`);
            }
            break;

          case 'orphan_gallery':
            if (issue.actualValue) {
              const currentGalleryIds = job.galleryIds || [];
              updates.galleryIds = currentGalleryIds.filter(id => id !== issue.actualValue);
              result.fixesApplied.push(`Rimosso galleryId inesistente: ${issue.actualValue}`);
            }
            break;

          case 'order_jobid_mismatch':
            if (issue.resourceId && issue.expectedValue) {
              const orderRef = doc(db, 'orders', issue.resourceId);
              await updateDoc(orderRef, {
                jobId: issue.expectedValue,
                updatedAt: Timestamp.now()
              });
              result.fixesApplied.push(`Corretto jobId ordine ${issue.resourceId}`);
            }
            break;

          case 'quote_jobid_mismatch':
            if (issue.resourceId && issue.expectedValue) {
              const quoteRef = doc(db, 'quotes', issue.resourceId);
              await updateDoc(quoteRef, {
                jobId: issue.expectedValue,
                updatedAt: Timestamp.now()
              });
              result.fixesApplied.push(`Corretto jobId preventivo ${issue.resourceId}`);
            }
            break;

          case 'gallery_jobid_mismatch':
            if (issue.resourceId && issue.expectedValue) {
              const galleryRef = doc(db, 'galleries', issue.resourceId);
              await updateDoc(galleryRef, {
                jobId: issue.expectedValue,
                updatedAt: Timestamp.now()
              });
              result.fixesApplied.push(`Corretto jobId galleria ${issue.resourceId}`);
            }
            break;

          case 'financial_mismatch':
            if (issue.field === 'financials.totaleOrdini' && issue.expectedValue !== undefined) {
              updates['financials.totaleOrdini'] = issue.expectedValue;
              result.fixesApplied.push(`totaleOrdini aggiornato a ${issue.expectedValue}`);
            }
            if (issue.field === 'financials.saldoResiduo' && issue.expectedValue !== undefined) {
              updates['financials.saldoResiduo'] = issue.expectedValue;
              result.fixesApplied.push(`saldoResiduo aggiornato a ${issue.expectedValue}`);
            }
            break;
        }
      } catch (err) {
        console.error(`Errore fix ${issue.category}:`, err);
        result.fixesFailed.push(`${fixDesc}: ${err}`);
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = Timestamp.now();
      await updateDoc(jobRef, updates);
      console.log(`✅ Job ${jobId} aggiornato con ${Object.keys(updates).length} campi`);
    }

    result.success = result.fixesFailed.length === 0;
    return result;

  } catch (error) {
    console.error(`❌ Errore fix job ${jobId}:`, error);
    result.fixesFailed.push(`Errore generale: ${error}`);
    result.success = false;
    return result;
  }
}

export async function fixAllIssues(
  report: FullAnalysisReport,
  onProgress?: (current: number, total: number, jobName: string) => void
): Promise<FullFixReport> {
  const fixReport: FullFixReport = {
    timestamp: new Date(),
    totalJobsFixed: 0,
    totalFixesApplied: 0,
    totalFixesFailed: 0,
    results: []
  };

  const jobsWithFixableIssues = report.results.filter(r => r.fixableCount > 0);

  for (let i = 0; i < jobsWithFixableIssues.length; i++) {
    const jobResult = jobsWithFixableIssues[i];
    
    if (onProgress) {
      onProgress(i + 1, jobsWithFixableIssues.length, jobResult.jobName);
    }

    const fixableIssues = jobResult.issues.filter(issue => issue.fixable);
    const result = await fixJobIssues(jobResult.jobId, fixableIssues);
    
    fixReport.results.push(result);
    fixReport.totalFixesApplied += result.fixesApplied.length;
    fixReport.totalFixesFailed += result.fixesFailed.length;
    
    if (result.fixesApplied.length > 0) {
      fixReport.totalJobsFixed++;
    }
  }

  console.log('✅ Fix completati');
  console.log(`   Jobs corretti: ${fixReport.totalJobsFixed}`);
  console.log(`   Fix applicati: ${fixReport.totalFixesApplied}`);
  console.log(`   Fix falliti: ${fixReport.totalFixesFailed}`);

  return fixReport;
}

export async function syncClientSourceRefs(
  onProgress?: (current: number, total: number) => void
): Promise<{ updated: number; errors: number }> {
  console.log('🔄 Sincronizzazione sourceRefs clienti...');

  const result = { updated: 0, errors: 0 };

  try {
    const jobsSnapshot = await getDocs(collection(db, 'jobs'));
    const jobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Job[];

    const clientJobsMap = new Map<string, Set<string>>();

    for (const job of jobs) {
      const clientiIds = job.clientiIds || [];
      for (const clienteId of clientiIds) {
        if (!clientJobsMap.has(clienteId)) {
          clientJobsMap.set(clienteId, new Set());
        }
        clientJobsMap.get(clienteId)!.add(job.id);
      }
    }

    const clientiSnapshot = await getDocs(collection(db, 'clienti'));
    const total = clientiSnapshot.docs.length;

    for (let i = 0; i < clientiSnapshot.docs.length; i++) {
      const clienteDoc = clientiSnapshot.docs[i];
      const cliente = { id: clienteDoc.id, ...clienteDoc.data() } as Cliente;
      
      if (onProgress) {
        onProgress(i + 1, total);
      }

      const expectedJobIds = clientJobsMap.get(cliente.id) || new Set();
      const currentJobIds = new Set(cliente.sourceRefs?.jobIds || []);

      const missingJobIds = [...expectedJobIds].filter(id => !currentJobIds.has(id));

      if (missingJobIds.length > 0) {
        try {
          const clienteRef = doc(db, 'clienti', cliente.id);
          await updateDoc(clienteRef, {
            'sourceRefs.jobIds': arrayUnion(...missingJobIds),
            updatedAt: Timestamp.now()
          });
          result.updated++;
          console.log(`✅ Cliente ${cliente.nome} ${cliente.cognome}: aggiunti ${missingJobIds.length} jobIds`);
        } catch (err) {
          console.error(`❌ Errore update cliente ${cliente.id}:`, err);
          result.errors++;
        }
      }
    }

    console.log(`✅ Sync completata: ${result.updated} clienti aggiornati, ${result.errors} errori`);
    return result;

  } catch (error) {
    console.error('❌ Errore sync sourceRefs:', error);
    throw error;
  }
}
