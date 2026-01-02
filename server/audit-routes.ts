/**
 * Audit System Routes - Verifica integrità e sicurezza del sistema
 * 
 * Controlli:
 * - Sicurezza: endpoint non protetti, secrets esposti
 * - Integrità dati: riferimenti orfani, documenti malformati
 * - Consistenza: stati workflow inconsistenti
 */

import { Router, Request, Response, NextFunction } from "express";
import { db } from './firebase-admin.js';
import { authenticateFirebase } from './email-routes.js';

const router = Router();

const ADMIN_EMAILS = ["gennaro.mazzacane@gmail.com"];

interface AuthRequest extends Request {
  user?: {
    uid: string;
    email: string;
  };
}

function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const email = req.user?.email;
  if (!email || !ADMIN_EMAILS.includes(email)) {
    return res.status(403).json({
      error: 'Accesso negato',
      message: 'Solo gli amministratori possono eseguire audit del sistema',
    });
  }
  next();
}

interface AuditIssue {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'security' | 'data-integrity' | 'consistency' | 'performance';
  title: string;
  description: string;
  affectedCollection?: string;
  affectedDocId?: string;
  suggestedFix?: string;
}

interface AuditResult {
  success: boolean;
  timestamp: string;
  durationMs: number;
  totalIssues: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  issues: AuditIssue[];
}

/**
 * GET /api/audit/full
 * Esegue audit completo del sistema
 */
router.get('/full', authenticateFirebase, requireAdmin, async (req: AuthRequest, res: Response) => {
  const startTime = Date.now();
  const issues: AuditIssue[] = [];
  
  try {
    console.log('🔍 Starting full system audit...');
    
    // 1. Verifica riferimenti orfani clienteId in jobs
    const orphanedJobClients = await checkOrphanedReferences('jobs', 'clienteId', 'clienti');
    issues.push(...orphanedJobClients);
    
    // 2. Verifica riferimenti orfani jobId in orders
    const orphanedOrderJobs = await checkOrphanedReferences('orders', 'jobId', 'jobs');
    issues.push(...orphanedOrderJobs);
    
    // 3. Verifica riferimenti orfani jobId in quotes
    const orphanedQuoteJobs = await checkOrphanedReferences('quotes', 'jobId', 'jobs');
    issues.push(...orphanedQuoteJobs);
    
    // 4. Verifica riferimenti orfani galleryId in photos
    const orphanedPhotoGalleries = await checkOrphanedReferences('photos', 'galleryId', 'galleries');
    issues.push(...orphanedPhotoGalleries);
    
    // 5. Verifica bookings senza clienteId
    const bookingsWithoutClient = await checkMissingRequiredField('bookings', 'clienteId');
    issues.push(...bookingsWithoutClient);
    
    // 6. Verifica gallerie senza jobId
    const galleriesWithoutJob = await checkMissingRequiredField('galleries', 'jobId');
    issues.push(...galleriesWithoutJob);
    
    // 7. Verifica ordini con stato inconsistente
    const inconsistentOrders = await checkOrderConsistency();
    issues.push(...inconsistentOrders);
    
    // 8. Verifica quotes con firma ma stato non firmato
    const inconsistentQuotes = await checkQuoteConsistency();
    issues.push(...inconsistentQuotes);
    
    // 9. Verifica documenti con date future sospette
    const suspiciousDates = await checkSuspiciousDates();
    issues.push(...suspiciousDates);
    
    // 10. Verifica duplicati email clienti
    const duplicateClients = await checkDuplicateClients();
    issues.push(...duplicateClients);
    
    // 11. Verifica booking consistency (calendar sync)
    const bookingIssues = await checkBookingConsistency();
    issues.push(...bookingIssues);
    
    // 12. Verifica jobs senza calendar event
    const jobCalendarIssues = await checkJobCalendarSync();
    issues.push(...jobCalendarIssues);
    
    // 13. Verifica consulenze senza calendar event
    const consultationCalendarIssues = await checkConsultationCalendarSync();
    issues.push(...consultationCalendarIssues);

    const durationMs = Date.now() - startTime;
    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const infoCount = issues.filter(i => i.severity === 'info').length;
    
    console.log(`✅ Audit completed in ${durationMs}ms: ${issues.length} issues found (${criticalCount} critical, ${warningCount} warnings, ${infoCount} info)`);
    
    const result: AuditResult = {
      success: true,
      timestamp: new Date().toISOString(),
      durationMs,
      totalIssues: issues.length,
      criticalCount,
      warningCount,
      infoCount,
      issues: issues.sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      }),
    };
    
    res.json(result);
    
  } catch (error: any) {
    console.error('❌ Audit failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    });
  }
});

/**
 * GET /api/audit/data-integrity
 * Verifica solo integrità dati
 */
router.get('/data-integrity', authenticateFirebase, requireAdmin, async (req: AuthRequest, res: Response) => {
  const startTime = Date.now();
  const issues: AuditIssue[] = [];
  
  try {
    // Riferimenti orfani
    issues.push(...await checkOrphanedReferences('jobs', 'clienteId', 'clienti'));
    issues.push(...await checkOrphanedReferences('orders', 'jobId', 'jobs'));
    issues.push(...await checkOrphanedReferences('quotes', 'jobId', 'jobs'));
    issues.push(...await checkOrphanedReferences('photos', 'galleryId', 'galleries'));
    issues.push(...await checkOrphanedReferences('galleries', 'jobId', 'jobs'));
    
    // Campi mancanti
    issues.push(...await checkMissingRequiredField('jobs', 'clienteId'));
    issues.push(...await checkMissingRequiredField('orders', 'jobId'));
    
    const durationMs = Date.now() - startTime;
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      durationMs,
      totalIssues: issues.length,
      criticalCount: issues.filter(i => i.severity === 'critical').length,
      warningCount: issues.filter(i => i.severity === 'warning').length,
      infoCount: issues.filter(i => i.severity === 'info').length,
      issues,
    });
    
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/audit/consistency
 * Verifica consistenza stati e workflow
 */
router.get('/consistency', authenticateFirebase, requireAdmin, async (req: AuthRequest, res: Response) => {
  const startTime = Date.now();
  const issues: AuditIssue[] = [];
  
  try {
    issues.push(...await checkOrderConsistency());
    issues.push(...await checkQuoteConsistency());
    issues.push(...await checkBookingConsistency());
    
    const durationMs = Date.now() - startTime;
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      durationMs,
      totalIssues: issues.length,
      criticalCount: issues.filter(i => i.severity === 'critical').length,
      warningCount: issues.filter(i => i.severity === 'warning').length,
      infoCount: issues.filter(i => i.severity === 'info').length,
      issues,
    });
    
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== HELPER FUNCTIONS ====================

async function checkOrphanedReferences(
  sourceCollection: string,
  foreignKeyField: string,
  targetCollection: string
): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];
  
  try {
    const sourceSnap = await db.collection(sourceCollection).get();
    const targetSnap = await db.collection(targetCollection).get();
    const targetIds = new Set(targetSnap.docs.map(d => d.id));
    
    for (const doc of sourceSnap.docs) {
      const data = doc.data();
      const foreignKey = data[foreignKeyField];
      
      if (foreignKey && !targetIds.has(foreignKey)) {
        issues.push({
          id: `orphan-${sourceCollection}-${doc.id}`,
          severity: 'critical',
          category: 'data-integrity',
          title: `Riferimento orfano in ${sourceCollection}`,
          description: `Il documento ${doc.id} ha ${foreignKeyField}="${foreignKey}" che non esiste in ${targetCollection}`,
          affectedCollection: sourceCollection,
          affectedDocId: doc.id,
          suggestedFix: `Verificare e correggere il riferimento o eliminare il documento`,
        });
      }
    }
  } catch (error) {
    console.error(`Error checking orphaned refs ${sourceCollection} -> ${targetCollection}:`, error);
  }
  
  return issues;
}

async function checkMissingRequiredField(
  collection: string,
  requiredField: string
): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];
  
  try {
    const snap = await db.collection(collection).get();
    
    for (const doc of snap.docs) {
      const data = doc.data();
      
      if (!data[requiredField]) {
        issues.push({
          id: `missing-${collection}-${doc.id}-${requiredField}`,
          severity: 'warning',
          category: 'data-integrity',
          title: `Campo obbligatorio mancante`,
          description: `${collection}/${doc.id} non ha il campo ${requiredField}`,
          affectedCollection: collection,
          affectedDocId: doc.id,
          suggestedFix: `Aggiungere il campo ${requiredField} al documento`,
        });
      }
    }
  } catch (error) {
    console.error(`Error checking missing field ${requiredField} in ${collection}:`, error);
  }
  
  return issues;
}

async function checkOrderConsistency(): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];
  
  try {
    const ordersSnap = await db.collection('orders').get();
    
    for (const doc of ordersSnap.docs) {
      const data = doc.data();
      
      // Ordine con pagamento completo ma stato non completato
      if (data.paidAmount >= data.totalAmount && data.totalAmount > 0) {
        if (data.workflowState && !['completed', 'delivered'].includes(data.workflowState)) {
          issues.push({
            id: `order-paid-not-completed-${doc.id}`,
            severity: 'info',
            category: 'consistency',
            title: `Ordine pagato ma non completato`,
            description: `Ordine ${doc.id} è completamente pagato (${data.paidAmount}€) ma lo stato è "${data.workflowState}"`,
            affectedCollection: 'orders',
            affectedDocId: doc.id,
            suggestedFix: `Verificare se l'ordine deve essere marcato come completato`,
          });
        }
      }
      
      // Ordine con paidAmount > totalAmount
      if (data.paidAmount > data.totalAmount && data.totalAmount > 0) {
        issues.push({
          id: `order-overpaid-${doc.id}`,
          severity: 'warning',
          category: 'consistency',
          title: `Ordine con pagamento eccedente`,
          description: `Ordine ${doc.id}: pagato ${data.paidAmount}€ su un totale di ${data.totalAmount}€`,
          affectedCollection: 'orders',
          affectedDocId: doc.id,
          suggestedFix: `Verificare i pagamenti e correggere gli importi`,
        });
      }
    }
  } catch (error) {
    console.error('Error checking order consistency:', error);
  }
  
  return issues;
}

async function checkQuoteConsistency(): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];
  
  try {
    const quotesSnap = await db.collection('quotes').get();
    
    for (const doc of quotesSnap.docs) {
      const data = doc.data();
      
      // Quote con firma ma stato non firmato
      if (data.signatureData && data.status !== 'signed') {
        issues.push({
          id: `quote-signed-wrong-status-${doc.id}`,
          severity: 'warning',
          category: 'consistency',
          title: `Preventivo firmato con stato errato`,
          description: `Preventivo ${doc.id} ha firma digitale ma stato è "${data.status}" invece di "signed"`,
          affectedCollection: 'quotes',
          affectedDocId: doc.id,
          suggestedFix: `Aggiornare lo stato del preventivo a "signed"`,
        });
      }
      
      // Quote senza jobId
      if (!data.jobId) {
        issues.push({
          id: `quote-no-job-${doc.id}`,
          severity: 'warning',
          category: 'data-integrity',
          title: `Preventivo senza lavoro associato`,
          description: `Preventivo ${doc.id} non ha un jobId associato`,
          affectedCollection: 'quotes',
          affectedDocId: doc.id,
          suggestedFix: `Associare il preventivo a un lavoro esistente`,
        });
      }
    }
  } catch (error) {
    console.error('Error checking quote consistency:', error);
  }
  
  return issues;
}

async function checkBookingConsistency(): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];
  
  try {
    const bookingsSnap = await db.collection('bookings').get();
    
    for (const doc of bookingsSnap.docs) {
      const data = doc.data();
      
      // Booking confermata senza evento calendar
      if (data.status === 'confirmed' && !data.calendarEventId) {
        issues.push({
          id: `booking-no-calendar-${doc.id}`,
          severity: 'warning',
          category: 'consistency',
          title: `Prenotazione confermata senza evento calendario`,
          description: `Prenotazione ${doc.id} è confermata ma non ha calendarEventId`,
          affectedCollection: 'bookings',
          affectedDocId: doc.id,
          suggestedFix: `Sincronizzare la prenotazione con Google Calendar`,
        });
      }
    }
  } catch (error) {
    console.error('Error checking booking consistency:', error);
  }
  
  return issues;
}

async function checkSuspiciousDates(): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];
  
  try {
    const now = new Date();
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 5);
    
    // Controlla jobs con date molto nel futuro
    const jobsSnap = await db.collection('jobs').get();
    for (const doc of jobsSnap.docs) {
      const data = doc.data();
      if (data.eventDate) {
        const eventDate = data.eventDate.toDate ? data.eventDate.toDate() : new Date(data.eventDate);
        if (eventDate > farFuture) {
          issues.push({
            id: `job-far-future-${doc.id}`,
            severity: 'info',
            category: 'data-integrity',
            title: `Lavoro con data molto nel futuro`,
            description: `Job ${doc.id} ha data evento ${eventDate.toLocaleDateString('it-IT')} (oltre 5 anni)`,
            affectedCollection: 'jobs',
            affectedDocId: doc.id,
            suggestedFix: `Verificare se la data è corretta`,
          });
        }
      }
    }
  } catch (error) {
    console.error('Error checking suspicious dates:', error);
  }
  
  return issues;
}

async function checkDuplicateClients(): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];
  
  try {
    const clientsSnap = await db.collection('clienti').get();
    const emailMap = new Map<string, string[]>();
    
    for (const doc of clientsSnap.docs) {
      const data = doc.data();
      if (data.email) {
        const email = data.email.toLowerCase().trim();
        if (!emailMap.has(email)) {
          emailMap.set(email, []);
        }
        emailMap.get(email)!.push(doc.id);
      }
    }
    
    for (const [email, docIds] of emailMap) {
      if (docIds.length > 1) {
        issues.push({
          id: `duplicate-email-${email}`,
          severity: 'warning',
          category: 'data-integrity',
          title: `Email cliente duplicata`,
          description: `L'email "${email}" è usata da ${docIds.length} clienti: ${docIds.join(', ')}`,
          affectedCollection: 'clienti',
          suggestedFix: `Unificare i clienti duplicati`,
        });
      }
    }
  } catch (error) {
    console.error('Error checking duplicate clients:', error);
  }
  
  return issues;
}

async function checkJobCalendarSync(): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];
  
  try {
    const jobsSnap = await db.collection('jobs').get();
    
    for (const doc of jobsSnap.docs) {
      const data = doc.data();
      
      // Job con data definita ma senza evento calendar
      if (data.eventDate && !data.calendarEventId && !data.deleted) {
        const eventDate = data.eventDate.toDate ? data.eventDate.toDate() : new Date(data.eventDate);
        const now = new Date();
        
        // Solo per eventi futuri o recenti (ultimi 30 giorni)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        if (eventDate > thirtyDaysAgo) {
          issues.push({
            id: `job-no-calendar-${doc.id}`,
            severity: 'warning',
            category: 'consistency',
            title: `Lavoro senza evento calendario`,
            description: `Job "${data.title || doc.id}" (data: ${eventDate.toLocaleDateString('it-IT')}) non ha calendarEventId`,
            affectedCollection: 'jobs',
            affectedDocId: doc.id,
            suggestedFix: `Sincronizzare il lavoro con Google Calendar dalla pagina dettaglio lavoro`,
          });
        }
      }
      
      // Job confermato/in lavorazione senza data evento
      if (['confirmed', 'in_progress', 'editing'].includes(data.workflowState) && !data.eventDate) {
        issues.push({
          id: `job-no-date-${doc.id}`,
          severity: 'info',
          category: 'consistency',
          title: `Lavoro confermato senza data evento`,
          description: `Job "${data.title || doc.id}" è in stato "${data.workflowState}" ma non ha data evento definita`,
          affectedCollection: 'jobs',
          affectedDocId: doc.id,
          suggestedFix: `Definire la data dell'evento nel lavoro`,
        });
      }
    }
  } catch (error) {
    console.error('Error checking job calendar sync:', error);
  }
  
  return issues;
}

/**
 * GET /api/audit/orphaned-photos
 * Analisi dettagliata foto orfane con verifica duplicati
 */
router.get('/orphaned-photos', authenticateFirebase, requireAdmin, async (req: AuthRequest, res: Response) => {
  const startTime = Date.now();
  
  try {
    console.log('🔍 Analyzing orphaned photos...');
    
    // 1. Carica tutte le gallerie esistenti
    const galleriesSnap = await db.collection('galleries').get();
    const validGalleryIds = new Set(galleriesSnap.docs.map(doc => doc.id));
    
    // 2. Carica tutte le foto
    const photosSnap = await db.collection('photos').get();
    
    // 3. Raggruppa foto orfane per galleryId
    const orphanedByGallery = new Map<string, any[]>();
    const validPhotos: any[] = [];
    
    for (const doc of photosSnap.docs) {
      const data = doc.data();
      const galleryId = data.galleryId;
      
      if (!galleryId || !validGalleryIds.has(galleryId)) {
        const galleryKey = galleryId || 'no-gallery-id';
        if (!orphanedByGallery.has(galleryKey)) {
          orphanedByGallery.set(galleryKey, []);
        }
        orphanedByGallery.get(galleryKey)!.push({
          id: doc.id,
          filename: data.filename,
          originalUrl: data.originalUrl,
          photoUrl: data.photoUrl,
          galleryId: galleryId,
        });
      } else {
        validPhotos.push({
          id: doc.id,
          filename: data.filename,
          originalUrl: data.originalUrl,
        });
      }
    }
    
    // 4. Per ogni gruppo, verifica duplicati in foto valide
    const orphanedGalleries = [];
    let totalOrphaned = 0;
    let totalDuplicates = 0;
    let totalUnique = 0;
    
    for (const [galleryId, photos] of orphanedByGallery) {
      const duplicates: any[] = [];
      const unique: any[] = [];
      
      for (const photo of photos) {
        // Cerca duplicato per filename o originalUrl
        const isDuplicate = validPhotos.some(vp => 
          (photo.filename && vp.filename && photo.filename === vp.filename) ||
          (photo.originalUrl && vp.originalUrl && photo.originalUrl === vp.originalUrl)
        );
        
        if (isDuplicate) {
          duplicates.push(photo);
        } else {
          unique.push(photo);
        }
      }
      
      totalOrphaned += photos.length;
      totalDuplicates += duplicates.length;
      totalUnique += unique.length;
      
      orphanedGalleries.push({
        galleryId,
        totalPhotos: photos.length,
        duplicateCount: duplicates.length,
        uniqueCount: unique.length,
        duplicates: duplicates.slice(0, 5), // Primi 5 per anteprima
        unique: unique.slice(0, 5), // Primi 5 per anteprima
        safeToDelete: unique.length === 0,
      });
    }
    
    // Ordina per numero di foto (più grandi prima)
    orphanedGalleries.sort((a, b) => b.totalPhotos - a.totalPhotos);
    
    const durationMs = Date.now() - startTime;
    
    console.log(`✅ Orphaned photos analysis completed in ${durationMs}ms`);
    console.log(`   Total orphaned: ${totalOrphaned}, Duplicates: ${totalDuplicates}, Unique: ${totalUnique}`);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      durationMs,
      summary: {
        totalOrphanedPhotos: totalOrphaned,
        totalDuplicates,
        totalUnique,
        orphanedGalleriesCount: orphanedGalleries.length,
        safeToDeleteCount: orphanedGalleries.filter(g => g.safeToDelete).length,
      },
      orphanedGalleries,
    });
    
  } catch (error: any) {
    console.error('❌ Orphaned photos analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * DELETE /api/audit/orphaned-photos/:galleryId
 * Elimina le foto orfane (documenti Firestore) di una specifica galleria.
 * 
 * NOTA: Questo endpoint elimina solo i documenti Firestore dalla collezione 'photos'.
 * I file in Firebase Storage associati alla galleria dovrebbero essere già stati eliminati
 * quando la galleria originale è stata cancellata (AdminDashboard.tsx deleteGallery
 * elimina sia Storage che Firestore). Questi documenti sono solo metadati rimasti orfani.
 */
router.delete('/orphaned-photos/:galleryId', authenticateFirebase, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { galleryId } = req.params;
  const { onlyDuplicates } = req.query; // Se true, elimina solo i duplicati
  
  try {
    console.log(`🗑️ Deleting orphaned photo documents for gallery: ${galleryId}`);
    
    // Verifica che la galleria non esista (conferma che è orfana)
    const galleryDoc = await db.collection('galleries').doc(galleryId).get();
    if (galleryDoc.exists) {
      return res.status(400).json({
        success: false,
        error: 'La galleria esiste ancora. Non è possibile eliminare foto di gallerie esistenti.',
      });
    }
    
    // Trova tutte le foto orfane di questa galleria
    const photosSnap = await db.collection('photos')
      .where('galleryId', '==', galleryId)
      .get();
    
    if (photosSnap.empty) {
      return res.json({
        success: true,
        message: 'Nessuna foto orfana trovata per questa galleria',
        deletedCount: 0,
      });
    }
    
    // Elimina in batch (max 500 per batch in Firestore)
    let deletedCount = 0;
    const batchSize = 400; // Uso 400 per sicurezza
    
    for (let i = 0; i < photosSnap.docs.length; i += batchSize) {
      const batch = db.batch();
      const chunk = photosSnap.docs.slice(i, i + batchSize);
      
      for (const doc of chunk) {
        batch.delete(doc.ref);
        deletedCount++;
      }
      
      await batch.commit();
    }
    
    console.log(`✅ Deleted ${deletedCount} orphaned photo documents for gallery ${galleryId}`);
    
    res.json({
      success: true,
      message: `Eliminate ${deletedCount} foto orfane`,
      deletedCount,
    });
    
  } catch (error: any) {
    console.error(`❌ Failed to delete orphaned photos for gallery ${galleryId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

async function checkConsultationCalendarSync(): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];
  
  try {
    const consultationsSnap = await db.collection('consultations').get();
    
    for (const doc of consultationsSnap.docs) {
      const data = doc.data();
      
      // Consulenza confermata senza evento calendar
      if (data.status === 'confirmed' && !data.calendarEventId) {
        issues.push({
          id: `consultation-no-calendar-${doc.id}`,
          severity: 'warning',
          category: 'consistency',
          title: `Consulenza confermata senza evento calendario`,
          description: `Consulenza ${doc.id} per "${data.clientName || 'N/A'}" è confermata ma non ha calendarEventId`,
          affectedCollection: 'consultations',
          affectedDocId: doc.id,
          suggestedFix: `Sincronizzare la consulenza con Google Calendar`,
        });
      }
      
      // Consulenza approvata senza data
      if (data.status === 'approved' && !data.scheduledDate) {
        issues.push({
          id: `consultation-approved-no-date-${doc.id}`,
          severity: 'info',
          category: 'consistency',
          title: `Consulenza approvata senza data`,
          description: `Consulenza ${doc.id} per "${data.clientName || 'N/A'}" è approvata ma non ha data programmata`,
          affectedCollection: 'consultations',
          affectedDocId: doc.id,
          suggestedFix: `Programmare una data per la consulenza`,
        });
      }
    }
  } catch (error) {
    console.error('Error checking consultation calendar sync:', error);
  }
  
  return issues;
}

/**
 * GET /api/audit/payment-discrepancies
 * Trova discrepanze tra totale preventivi e piano pagamenti
 */
router.get('/payment-discrepancies', authenticateFirebase, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    console.log('🔍 Analyzing payment discrepancies...');
    
    interface DiscrepancyReport {
      jobId: string;
      jobSource: 'import' | 'new' | 'unknown';
      clientName: string;
      clientEmail: string;
      eventDate: string | null;
      // Preventivi
      quoteIds: string[];
      quoteTotale: number;
      quoteCount: number;
      signedQuoteCount: number;
      // Payment Schedule
      scheduleId: string | null;
      scheduleTotale: number;
      scheduleTotalePagato: number;
      scheduleSaldoResiduo: number;
      scheduleRateCount: number;
      scheduleRatePagate: number;
      // Calcoli
      sumOfRates: number;
      discrepancy: number;
      discrepancyType: 'quote_vs_schedule' | 'schedule_vs_rates' | 'both' | 'none';
      issues: string[];
    }
    
    const reports: DiscrepancyReport[] = [];
    
    // 1. Recupera tutti i job non deleted
    const jobsSnap = await db.collection('jobs')
      .where('deleted', '!=', true)
      .get();
    
    console.log(`📊 Analyzing ${jobsSnap.docs.length} jobs...`);
    
    for (const jobDoc of jobsSnap.docs) {
      const job = jobDoc.data();
      const jobId = jobDoc.id;
      const issues: string[] = [];
      
      // Determina source del job
      let jobSource: 'import' | 'new' | 'unknown' = 'unknown';
      if (job.source === 'import' || job.importedAt) {
        jobSource = 'import';
      } else if (job.createdAt) {
        jobSource = 'new';
      }
      
      // 2. Recupera preventivi del job
      const quotesSnap = await db.collection('quotes')
        .where('jobId', '==', jobId)
        .get();
      
      let quoteTotale = 0;
      let signedQuoteCount = 0;
      const quoteIds: string[] = [];
      
      for (const quoteDoc of quotesSnap.docs) {
        const quote = quoteDoc.data();
        quoteIds.push(quoteDoc.id);
        
        // Usa il totale del preventivo firmato se esiste
        if (quote.status === 'signed' || quote.signedAt || quote.signatureData) {
          signedQuoteCount++;
          quoteTotale += Number(quote.totale || quote.total || 0);
        }
      }
      
      // Se non ci sono preventivi firmati, usa il totale di tutti i preventivi
      if (signedQuoteCount === 0 && quotesSnap.docs.length > 0) {
        for (const quoteDoc of quotesSnap.docs) {
          const quote = quoteDoc.data();
          quoteTotale += Number(quote.totale || quote.total || 0);
        }
      }
      
      // 3. Recupera payment schedules del job
      const schedulesSnap = await db.collection('paymentSchedules')
        .where('jobId', '==', jobId)
        .get();
      
      let scheduleId: string | null = null;
      let scheduleTotale = 0;
      let scheduleTotalePagato = 0;
      let scheduleSaldoResiduo = 0;
      let scheduleRateCount = 0;
      let scheduleRatePagate = 0;
      let sumOfRates = 0;
      
      if (!schedulesSnap.empty) {
        // Prendi il primo schedule (dovrebbe essercene solo uno per job)
        const scheduleDoc = schedulesSnap.docs[0];
        const schedule = scheduleDoc.data();
        scheduleId = scheduleDoc.id;
        
        scheduleTotale = Number(schedule.totale || 0);
        scheduleTotalePagato = Number(schedule.totalePagato || 0);
        scheduleSaldoResiduo = Number(schedule.saldoResiduo || 0);
        
        // Calcola somma delle rate e conta rate pagate
        if (Array.isArray(schedule.payments)) {
          scheduleRateCount = schedule.payments.length;
          for (const payment of schedule.payments) {
            sumOfRates += Number(payment.importo || 0);
            if (payment.stato === 'pagato') {
              scheduleRatePagate++;
            }
          }
        }
      }
      
      // 4. Analizza discrepanze
      let discrepancyType: 'quote_vs_schedule' | 'schedule_vs_rates' | 'both' | 'none' = 'none';
      let discrepancy = 0;
      
      // Per job importati, usa anche i campi legacy del job se presenti
      const jobTotalePreventivato = Number(job.totalePreventivato || 0);
      const jobTotalePagato = Number(job.totalePagato || 0);
      const jobSaldoResiduo = Number(job.saldoResiduo || 0);
      
      // Usa il totale dal preventivo se disponibile, altrimenti dal job
      const totaleRiferimento = quoteTotale > 0 ? quoteTotale : jobTotalePreventivato;
      
      // Discrepanza tra totale preventivo/job e totale schedule
      if (scheduleId && totaleRiferimento > 0) {
        const quoteVsSchedule = Math.abs(totaleRiferimento - scheduleTotale);
        if (quoteVsSchedule > 0.01) { // Tolleranza 1 centesimo
          discrepancy = quoteVsSchedule;
          discrepancyType = 'quote_vs_schedule';
          const fonte = quoteTotale > 0 ? 'preventivo' : 'job.totalePreventivato';
          issues.push(`Totale ${fonte} (€${totaleRiferimento.toFixed(2)}) ≠ Totale piano (€${scheduleTotale.toFixed(2)}) - Diff: €${quoteVsSchedule.toFixed(2)}`);
        }
      }
      
      // Discrepanza tra totale schedule e somma rate
      if (scheduleId && scheduleRateCount > 0) {
        const scheduleVsRates = Math.abs(scheduleTotale - sumOfRates);
        if (scheduleVsRates > 0.01) {
          if (discrepancyType !== 'none') {
            discrepancyType = 'both';
          } else {
            discrepancyType = 'schedule_vs_rates';
            discrepancy = scheduleVsRates;
          }
          issues.push(`Totale piano (€${scheduleTotale.toFixed(2)}) ≠ Somma rate (€${sumOfRates.toFixed(2)}) - Diff: €${scheduleVsRates.toFixed(2)}`);
        }
      }
      
      // Per job importati: verifica che i campi legacy corrispondano al piano pagamenti
      if (scheduleId && jobSource === 'import') {
        // Verifica totale job vs schedule
        if (jobTotalePreventivato > 0 && Math.abs(jobTotalePreventivato - scheduleTotale) > 0.01) {
          if (!issues.some(i => i.includes('job.totalePreventivato'))) {
            issues.push(`[Legacy] job.totalePreventivato (€${jobTotalePreventivato.toFixed(2)}) ≠ Piano (€${scheduleTotale.toFixed(2)})`);
          }
        }
        // Verifica pagato job vs schedule
        if (Math.abs(jobTotalePagato - scheduleTotalePagato) > 0.01) {
          issues.push(`[Legacy] job.totalePagato (€${jobTotalePagato.toFixed(2)}) ≠ Piano pagato (€${scheduleTotalePagato.toFixed(2)})`);
        }
      }
      
      // Verifica invariante: saldoResiduo = totale - totalePagato
      if (scheduleId) {
        const expectedSaldo = Math.max(0, scheduleTotale - scheduleTotalePagato);
        const saldoDiff = Math.abs(expectedSaldo - scheduleSaldoResiduo);
        if (saldoDiff > 0.01) {
          issues.push(`Saldo residuo errato: atteso €${expectedSaldo.toFixed(2)}, trovato €${scheduleSaldoResiduo.toFixed(2)}`);
        }
      }
      
      // Schedule senza preventivo associato
      if (scheduleId && quoteTotale === 0 && jobTotalePreventivato === 0) {
        issues.push(`Piano pagamenti presente ma nessun preventivo trovato`);
      }
      
      // Aggiungi report solo se ci sono discrepanze o è il job specifico richiesto
      if (issues.length > 0 || jobId === 'h2rc66suq2nam3p9ooeswg') {
        // Recupera info cliente
        let clientName = job.clientName || job.nomeSposoCognome || 'N/A';
        let clientEmail = job.clientEmail || '';
        
        if (job.clienteId) {
          try {
            const clientDoc = await db.collection('clienti').doc(job.clienteId).get();
            if (clientDoc.exists) {
              const client = clientDoc.data();
              clientName = client?.nome || client?.name || clientName;
              clientEmail = client?.email || clientEmail;
            }
          } catch (e) {
            // ignore
          }
        }
        
        // Formatta data evento
        let eventDate: string | null = null;
        if (job.dataEvento) {
          try {
            const d = job.dataEvento.toDate ? job.dataEvento.toDate() : new Date(job.dataEvento);
            eventDate = d.toISOString().split('T')[0];
          } catch (e) {
            eventDate = String(job.dataEvento);
          }
        }
        
        reports.push({
          jobId,
          jobSource,
          clientName,
          clientEmail,
          eventDate,
          quoteIds,
          quoteTotale,
          quoteCount: quotesSnap.docs.length,
          signedQuoteCount,
          scheduleId,
          scheduleTotale,
          scheduleTotalePagato,
          scheduleSaldoResiduo,
          scheduleRateCount,
          scheduleRatePagate,
          sumOfRates,
          discrepancy,
          discrepancyType,
          issues,
        });
      }
    }
    
    // Ordina per discrepanza decrescente
    reports.sort((a, b) => b.discrepancy - a.discrepancy);
    
    // Statistiche
    const stats = {
      totalJobs: jobsSnap.docs.length,
      jobsWithDiscrepancies: reports.length,
      importedJobsWithIssues: reports.filter(r => r.jobSource === 'import').length,
      newJobsWithIssues: reports.filter(r => r.jobSource === 'new').length,
      totalDiscrepancyAmount: reports.reduce((sum, r) => sum + r.discrepancy, 0),
      byType: {
        quote_vs_schedule: reports.filter(r => r.discrepancyType === 'quote_vs_schedule').length,
        schedule_vs_rates: reports.filter(r => r.discrepancyType === 'schedule_vs_rates').length,
        both: reports.filter(r => r.discrepancyType === 'both').length,
      }
    };
    
    console.log(`✅ Found ${reports.length} jobs with payment discrepancies`);
    
    res.json({
      success: true,
      stats,
      reports,
    });
    
  } catch (error: any) {
    console.error('❌ Payment discrepancy audit failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/audit/job-payment-details/:jobId
 * Dettaglio completo di un singolo job per analisi pagamenti
 */
router.get('/job-payment-details/:jobId', authenticateFirebase, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { jobId } = req.params;
  
  try {
    // Job
    const jobDoc = await db.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ error: 'Job non trovato' });
    }
    const job = jobDoc.data();
    
    // Cliente
    let client = null;
    if (job?.clienteId) {
      const clientDoc = await db.collection('clienti').doc(job.clienteId).get();
      if (clientDoc.exists) {
        client = { id: clientDoc.id, ...clientDoc.data() };
      }
    }
    
    // Preventivi
    const quotesSnap = await db.collection('quotes').where('jobId', '==', jobId).get();
    const quotes = quotesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Ordini
    const ordersSnap = await db.collection('orders').where('jobId', '==', jobId).get();
    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Payment Schedules
    const schedulesSnap = await db.collection('paymentSchedules').where('jobId', '==', jobId).get();
    const schedules = schedulesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Cash Movements collegati
    const cashSnap = await db.collection('cashMovements').where('jobId', '==', jobId).get();
    const cashMovements = cashSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Legacy financials dal job
    const legacyFinancials = {
      totalePreventivato: job?.totalePreventivato,
      totalePagato: job?.totalePagato,
      saldoResiduo: job?.saldoResiduo,
      totaleOrdini: job?.totaleOrdini,
      accontoVersato: job?.accontoVersato,
    };
    
    res.json({
      success: true,
      job: { id: jobId, ...job },
      client,
      quotes,
      orders,
      schedules,
      cashMovements,
      legacyFinancials,
    });
    
  } catch (error: any) {
    console.error(`❌ Failed to get job payment details for ${jobId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/audit/fix-schedule-total/:jobId
 * Corregge il totale del piano pagamenti sincronizzandolo con il preventivo
 * e crea una rata di saldo per il residuo se necessario
 */
router.post('/fix-schedule-total/:jobId', authenticateFirebase, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { jobId } = req.params;
  const { createSaldoRata = true, nuovoTotale } = req.body;
  
  try {
    console.log(`🔧 Fixing schedule total for job ${jobId}...`);
    
    // 1. Recupera il job
    const jobDoc = await db.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ error: 'Job non trovato' });
    }
    const job = jobDoc.data();
    
    // 2. Recupera preventivo firmato
    const quotesSnap = await db.collection('quotes')
      .where('jobId', '==', jobId)
      .get();
    
    let quoteTotale = 0;
    let signedQuote: any = null;
    
    for (const quoteDoc of quotesSnap.docs) {
      const quote = quoteDoc.data();
      if (quote.status === 'signed' || quote.signedAt || quote.signatureData) {
        quoteTotale = Number(quote.totale || quote.total || 0);
        signedQuote = { id: quoteDoc.id, ...quote };
        break;
      }
    }
    
    // Se nessun preventivo firmato, usa il primo preventivo o i campi legacy
    if (quoteTotale === 0 && quotesSnap.docs.length > 0) {
      const firstQuote = quotesSnap.docs[0].data();
      quoteTotale = Number(firstQuote.totale || firstQuote.total || 0);
    }
    
    // Fallback ai campi legacy del job
    if (quoteTotale === 0) {
      quoteTotale = Number(job?.totalePreventivato || 0);
    }
    
    // Se fornito nuovoTotale manualmente, usalo
    const totaleFinale = nuovoTotale ? Number(nuovoTotale) : quoteTotale;
    
    if (totaleFinale === 0) {
      return res.status(400).json({ 
        error: 'Impossibile determinare il totale corretto',
        message: 'Nessun preventivo trovato e nessun nuovoTotale fornito'
      });
    }
    
    // 3. Recupera il piano pagamenti
    const schedulesSnap = await db.collection('paymentSchedules')
      .where('jobId', '==', jobId)
      .get();
    
    if (schedulesSnap.empty) {
      return res.status(404).json({ error: 'Nessun piano pagamenti trovato per questo job' });
    }
    
    const scheduleDoc = schedulesSnap.docs[0];
    const schedule = scheduleDoc.data();
    const scheduleId = scheduleDoc.id;
    
    const vecchioTotale = Number(schedule.totale || 0);
    const totalePagato = Number(schedule.totalePagato || 0);
    const nuovoSaldoResiduo = Math.max(0, totaleFinale - totalePagato);
    
    // 4. Prepara le modifiche
    const updates: any = {
      totale: totaleFinale,
      saldoResiduo: nuovoSaldoResiduo,
      updatedAt: new Date(),
    };
    
    let payments = [...(schedule.payments || [])];
    let newRataCreated = false;
    let ratesAdjusted = false;
    
    // 5. Calcola somma rate non pagate
    const rateNonPagate = payments.filter((p: any) => p.stato === 'atteso' || p.stato === 'scaduto');
    const sommaRateNonPagate = rateNonPagate.reduce((sum: number, p: any) => sum + Number(p.importo || 0), 0);
    
    // 6. Se il nuovo residuo è diverso dalla somma rate non pagate, ribilancia
    if (Math.abs(nuovoSaldoResiduo - sommaRateNonPagate) > 0.01) {
      if (nuovoSaldoResiduo <= 0) {
        // Nessun residuo: rimuovi tutte le rate non pagate
        payments = payments.filter((p: any) => p.stato === 'pagato' || p.stato === 'parziale');
        ratesAdjusted = true;
      } else if (rateNonPagate.length === 0 && createSaldoRata) {
        // Nessuna rata non pagata ma c'è residuo: crea nuova rata
        const { nanoid } = await import('nanoid');
        const nuovaRata = {
          id: nanoid(),
          tipo: 'saldo' as const,
          importo: nuovoSaldoResiduo,
          dataScadenza: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          stato: 'atteso' as const,
          note: 'Saldo residuo (creato da correzione audit)',
        };
        payments.push(nuovaRata);
        newRataCreated = true;
      } else if (rateNonPagate.length > 0) {
        // Ribilancia le rate non pagate per corrispondere al nuovo residuo
        // Strategia: distribuisci equamente con arrotondamento su ultima rata
        const numRate = rateNonPagate.length;
        const importoPerRata = Math.floor((nuovoSaldoResiduo / numRate) * 100) / 100;
        let distribuito = 0;
        let rateProcessate = 0;
        
        for (let i = 0; i < payments.length; i++) {
          const p = payments[i];
          if (p.stato === 'atteso' || p.stato === 'scaduto') {
            rateProcessate++;
            if (rateProcessate === numRate) {
              // Ultima rata: assegna il residuo rimanente
              p.importo = Math.max(0, Math.round((nuovoSaldoResiduo - distribuito) * 100) / 100);
            } else {
              p.importo = importoPerRata;
            }
            distribuito += p.importo;
            p.note = `${p.note || ''} (ribilanciato)`.trim();
          }
        }
        ratesAdjusted = true;
      }
      updates.payments = payments;
    } else if (createSaldoRata && nuovoSaldoResiduo > 0 && rateNonPagate.length === 0) {
      // Caso originale: residuo corretto ma manca rata
      const { nanoid } = await import('nanoid');
      const nuovaRata = {
        id: nanoid(),
        tipo: 'saldo' as const,
        importo: nuovoSaldoResiduo,
        dataScadenza: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        stato: 'atteso' as const,
        note: 'Saldo residuo (creato da correzione audit)',
      };
      payments.push(nuovaRata);
      updates.payments = payments;
      newRataCreated = true;
    }
    
    // 7. Aggiorna Firestore
    await db.collection('paymentSchedules').doc(scheduleId).update(updates);
    
    console.log(`✅ Fixed schedule ${scheduleId}: totale ${vecchioTotale} -> ${totaleFinale}, residuo ${nuovoSaldoResiduo}`);
    
    res.json({
      success: true,
      message: 'Piano pagamenti corretto',
      data: {
        scheduleId,
        vecchioTotale,
        nuovoTotale: totaleFinale,
        totalePagato,
        nuovoSaldoResiduo,
        quoteTotale,
        newRataCreated,
        ratesAdjusted,
        rateCount: payments.length,
      }
    });
    
  } catch (error: any) {
    console.error(`❌ Failed to fix schedule for job ${jobId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/audit/fix-all-discrepancies
 * Corregge tutte le discrepanze trovate (con dry-run opzionale)
 */
router.post('/fix-all-discrepancies', authenticateFirebase, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { dryRun = true } = req.body;
  
  try {
    console.log(`🔧 ${dryRun ? '[DRY-RUN]' : ''} Fixing all payment discrepancies...`);
    
    const results: any[] = [];
    
    // Recupera tutti i job con payment schedules
    const schedulesSnap = await db.collection('paymentSchedules').get();
    
    for (const scheduleDoc of schedulesSnap.docs) {
      const schedule = scheduleDoc.data();
      const jobId = schedule.jobId;
      
      if (!jobId) continue;
      
      // Recupera preventivo
      const quotesSnap = await db.collection('quotes')
        .where('jobId', '==', jobId)
        .get();
      
      let quoteTotale = 0;
      for (const quoteDoc of quotesSnap.docs) {
        const quote = quoteDoc.data();
        if (quote.status === 'signed' || quote.signedAt || quote.signatureData) {
          quoteTotale = Number(quote.totale || quote.total || 0);
          break;
        }
      }
      
      // Fallback a primo preventivo o job legacy
      if (quoteTotale === 0) {
        if (quotesSnap.docs.length > 0) {
          quoteTotale = Number(quotesSnap.docs[0].data().totale || 0);
        } else {
          const jobDoc = await db.collection('jobs').doc(jobId).get();
          if (jobDoc.exists) {
            quoteTotale = Number(jobDoc.data()?.totalePreventivato || 0);
          }
        }
      }
      
      const scheduleTotale = Number(schedule.totale || 0);
      const discrepancy = Math.abs(quoteTotale - scheduleTotale);
      
      if (discrepancy > 0.01 && quoteTotale > 0) {
        const totalePagato = Number(schedule.totalePagato || 0);
        const nuovoSaldoResiduo = Math.max(0, quoteTotale - totalePagato);
        
        const result: any = {
          jobId,
          scheduleId: scheduleDoc.id,
          vecchioTotale: scheduleTotale,
          nuovoTotale: quoteTotale,
          discrepancy,
          nuovoSaldoResiduo,
          fixed: false,
        };
        
        if (!dryRun) {
          // Applica correzione
          const updates: any = {
            totale: quoteTotale,
            saldoResiduo: nuovoSaldoResiduo,
            updatedAt: new Date(),
          };
          
          let payments = [...(schedule.payments || [])];
          const rateNonPagate = payments.filter((p: any) => p.stato === 'atteso' || p.stato === 'scaduto');
          const sommaRateNonPagate = rateNonPagate.reduce((sum: number, p: any) => sum + Number(p.importo || 0), 0);
          
          // Ribilancia se necessario
          if (Math.abs(nuovoSaldoResiduo - sommaRateNonPagate) > 0.01) {
            if (nuovoSaldoResiduo <= 0) {
              payments = payments.filter((p: any) => p.stato === 'pagato' || p.stato === 'parziale');
              result.ratesRemoved = true;
            } else if (rateNonPagate.length === 0) {
              const { nanoid } = await import('nanoid');
              payments.push({
                id: nanoid(),
                tipo: 'saldo',
                importo: nuovoSaldoResiduo,
                dataScadenza: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                stato: 'atteso',
                note: 'Saldo residuo (creato da correzione batch)',
              });
              result.newRataCreated = true;
            } else {
              // Ribilancia rate esistenti
              const numRate = rateNonPagate.length;
              const importoPerRata = Math.floor((nuovoSaldoResiduo / numRate) * 100) / 100;
              let distribuito = 0;
              let rateProcessate = 0;
              
              for (let i = 0; i < payments.length; i++) {
                const p = payments[i];
                if (p.stato === 'atteso' || p.stato === 'scaduto') {
                  rateProcessate++;
                  if (rateProcessate === numRate) {
                    p.importo = Math.max(0, Math.round((nuovoSaldoResiduo - distribuito) * 100) / 100);
                  } else {
                    p.importo = importoPerRata;
                  }
                  distribuito += p.importo;
                  p.note = `${p.note || ''} (ribilanciato)`.trim();
                }
              }
              result.ratesAdjusted = true;
            }
            updates.payments = payments;
          }
          
          await db.collection('paymentSchedules').doc(scheduleDoc.id).update(updates);
          result.fixed = true;
        }
        
        results.push(result);
      }
    }
    
    console.log(`✅ ${dryRun ? '[DRY-RUN]' : ''} Found ${results.length} schedules to fix`);
    
    res.json({
      success: true,
      dryRun,
      message: dryRun 
        ? `Trovati ${results.length} piani da correggere. Esegui con dryRun=false per applicare.`
        : `Corretti ${results.filter(r => r.fixed).length} piani pagamenti.`,
      totalFound: results.length,
      totalFixed: results.filter(r => r.fixed).length,
      results,
    });
    
  } catch (error: any) {
    console.error('❌ Failed to fix discrepancies:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
