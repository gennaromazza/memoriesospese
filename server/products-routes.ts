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

/**
 * GET /api/product-categories
 * Recupera tutte le categorie prodotti ordinate per displayOrder
 */
router.get('/product-categories', async (req, res) => {
  try {
    const snapshot = await db.collection('productCategories')
      .orderBy('displayOrder', 'asc')
      .get();

    const categories = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(categories);
  } catch (error) {
    console.error('Errore recupero categorie prodotti:', error);
    res.status(500).json({ error: 'Errore recupero categorie prodotti' });
  }
});

export default router;
