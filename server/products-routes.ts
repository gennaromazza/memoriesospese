/**
 * Products API Routes
 * Endpoint per recuperare prodotti da Firestore lato server
 */

import express from 'express';
import { db } from './firebase-admin.js';

const router = express.Router();

/**
 * GET /api/products
 * Recupera tutti i prodotti attivi da Firestore
 */
router.get('/', async (req, res) => {
  try {
    const snapshot = await db.collection('products')
      .where('attivo', '==', true)
      .get();

    const products = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(products);
  } catch (error) {
    console.error('Errore recupero prodotti:', error);
    res.status(500).json({ error: 'Errore recupero prodotti' });
  }
});

export default router;
