/**
 * PAYMENT SCHEDULES LIBRARY - CRUD Operations
 * Gestione pagamenti programmati con integrazione cassa
 */

import { db } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import type {
  PaymentSchedule,
  InsertPaymentSchedule,
  ScheduledPayment,
  RegisterPaymentData,
  UpcomingPayment,
  PaymentStats
} from '@shared/payment-schedule-types';
import { nanoid } from 'nanoid';
import { addTimelineEvent, updateJobFinancials } from './jobs';

const SCHEDULES_COLLECTION = 'paymentSchedules';
const CASH_MOVEMENTS_COLLECTION = 'cashMovements';

/**
 * Crea nuovo payment schedule
 */
export async function createPaymentSchedule(
  data: InsertPaymentSchedule,
  userId: string
): Promise<string> {
  try {
    // Prepara pagamenti con ID
    const paymentsWithIds: ScheduledPayment[] = data.payments.map(p => ({
      id: nanoid(),
      tipo: p.tipo,
      importo: p.importo,
      dataScadenza: Timestamp.fromDate(p.dataScadenza),
      stato: 'atteso',
      note: p.note
    }));
    
    // Calcola totali
    const totale = paymentsWithIds.reduce((sum, p) => sum + p.importo, 0);
    
    const scheduleData: Omit<PaymentSchedule, 'id'> = {
      jobId: data.jobId,
      orderId: data.orderId,
      clienteId: data.clienteId,
      payments: paymentsWithIds,
      totale,
      totalePagato: 0,
      saldoResiduo: totale,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: userId
    };

    const docRef = await addDoc(collection(db, SCHEDULES_COLLECTION), scheduleData);
    
    // Timeline event
    await addTimelineEvent({
      jobId: data.jobId,
      tipo: 'nota_aggiunta',
      descrizione: `Calendario pagamenti creato (${paymentsWithIds.length} scadenze)`,
      userId,
      metadata: { scheduleId: docRef.id, totale }
    });

    console.log('✅ Payment schedule creato:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Errore creazione schedule:', error);
    throw error;
  }
}

/**
 * Get payment schedule
 */
export async function getPaymentSchedule(scheduleId: string): Promise<PaymentSchedule | null> {
  try {
    const scheduleDoc = await getDoc(doc(db, SCHEDULES_COLLECTION, scheduleId));
    if (!scheduleDoc.exists()) return null;
    
    return {
      id: scheduleDoc.id,
      ...scheduleDoc.data()
    } as PaymentSchedule;
  } catch (error) {
    console.error('❌ Errore get schedule:', error);
    throw error;
  }
}

/**
 * Get payment schedule for job (restituisce primo schedule trovato)
 * NOTA: Se esistono duplicati, usa getPaymentSchedulesForJob per fetchare tutti
 */
export async function getPaymentScheduleForJob(jobId: string): Promise<PaymentSchedule | null> {
  try {
    const q = query(
      collection(db, SCHEDULES_COLLECTION),
      where('jobId', '==', jobId)
    );
    
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    
    // Log warning se esistono duplicati (data issue da risolvere)
    if (snapshot.docs.length > 1) {
      console.warn(`⚠️ Job ${jobId} ha ${snapshot.docs.length} payment schedules duplicati!`);
    }
    
    const scheduleDoc = snapshot.docs[0];
    return {
      id: scheduleDoc.id,
      ...scheduleDoc.data()
    } as PaymentSchedule;
  } catch (error) {
    console.error('❌ Errore get schedule for job:', error);
    throw error;
  }
}

/**
 * Get ALL payment schedules for job (per gestire duplicati)
 * Usato da useJobFinancials per calcolare totali aggregati corretti
 */
export async function getPaymentSchedulesForJob(jobId: string): Promise<PaymentSchedule[]> {
  try {
    const q = query(
      collection(db, SCHEDULES_COLLECTION),
      where('jobId', '==', jobId)
    );
    
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as PaymentSchedule));
  } catch (error) {
    console.error('❌ Errore get schedules for job:', error);
    throw error;
  }
}

/**
 * Register payment (marca pagamento come pagato + integrazione cassa)
 */
export async function registerPayment(
  data: RegisterPaymentData,
  userId: string
): Promise<void> {
  try {
    const schedule = await getPaymentSchedule(data.scheduleId);
    if (!schedule) throw new Error('Schedule non trovato');
    
    // Trova pagamento da aggiornare
    const paymentIndex = schedule.payments.findIndex(p => p.id === data.paymentId);
    if (paymentIndex === -1) throw new Error('Pagamento non trovato');
    
    const payment = schedule.payments[paymentIndex];
    
    // Aggiorna pagamento
    const updatedPayments = [...schedule.payments];
    updatedPayments[paymentIndex] = {
      ...payment,
      stato: data.importoPagato >= payment.importo ? 'pagato' : 'parziale',
      importoPagato: data.importoPagato,
      dataPagamento: Timestamp.fromDate(data.dataPagamento),
      metodoPagamento: data.metodoPagamento,
      note: data.note
    };
    
    // Ricalcola totali
    const totalePagato = updatedPayments
      .filter(p => p.importoPagato)
      .reduce((sum, p) => sum + (p.importoPagato || 0), 0);
    
    const saldoResiduo = schedule.totale - totalePagato;
    
    // 1. Crea cashMovement (se richiesto)
    let cashMovementId: string | undefined;
    if (data.createCashMovement !== false) {
      const cashMovementData = {
        tipo: 'entrata',
        categoria: 'Servizio fotografico',
        importo: data.importoPagato,
        descrizione: `Pagamento ${payment.tipo} - Job ${schedule.jobId}`,
        data: Timestamp.fromDate(data.dataPagamento),
        metodoPagamento: data.metodoPagamento,
        note: data.note,
        jobId: schedule.jobId, // Link a job
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };
      
      const cashMovementRef = await addDoc(
        collection(db, CASH_MOVEMENTS_COLLECTION),
        cashMovementData
      );
      cashMovementId = cashMovementRef.id;
      
      updatedPayments[paymentIndex].cashMovementId = cashMovementId;
    }
    
    // 2. Update order transaction (se richiesto)
    if (data.updateOrder !== false) {
      const orderRef = doc(db, 'orders', schedule.orderId);
      const orderDoc = await getDoc(orderRef);
      
      if (orderDoc.exists()) {
        const currentTransactions = orderDoc.data().transactions || [];
        const newTransaction = {
          tipo: payment.tipo,
          importo: data.importoPagato,
          metodo: data.metodoPagamento,
          data: Timestamp.fromDate(data.dataPagamento),
          note: data.note,
          emailInviata: false
        };
        
        await updateDoc(orderRef, {
          transactions: [...currentTransactions, newTransaction],
          acconto: payment.tipo === 'acconto' ? data.importoPagato : orderDoc.data().acconto,
          saldo: schedule.totale - totalePagato,
          updatedAt: Timestamp.now()
        });
      }
    }
    
    // 3. Update payment schedule
    await updateDoc(doc(db, SCHEDULES_COLLECTION, data.scheduleId), {
      payments: updatedPayments,
      totalePagato,
      saldoResiduo,
      updatedAt: Timestamp.now()
    });
    
    // 4. Update job financials
    await updateJobFinancials(schedule.jobId, {
      totalePagato
    });
    
    // 5. Timeline event
    await addTimelineEvent({
      jobId: schedule.jobId,
      tipo: 'pagamento_ricevuto',
      descrizione: `Pagamento ${payment.tipo} ricevuto: €${data.importoPagato}`,
      userId,
      metadata: {
        scheduleId: data.scheduleId,
        paymentId: data.paymentId,
        importo: data.importoPagato,
        metodo: data.metodoPagamento
      }
    });
    
    // 6. Aggiorna stato job se saldo completato
    if (saldoResiduo === 0) {
      const jobDoc = await getDoc(doc(db, 'jobs', schedule.jobId));
      if (jobDoc.exists() && jobDoc.data().status === 'confermato') {
        await updateDoc(doc(db, 'jobs', schedule.jobId), {
          status: 'shooting_fatto',
          updatedAt: Timestamp.now()
        });
      }
    }
    
    console.log('✅ Pagamento registrato:', data.paymentId);
  } catch (error) {
    console.error('❌ Errore registrazione pagamento:', error);
    throw error;
  }
}

/**
 * Get upcoming payments (prossimi 30 giorni)
 */
export async function getUpcomingPayments(days = 30): Promise<UpcomingPayment[]> {
  try {
    const now = Timestamp.now();
    const futureDate = Timestamp.fromMillis(now.toMillis() + days * 24 * 60 * 60 * 1000);
    
    const snapshot = await getDocs(collection(db, SCHEDULES_COLLECTION));
    const upcomingPayments: UpcomingPayment[] = [];
    
    for (const scheduleDoc of snapshot.docs) {
      const schedule = scheduleDoc.data() as PaymentSchedule;
      
      // Get job e cliente info
      const jobDoc = await getDoc(doc(db, 'jobs', schedule.jobId));
      const clienteDoc = await getDoc(doc(db, 'clienti', schedule.clienteId));
      
      if (!jobDoc.exists() || !clienteDoc.exists()) continue;
      
      const job = jobDoc.data();
      const cliente = clienteDoc.data();
      
      // Filtra pagamenti in scadenza
      for (const payment of schedule.payments) {
        if (payment.stato === 'atteso' || payment.stato === 'parziale') {
          if (payment.dataScadenza >= now && payment.dataScadenza <= futureDate) {
            const giorniAllaScadenza = Math.ceil(
              (payment.dataScadenza.toMillis() - now.toMillis()) / (24 * 60 * 60 * 1000)
            );
            
            upcomingPayments.push({
              scheduleId: scheduleDoc.id,
              paymentId: payment.id,
              jobId: schedule.jobId,
              clienteId: schedule.clienteId,
              clienteNome: `${cliente.nome} ${cliente.cognome}`,
              jobType: job.jobType,
              tipo: payment.tipo,
              importo: payment.importo,
              dataScadenza: payment.dataScadenza,
              giorniAllaScadenza,
              stato: payment.stato
            });
          }
        }
      }
    }
    
    // Ordina per data scadenza
    return upcomingPayments.sort((a, b) => 
      a.dataScadenza.toMillis() - b.dataScadenza.toMillis()
    );
  } catch (error) {
    console.error('❌ Errore get upcoming payments:', error);
    throw error;
  }
}

/**
 * Get overdue payments (scaduti)
 */
export async function getOverduePayments(): Promise<UpcomingPayment[]> {
  try {
    const now = Timestamp.now();
    const snapshot = await getDocs(collection(db, SCHEDULES_COLLECTION));
    const overduePayments: UpcomingPayment[] = [];
    
    for (const scheduleDoc of snapshot.docs) {
      const schedule = scheduleDoc.data() as PaymentSchedule;
      
      const jobDoc = await getDoc(doc(db, 'jobs', schedule.jobId));
      const clienteDoc = await getDoc(doc(db, 'clienti', schedule.clienteId));
      
      if (!jobDoc.exists() || !clienteDoc.exists()) continue;
      
      const job = jobDoc.data();
      const cliente = clienteDoc.data();
      
      // Aggiorna stato a scaduto se necessario
      const updatedPayments = [...schedule.payments];
      let hasUpdates = false;
      
      for (let i = 0; i < updatedPayments.length; i++) {
        const payment = updatedPayments[i];
        if ((payment.stato === 'atteso' || payment.stato === 'parziale') && 
            payment.dataScadenza < now) {
          
          updatedPayments[i] = { ...payment, stato: 'scaduto' };
          hasUpdates = true;
          
          const giorniDiRitardo = Math.ceil(
            (now.toMillis() - payment.dataScadenza.toMillis()) / (24 * 60 * 60 * 1000)
          );
          
          overduePayments.push({
            scheduleId: scheduleDoc.id,
            paymentId: payment.id,
            jobId: schedule.jobId,
            clienteId: schedule.clienteId,
            clienteNome: `${cliente.nome} ${cliente.cognome}`,
            jobType: job.jobType,
            tipo: payment.tipo,
            importo: payment.importo,
            dataScadenza: payment.dataScadenza,
            giorniAllaScadenza: -giorniDiRitardo,
            stato: 'scaduto'
          });
        }
      }
      
      // Update se ci sono stati cambi di stato
      if (hasUpdates) {
        await updateDoc(doc(db, SCHEDULES_COLLECTION, scheduleDoc.id), {
          payments: updatedPayments,
          updatedAt: Timestamp.now()
        });
      }
    }
    
    return overduePayments;
  } catch (error) {
    console.error('❌ Errore get overdue payments:', error);
    throw error;
  }
}

/**
 * Get payment stats
 */
export async function getPaymentStats(): Promise<PaymentStats> {
  try {
    const snapshot = await getDocs(collection(db, SCHEDULES_COLLECTION));
    
    let totaleAtteso = 0;
    let totalePagato = 0;
    let totaleScaduto = 0;
    let prossimi7Giorni = 0;
    let prossimi30Giorni = 0;
    
    const now = Timestamp.now();
    const next7Days = Timestamp.fromMillis(now.toMillis() + 7 * 24 * 60 * 60 * 1000);
    const next30Days = Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60 * 1000);
    
    for (const doc of snapshot.docs) {
      const schedule = doc.data() as PaymentSchedule;
      
      for (const payment of schedule.payments) {
        if (payment.stato === 'atteso' || payment.stato === 'parziale') {
          totaleAtteso += payment.importo - (payment.importoPagato || 0);
          
          if (payment.dataScadenza < now) {
            totaleScaduto += payment.importo - (payment.importoPagato || 0);
          } else if (payment.dataScadenza <= next7Days) {
            prossimi7Giorni += payment.importo - (payment.importoPagato || 0);
          } else if (payment.dataScadenza <= next30Days) {
            prossimi30Giorni += payment.importo - (payment.importoPagato || 0);
          }
        } else if (payment.stato === 'pagato') {
          totalePagato += payment.importoPagato || payment.importo;
        }
      }
    }
    
    return {
      totaleAtteso,
      totalePagato,
      totaleScaduto,
      prossimi7Giorni,
      prossimi30Giorni
    };
  } catch (error) {
    console.error('❌ Errore get payment stats:', error);
    throw error;
  }
}
