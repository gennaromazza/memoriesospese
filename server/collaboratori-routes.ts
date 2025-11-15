
import express from 'express';
import { db } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import type {
  Collaboratore,
  InsertCollaboratore,
  UpdateCollaboratore,
  JobCollaboratoreAssignment,
  InsertJobCollaboratoreAssignment,
  CollaboratoreStats
} from '@shared/collaboratori-types';

const router = express.Router();

/**
 * GET /api/collaboratori
 * Ottieni tutti i collaboratori (con filtro opzionale per attivi)
 */
router.get('/collaboratori', async (req, res) => {
  try {
    const { attiviOnly } = req.query;
    
    let query = db.collection('collaboratori').orderBy('cognome', 'asc');
    
    if (attiviOnly === 'true') {
      query = query.where('attivo', '==', true) as any;
    }
    
    const snapshot = await query.get();
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
    
    const collaboratoreData: Omit<Collaboratore, 'id'> = {
      nome: data.nome,
      cognome: data.cognome,
      email: data.email.toLowerCase(),
      cellulare: data.cellulare,
      ruolo: data.ruolo,
      tariffaOraria: data.tariffaOraria,
      tariffaGiornaliera: data.tariffaGiornaliera,
      note: data.note,
      attivo: true,
      hasAccess: data.hasAccess || false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    const docRef = await db.collection('collaboratori').add(collaboratoreData);
    res.json({ id: docRef.id, ...collaboratoreData });
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
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    const docRef = await db.collection('jobCollaboratoreAssignments').add(assignmentData);
    
    // Invia email al collaboratore
    // TODO: Implementare invio email
    
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

export default router;
