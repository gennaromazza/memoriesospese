/**
 * Admin Routes
 * Endpoints per admin UI - cancellation management, reconciliation, health checks
 */

import express from 'express';
import { db } from './firebase-admin.js';
import { triggerManualRetry } from './workers/cancellation-retry.js';

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

export default router;
