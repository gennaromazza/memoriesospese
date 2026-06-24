/**
 * Admin Routes
 * Endpoints per admin UI - cancellation management, reconciliation, health checks
 */

import express from 'express';
import { db } from './firebase-admin.js';
import { triggerManualRetry } from './workers/cancellation-retry.js';
import { ensureJobCalendarEvent } from './job-routes.js';
import { formatPhoneForWhatsApp } from '../shared/phone-utils.js';
import { authenticateFirebase } from './email-routes.js';
import { generateGalleryThumbnails } from './thumbnails.js';

const router = express.Router();

const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

function requireAdmin(req: any, res: express.Response, next: express.NextFunction) {
  if (!ADMIN_EMAILS.includes(req.user?.email || '')) {
    return res.status(403).json({ error: 'Accesso negato: solo admin' });
  }
  next();
}

/**
 * POST /api/admin/galleries/:galleryId/generate-thumbnails
 * Genera le miniature mancanti per una galleria (lato server, admin SDK).
 * Body: { limit?: number }  -> processa fino a `limit` foto per chiamata.
 * Ritorna: { success, totalMissing, processed, generated, failed, remaining }
 * Chiamare ripetutamente finché remaining === 0 (o generated === 0).
 */
router.post('/galleries/:galleryId/generate-thumbnails', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    if (!ADMIN_EMAILS.includes(req.user?.email || '')) {
      return res.status(403).json({ error: 'Accesso negato: solo admin' });
    }

    const { galleryId } = req.params;
    if (!galleryId) {
      return res.status(400).json({ error: 'galleryId mancante' });
    }

    const limit = Number(req.body?.limit) || undefined;
    const result = await generateGalleryThumbnails(galleryId, limit as number);

    console.log(
      `🖼️  Thumbnails galleria ${galleryId}: ${result.generated} generate, ` +
      `${result.failed} fallite, ${result.remaining} rimanenti`
    );

    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error(`❌ Errore generazione miniature galleria ${req.params.galleryId}:`, error);
    res.status(500).json({ error: 'Errore durante la generazione delle miniature', details: error.message });
  }
});

/**
 * GET /api/admin/pending-cancellations
 * Lista bookings in cancellation_pending per admin monitoring
 */
router.get('/pending-cancellations', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    const pendingSnapshot = await db.collection('bookings')
      .where('stato', '==', 'cancellation_pending')
      .orderBy('cancellationMetadata.initiatedAt', 'desc')
      .limit(100)
      .get();

    const pendingBookings = pendingSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        cliente: data.cliente,
        campagna: data.campagna,
        dataShootingInizio: data.dataShootingInizio,
        cancellationMetadata: data.cancellationMetadata,
        updatedAt: data.updatedAt
      };
    });

    res.json({
      success: true,
      count: pendingBookings.length,
      pendingBookings
    });

  } catch (error: any) {
    console.error('❌ Errore fetching pending cancellations:', error);
    res.status(500).json({
      error: 'Errore durante il recupero delle cancellazioni pending',
      details: error.message
    });
  }
});

/**
 * POST /api/admin/retry-cancellation/:bookingId
 * Manual trigger retry per booking specifico
 */
router.post('/retry-cancellation/:bookingId', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    const { bookingId } = req.params;
    
    const result = await triggerManualRetry(bookingId);
    
    res.json(result);

  } catch (error: any) {
    console.error(`❌ Errore manual retry booking ${req.params.bookingId}:`, error);
    res.status(500).json({
      error: 'Errore durante il retry manuale',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/worker-health
 * Health check del cancellation retry worker
 */
router.get('/worker-health', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    // Query stats sullo stato dei pending cancellations
    const pendingSnapshot = await db.collection('bookings')
      .where('stato', '==', 'cancellation_pending')
      .get();

    const totalPending = pendingSnapshot.size;
    const maxRetriesReached = pendingSnapshot.docs.filter(doc => 
      doc.data().cancellationMetadata?.maxRetriesReached === true
    ).length;

    const recentFailures = pendingSnapshot.docs.filter(doc => {
      const metadata = doc.data().cancellationMetadata;
      if (!metadata?.lastAttemptAt) return false;
      
      const lastAttempt = metadata.lastAttemptAt.toDate();
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      return lastAttempt > fifteenMinutesAgo && metadata.lastErrorCode;
    }).length;

    res.json({
      success: true,
      workerStatus: 'active',
      stats: {
        totalPending,
        maxRetriesReached,
        recentFailures
      },
      alerts: maxRetriesReached > 0 ? [
        `⚠️  ${maxRetriesReached} booking(s) hanno raggiunto max retry attempts - manual intervention richiesta`
      ] : []
    });

  } catch (error: any) {
    console.error('❌ Errore worker health check:', error);
    res.status(500).json({
      error: 'Errore durante health check',
      details: error.message
    });
  }
});

/**
 * POST /api/admin/jobs/reconcile-calendar
 * Backfill googleCalendarEventId per legacy jobs con blocking status
 * Utile dopo migrazioni o per riparazione automatica
 */
router.post('/jobs/reconcile-calendar', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    console.log('🔄 Avvio reconciliation Calendar events per legacy jobs...');
    
    // Stati bloccanti che richiedono Calendar event
    const BLOCKING_STATUSES = ['confermato', 'shooting_fatto', 'selezione_pending', 'produzione'];
    
    // Cerca tutti jobs con blocking status
    const jobsSnapshot = await db.collection('jobs')
      .where('status', 'in', BLOCKING_STATUSES)
      .get();
    
    const allJobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log(`📊 Trovati ${allJobs.length} jobs con blocking status da verificare/riconciliare`);
    
    if (allJobs.length === 0) {
      return res.json({
        success: true,
        message: 'Nessun job con blocking status da riconciliare',
        stats: {
          total: 0,
          verified: 0,
          created: 0,
          recreated: 0,
          failures: 0
        }
      });
    }
    
    // Process reconciliation per TUTTI i jobs (non solo quelli senza ID)
    // ensureJobCalendarEvent() gestisce:
    // - Jobs con ID valido → verifica esistenza → 'verified'
    // - Jobs con ID stale → rimuove + ricrea → 'recreated'
    // - Jobs senza ID → crea nuovo → 'created'
    const results = {
      verified: [] as Array<{ jobId: string; eventId: string }>,
      created: [] as Array<{ jobId: string; eventId: string }>,
      recreated: [] as Array<{ jobId: string; eventId: string }>,
      failures: [] as Array<{ jobId: string; error: string }>
    };
    
    for (const job of allJobs) {
      try {
        // Chiama helper per creare/verificare Calendar event
        // Helper gestisce verifica esistenza + ricrea se stale
        const result = await ensureJobCalendarEvent(job.id);
        
        if (result.success && result.action) {
          // Categorizza per action type (action è undefined quando success=false)
          if (result.action === 'verified') {
            results.verified.push({ jobId: job.id, eventId: result.eventId! });
          } else if (result.action === 'created') {
            results.created.push({ jobId: job.id, eventId: result.eventId! });
          } else if (result.action === 'recreated') {
            results.recreated.push({ jobId: job.id, eventId: result.eventId! });
          }
        } else {
          // success=false o action mancante → failure
          results.failures.push({
            jobId: job.id,
            error: result.error || 'Unknown error'
          });
        }
        
      } catch (error: any) {
        results.failures.push({
          jobId: job.id,
          error: error.message || 'Unknown error'
        });
      }
    }
    
    const totalSuccess = results.verified.length + results.created.length + results.recreated.length;
    
    console.log(`✅ Reconciliation completata: ${totalSuccess} success (${results.verified.length} verified, ${results.created.length} created, ${results.recreated.length} recreated), ${results.failures.length} failures`);
    
    res.json({
      success: true,
      message: 'Reconciliation completata',
      stats: {
        total: allJobs.length,
        verified: results.verified.length,
        created: results.created.length,
        recreated: results.recreated.length,
        failures: results.failures.length
      },
      details: {
        verified: results.verified,
        created: results.created,
        recreated: results.recreated,
        failed: results.failures
      }
    });
    
  } catch (error: any) {
    console.error('❌ Errore durante reconciliation Calendar events:', error);
    res.status(500).json({
      error: 'Errore durante reconciliation',
      details: error.message
    });
  }
});

/**
 * POST /api/admin/fix-calendar-links
 * Aggiorna la descrizione di tutti gli eventi Google Calendar dei job
 * con i link corretti (publicToken per preventivi firmati)
 * One-time migration script
 */
router.post('/fix-calendar-links', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    console.log('🔗 Inizio fix link calendario per tutti i job...');
    const { ensureJobCalendarEvent } = await import('./job-routes.js');

    const jobsSnap = await db.collection('jobs')
      .where('googleCalendarEventId', '!=', '')
      .get();

    console.log(`📋 Trovati ${jobsSnap.size} job con evento calendario`);

    const results = {
      total: jobsSnap.size,
      updated: 0,
      skipped: 0,
      errors: 0,
      details: [] as Array<{ jobId: string; nomeEvento: string; status: string; result: string }>,
    };

    for (const doc of jobsSnap.docs) {
      const job = doc.data();
      try {
        const result = await ensureJobCalendarEvent(doc.id);
        if (result.success) {
          results.updated++;
          results.details.push({
            jobId: doc.id,
            nomeEvento: job.nomeEvento || 'N/A',
            status: job.status || 'N/A',
            result: `✅ ${result.action || 'updated'}`,
          });
        } else {
          results.skipped++;
          results.details.push({
            jobId: doc.id,
            nomeEvento: job.nomeEvento || 'N/A',
            status: job.status || 'N/A',
            result: `⏭️ ${result.error || 'skipped'}`,
          });
        }
        console.log(`  [${results.updated + results.skipped + results.errors}/${results.total}] ${job.nomeEvento || doc.id}: ${result.success ? '✅' : '⏭️'}`);
      } catch (err: any) {
        results.errors++;
        results.details.push({
          jobId: doc.id,
          nomeEvento: job.nomeEvento || 'N/A',
          status: job.status || 'N/A',
          result: `❌ ${err.message}`,
        });
        console.error(`  ❌ Errore job ${doc.id}:`, err.message);
      }
    }

    console.log(`🔗 Fix completato: ${results.updated} aggiornati, ${results.skipped} saltati, ${results.errors} errori`);

    res.json({
      success: true,
      message: `Fix link calendario completato: ${results.updated} aggiornati, ${results.skipped} saltati, ${results.errors} errori`,
      results,
    });
  } catch (error: any) {
    console.error('❌ Errore fix calendar links:', error);
    res.status(500).json({
      error: 'Errore durante fix link calendario',
      details: error.message,
    });
  }
});

/**
 * POST /api/admin/sync-calendar
 * Sincronizzazione manuale Google Calendar <-> Firestore
 * Elimina eventi fantasma e ripara inconsistenze
 */
router.post('/sync-calendar', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    console.log('🔄 Admin triggered manual calendar sync');
    
    // Importa dinamicamente per evitare circular dependencies
    const { runEventSyncGuard } = await import('./sync/event-sync-guard.js');
    
    const report = await runEventSyncGuard();
    
    res.json({
      success: true,
      message: 'Calendar sync completed successfully',
      report: {
        timestamp: report.timestamp,
        duration: report.duration,
        googleCalendarEvents: report.googleCalendarEvents,
        firestoreRecords: report.firestoreRecords,
        repairsPerformed: {
          consultations: report.repairs.consultations.length,
          bookings: report.repairs.bookings.length,
          total: report.repairs.consultations.length + report.repairs.bookings.length
        },
        details: report.repairs
      }
    });
    
  } catch (error: any) {
    console.error('❌ Errore durante sync calendar:', error);
    res.status(500).json({
      error: 'Errore durante la sincronizzazione calendar',
      details: error.message
    });
  }
});

/**
 * POST /api/admin/migrate-phone-numbers
 * Migra e standardizza tutti i numeri di telefono nel database per WhatsApp
 * Aggiorna clienti, bookings, orders, jobs con numeri formattati correttamente
 */
router.post('/migrate-phone-numbers', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    console.log('📱 Inizio migrazione numeri di telefono...');
    
    const results = {
      clienti: { total: 0, updated: 0, errors: 0 },
      bookings: { total: 0, updated: 0, errors: 0 },
      orders: { total: 0, updated: 0, errors: 0 },
      jobs: { total: 0, updated: 0, errors: 0 },
      consultations: { total: 0, updated: 0, errors: 0 },
    };
    
    // 1. Migra clienti
    console.log('📱 Migrazione clienti...');
    const clientiSnap = await db.collection('clienti').get();
    results.clienti.total = clientiSnap.size;
    
    for (const doc of clientiSnap.docs) {
      try {
        const data = doc.data();
        const updates: Record<string, any> = {};
        let needsUpdate = false;
        
        // Campi telefono nei clienti
        const phoneFields = ['whatsapp', 'cellulare1', 'cellulare2', 'telefono', 'cellulare'];
        
        for (const field of phoneFields) {
          if (data[field]) {
            const formatted = formatPhoneForWhatsApp(data[field]);
            if (formatted && formatted !== data[field]) {
              updates[field] = formatted;
              needsUpdate = true;
            }
          }
        }
        
        if (needsUpdate) {
          await doc.ref.update(updates);
          results.clienti.updated++;
        }
      } catch (error) {
        console.error(`Errore migrazione cliente ${doc.id}:`, error);
        results.clienti.errors++;
      }
    }
    
    // 2. Migra bookings (cliente.whatsapp nested)
    console.log('📱 Migrazione bookings...');
    const bookingsSnap = await db.collection('bookings').get();
    results.bookings.total = bookingsSnap.size;
    
    for (const doc of bookingsSnap.docs) {
      try {
        const data = doc.data();
        const updates: Record<string, any> = {};
        let needsUpdate = false;
        
        // Campo nested cliente.whatsapp
        if (data.cliente?.whatsapp) {
          const formatted = formatPhoneForWhatsApp(data.cliente.whatsapp);
          if (formatted && formatted !== data.cliente.whatsapp) {
            updates['cliente.whatsapp'] = formatted;
            needsUpdate = true;
          }
        }
        
        if (needsUpdate) {
          await doc.ref.update(updates);
          results.bookings.updated++;
        }
      } catch (error) {
        console.error(`Errore migrazione booking ${doc.id}:`, error);
        results.bookings.errors++;
      }
    }
    
    // 3. Migra orders (clienteWhatsapp)
    console.log('📱 Migrazione orders...');
    const ordersSnap = await db.collection('orders').get();
    results.orders.total = ordersSnap.size;
    
    for (const doc of ordersSnap.docs) {
      try {
        const data = doc.data();
        const updates: Record<string, any> = {};
        let needsUpdate = false;
        
        if (data.clienteWhatsapp) {
          const formatted = formatPhoneForWhatsApp(data.clienteWhatsapp);
          if (formatted && formatted !== data.clienteWhatsapp) {
            updates.clienteWhatsapp = formatted;
            needsUpdate = true;
          }
        }
        
        if (needsUpdate) {
          await doc.ref.update(updates);
          results.orders.updated++;
        }
      } catch (error) {
        console.error(`Errore migrazione order ${doc.id}:`, error);
        results.orders.errors++;
      }
    }
    
    // 4. Migra jobs (clienteTelefono)
    console.log('📱 Migrazione jobs...');
    const jobsSnap = await db.collection('jobs').get();
    results.jobs.total = jobsSnap.size;
    
    for (const doc of jobsSnap.docs) {
      try {
        const data = doc.data();
        const updates: Record<string, any> = {};
        let needsUpdate = false;
        
        if (data.clienteTelefono) {
          const formatted = formatPhoneForWhatsApp(data.clienteTelefono);
          if (formatted && formatted !== data.clienteTelefono) {
            updates.clienteTelefono = formatted;
            needsUpdate = true;
          }
        }
        
        if (needsUpdate) {
          await doc.ref.update(updates);
          results.jobs.updated++;
        }
      } catch (error) {
        console.error(`Errore migrazione job ${doc.id}:`, error);
        results.jobs.errors++;
      }
    }
    
    // 5. Migra consultations (clientPhone)
    console.log('📱 Migrazione consultations...');
    const consultationsSnap = await db.collection('consultations').get();
    results.consultations.total = consultationsSnap.size;
    
    for (const doc of consultationsSnap.docs) {
      try {
        const data = doc.data();
        const updates: Record<string, any> = {};
        let needsUpdate = false;
        
        if (data.clientPhone) {
          const formatted = formatPhoneForWhatsApp(data.clientPhone);
          if (formatted && formatted !== data.clientPhone) {
            updates.clientPhone = formatted;
            needsUpdate = true;
          }
        }
        
        if (needsUpdate) {
          await doc.ref.update(updates);
          results.consultations.updated++;
        }
      } catch (error) {
        console.error(`Errore migrazione consultation ${doc.id}:`, error);
        results.consultations.errors++;
      }
    }
    
    const totalUpdated = results.clienti.updated + results.bookings.updated + 
                        results.orders.updated + results.jobs.updated + results.consultations.updated;
    
    console.log(`✅ Migrazione completata: ${totalUpdated} documenti aggiornati`);
    
    res.json({
      success: true,
      message: `Migrazione completata: ${totalUpdated} numeri standardizzati`,
      results
    });
    
  } catch (error: any) {
    console.error('❌ Errore durante migrazione numeri telefono:', error);
    res.status(500).json({
      error: 'Errore durante la migrazione numeri telefono',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/phone-migration-preview
 * Anteprima della migrazione: mostra quanti numeri verrebbero aggiornati
 */
router.get('/phone-migration-preview', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    console.log('📱 Anteprima migrazione numeri...');
    
    const preview = {
      clienti: { total: 0, toUpdate: 0, samples: [] as Array<{ id: string; field: string; from: string; to: string }> },
      bookings: { total: 0, toUpdate: 0 },
      orders: { total: 0, toUpdate: 0 },
      jobs: { total: 0, toUpdate: 0 },
      consultations: { total: 0, toUpdate: 0 },
    };
    
    // Verifica clienti
    const clientiSnap = await db.collection('clienti').get();
    preview.clienti.total = clientiSnap.size;
    
    const phoneFields = ['whatsapp', 'cellulare1', 'cellulare2', 'telefono', 'cellulare'];
    
    for (const doc of clientiSnap.docs) {
      const data = doc.data();
      for (const field of phoneFields) {
        if (data[field]) {
          const formatted = formatPhoneForWhatsApp(data[field]);
          if (formatted && formatted !== data[field]) {
            preview.clienti.toUpdate++;
            if (preview.clienti.samples.length < 5) {
              preview.clienti.samples.push({
                id: doc.id,
                field,
                from: data[field],
                to: formatted
              });
            }
            break; // Conta solo una volta per documento
          }
        }
      }
    }
    
    // Conteggio veloce per altre collection
    const bookingsSnap = await db.collection('bookings').get();
    preview.bookings.total = bookingsSnap.size;
    for (const doc of bookingsSnap.docs) {
      const data = doc.data();
      if (data.cliente?.whatsapp) {
        const formatted = formatPhoneForWhatsApp(data.cliente.whatsapp);
        if (formatted && formatted !== data.cliente.whatsapp) {
          preview.bookings.toUpdate++;
        }
      }
    }
    
    const ordersSnap = await db.collection('orders').get();
    preview.orders.total = ordersSnap.size;
    for (const doc of ordersSnap.docs) {
      const data = doc.data();
      if (data.clienteWhatsapp) {
        const formatted = formatPhoneForWhatsApp(data.clienteWhatsapp);
        if (formatted && formatted !== data.clienteWhatsapp) {
          preview.orders.toUpdate++;
        }
      }
    }
    
    const jobsSnap = await db.collection('jobs').get();
    preview.jobs.total = jobsSnap.size;
    for (const doc of jobsSnap.docs) {
      const data = doc.data();
      if (data.clienteTelefono) {
        const formatted = formatPhoneForWhatsApp(data.clienteTelefono);
        if (formatted && formatted !== data.clienteTelefono) {
          preview.jobs.toUpdate++;
        }
      }
    }
    
    const consultationsSnap = await db.collection('consultations').get();
    preview.consultations.total = consultationsSnap.size;
    for (const doc of consultationsSnap.docs) {
      const data = doc.data();
      if (data.clientPhone) {
        const formatted = formatPhoneForWhatsApp(data.clientPhone);
        if (formatted && formatted !== data.clientPhone) {
          preview.consultations.toUpdate++;
        }
      }
    }
    
    const totalToUpdate = preview.clienti.toUpdate + preview.bookings.toUpdate + 
                          preview.orders.toUpdate + preview.jobs.toUpdate + preview.consultations.toUpdate;
    
    res.json({
      success: true,
      totalToUpdate,
      preview
    });
    
  } catch (error: any) {
    console.error('❌ Errore anteprima migrazione:', error);
    res.status(500).json({
      error: 'Errore durante anteprima migrazione',
      details: error.message
    });
  }
});

export default router;
