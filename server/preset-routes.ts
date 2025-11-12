/**
 * JOB PRESETS ROUTES
 * API per gestione preset riutilizzabili per creazione job/preventivi
 */

import { Router } from 'express';
import { db } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { JobPreset, InsertJobPreset, UpdateJobPreset } from '../shared/presets-types';

const router = Router();

/**
 * GET /api/presets
 * Lista preset dell'utente corrente (proprietari + condivisi)
 */
router.get('/', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'] as string;
    
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Query preset: proprietario O condivisi con l'utente
    const presetsRef = db.collection('jobPresets');
    
    // Preset creati dall'utente
    const ownedQuery = presetsRef.where('createdBy', '==', userEmail);
    const ownedSnapshot = await ownedQuery.get();
    
    // Preset condivisi con l'utente (future feature)
    const sharedQuery = presetsRef.where('sharedWith', 'array-contains', userEmail);
    const sharedSnapshot = await sharedQuery.get();
    
    // Combina risultati
    const presets: JobPreset[] = [];
    const seenIds = new Set<string>();
    
    ownedSnapshot.forEach((doc) => {
      if (!seenIds.has(doc.id)) {
        presets.push({ id: doc.id, ...doc.data() } as JobPreset);
        seenIds.add(doc.id);
      }
    });
    
    sharedSnapshot.forEach((doc) => {
      if (!seenIds.has(doc.id)) {
        presets.push({ id: doc.id, ...doc.data() } as JobPreset);
        seenIds.add(doc.id);
      }
    });
    
    // Ordina per data creazione (più recenti prima)
    presets.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
    
    res.json(presets);
  } catch (error) {
    console.error('[PRESETS] Error fetching presets:', error);
    res.status(500).json({ error: 'Failed to fetch presets' });
  }
});

/**
 * GET /api/presets/:id
 * Dettaglio preset singolo
 */
router.get('/:id', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'] as string;
    const { id } = req.params;
    
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const presetDoc = await db.collection('jobPresets').doc(id).get();
    
    if (!presetDoc.exists) {
      return res.status(404).json({ error: 'Preset not found' });
    }
    
    const preset = { id: presetDoc.id, ...presetDoc.data() } as JobPreset;
    
    // Verifica permessi: proprietario, condiviso, o pubblico
    const hasAccess = 
      preset.createdBy === userEmail ||
      preset.sharedWith?.includes(userEmail) ||
      preset.isPublic;
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(preset);
  } catch (error) {
    console.error('[PRESETS] Error fetching preset:', error);
    res.status(500).json({ error: 'Failed to fetch preset' });
  }
});

/**
 * POST /api/presets
 * Crea nuovo preset
 */
router.post('/', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'] as string;
    
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const data: InsertJobPreset = req.body;
    
    // Validazione base
    if (!data.nome?.trim()) {
      return res.status(400).json({ error: 'Nome preset è obbligatorio' });
    }
    
    if (!data.products || data.products.length === 0) {
      return res.status(400).json({ error: 'Almeno un prodotto è richiesto' });
    }
    
    // Validazione prodotti
    for (const product of data.products) {
      if (!product.nome?.trim()) {
        return res.status(400).json({ error: 'Ogni prodotto deve avere un nome' });
      }
      if (typeof product.prezzo !== 'number' || product.prezzo < 0) {
        return res.status(400).json({ error: 'Prezzo prodotto non valido' });
      }
    }
    
    // Validazione sconto
    if (data.discountValue !== undefined) {
      if (!data.discountType) {
        return res.status(400).json({ error: 'Tipo sconto mancante' });
      }
      if (data.discountType === 'percent' && (data.discountValue < 0 || data.discountValue > 100)) {
        return res.status(400).json({ error: 'Sconto percentuale deve essere tra 0 e 100' });
      }
      if (data.discountType === 'amount' && data.discountValue < 0) {
        return res.status(400).json({ error: 'Sconto non può essere negativo' });
      }
    }
    
    const now = FieldValue.serverTimestamp();
    const presetData = {
      ...data,
      createdBy: userEmail,
      createdAt: now,
      updatedAt: now,
    };
    
    const docRef = await db.collection('jobPresets').add(presetData);
    const newPreset = await docRef.get();
    
    res.status(201).json({ id: docRef.id, ...newPreset.data() });
  } catch (error) {
    console.error('[PRESETS] Error creating preset:', error);
    res.status(500).json({ error: 'Failed to create preset' });
  }
});

/**
 * PATCH /api/presets/:id
 * Aggiorna preset esistente
 */
router.patch('/:id', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'] as string;
    const { id } = req.params;
    
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const presetDoc = await db.collection('jobPresets').doc(id).get();
    
    if (!presetDoc.exists) {
      return res.status(404).json({ error: 'Preset not found' });
    }
    
    const preset = presetDoc.data() as JobPreset;
    
    // Solo il proprietario può modificare
    if (preset.createdBy !== userEmail) {
      return res.status(403).json({ error: 'Only owner can modify preset' });
    }
    
    const updates: UpdateJobPreset = req.body;
    
    // Validazione nome se fornito
    if (updates.nome !== undefined && !updates.nome?.trim()) {
      return res.status(400).json({ error: 'Nome preset non può essere vuoto' });
    }
    
    // Validazione prodotti se forniti
    if (updates.products !== undefined) {
      if (updates.products.length === 0) {
        return res.status(400).json({ error: 'Almeno un prodotto è richiesto' });
      }
      for (const product of updates.products) {
        if (!product.nome?.trim()) {
          return res.status(400).json({ error: 'Ogni prodotto deve avere un nome' });
        }
        if (typeof product.prezzo !== 'number' || product.prezzo < 0) {
          return res.status(400).json({ error: 'Prezzo prodotto non valido' });
        }
      }
    }
    
    // Validazione sconto se fornito
    if (updates.discountValue !== undefined && updates.discountValue !== null) {
      if (!updates.discountType && !preset.discountType) {
        return res.status(400).json({ error: 'Tipo sconto mancante' });
      }
      const discountType = updates.discountType || preset.discountType;
      if (discountType === 'percent' && (updates.discountValue < 0 || updates.discountValue > 100)) {
        return res.status(400).json({ error: 'Sconto percentuale deve essere tra 0 e 100' });
      }
      if (discountType === 'amount' && updates.discountValue < 0) {
        return res.status(400).json({ error: 'Sconto non può essere negativo' });
      }
    }
    
    // Rimuovi campi null (per reset opzionali)
    const updateData: any = { ...updates };
    if (updates.discountType === null) {
      updateData.discountType = FieldValue.delete();
    }
    if (updates.discountValue === null) {
      updateData.discountValue = FieldValue.delete();
    }
    if (updates.theme === null) {
      updateData.theme = FieldValue.delete();
    }
    if (updates.paymentScheduleConfig === null) {
      updateData.paymentScheduleConfig = FieldValue.delete();
    }
    
    updateData.updatedAt = FieldValue.serverTimestamp();
    
    await db.collection('jobPresets').doc(id).update(updateData);
    
    const updatedDoc = await db.collection('jobPresets').doc(id).get();
    res.json({ id: updatedDoc.id, ...updatedDoc.data() });
  } catch (error) {
    console.error('[PRESETS] Error updating preset:', error);
    res.status(500).json({ error: 'Failed to update preset' });
  }
});

/**
 * DELETE /api/presets/:id
 * Elimina preset
 */
router.delete('/:id', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'] as string;
    const { id } = req.params;
    
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const presetDoc = await db.collection('jobPresets').doc(id).get();
    
    if (!presetDoc.exists) {
      return res.status(404).json({ error: 'Preset not found' });
    }
    
    const preset = presetDoc.data() as JobPreset;
    
    // Solo il proprietario può eliminare
    if (preset.createdBy !== userEmail) {
      return res.status(403).json({ error: 'Only owner can delete preset' });
    }
    
    await db.collection('jobPresets').doc(id).delete();
    
    res.json({ success: true, message: 'Preset eliminato con successo' });
  } catch (error) {
    console.error('[PRESETS] Error deleting preset:', error);
    res.status(500).json({ error: 'Failed to delete preset' });
  }
});

export default router;
