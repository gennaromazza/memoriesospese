/**
 * PAYMENT SCHEDULE ROUTES
 * API endpoints per gestione scadenzari pagamenti
 */

import { Router, Request, Response } from 'express';
import { db } from './firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { nanoid } from 'nanoid';
import { DateTime } from 'luxon';
import { authenticateFirebase } from './email-routes.js';
import { nowRomeDate, daysFromNowRome, toRomeDateTime } from './utils/timezone.js';

const ADMIN_EMAILS = ["gennaro.mazzacane@gmail.com"];

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

    const today = nowRomeDate();
    const addDays = (date: Date, days: number) => {
      return toRomeDateTime(date).plus({ days }).toJSDate();
    };

    const presets = {
      '4-rate-evento': {
        nome: 'Piano 4 Rate',
        descrizione: 'Acconto alla firma, 50% pre-evento, 25% post, saldo',
        requiresEventDate: true,
        requiresAccontoInput: true,
        payments: [],
      },
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
 * Body: { quoteId, jobId, clienteId, presetType: 'acconto-saldo' | '2-rate' | '3-rate' | '4-rate-evento', accontoIniziale?: number, eventDate?: string }
 */
router.post('/generate-auto', authenticateFirebase, async (req: any, res: Response) => {
  try {
    const { quoteId, jobId, clienteId, presetType = 'acconto-saldo', accontoIniziale, eventDate: eventDateStr, rata2Perc: r2p, rata3Perc: r3p, rata2Days: r2d, rata3Days: r3d, saldoDays: sd } = req.body;

    // Validazione
    if (!quoteId || !jobId || !clienteId) {
      return res.status(400).json({
        error: 'Parametri mancanti',
        message: 'quoteId, jobId, clienteId richiesti'
      });
    }

    // 🔐 IDEMPOTENCY CHECK: Verifica se esiste già uno schedule per questo quoteId
    const existingScheduleSnap = await db.collection('paymentSchedules')
      .where('quoteId', '==', quoteId)
      .limit(1)
      .get();
    
    if (!existingScheduleSnap.empty) {
      const existingSchedule = { id: existingScheduleSnap.docs[0].id, ...existingScheduleSnap.docs[0].data() };
      console.log(`⏭️ PaymentSchedule già esistente per quote ${quoteId}, skip creazione duplicato`);
      return res.status(200).json({
        success: true,
        scheduleId: existingSchedule.id,
        message: 'Piano pagamenti già esistente (idempotency)',
        data: existingSchedule,
        skipped: true,
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

    const today = nowRomeDate();
    const addDays = (date: Date, days: number) => {
      return toRomeDateTime(date).plus({ days }).toJSDate();
    };

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
      case '4-rate-evento': {
        if (!eventDateStr) {
          return res.status(400).json({
            error: 'Data evento obbligatoria',
            message: 'Per il preset 4 rate è necessaria la data dell\'evento'
          });
        }
        const acconto = Math.round(accontoIniziale || 0);
        const p2Perc = r2p || 50;
        const p3Perc = r3p || 25;
        const d2Days = r2d ?? -10;
        const d3Days = r3d ?? 90;
        const dSaldoDays = sd ?? 130;

        if (acconto < 0 || acconto >= totale) {
          return res.status(400).json({
            error: 'Acconto non valido',
            message: 'L\'acconto deve essere positivo e inferiore al totale'
          });
        }
        const eventDateParsed = toRomeDateTime(eventDateStr).toJSDate();
        const targetRata2 = Math.round(totale * p2Perc / 100) - acconto;
        const rata2val = Math.max(0, targetRata2);
        const rata3val = Math.round(totale * p3Perc / 100);
        const saldo = totale - acconto - rata2val - rata3val;

        const dataSecondaRata = addDays(eventDateParsed, d2Days);
        const dataTerzaRata = addDays(eventDateParsed, d3Days);
        const dataSaldo = addDays(eventDateParsed, dSaldoDays);
        const saldoPerc = 100 - p2Perc - p3Perc;
        paymentsData = [
          { tipo: 'acconto', importo: acconto, dataScadenza: today, descrizione: 'Acconto alla firma' },
          { tipo: 'rata', importo: rata2val, dataScadenza: dataSecondaRata < today ? today : dataSecondaRata, descrizione: `2ª rata (${p2Perc}% - acconto) pre-evento` },
          { tipo: 'rata', importo: rata3val, dataScadenza: dataTerzaRata, descrizione: `3ª rata (${p3Perc}%) post-evento` },
          { tipo: 'saldo', importo: saldo, dataScadenza: dataSaldo, descrizione: `Saldo (${saldoPerc}%)` },
        ];
        break;
      }
      default:
        return res.status(400).json({
          error: 'Preset non valido',
          message: 'presetType deve essere: acconto-saldo, 2-rate, 3-rate o 4-rate-evento'
        });
    }

    // Crea ScheduledPayment[] con nanoid + round to whole euros
    const scheduledPayments = paymentsData.map((p) => ({
      id: nanoid(),
      tipo: p.tipo as 'acconto' | 'rata' | 'saldo',
      importo: Math.round(p.importo),
      dataScadenza: Timestamp.fromDate(p.dataScadenza),
      stato: 'atteso' as const,
      note: p.descrizione,
    }));

    // Fix rounding: adjust last payment to match exact total
    const totaleRounded = scheduledPayments.reduce((sum, p) => sum + p.importo, 0);
    const differenza = Math.round(totale - totaleRounded);
    
    if (Math.abs(differenza) > 0) {
      // Add rounding difference to last payment
      scheduledPayments[scheduledPayments.length - 1].importo = 
        Math.round((scheduledPayments[scheduledPayments.length - 1].importo + differenza) * 100) / 100;
    }

    // Final total after rounding adjustment
    const totalePagamenti = scheduledPayments.reduce((sum, p) => sum + p.importo, 0);

    // Crea PaymentSchedule documento
    // 🔐 Usa ID deterministico basato su quoteId per garantire atomicità 
    // Se esiste già un documento con questo ID, .set() sovrascriverà (safe perché stesso quote)
    const scheduleId = `ps-${quoteId}`;
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

    // Salva in Firestore con create() per fallire se già esiste (race condition protection)
    try {
      await db.collection('paymentSchedules').doc(scheduleId).create(paymentSchedule);
    } catch (createError: any) {
      // Se il documento esiste già (race condition), ritorna l'esistente
      if (createError.code === 6 || createError.message?.includes('ALREADY_EXISTS')) {
        console.log(`⏭️ PaymentSchedule ${scheduleId} già creato (race condition detected), recupero esistente`);
        const existingDoc = await db.collection('paymentSchedules').doc(scheduleId).get();
        return res.status(200).json({
          success: true,
          scheduleId,
          message: 'Piano pagamenti già esistente (race condition)',
          data: { id: existingDoc.id, ...existingDoc.data() },
          skipped: true,
        });
      }
      throw createError;
    }

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
router.post('/generate', authenticateFirebase, async (req: any, res: Response) => {
  try {
    const { quoteId, jobId, clienteId, payments, totale, presetType, dataRiferimento, accontoIniziale, eventDate: eventDateBody, rata2Perc, rata3Perc, rata2Days, rata3Days, saldoDays } = req.body;

    // Validazione base
    if (!quoteId || !jobId || !clienteId) {
      return res.status(400).json({
        error: 'Parametri mancanti',
        message: 'quoteId, jobId, clienteId richiesti'
      });
    }

    // 🔐 IDEMPOTENCY CHECK: Verifica se esiste già uno schedule per questo quoteId
    const existingScheduleSnap = await db.collection('paymentSchedules')
      .where('quoteId', '==', quoteId)
      .limit(1)
      .get();
    
    if (!existingScheduleSnap.empty) {
      const existingSchedule = { id: existingScheduleSnap.docs[0].id, ...existingScheduleSnap.docs[0].data() };
      console.log(`⏭️ PaymentSchedule già esistente per quote ${quoteId}, skip creazione duplicato (generate endpoint)`);
      return res.status(200).json({
        success: true,
        scheduleId: existingSchedule.id,
        message: 'Piano pagamenti già esistente (idempotency)',
        data: existingSchedule,
        skipped: true,
      });
    }

    const baseDate = dataRiferimento ? toRomeDateTime(dataRiferimento).toJSDate() : nowRomeDate();

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

      const today = baseDate;
      // FIX: Usa Luxon per addDaysHelper DST-safe (usa import top-level)
      const addDaysHelper = (date: Date, days: number) => {
        const dt = DateTime.fromJSDate(date, { zone: 'Europe/Rome' });
        return dt.plus({ days }).toJSDate();
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
        case '4-rate-evento': {
          const evDateStr = eventDateBody;
          if (!evDateStr) {
            return res.status(400).json({
              error: 'Data evento obbligatoria',
              message: 'Per il preset 4 rate è necessaria la data dell\'evento'
            });
          }
          const acconto = Math.round(accontoIniziale || 0);
          const p2Perc = rata2Perc || 50;
          const p3Perc = rata3Perc || 25;
          const d2Days = rata2Days ?? -10;
          const d3Days = rata3Days ?? 90;
          const dSaldoDays = saldoDays ?? 130;

          if (acconto < 0 || acconto >= totaleQuote) {
            return res.status(400).json({
              error: 'Acconto non valido',
              message: 'L\'acconto deve essere positivo e inferiore al totale'
            });
          }
          const evDate = toRomeDateTime(evDateStr).toJSDate();
          const targetRata2 = Math.round(totaleQuote * p2Perc / 100) - acconto;
          const rata2val = Math.max(0, targetRata2);
          const rata3val = Math.round(totaleQuote * p3Perc / 100);
          const saldoFinale = totaleQuote - acconto - rata2val - rata3val;

          const dataRata2 = addDaysHelper(evDate, d2Days);
          const dataRata3 = addDaysHelper(evDate, d3Days);
          const dataSaldoF = addDaysHelper(evDate, dSaldoDays);
          const saldoPerc = 100 - p2Perc - p3Perc;
          paymentsData = [
            { tipo: 'acconto', importo: acconto, dataScadenza: today, descrizione: 'Acconto alla firma' },
            { tipo: 'rata', importo: rata2val, dataScadenza: dataRata2 < today ? today : dataRata2, descrizione: `2ª rata (${p2Perc}% - acconto) pre-evento` },
            { tipo: 'rata', importo: rata3val, dataScadenza: dataRata3, descrizione: `3ª rata (${p3Perc}%) post-evento` },
            { tipo: 'saldo', importo: saldoFinale, dataScadenza: dataSaldoF, descrizione: `Saldo (${saldoPerc}%)` },
          ];
          break;
        }
        default:
          return res.status(400).json({
            error: 'Preset non valido',
            message: 'presetType deve essere: acconto-saldo, 2-rate, 3-rate o 4-rate-evento'
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
      // 🔐 Usa ID deterministico basato su quoteId per garantire atomicità
      const scheduleId = `ps-${quoteId}`;
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

      // Salva con create() per fallire se già esiste (race condition protection)
      try {
        await db.collection('paymentSchedules').doc(scheduleId).create(paymentSchedule);
      } catch (createError: any) {
        if (createError.code === 6 || createError.message?.includes('ALREADY_EXISTS')) {
          console.log(`⏭️ PaymentSchedule ${scheduleId} già creato (race condition), recupero esistente`);
          const existingDoc = await db.collection('paymentSchedules').doc(scheduleId).get();
          return res.status(200).json({
            success: true,
            scheduleId,
            message: 'Piano pagamenti già esistente (race condition)',
            data: { id: existingDoc.id, ...existingDoc.data() },
            skipped: true,
          });
        }
        throw createError;
      }

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
    // 🔐 Usa ID deterministico basato su quoteId per garantire atomicità
    const scheduleId = `ps-${quoteId}`;
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

    // Salva con create() per fallire se già esiste (race condition protection)
    try {
      await db.collection('paymentSchedules').doc(scheduleId).create(paymentSchedule);
    } catch (createError: any) {
      if (createError.code === 6 || createError.message?.includes('ALREADY_EXISTS')) {
        console.log(`⏭️ PaymentSchedule ${scheduleId} già creato (race condition), recupero esistente`);
        const existingDoc = await db.collection('paymentSchedules').doc(scheduleId).get();
        return res.status(200).json({
          success: true,
          scheduleId,
          message: 'Piano pagamenti già esistente (race condition)',
          data: { id: existingDoc.id, ...existingDoc.data() },
          skipped: true,
        });
      }
      throw createError;
    }

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
router.post('/:scheduleId/payments/:paymentId/register', authenticateFirebase, async (req: any, res: Response) => {
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

    // Fetch job per descrizione CashMovement (prima di tutto)
    let jobDescription = '';
    let clienteNome = '';
    try {
      const jobDoc = await db.collection('jobs').doc(schedule.jobId).get();
      if (jobDoc.exists) {
        const jobData = jobDoc.data();
        jobDescription = jobData?.nome || jobData?.tipo || 'Servizio';
        clienteNome = jobData?.cliente?.nome 
          ? `${jobData.cliente.nome} ${jobData.cliente.cognome || ''}`.trim()
          : '';
      }
    } catch (jobError) {
      console.error('⚠️ Errore fetch job per descrizione:', jobError);
    }

    // Crea CashMovement prima dell'update principale
    let cashMovementId: string | null = null;
    try {
      const paymentDate = dataPagamento ? toRomeDateTime(dataPagamento).toJSDate() : nowRomeDate();
      const paymentTipo = schedule.payments[paymentIndex]?.tipo || 'rata';
      const tipoLabel = paymentTipo === 'acconto' ? 'Acconto' : paymentTipo === 'saldo' ? 'Saldo' : 'Rata';
      
      const cashMovementData = {
        tipo: 'entrata' as const,
        categoria: 'Servizio fotografico',
        importo: Number(importoPagato),
        descrizione: clienteNome 
          ? `${tipoLabel} - ${jobDescription} (${clienteNome})`
          : `${tipoLabel} - ${jobDescription}`,
        data: Timestamp.fromDate(paymentDate),
        metodoPagamento: metodoPagamento || 'contante',
        note: note || `Job ID: ${schedule.jobId}, Schedule ID: ${scheduleId}`,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        sourceType: 'payment-schedule',
        sourceId: scheduleId,
        paymentId: paymentId,
        jobId: schedule.jobId,
      };
      
      const cashMovementRef = await db.collection('cashMovements').add(cashMovementData);
      cashMovementId = cashMovementRef.id;
      console.log(`✅ CashMovement creato: ${cashMovementId}`);
    } catch (cashError) {
      console.error('❌ Errore creazione CashMovement:', cashError);
    }

    // Update pagamento con tutti i dati in un singolo update atomico
    const updatedPayments = [...schedule.payments];
    const payment = updatedPayments[paymentIndex];

    // FIX: Somma cumulativa - non sovrascrivere importoPagato
    const importoGiaVersato = Number(payment.importoPagato) || 0;
    const nuovoImportoPagato = importoGiaVersato + Number(importoPagato);
    payment.importoPagato = Math.round(nuovoImportoPagato * 100) / 100;
    
    payment.dataPagamento = Timestamp.fromDate(dataPagamento ? toRomeDateTime(dataPagamento).toJSDate() : nowRomeDate());
    payment.metodoPagamento = metodoPagamento || 'contante';
    
    // FIX: Stato pagamento coerente
    if (payment.importoPagato >= Number(payment.importo)) {
      payment.stato = 'pagato';
    } else if (payment.importoPagato > 0) {
      payment.stato = 'parziale';
    } else {
      payment.stato = 'atteso';
    }
    
    if (note) payment.note = note;
    if (cashMovementId) payment.cashMovementId = cashMovementId;

    // Ricalcola totali con numeri espliciti
    const nuovoTotalePagato = updatedPayments.reduce((sum: number, p: any) => sum + (Number(p.importoPagato) || 0), 0);
    const totaleSchedule = Number(schedule.totale) || 0;
    const nuovoSaldoResiduo = Math.max(0, totaleSchedule - nuovoTotalePagato);

    // Update Firestore atomico
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
        cashMovementId,
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

/**
 * POST /api/payment-schedules/:scheduleId/remodulate
 * Rimodula le rate rimanenti dopo un pagamento con importo diverso
 * Body: { 
 *   paymentId: string,           // ID del pagamento appena registrato
 *   strategy: 'equal' | 'last'   // 'equal' = distribuisci equamente, 'last' = modifica solo ultima rata
 * }
 */
router.post('/:scheduleId/remodulate', authenticateFirebase, async (req: any, res: Response) => {
  try {
    const { scheduleId } = req.params;
    const { paymentId, strategy = 'last' } = req.body;

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

    // Calcola totale pagato con numeri espliciti
    const totalePagato = schedule.payments.reduce((sum: number, p: any) => sum + (Number(p.importoPagato) || 0), 0);
    
    // Calcola residuo
    const totaleOriginale = Number(schedule.totale) || 0;
    const residuo = Math.max(0, totaleOriginale - totalePagato);
    
    if (residuo <= 0) {
      // Aggiorna comunque i totali per consistenza
      await db.collection('paymentSchedules').doc(scheduleId).update({
        totalePagato: totalePagato,
        saldoResiduo: 0,
        updatedAt: Timestamp.now(),
      });
      
      return res.json({
        success: true,
        message: 'Nessuna rimodulazione necessaria - saldo completato',
        data: { scheduleId, totalePagato, residuo: 0 }
      });
    }

    // Trova pagamenti non completamente pagati (inclusi parziali)
    const pagamentiNonPagati = schedule.payments.filter((p: any) => 
      p.stato === 'atteso' || p.stato === 'scaduto' || p.stato === 'parziale'
    );

    if (pagamentiNonPagati.length === 0) {
      // Nessun pagamento da rimodulare, crea nuovo pagamento per il residuo
      const newPayment = {
        id: nanoid(),
        tipo: 'saldo' as const,
        importo: Math.round(residuo * 100) / 100,
        dataScadenza: Timestamp.fromDate(DateTime.now().plus({ days: 30 }).toJSDate()),
        stato: 'atteso' as const,
        note: 'Saldo residuo (rimodulazione automatica)',
      };
      
      const updatedPayments = [...schedule.payments, newPayment];
      
      // NON modifichiamo totale - manteniamo il valore contrattuale originale
      await db.collection('paymentSchedules').doc(scheduleId).update({
        payments: updatedPayments,
        // totale: NON MODIFICHIAMO
        totalePagato: totalePagato,
        saldoResiduo: residuo,
        updatedAt: Timestamp.now(),
      });
      
      return res.json({
        success: true,
        message: 'Creato nuovo pagamento per saldo residuo',
        data: { scheduleId, newPayment, totale: totaleOriginale, totalePagato, saldoResiduo: residuo }
      });
    }

    // Rimodula i pagamenti non completamente pagati
    const updatedPayments = schedule.payments.map((p: any) => {
      if (p.stato === 'pagato') {
        return p; // Mantieni pagamenti già completati
      }
      return { ...p }; // Clone per modifica (atteso, scaduto, parziale)
    });

    if (strategy === 'equal') {
      // FIX: Distribuisci equamente il RESIDUO da incassare tra tutte le rate non completamente pagate
      // Per rate parziali: nuovo importo = importoPagato + quotaResiduo
      const numRateNonPagate = pagamentiNonPagati.length;
      const quotaResiduoPerRata = Math.floor((residuo / numRateNonPagate) * 100) / 100;
      let distribuito = 0;
      let rateProcessate = 0;
      
      for (let i = 0; i < updatedPayments.length; i++) {
        const p = updatedPayments[i];
        if (p.stato !== 'pagato') {
          rateProcessate++;
          const importoGiaVersato = Number(p.importoPagato) || 0;
          
          if (rateProcessate === numRateNonPagate) {
            // Ultima rata: assegna tutto il residuo rimanente
            const quotaResiduoFinale = Math.round((residuo - distribuito) * 100) / 100;
            p.importo = Math.round((importoGiaVersato + quotaResiduoFinale) * 100) / 100;
            distribuito += quotaResiduoFinale;
          } else {
            p.importo = Math.round((importoGiaVersato + quotaResiduoPerRata) * 100) / 100;
            distribuito += quotaResiduoPerRata;
          }
          p.note = `${p.note || ''} (rimodulato)`.trim();
        }
      }
    } else {
      // 'last' strategy: modifica solo l'ultima rata non pagata
      // FIX: Sostituito findLastIndex con loop backward (compatibile Node 16+)
      let lastNonPaidIndex = -1;
      for (let i = updatedPayments.length - 1; i >= 0; i--) {
        if (updatedPayments[i].stato !== 'pagato') {
          lastNonPaidIndex = i;
          break;
        }
      }
      
      if (lastNonPaidIndex !== -1) {
        // FIX: Calcola la somma dei RESIDUI (importo - importoPagato) delle altre rate
        let altriResidui = 0;
        for (let i = 0; i < updatedPayments.length; i++) {
          if (i !== lastNonPaidIndex && updatedPayments[i].stato !== 'pagato') {
            const importoRata = Number(updatedPayments[i].importo) || 0;
            const pagatoRata = Number(updatedPayments[i].importoPagato) || 0;
            altriResidui += Math.max(0, importoRata - pagatoRata);
          }
        }
        
        // Residuo da assegnare all'ultima rata
        const residuoUltimaRata = Math.round((residuo - altriResidui) * 100) / 100;
        const importoGiaVersatoUltima = Number(updatedPayments[lastNonPaidIndex].importoPagato) || 0;
        const nuovoImportoUltimaRata = Math.round((importoGiaVersatoUltima + residuoUltimaRata) * 100) / 100;
        
        if (residuoUltimaRata > 0) {
          // Caso normale: ultima rata positiva
          updatedPayments[lastNonPaidIndex].importo = nuovoImportoUltimaRata;
          updatedPayments[lastNonPaidIndex].note = `${updatedPayments[lastNonPaidIndex].note || ''} (rimodulato)`.trim();
        } else {
          // Caso edge: residuo < somma altri residui
          // Fallback a strategia equal per mantenere invarianti
          const numRateNonPagate = pagamentiNonPagati.length;
          const quotaResiduoPerRata = Math.floor((residuo / numRateNonPagate) * 100) / 100;
          let distribuito = 0;
          let rateProcessate = 0;
          
          for (let i = 0; i < updatedPayments.length; i++) {
            const p = updatedPayments[i];
            if (p.stato !== 'pagato') {
              rateProcessate++;
              const importoGiaVersato = Number(p.importoPagato) || 0;
              
              if (rateProcessate === numRateNonPagate) {
                // Ultima rata: assegna tutto il residuo rimanente
                const quotaResiduoFinale = Math.max(0, Math.round((residuo - distribuito) * 100) / 100);
                p.importo = Math.round((importoGiaVersato + quotaResiduoFinale) * 100) / 100;
                distribuito += quotaResiduoFinale;
              } else {
                p.importo = Math.round((importoGiaVersato + quotaResiduoPerRata) * 100) / 100;
                distribuito += quotaResiduoPerRata;
              }
              p.note = `${p.note || ''} (rimodulato - fallback equal)`.trim();
            }
          }
        }
      }
    }

    // Ricalcola i totali dopo la rimodulazione
    // IMPORTANTE: Il totale originale (totaleOriginale) NON deve cambiare
    // Solo le rate non pagate vengono ridistribuite per coprire il residuo
    const nuovoTotalePagato = updatedPayments.reduce((sum: number, p: any) => sum + (Number(p.importoPagato) || 0), 0);
    
    // Il saldo residuo è sempre: totale originale - pagato
    // Non ricalcoliamo totale perché rappresenta il contratto originale
    const nuovoSaldoResiduo = Math.max(0, totaleOriginale - nuovoTotalePagato);

    // Aggiorna Firestore mantenendo il totale originale
    await db.collection('paymentSchedules').doc(scheduleId).update({
      payments: updatedPayments,
      // totale: NON MODIFICHIAMO - rappresenta il valore contrattuale originale
      totalePagato: nuovoTotalePagato,
      saldoResiduo: nuovoSaldoResiduo,
      updatedAt: Timestamp.now(),
    });

    // Timeline event
    try {
      const timelineEventId = nanoid();
      await db.collection('jobTimeline').doc(timelineEventId).set({
        id: timelineEventId,
        jobId: schedule.jobId,
        evento: 'Piano pagamenti rimodulato',
        descrizione: `Rate rimodulate con strategia "${strategy}". Nuovo saldo residuo: €${nuovoSaldoResiduo.toFixed(2)}`,
        categoria: 'pagamenti',
        timestamp: Timestamp.now(),
        userId: 'admin',
      });
    } catch (timelineError) {
      console.error('❌ Errore creazione evento timeline:', timelineError);
    }

    return res.json({
      success: true,
      message: `Rate rimodulate con strategia "${strategy}"`,
      data: {
        scheduleId,
        strategy,
        totale: totaleOriginale,
        totalePagato: nuovoTotalePagato,
        saldoResiduo: nuovoSaldoResiduo,
        payments: updatedPayments.filter((p: any) => p.stato !== 'pagato'),
      }
    });
  } catch (error) {
    console.error('❌ Errore rimodulazione rate:', error);
    return res.status(500).json({
      error: 'Errore server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
});

/**
 * POST /api/payment-schedules/:scheduleId/payments
 * Aggiungi nuova rata a schedule esistente
 */
router.post('/:scheduleId/payments', authenticateFirebase, async (req: any, res: Response) => {
  try {
    const { scheduleId } = req.params;
    const { tipo, importo, dataScadenza, descrizione } = req.body;

    // Validazione
    if (!tipo || !importo || !dataScadenza) {
      return res.status(400).json({
        error: 'Dati incompleti',
        message: 'Tipo, importo e data scadenza sono obbligatori'
      });
    }

    if (importo <= 0) {
      return res.status(400).json({
        error: 'Importo non valido',
        message: 'Importo deve essere > 0'
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

    // Crea nuovo pagamento
    const newPayment = {
      id: nanoid(),
      tipo: tipo as 'acconto' | 'rata' | 'saldo',
      importo: Number(importo),
      dataScadenza: Timestamp.fromDate(new Date(dataScadenza)),
      stato: 'atteso' as const,
      note: descrizione || `${tipo} aggiunto manualmente`
    };

    // Aggiungi pagamento
    const updatedPayments = [...schedule.payments, newPayment];

    // FIX: NON ricalcolare totale - è immutabile (valore contratto)
    // Solo saldoResiduo viene ricalcolato
    const totaleOriginale = Number(schedule.totale) || 0;
    const totalePagato = schedule.totalePagato || 0;
    const nuovoSaldoResiduo = Math.max(0, totaleOriginale - totalePagato);

    // Update Firestore - totale NON viene modificato
    await db.collection('paymentSchedules').doc(scheduleId).update({
      payments: updatedPayments,
      saldoResiduo: nuovoSaldoResiduo,
      updatedAt: Timestamp.now(),
    });

    // Timeline event
    try {
      const timelineEventId = nanoid();
      await db.collection('jobTimeline').doc(timelineEventId).set({
        id: timelineEventId,
        jobId: schedule.jobId,
        evento: 'Rata aggiunta',
        descrizione: `Aggiunta nuova rata: ${tipo} di €${importo.toFixed(2)}`,
        categoria: 'pagamenti',
        timestamp: Timestamp.now(),
        userId: 'admin',
      });
    } catch (timelineError) {
      console.error('❌ Errore creazione evento timeline:', timelineError);
    }

    return res.json({
      success: true,
      message: 'Rata aggiunta con successo',
      data: {
        scheduleId,
        payment: newPayment,
        totale: totaleOriginale,
        saldoResiduo: nuovoSaldoResiduo,
      }
    });
  } catch (error) {
    console.error('❌ Errore aggiunta rata:', error);
    return res.status(500).json({
      error: 'Errore server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
});

/**
 * PATCH /api/payment-schedules/:scheduleId/payments/:paymentId
 * Modifica rata esistente (solo se non ancora pagata)
 */
router.patch('/:scheduleId/payments/:paymentId', authenticateFirebase, async (req: any, res: Response) => {
  try {
    const { scheduleId, paymentId } = req.params;
    const { tipo, importo, dataScadenza, descrizione } = req.body;

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

    const payment = schedule.payments[paymentIndex];

    // Blocca modifica se già pagato
    if (payment.stato === 'pagato') {
      return res.status(400).json({
        error: 'Modifica non consentita',
        message: 'Impossibile modificare un pagamento già registrato come pagato'
      });
    }

    // Update pagamento
    const updatedPayments = [...schedule.payments];
    updatedPayments[paymentIndex] = {
      ...payment,
      ...(tipo && { tipo }),
      ...(importo && { importo: Number(importo) }),
      ...(dataScadenza && { dataScadenza: Timestamp.fromDate(new Date(dataScadenza)) }),
      ...(descrizione && { note: descrizione })
    };

    // FIX: NON ricalcolare totale - è immutabile (valore contratto)
    const totaleOriginale = Number(schedule.totale) || 0;
    const totalePagato = schedule.totalePagato || 0;
    const nuovoSaldoResiduo = Math.max(0, totaleOriginale - totalePagato);

    // Update Firestore - totale NON viene modificato
    await db.collection('paymentSchedules').doc(scheduleId).update({
      payments: updatedPayments,
      saldoResiduo: nuovoSaldoResiduo,
      updatedAt: Timestamp.now(),
    });

    // Timeline event
    try {
      const timelineEventId = nanoid();
      await db.collection('jobTimeline').doc(timelineEventId).set({
        id: timelineEventId,
        jobId: schedule.jobId,
        evento: 'Rata modificata',
        descrizione: `Modificata rata ${payment.tipo}: nuovo importo €${importo?.toFixed(2) || payment.importo.toFixed(2)}`,
        categoria: 'pagamenti',
        timestamp: Timestamp.now(),
        userId: 'admin',
      });
    } catch (timelineError) {
      console.error('❌ Errore creazione evento timeline:', timelineError);
    }

    return res.json({
      success: true,
      message: 'Rata modificata con successo',
      data: {
        scheduleId,
        payment: updatedPayments[paymentIndex],
        totale: totaleOriginale,
        saldoResiduo: nuovoSaldoResiduo,
      }
    });
  } catch (error) {
    console.error('❌ Errore modifica rata:', error);
    return res.status(500).json({
      error: 'Errore server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
});

/**
 * DELETE /api/payment-schedules/:scheduleId/payments/:paymentId
 * Elimina rata (solo se non ancora pagata)
 */
router.delete('/:scheduleId/payments/:paymentId', authenticateFirebase, async (req: any, res: Response) => {
  try {
    const { scheduleId, paymentId } = req.params;

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
    const payment = schedule.payments.find((p: any) => p.id === paymentId);
    if (!payment) {
      return res.status(404).json({
        error: 'Pagamento non trovato',
        message: `Pagamento ${paymentId} non esiste nello schedule`
      });
    }

    // Blocca eliminazione se già pagato (anche parzialmente)
    if (payment.stato === 'pagato' || payment.stato === 'parziale' || (payment.importoPagato && payment.importoPagato > 0)) {
      return res.status(400).json({
        error: 'Eliminazione non consentita',
        message: 'Impossibile eliminare un pagamento già registrato o parzialmente pagato'
      });
    }

    // Rimuovi pagamento
    const updatedPayments = schedule.payments.filter((p: any) => p.id !== paymentId);

    // FIX: NON ricalcolare totale - è immutabile (valore contratto)
    const totaleOriginale = Number(schedule.totale) || 0;
    const totalePagato = schedule.totalePagato || 0;
    const nuovoSaldoResiduo = Math.max(0, totaleOriginale - totalePagato);

    // Update Firestore - totale NON viene modificato
    await db.collection('paymentSchedules').doc(scheduleId).update({
      payments: updatedPayments,
      saldoResiduo: nuovoSaldoResiduo,
      updatedAt: Timestamp.now(),
    });

    // Timeline event
    try {
      const timelineEventId = nanoid();
      await db.collection('jobTimeline').doc(timelineEventId).set({
        id: timelineEventId,
        jobId: schedule.jobId,
        evento: 'Rata eliminata',
        descrizione: `Eliminata rata ${payment.tipo} di €${payment.importo.toFixed(2)}`,
        categoria: 'pagamenti',
        timestamp: Timestamp.now(),
        userId: 'admin',
      });
    } catch (timelineError) {
      console.error('❌ Errore creazione evento timeline:', timelineError);
    }

    return res.json({
      success: true,
      message: 'Rata eliminata con successo',
      data: {
        scheduleId,
        totale: totaleOriginale,
        saldoResiduo: nuovoSaldoResiduo,
      }
    });
  } catch (error) {
    console.error('❌ Errore eliminazione rata:', error);
    return res.status(500).json({
      error: 'Errore server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
});

/**
 * POST /api/payment-schedules/send-reminders
 * Invia reminder email per pagamenti in scadenza (da schedulare con cron)
 * Filtra pagamenti attesi con scadenza entro 7 giorni che non hanno reminder già inviato
 */
router.post('/send-reminders', authenticateFirebase, async (req: any, res: Response) => {
  try {
    // FIX: Usa Luxon per calcolo DST-safe (usa import top-level)
    const nowRome = DateTime.now().setZone('Europe/Rome');
    const now = nowRome.toJSDate();
    const in7Days = nowRome.plus({ days: 7 }).toJSDate();
    
    console.log(`[Payment Reminder] Cerco pagamenti in scadenza tra ${now.toISOString()} e ${in7Days.toISOString()}`);
    
    // Recupera tutti i payment schedules
    const schedulesSnap = await db.collection('paymentSchedules').get();
    
    const results = {
      total: 0,
      sent: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    // Per ogni schedule, controlla i pagamenti
    for (const scheduleDoc of schedulesSnap.docs) {
      const schedule = scheduleDoc.data();
      const scheduleId = scheduleDoc.id;
      
      if (!schedule || !schedule.payments || !Array.isArray(schedule.payments)) {
        continue;
      }
      
      // Recupera job per info cliente e evento
      const jobDoc = await db.collection('jobs').doc(schedule.jobId).get();
      if (!jobDoc.exists) {
        console.log(`Job non trovato per schedule ${scheduleId}`);
        continue;
      }
      
      const job = jobDoc.data();
      if (!job) continue;
      
      const clientiIds: string[] = Array.isArray(job.clientiIds) && job.clientiIds.length > 0
        ? job.clientiIds
        : (job.clienteId ? [job.clienteId] : []);
      if (clientiIds.length === 0) {
        console.log(`[Payment Reminder] Nessun cliente trovato per job ${schedule.jobId}`);
        continue;
      }
      
      // Prendi il primo cliente (primary contact) - usa collezione 'clienti' corretta
      const clienteDoc = await db.collection('clienti').doc(clientiIds[0]).get();
      if (!clienteDoc.exists) {
        console.log(`[Payment Reminder] Cliente non trovato: ${clientiIds[0]}`);
        continue;
      }
      
      const cliente = clienteDoc.data();
      if (!cliente || !cliente.email) {
        console.log(`[Payment Reminder] Email cliente mancante per ${clientiIds[0]}`);
        continue;
      }
      
      // Filtra pagamenti in scadenza
      const nowRome = DateTime.now().setZone('Europe/Rome');
      
      for (const payment of schedule.payments) {
        // Skip SOLO se completamente pagato - parziale riceve reminder
        if (payment.stato === 'pagato') {
          continue;
        }
        
        // Permetti re-send se sono passati 7+ giorni dall'ultimo reminder
        if (payment.reminderSentAt) {
          const lastReminderDate = payment.reminderSentAt.toDate ? payment.reminderSentAt.toDate() : new Date(payment.reminderSentAt);
          const daysSinceReminder = DateTime.now().setZone('Europe/Rome').diff(DateTime.fromJSDate(lastReminderDate).setZone('Europe/Rome'), 'days').days;
          if (daysSinceReminder < 7) {
            continue; // Skip se ultimo reminder inviato meno di 7 giorni fa
          }
        }
        
        // Converti dataScadenza a Date
        const dueDate = payment.dataScadenza.toDate ? payment.dataScadenza.toDate() : new Date(payment.dataScadenza);
        const dueDateRome = DateTime.fromJSDate(dueDate).setZone('Europe/Rome');
        
        // Calcola giorni alla scadenza
        const daysDiff = dueDateRome.diff(nowRome, 'days').days;
        
        // Invia reminder se:
        // - Scadenza entro 7 giorni (0 <= daysDiff <= 7)
        // - Già scaduto ma non più di 30 giorni fa (-30 <= daysDiff < 0)
        const shouldRemind = (daysDiff >= -30 && daysDiff <= 7);
        
        if (shouldRemind) {
          results.total++;
          
          try {
            // Atomic check-and-set con transazione
            const shouldSend = await db.runTransaction(async (transaction) => {
              const scheduleRef = db.collection('paymentSchedules').doc(scheduleId);
              const scheduleSnapshot = await transaction.get(scheduleRef);
              
              if (!scheduleSnapshot.exists) {
                return false;
              }
              
              const scheduleData = scheduleSnapshot.data();
              if (!scheduleData) {
                return false;
              }
              
              const paymentToUpdate = scheduleData.payments?.find((p: any) => p.id === payment.id);
              
              if (!paymentToUpdate || paymentToUpdate.reminderSentAt) {
                return false; // Già inviato
              }
              
              // Marca come inviato atomicamente
              const updatedPayments = scheduleData.payments.map((p: any) => 
                p.id === payment.id 
                  ? { ...p, reminderSentAt: Timestamp.now() }
                  : p
              );
              
              transaction.update(scheduleRef, {
                payments: updatedPayments,
                updatedAt: Timestamp.now()
              });
              
              return true;
            });
            
            if (!shouldSend) {
              console.log(`Reminder già inviato per payment ${payment.id}`);
              continue;
            }
            
            // Invia email
            const { sendGmailEmail, getStudioContactInfo, createPaymentReminderEmailHTML } = await import('./email-routes.js');
            const studioInfo = await getStudioContactInfo();
            
            const clienteName = `${cliente.nome || ''} ${cliente.cognome || ''}`.trim();
            const formattedDueDate = dueDateRome.toFormat('dd/MM/yyyy');
            
            // Determina se pagamento è scaduto
            const isOverdue = daysDiff < 0;
            
            // Calcola giorni usando ceil per arrotondare per eccesso
            // Se daysDiff è 0.5 (12 ore) → daysUntilDue = 1 (manca 1 giorno)
            // Se isOverdue, usa valore assoluto
            const daysUntilDue = isOverdue 
              ? Math.abs(Math.floor(daysDiff))  // Giorni di ritardo (floor per evitare arrotondamenti eccessivi)
              : Math.ceil(daysDiff);             // Giorni rimanenti (ceil per sicurezza)
            
            const htmlContent = createPaymentReminderEmailHTML(
              clienteName,
              job.nomeEvento || 'Servizio fotografico',
              payment.importo,
              formattedDueDate,
              payment.tipo,
              daysUntilDue,
              isOverdue,
              undefined, // portalUrl - TODO: implementare portale cliente
              studioInfo
            );
            
            await sendGmailEmail(
              cliente.email,
              `Promemoria Pagamento - ${job.nomeEvento || 'Servizio'}`,
              htmlContent
            );
            
            results.sent++;
            console.log(`✅ Reminder pagamento inviato a ${cliente.email} per ${payment.tipo} di €${payment.importo}`);
            
          } catch (emailError: any) {
            results.failed++;
            results.errors.push(`Payment ${payment.id}: ${emailError.message}`);
            console.error(`❌ Errore invio reminder payment ${payment.id}:`, emailError.message);
          }
        }
      }
    }
    
    console.log(`[Payment Reminder] Completato - Totale: ${results.total}, Inviati: ${results.sent}, Falliti: ${results.failed}`);
    
    return res.json({
      success: true,
      message: 'Payment reminder process completed',
      results
    });
    
  } catch (error: any) {
    console.error('[POST /send-reminders] Errore:', error.message);
    return res.status(500).json({
      error: 'Errore invio reminder pagamenti',
      message: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
});

export default router;
