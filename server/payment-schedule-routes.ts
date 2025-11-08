/**
 * PAYMENT SCHEDULE ROUTES
 * API endpoints per gestione scadenzari pagamenti
 */

import { Router, Request, Response } from 'express';
import { db } from './firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { nanoid } from 'nanoid';

const router = Router();

/**
 * POST /api/payment-schedules/generate
 * Genera piano pagamenti da quote
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { quoteId, jobId, clienteId, payments, totale } = req.body;

    // Validazione input
    if (!quoteId || !jobId || !clienteId || !payments || !Array.isArray(payments)) {
      return res.status(400).json({
        error: 'Parametri mancanti',
        message: 'quoteId, jobId, clienteId, payments richiesti'
      });
    }

    if (payments.length === 0) {
      return res.status(400).json({
        error: 'Nessuna rata specificata',
        message: 'Almeno una rata richiesta'
      });
    }

    // Calcola totale rate
    const totaleRate = payments.reduce((sum: number, p: any) => sum + (p.importo || 0), 0);
    const differenza = Math.abs(totaleRate - totale);

    // Valida totale (tolleranza 1 centesimo)
    if (differenza >= 0.01) {
      return res.status(400).json({
        error: 'Totale non valido',
        message: `Il totale delle rate (€${totaleRate.toFixed(2)}) deve essere uguale al totale quote (€${totale.toFixed(2)}). Differenza: €${differenza.toFixed(2)}`
      });
    }

    // Determina tipo pagamento automaticamente
    const determinaPaymentType = (index: number, total: number): 'acconto' | 'rata' | 'saldo' => {
      if (total === 1) return 'acconto'; // Unico pagamento
      if (index === 0) return 'acconto'; // Primo pagamento
      if (index === total - 1) return 'saldo'; // Ultimo pagamento
      return 'rata'; // Pagamenti intermedi
    };

    // Crea ScheduledPayment[] con nanoid
    const scheduledPayments = payments.map((payment: any, index: number) => ({
      id: nanoid(),
      tipo: determinaPaymentType(index, payments.length),
      importo: payment.importo,
      dataScadenza: Timestamp.fromDate(new Date(payment.dataScadenza)),
      stato: 'atteso' as const,
      note: payment.descrizione || '',
    }));

    // Crea PaymentSchedule documento
    const scheduleId = nanoid();
    const now = Timestamp.now();

    const paymentSchedule = {
      id: scheduleId,
      jobId,
      quoteId, // Link alla quote di riferimento
      orderId: '', // Opzionale: verrà popolato quando ordine viene creato
      clienteId,
      payments: scheduledPayments,
      totale: totaleRate,
      totalePagato: 0,
      saldoResiduo: totaleRate,
      createdAt: now,
      updatedAt: now,
      createdBy: 'admin', // Admin-only endpoint
    };

    // Salva in Firestore
    await db.collection('paymentSchedules').doc(scheduleId).set(paymentSchedule);

    // Update job timeline (opzionale ma utile)
    try {
      const timelineEventId = nanoid();
      await db.collection('jobTimeline').doc(timelineEventId).set({
        id: timelineEventId,
        jobId,
        evento: 'Piano pagamenti generato',
        descrizione: `Creato scadenzario con ${payments.length} rate per un totale di €${totaleRate.toFixed(2)}`,
        categoria: 'pagamenti',
        timestamp: now,
        userId: 'admin',
      });
    } catch (timelineError) {
      // Non bloccare se timeline fail
      console.error('❌ Errore creazione evento timeline:', timelineError);
    }

    return res.status(201).json({
      success: true,
      scheduleId,
      message: `Piano pagamenti generato con ${payments.length} rate`,
      data: paymentSchedule,
    });
  } catch (error) {
    console.error('❌ Errore generazione piano pagamenti:', error);
    return res.status(500).json({
      error: 'Errore server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
});

/**
 * GET /api/payment-schedules/job/:jobId
 * Ottieni payment schedules per job
 */
router.get('/job/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const snapshot = await db.collection('paymentSchedules')
      .where('jobId', '==', jobId)
      .orderBy('createdAt', 'desc')
      .get();

    const schedules = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.json(schedules);
  } catch (error) {
    console.error('❌ Errore fetch payment schedules:', error);
    return res.status(500).json({
      error: 'Errore server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
});

/**
 * POST /api/payment-schedules/:scheduleId/payments/:paymentId/register
 * Registra pagamento ricevuto
 */
router.post('/:scheduleId/payments/:paymentId/register', async (req: Request, res: Response) => {
  try {
    const { scheduleId, paymentId } = req.params;
    const { importoPagato, dataPagamento, metodoPagamento, note } = req.body;

    // Validazione
    if (!importoPagato || importoPagato <= 0) {
      return res.status(400).json({
        error: 'Importo non valido',
        message: 'Importo pagato richiesto e > 0'
      });
    }

    // Fetch schedule
    const scheduleDoc = await db.collection('paymentSchedules').doc(scheduleId).get();
    if (!scheduleDoc.exists) {
      return res.status(404).json({
        error: 'Schedule non trovato',
        message: `Payment schedule ${scheduleId} non esiste`
      });
    }

    const schedule = scheduleDoc.data();
    if (!schedule) {
      return res.status(500).json({ error: 'Dati schedule non validi' });
    }

    // Trova pagamento
    const paymentIndex = schedule.payments.findIndex((p: any) => p.id === paymentId);
    if (paymentIndex === -1) {
      return res.status(404).json({
        error: 'Pagamento non trovato',
        message: `Pagamento ${paymentId} non esiste nello schedule`
      });
    }

    // Update pagamento
    const updatedPayments = [...schedule.payments];
    const payment = updatedPayments[paymentIndex];

    payment.importoPagato = importoPagato;
    payment.dataPagamento = Timestamp.fromDate(new Date(dataPagamento || Date.now()));
    payment.metodoPagamento = metodoPagamento || 'contante';
    payment.stato = importoPagato >= payment.importo ? 'pagato' : 'parziale';
    if (note) payment.note = note;

    // Ricalcola totali
    const nuovoTotalePagato = updatedPayments.reduce((sum: number, p: any) => sum + (p.importoPagato || 0), 0);
    const nuovoSaldoResiduo = schedule.totale - nuovoTotalePagato;

    // Update Firestore
    await db.collection('paymentSchedules').doc(scheduleId).update({
      payments: updatedPayments,
      totalePagato: nuovoTotalePagato,
      saldoResiduo: nuovoSaldoResiduo,
      updatedAt: Timestamp.now(),
    });

    // Timeline event (opzionale)
    try {
      const timelineEventId = nanoid();
      await db.collection('jobTimeline').doc(timelineEventId).set({
        id: timelineEventId,
        jobId: schedule.jobId,
        evento: 'Pagamento registrato',
        descrizione: `Ricevuto pagamento di €${importoPagato.toFixed(2)} (${payment.tipo}). Saldo residuo: €${nuovoSaldoResiduo.toFixed(2)}`,
        categoria: 'pagamenti',
        timestamp: Timestamp.now(),
        userId: 'admin',
      });
    } catch (timelineError) {
      console.error('❌ Errore creazione evento timeline:', timelineError);
    }

    return res.json({
      success: true,
      message: 'Pagamento registrato con successo',
      data: {
        scheduleId,
        paymentId,
        totalePagato: nuovoTotalePagato,
        saldoResiduo: nuovoSaldoResiduo,
      }
    });
  } catch (error) {
    console.error('❌ Errore registrazione pagamento:', error);
    return res.status(500).json({
      error: 'Errore server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
});

export default router;
