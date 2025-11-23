/**
 * Admin Routes
 * Endpoints per admin UI - cancellation management, reconciliation, health checks
 */

import express from 'express';
import { db } from './firebase-admin.js';
import { triggerManualRetry } from './workers/cancellation-retry.js';
import { ensureJobCalendarEvent } from './job-routes.js';

const router = express.Router();

/**
 * GET /api/admin/pending-cancellations
 * Lista bookings in cancellation_pending per admin monitoring
 */
router.get('/pending-cancellations', async (req, res) => {
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
router.post('/retry-cancellation/:bookingId', async (req, res) => {
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
router.get('/worker-health', async (req, res) => {
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
router.post('/jobs/reconcile-calendar', async (req, res) => {
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
 * POST /api/admin/sync-calendar
 * Sincronizzazione manuale Google Calendar <-> Firestore
 * Elimina eventi fantasma e ripara inconsistenze
 */
router.post('/sync-calendar', async (req, res) => {
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

export default router;
