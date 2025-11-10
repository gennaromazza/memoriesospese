/**
 * PAYMENT SCHEDULE ROUTES
 * API endpoints per gestione scadenzari pagamenti
 */

import { Router, Request, Response } from 'express';
import { db } from './firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { nanoid } from 'nanoid';

const router = Router();

/**
 * GET /api/payment-schedules/presets/:quoteId
 * Genera preset piani pagamento automaticamente da quote firmato
 * Ritorna opzioni: acconto-saldo, 2-rate, 3-rate
 */
router.get('/presets/:quoteId', async (req: Request, res: Response) => {
  try {
    const { quoteId } = req.params;

    // Fetch quote
    const quoteDoc = await db.collection('quotes').doc(quoteId).get();
    if (!quoteDoc.exists) {
      return res.status(404).json({
        error: 'Preventivo non trovato',
        message: `Quote ${quoteId} non esiste`
      });
    }

    const quote = quoteDoc.data();
    if (!quote) {
      return res.status(500).json({ error: 'Dati quote non validi' });
    }

    // Calcola totale da preventivo
    const totale = quote.totalAfterDiscount || quote.totaleSelezionato || 0;
    if (totale <= 0) {
      return res.status(400).json({
        error: 'Totale preventivo non valido',
        message: 'Il preventivo deve avere un totale > 0'
      });
    }

    const today = new Date();
    const addDays = (date: Date, days: number) => {
      const result = new Date(date);
      result.setDate(result.getDate() + days);
      return result;
    };

    // Genera preset automatici
    const presets = {
      'acconto-saldo': {
        nome: 'Acconto + Saldo',
        descrizione: 'Acconto 30% + Saldo 70%',
        payments: [
          {
            tipo: 'acconto',
            importo: totale * 0.3,
            dataScadenza: addDays(today, 7),
            descrizione: 'Acconto 30%',
          },
          {
            tipo: 'saldo',
            importo: totale * 0.7,
            dataScadenza: addDays(today, 30),
            descrizione: 'Saldo 70%',
          },
        ],
      },
      '2-rate': {
        nome: '2 Rate Uguali',
        descrizione: '50% + 50%',
        payments: [
          {
            tipo: 'acconto',
            importo: totale / 2,
            dataScadenza: addDays(today, 7),
            descrizione: 'Prima rata (50%)',
          },
          {
            tipo: 'saldo',
            importo: totale / 2,
            dataScadenza: addDays(today, 30),
            descrizione: 'Seconda rata (50%)',
          },
        ],
      },
      '3-rate': {
        nome: '3 Rate Uguali',
        descrizione: '33.33% ciascuna',
        payments: [
          {
            tipo: 'acconto',
            importo: totale / 3,
            dataScadenza: addDays(today, 7),
            descrizione: 'Prima rata (1/3)',
          },
          {
            tipo: 'rata',
            importo: totale / 3,
            dataScadenza: addDays(today, 30),
            descrizione: 'Seconda rata (2/3)',
          },
          {
            tipo: 'saldo',
            importo: totale / 3,
            dataScadenza: addDays(today, 60),
            descrizione: 'Terza rata (3/3)',
          },
        ],
      },
    };

    return res.json({
      success: true,
      quoteId,
      totale,
      presets,
    });
  } catch (error) {
    console.error('❌ Errore generazione presets:', error);
    return res.status(500).json({
      error: 'Errore server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
});

/**
 * POST /api/payment-schedules/generate-auto
 * Genera E salva automaticamente piano pagamenti da preventivo firmato
 * Body: { quoteId, jobId, clienteId, presetType: 'acconto-saldo' | '2-rate' | '3-rate' }
 */
router.post('/generate-auto', async (req: Request, res: Response) => {
  try {
    const { quoteId, jobId, clienteId, presetType = 'acconto-saldo' } = req.body;

    // Validazione
    if (!quoteId || !jobId || !clienteId) {
      return res.status(400).json({
        error: 'Parametri mancanti',
        message: 'quoteId, jobId, clienteId richiesti'
      });
    }

    // Fetch quote
    const quoteDoc = await db.collection('quotes').doc(quoteId).get();
    if (!quoteDoc.exists) {
      return res.status(404).json({
        error: 'Preventivo non trovato',
        message: `Quote ${quoteId} non esiste`
      });
    }

    const quote = quoteDoc.data();
    if (!quote) {
      return res.status(500).json({ error: 'Dati quote non validi' });
    }

    // Calcola totale automaticamente
    const totale = quote.totalAfterDiscount || quote.totaleSelezionato || 0;
    if (totale <= 0) {
      return res.status(400).json({
        error: 'Totale preventivo non valido',
        message: 'Il preventivo deve avere un totale > 0'
      });
    }

    const today = new Date();
    const addDays = (date: Date, days: number) => {
      const result = new Date(date);
      result.setDate(result.getDate() + days);
      return result;
    };

    // Genera payments automaticamente basato su preset
    let paymentsData: Array<{tipo: string, importo: number, dataScadenza: Date, descrizione: string}> = [];
    
    switch (presetType) {
      case 'acconto-saldo':
        paymentsData = [
          { tipo: 'acconto', importo: totale * 0.3, dataScadenza: addDays(today, 7), descrizione: 'Acconto 30%' },
          { tipo: 'saldo', importo: totale * 0.7, dataScadenza: addDays(today, 30), descrizione: 'Saldo 70%' },
        ];
        break;
      case '2-rate':
        paymentsData = [
          { tipo: 'acconto', importo: totale / 2, dataScadenza: addDays(today, 7), descrizione: 'Prima rata (50%)' },
          { tipo: 'saldo', importo: totale / 2, dataScadenza: addDays(today, 30), descrizione: 'Seconda rata (50%)' },
        ];
        break;
      case '3-rate':
        paymentsData = [
          { tipo: 'acconto', importo: totale / 3, dataScadenza: addDays(today, 7), descrizione: 'Prima rata (1/3)' },
          { tipo: 'rata', importo: totale / 3, dataScadenza: addDays(today, 30), descrizione: 'Seconda rata (2/3)' },
          { tipo: 'saldo', importo: totale / 3, dataScadenza: addDays(today, 60), descrizione: 'Terza rata (3/3)' },
        ];
        break;
      default:
        return res.status(400).json({
          error: 'Preset non valido',
          message: 'presetType deve essere: acconto-saldo, 2-rate o 3-rate'
        });
    }

    // Crea ScheduledPayment[] con nanoid + fix rounding
    const scheduledPayments = paymentsData.map((p, idx) => ({
      id: nanoid(),
      tipo: p.tipo as 'acconto' | 'rata' | 'saldo',
      importo: Math.round(p.importo * 100) / 100, // Round to cents
      dataScadenza: Timestamp.fromDate(p.dataScadenza),
      stato: 'atteso' as const,
      note: p.descrizione,
    }));

    // Fix rounding: adjust last payment to match exact total
    const totaleRounded = scheduledPayments.reduce((sum, p) => sum + p.importo, 0);
    const differenza = Math.round((totale - totaleRounded) * 100) / 100;
    
    if (Math.abs(differenza) > 0) {
      // Add rounding difference to last payment
      scheduledPayments[scheduledPayments.length - 1].importo = 
        Math.round((scheduledPayments[scheduledPayments.length - 1].importo + differenza) * 100) / 100;
    }

    // Final total after rounding adjustment
    const totalePagamenti = scheduledPayments.reduce((sum, p) => sum + p.importo, 0);

    // Crea PaymentSchedule documento
    const scheduleId = nanoid();
    const now = Timestamp.now();

    const paymentSchedule = {
      id: scheduleId,
      jobId,
      quoteId,
      orderId: '',
      clienteId,
      payments: scheduledPayments,
      totale: totalePagamenti,
      totalePagato: 0,
      saldoResiduo: totalePagamenti,
      createdAt: now,
      updatedAt: now,
      createdBy: 'admin',
    };

    // Salva in Firestore
    await db.collection('paymentSchedules').doc(scheduleId).set(paymentSchedule);

    // Timeline event
    try {
      const timelineEventId = nanoid();
      await db.collection('jobTimeline').doc(timelineEventId).set({
        id: timelineEventId,
        jobId,
        evento: 'Piano pagamenti generato automaticamente',
        descrizione: `Creato ${presetType} con ${scheduledPayments.length} rate per un totale di €${totalePagamenti.toFixed(2)}`,
        categoria: 'pagamenti',
        timestamp: now,
        userId: 'admin',
      });
    } catch (timelineError) {
      console.error('❌ Errore creazione evento timeline:', timelineError);
    }

    return res.status(201).json({
      success: true,
      scheduleId,
      presetType,
      message: `Piano pagamenti ${presetType} generato automaticamente`,
      data: paymentSchedule,
    });
  } catch (error) {
    console.error('❌ Errore generazione automatica piano pagamenti:', error);
    return res.status(500).json({
      error: 'Errore server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
});

/**
 * POST /api/payment-schedules/generate
 * HYBRID: Genera piano pagamenti automaticamente (presetType) o manualmente (payments)
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { quoteId, jobId, clienteId, payments, totale, presetType } = req.body;

    // Validazione base
    if (!quoteId || !jobId || !clienteId) {
      return res.status(400).json({
        error: 'Parametri mancanti',
        message: 'quoteId, jobId, clienteId richiesti'
      });
    }

    // ==== MODE 1: AUTOMATIC (presetType provided) ====
    if (presetType) {
      // Fetch quote per calcolare totale automaticamente
      const quoteDoc = await db.collection('quotes').doc(quoteId).get();
      if (!quoteDoc.exists) {
        return res.status(404).json({
          error: 'Preventivo non trovato',
          message: `Quote ${quoteId} non esiste`
        });
      }

      const quote = quoteDoc.data();
      if (!quote) {
        return res.status(500).json({ error: 'Dati quote non validi' });
      }

      const totaleQuote = quote.totalAfterDiscount || quote.totaleSelezionato || 0;
      if (totaleQuote <= 0) {
        return res.status(400).json({
          error: 'Totale preventivo non valido',
          message: 'Il preventivo deve avere un totale > 0'
        });
      }

      const today = new Date();
      const addDaysHelper = (date: Date, days: number) => {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
      };

      // Genera payments automaticamente
      let paymentsData: Array<{tipo: string, importo: number, dataScadenza: Date, descrizione: string}> = [];
      
      switch (presetType) {
        case 'acconto-saldo':
          paymentsData = [
            { tipo: 'acconto', importo: totaleQuote * 0.3, dataScadenza: addDaysHelper(today, 7), descrizione: 'Acconto 30%' },
            { tipo: 'saldo', importo: totaleQuote * 0.7, dataScadenza: addDaysHelper(today, 30), descrizione: 'Saldo 70%' },
          ];
          break;
        case '2-rate':
          paymentsData = [
            { tipo: 'acconto', importo: totaleQuote / 2, dataScadenza: addDaysHelper(today, 7), descrizione: 'Prima rata (50%)' },
            { tipo: 'saldo', importo: totaleQuote / 2, dataScadenza: addDaysHelper(today, 30), descrizione: 'Seconda rata (50%)' },
          ];
          break;
        case '3-rate':
          paymentsData = [
            { tipo: 'acconto', importo: totaleQuote / 3, dataScadenza: addDaysHelper(today, 7), descrizione: 'Prima rata (1/3)' },
            { tipo: 'rata', importo: totaleQuote / 3, dataScadenza: addDaysHelper(today, 30), descrizione: 'Seconda rata (2/3)' },
            { tipo: 'saldo', importo: totaleQuote / 3, dataScadenza: addDaysHelper(today, 60), descrizione: 'Terza rata (3/3)' },
          ];
          break;
        default:
          return res.status(400).json({
            error: 'Preset non valido',
            message: 'presetType deve essere: acconto-saldo, 2-rate o 3-rate'
          });
      }

      // Crea ScheduledPayment[] con rounding fix
      const scheduledPayments = paymentsData.map((p) => ({
        id: nanoid(),
        tipo: p.tipo as 'acconto' | 'rata' | 'saldo',
        importo: Math.round(p.importo * 100) / 100,
        dataScadenza: Timestamp.fromDate(p.dataScadenza),
        stato: 'atteso' as const,
        note: p.descrizione,
      }));

      // Fix rounding: adjust last payment
      const totaleRounded = scheduledPayments.reduce((sum, p) => sum + p.importo, 0);
      const differenza = Math.round((totaleQuote - totaleRounded) * 100) / 100;
      
      if (Math.abs(differenza) > 0) {
        scheduledPayments[scheduledPayments.length - 1].importo = 
          Math.round((scheduledPayments[scheduledPayments.length - 1].importo + differenza) * 100) / 100;
      }

      const totalePagamenti = scheduledPayments.reduce((sum, p) => sum + p.importo, 0);

      // Salva schedule
      const scheduleId = nanoid();
      const now = Timestamp.now();

      const paymentSchedule = {
        id: scheduleId,
        jobId,
        quoteId,
        orderId: '',
        clienteId,
        payments: scheduledPayments,
        totale: totalePagamenti,
        totalePagato: 0,
        saldoResiduo: totalePagamenti,
        createdAt: now,
        updatedAt: now,
        createdBy: 'admin',
      };

      await db.collection('paymentSchedules').doc(scheduleId).set(paymentSchedule);

      // Link schedule ID to quote atomically
      try {
        const quoteRef = db.collection('quotes').doc(quoteId);
        await quoteRef.update({
          paymentScheduleIds: admin.firestore.FieldValue.arrayUnion(scheduleId)
        });
      } catch (linkError) {
        console.error('❌ Errore linking schedule to quote:', linkError);
        // Non bloccare se fallisce (backward compatibility)
      }

      // Timeline
      try {
        const timelineEventId = nanoid();
        await db.collection('jobTimeline').doc(timelineEventId).set({
          id: timelineEventId,
          jobId,
          evento: 'Piano pagamenti generato automaticamente',
          descrizione: `Creato ${presetType} con ${scheduledPayments.length} rate per un totale di €${totalePagamenti.toFixed(2)}`,
          categoria: 'pagamenti',
          timestamp: now,
          userId: 'admin',
        });
      } catch (timelineError) {
        console.error('❌ Errore timeline:', timelineError);
      }

      return res.status(201).json({
        success: true,
        scheduleId,
        presetType,
        message: `Piano pagamenti ${presetType} generato automaticamente`,
        data: paymentSchedule,
      });
    }

    // ==== MODE 2: MANUAL (payments provided) ====
    if (!payments || !Array.isArray(payments)) {
      return res.status(400).json({
        error: 'Parametri mancanti',
        message: 'payments richiesto per modalità manuale'
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

    // Link schedule ID to quote atomically
    try {
      const quoteRef = db.collection('quotes').doc(quoteId);
      await quoteRef.update({
        paymentScheduleIds: admin.firestore.FieldValue.arrayUnion(scheduleId)
      });
    } catch (linkError) {
      console.error('❌ Errore linking schedule to quote:', linkError);
      // Non bloccare se fallisce (backward compatibility)
    }

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
