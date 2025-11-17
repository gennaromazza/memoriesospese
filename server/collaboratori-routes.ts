
import express from 'express';
import { db } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { nanoid } from 'nanoid';
import type {
  Collaboratore,
  InsertCollaboratore,
  UpdateCollaboratore,
  JobCollaboratoreAssignment,
  InsertJobCollaboratoreAssignment,
  CollaboratoreStats,
  CollaboratorPayment,
  CollaboratorPaymentType,
  PaymentMethod
} from '@shared/collaboratori-types';

const router = express.Router();

/**
 * Genera token univoco per dashboard collaboratore
 */
function generateCollaboratorToken(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15) +
         Date.now().toString(36);
}

/**
 * GET /api/collaboratori
 * Ottieni tutti i collaboratori (con filtro opzionale per attivi)
 */
router.get('/collaboratori', async (req, res) => {
  try {
    const { attiviOnly } = req.query;
    
    // 🔧 Fix: where() deve venire prima di orderBy() per evitare errore Firestore
    let baseQuery = db.collection('collaboratori');
    
    if (attiviOnly === 'true') {
      baseQuery = baseQuery.where('attivo', '==', true);
    }
    
    const queryWithOrder = baseQuery.orderBy('cognome', 'asc');
    
    const snapshot = await queryWithOrder.get();
    const collaboratori = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json(collaboratori);
  } catch (error: any) {
    console.error('❌ Error fetching collaboratori:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/collaboratori/:id
 * Ottieni un singolo collaboratore
 */
router.get('/collaboratori/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db.collection('collaboratori').doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Collaboratore non trovato' });
    }
    
    res.json({ id: doc.id, ...doc.data() });
  } catch (error: any) {
    console.error('❌ Error fetching collaboratore:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/collaboratori
 * Crea nuovo collaboratore
 */
router.post('/collaboratori', async (req, res) => {
  try {
    const data: InsertCollaboratore = req.body;
    
    const collaboratoreData: any = {
      nome: data.nome,
      cognome: data.cognome,
      email: data.email.toLowerCase(),
      ruolo: data.ruolo,
      attivo: true,
      hasAccess: data.hasAccess || false,
      dashboardToken: generateCollaboratorToken(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    if (data.cellulare) collaboratoreData.cellulare = data.cellulare;
    if (data.tariffaOraria !== undefined) collaboratoreData.tariffaOraria = data.tariffaOraria;
    if (data.tariffaGiornaliera !== undefined) collaboratoreData.tariffaGiornaliera = data.tariffaGiornaliera;
    if (data.note) collaboratoreData.note = data.note;
    
    const docRef = await db.collection('collaboratori').add(collaboratoreData);
    const created = { id: docRef.id, ...collaboratoreData };
    res.json(created);
  } catch (error: any) {
    console.error('❌ Error creating collaboratore:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/collaboratori/:id
 * Aggiorna collaboratore
 */
router.patch('/collaboratori/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates: UpdateCollaboratore = req.body;
    
    const updateData: any = {
      ...updates,
      updatedAt: Timestamp.now()
    };
    
    if (updates.email) {
      updateData.email = updates.email.toLowerCase();
    }
    
    await db.collection('collaboratori').doc(id).update(updateData);
    
    const updated = await db.collection('collaboratori').doc(id).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (error: any) {
    console.error('❌ Error updating collaboratore:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/collaboratori/assign-to-job
 * Assegna collaboratore a job
 */
router.post('/collaboratori/assign-to-job', async (req, res) => {
  try {
    const data: InsertJobCollaboratoreAssignment = req.body;
    
    const assignmentData: Omit<JobCollaboratoreAssignment, 'id'> = {
      ...data,
      status: 'pending',
      dataRichiesta: Timestamp.now(),
      isPagato: false,
      pagamenti: [],
      saldoResiduo: data.compenso,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    const docRef = await db.collection('jobCollaboratoreAssignments').add(assignmentData);
    
    // Recupera dati collaboratore e job per email
    const collaboratoreDoc = await db.collection('collaboratori').doc(data.collaboratoreId).get();
    const jobDoc = await db.collection('jobs').doc(data.jobId).get();
    
    if (collaboratoreDoc.exists && jobDoc.exists) {
      const collaboratore = collaboratoreDoc.data();
      const job = jobDoc.data();
      
      // Invia email notifica (fire-and-forget, non blocca risposta)
      fetch(`${process.env.VITE_APP_URL || 'http://localhost:5000'}/api/email/collaborator-assignment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collaboratoreEmail: collaboratore?.email,
          collaboratoreNome: `${collaboratore?.nome} ${collaboratore?.cognome}`,
          jobNome: job?.nomeEvento,
          jobData: job?.eventDate ? new Date(job.eventDate.toDate()).toLocaleDateString('it-IT') : null,
          ruolo: data.ruoloInJob,
          compenso: data.compenso,
          noteAdmin: data.noteAdmin,
          assignmentId: docRef.id
        })
      }).catch(err => console.error('❌ Email invio fallito (non bloccante):', err));
    }
    
    res.json({ id: docRef.id, ...assignmentData });
  } catch (error: any) {
    console.error('❌ Error assigning collaboratore:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/collaboratori/assignments/job/:jobId
 * Ottieni assegnazioni per job
 */
router.get('/collaboratori/assignments/job/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const snapshot = await db.collection('jobCollaboratoreAssignments')
      .where('jobId', '==', jobId)
      .orderBy('dataRichiesta', 'desc')
      .get();
    
    const assignments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json(assignments);
  } catch (error: any) {
    console.error('❌ Error fetching job assignments:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/collaboratori/assignments/collaboratore/:collaboratoreId
 * Ottieni assegnazioni per collaboratore
 */
router.get('/collaboratori/assignments/collaboratore/:collaboratoreId', async (req, res) => {
  try {
    const { collaboratoreId } = req.params;
    
    const snapshot = await db.collection('jobCollaboratoreAssignments')
      .where('collaboratoreId', '==', collaboratoreId)
      .orderBy('dataRichiesta', 'desc')
      .get();
    
    const assignments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json(assignments);
  } catch (error: any) {
    console.error('❌ Error fetching collaboratore assignments:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/collaboratori/assignments/:id/respond
 * Rispondi a assegnazione (accetta/rifiuta)
 */
router.patch('/collaboratori/assignments/:id/respond', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, noteRifiuto } = req.body;
    
    const updateData: any = {
      status,
      dataRisposta: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    if (noteRifiuto) {
      updateData.noteRifiuto = noteRifiuto;
    }
    
    await db.collection('jobCollaboratoreAssignments').doc(id).update(updateData);
    
    const updated = await db.collection('jobCollaboratoreAssignments').doc(id).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (error: any) {
    console.error('❌ Error responding to assignment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/collaboratori/assignments/:id/mark-paid
 * Segna assegnazione come pagata
 */
router.patch('/collaboratori/assignments/:id/mark-paid', async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.collection('jobCollaboratoreAssignments').doc(id).update({
      isPagato: true,
      dataPagamento: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    
    const updated = await db.collection('jobCollaboratoreAssignments').doc(id).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (error: any) {
    console.error('❌ Error marking assignment as paid:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/collaboratori/:id/stats
 * Ottieni statistiche collaboratore
 */
router.get('/collaboratori/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    
    const snapshot = await db.collection('jobCollaboratoreAssignments')
      .where('collaboratoreId', '==', id)
      .get();
    
    const assignments = snapshot.docs.map(doc => doc.data() as JobCollaboratoreAssignment);
    
    const stats: CollaboratoreStats = {
      totalJobs: assignments.length,
      jobsAccepted: assignments.filter(a => a.status === 'accepted').length,
      jobsDeclined: assignments.filter(a => a.status === 'declined').length,
      jobsPending: assignments.filter(a => a.status === 'pending').length,
      totalEarnings: assignments
        .filter(a => a.status === 'accepted')
        .reduce((sum, a) => sum + a.compenso, 0),
      earningsPaid: assignments
        .filter(a => a.status === 'accepted' && a.isPagato)
        .reduce((sum, a) => sum + a.compenso, 0),
      earningsPending: assignments
        .filter(a => a.status === 'accepted' && !a.isPagato)
        .reduce((sum, a) => sum + a.compenso, 0)
    };
    
    res.json(stats);
  } catch (error: any) {
    console.error('❌ Error fetching collaboratore stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/collaboratori/public/assignment/:id
 * Ottieni dettagli assegnazione (pubblico, per link email)
 */
router.get('/public/assignment/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const assignmentDoc = await db.collection('jobCollaboratoreAssignments').doc(id).get();
    if (!assignmentDoc.exists) {
      return res.status(404).json({ error: 'Assegnazione non trovata' });
    }
    
    const assignment = assignmentDoc.data();
    
    // Recupera dati collaboratore e job
    const [collaboratoreDoc, jobDoc] = await Promise.all([
      db.collection('collaboratori').doc(assignment!.collaboratoreId).get(),
      db.collection('jobs').doc(assignment!.jobId).get()
    ]);
    
    res.json({
      id: assignmentDoc.id,
      ...assignment,
      collaboratore: collaboratoreDoc.exists ? collaboratoreDoc.data() : null,
      job: jobDoc.exists ? jobDoc.data() : null
    });
  } catch (error: any) {
    console.error('❌ Error fetching assignment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/collaboratori/public/assignment/:id/accept
 * Accetta assegnazione (pubblico, da link email)
 */
router.post('/public/assignment/:id/accept', async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.collection('jobCollaboratoreAssignments').doc(id).update({
      status: 'accepted',
      dataRisposta: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    
    res.json({ success: true, message: 'Assegnazione accettata' });
  } catch (error: any) {
    console.error('❌ Error accepting assignment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/collaboratori/public/assignment/:id/decline
 * Rifiuta assegnazione (pubblico, da link email)
 */
router.post('/public/assignment/:id/decline', async (req, res) => {
  try {
    const { id } = req.params;
    const { noteRifiuto } = req.body;
    
    await db.collection('jobCollaboratoreAssignments').doc(id).update({
      status: 'declined',
      dataRisposta: Timestamp.now(),
      noteRifiuto: noteRifiuto || '',
      updatedAt: Timestamp.now()
    });
    
    res.json({ success: true, message: 'Assegnazione rifiutata' });
  } catch (error: any) {
    console.error('❌ Error declining assignment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/collaboratori/assignments/:id/add-payment
 * Registra pagamento (acconto/saldo) per assegnazione collaboratore
 */
router.post('/assignments/:id/add-payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { importo, tipo, metodo, note, data } = req.body as {
      importo: number;
      tipo: CollaboratorPaymentType;
      metodo: PaymentMethod;
      note?: string;
      data?: string;
    };
    
    // Validazione input
    if (!importo || importo <= 0) {
      return res.status(400).json({ error: 'Importo non valido' });
    }
    if (!tipo || !['acconto', 'saldo'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo pagamento non valido' });
    }
    if (!metodo) {
      return res.status(400).json({ error: 'Metodo pagamento richiesto' });
    }
    
    // Recupera assegnazione
    const assignmentDoc = await db.collection('jobCollaboratoreAssignments').doc(id).get();
    if (!assignmentDoc.exists) {
      return res.status(404).json({ error: 'Assegnazione non trovata' });
    }
    const assignment = assignmentDoc.data() as JobCollaboratoreAssignment;
    
    // Recupera collaboratore e job per descrizione movimento cassa
    const [collaboratoreDoc, jobDoc] = await Promise.all([
      db.collection('collaboratori').doc(assignment.collaboratoreId).get(),
      db.collection('jobs').doc(assignment.jobId).get()
    ]);
    
    const collaboratore = collaboratoreDoc.data();
    const job = jobDoc.data();
    const nomeCollaboratore = `${collaboratore?.nome || ''} ${collaboratore?.cognome || ''}`.trim();
    const nomeJob = job?.nomeEvento || 'Lavoro senza nome';
    const ruolo = assignment.ruoloInJob;
    
    // Mappa ruoli per categoria
    const ruoliLabels: Record<string, string> = {
      fotografo_secondario: 'Fotografo Secondario',
      videomaker: 'Videomaker',
      assistente: 'Assistente',
      photo_editor: 'Photo Editor',
      album_designer: 'Album Designer',
      altro: 'Altro'
    };
    
    const categoriaMovimento = `Collaboratori - ${ruoliLabels[ruolo] || 'Altro'}`;
    const descrizioneMovimento = `Pagamento ${nomeCollaboratore} - ${nomeJob}`;
    
    // Crea movimento cassa (uscita)
    const cashMovementData = {
      tipo: 'uscita' as const,
      categoria: categoriaMovimento,
      importo: importo,
      descrizione: descrizioneMovimento,
      data: data ? Timestamp.fromDate(new Date(data)) : Timestamp.now(),
      metodoPagamento: metodo,
      note: note || null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    const cashMovementRef = await db.collection('cashMovements').add(cashMovementData);
    
    // Crea record pagamento per assegnazione
    const pagamento: Omit<CollaboratorPayment, 'data'> & { data: any } = {
      id: nanoid(10),
      tipo: tipo,
      importo: importo,
      data: data ? Timestamp.fromDate(new Date(data)) : Timestamp.now(),
      metodo: metodo,
      note: note,
      cashMovementId: cashMovementRef.id
    };
    
    // Aggiorna array pagamenti e ricalcola saldo
    const pagamentiAttuali = assignment.pagamenti || [];
    const nuoviPagamenti = [...pagamentiAttuali, pagamento];
    
    const totalePagato = nuoviPagamenti.reduce((sum, p) => sum + p.importo, 0);
    const nuovoSaldoResiduo = assignment.compenso - totalePagato;
    const isPagato = nuovoSaldoResiduo <= 0;
    
    // Aggiorna assegnazione
    await db.collection('jobCollaboratoreAssignments').doc(id).update({
      pagamenti: nuoviPagamenti,
      saldoResiduo: nuovoSaldoResiduo,
      isPagato: isPagato,
      dataPagamento: isPagato ? Timestamp.now() : assignment.dataPagamento,
      updatedAt: Timestamp.now()
    });
    
    res.json({ 
      success: true,
      saldoResiduo: nuovoSaldoResiduo,
      isPagato: isPagato,
      cashMovementId: cashMovementRef.id
    });
  } catch (error: any) {
    console.error('❌ Error adding payment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/collaboratori/dashboard/:token
 * Dashboard collaboratore via link magico (pubblico)
 */
router.get('/dashboard/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    // Trova collaboratore con questo token
    const collaboratoriSnapshot = await db.collection('collaboratori')
      .where('dashboardToken', '==', token)
      .limit(1)
      .get();
    
    if (collaboratoriSnapshot.empty) {
      return res.status(404).json({ error: 'Token non valido o collaboratore non trovato' });
    }
    
    const collaboratoreDoc = collaboratoriSnapshot.docs[0];
    const collaboratore = { id: collaboratoreDoc.id, ...collaboratoreDoc.data() };
    
    // Recupera tutte le assegnazioni del collaboratore
    const assignmentsSnapshot = await db.collection('jobCollaboratoreAssignments')
      .where('collaboratoreId', '==', collaboratoreDoc.id)
      .orderBy('dataRichiesta', 'desc')
      .get();
    
    // Per ogni assegnazione, recupera i dati del job
    const assignments = await Promise.all(
      assignmentsSnapshot.docs.map(async (assignmentDoc) => {
        const assignment = assignmentDoc.data();
        const jobDoc = await db.collection('jobs').doc(assignment.jobId).get();
        
        return {
          id: assignmentDoc.id,
          ...assignment,
          job: jobDoc.exists ? { id: jobDoc.id, ...jobDoc.data() } : null
        };
      })
    );
    
    res.json({
      collaboratore,
      assignments
    });
  } catch (error: any) {
    console.error('❌ Error fetching collaborator dashboard:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
