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

/**
 * GET /api/products/stats
 * Statistiche vendite prodotti aggregate da ordini e prenotazioni
 */
router.get('/stats', async (req, res) => {
  try {
    interface ProductStat {
      prodottoId: string;
      prodottoNome: string;
      isCustom: boolean;
      quantitaVenduta: number;
      quantitaPrenotata: number;
      totaleQuantita: number;
      fatturatoVenduto: number;
      fatturatoPrevisto: number;
      totaleFatturato: number;
    }
    
    const productStats: Map<string, ProductStat> = new Map();
    
    const getOrCreate = (id: string, nome: string, isCustom: boolean): ProductStat => {
      const key = id || nome;
      if (!productStats.has(key)) {
        productStats.set(key, {
          prodottoId: id,
          prodottoNome: nome,
          isCustom,
          quantitaVenduta: 0,
          quantitaPrenotata: 0,
          totaleQuantita: 0,
          fatturatoVenduto: 0,
          fatturatoPrevisto: 0,
          totaleFatturato: 0
        });
      }
      return productStats.get(key)!;
    };
    
    // 1. Recupera ordini completati (vendite effettive)
    const ordersSnap = await db.collection('orders').get();
    let ordiniAnalizzati = 0;
    let ordiniCompletati = 0;
    
    for (const orderDoc of ordersSnap.docs) {
      const order = orderDoc.data();
      ordiniAnalizzati++;
      
      const isCompleted = order.status === 'completato' || 
                          order.workflowState === 'completato' ||
                          order.statoWorkflow === 'completato';
      
      if (order.prodotti && Array.isArray(order.prodotti)) {
        for (const item of order.prodotti) {
          const isCustom = item.isCustom || 
                          (item.prodottoId && item.prodottoId.startsWith('custom_')) ||
                          false;
          const stat = getOrCreate(
            item.prodottoId || '',
            item.prodottoNome || item.nome || 'Prodotto sconosciuto',
            isCustom
          );
          
          const qty = item.quantita || item.quantity || 1;
          const price = item.prodottoPrezzo || item.prezzo || 0;
          
          if (isCompleted) {
            stat.quantitaVenduta += qty;
            stat.fatturatoVenduto += qty * price;
            ordiniCompletati++;
          } else {
            stat.quantitaPrenotata += qty;
            stat.fatturatoPrevisto += qty * price;
          }
        }
      }
    }
    
    // 2. Recupera prenotazioni confermate (vendite future)
    const bookingsSnap = await db.collection('bookings').get();
    let prenotazioniAnalizzate = 0;
    
    for (const bookingDoc of bookingsSnap.docs) {
      const booking = bookingDoc.data();
      prenotazioniAnalizzate++;
      
      const isConfirmed = booking.stato === 'confermata' || 
                          booking.status === 'confermata' ||
                          booking.statoWorkflow === 'confermata';
      
      if (!isConfirmed) continue;
      
      // Supporta sia prodotti array che prodotto singolo
      if (booking.prodotti && Array.isArray(booking.prodotti)) {
        for (const item of booking.prodotti) {
          const isCustom = item.isCustom || 
                          (item.prodottoId && item.prodottoId.startsWith('custom_')) ||
                          false;
          const stat = getOrCreate(
            item.prodottoId || '',
            item.prodottoNome || item.nome || 'Prodotto sconosciuto',
            isCustom
          );
          
          const qty = item.quantita || item.quantity || 1;
          const price = item.prodottoPrezzo || item.prezzo || 0;
          
          stat.quantitaPrenotata += qty;
          stat.fatturatoPrevisto += qty * price;
        }
      } else if (booking.prodottoId || booking.prodottoNome) {
        const isCustom = booking.prodottoId?.startsWith('custom_') || false;
        const stat = getOrCreate(
          booking.prodottoId || '',
          booking.prodottoNome || 'Prodotto sconosciuto',
          isCustom
        );
        
        stat.quantitaPrenotata += 1;
        stat.fatturatoPrevisto += booking.prodottoPrezzo || 0;
      }
    }
    
    // 3. Calcola totali e converti in array
    const statsArray: ProductStat[] = [];
    let totaleVenduto = 0;
    let totalePrevisto = 0;
    let totaleQtaVenduta = 0;
    let totaleQtaPrenotata = 0;
    
    for (const stat of productStats.values()) {
      stat.totaleQuantita = stat.quantitaVenduta + stat.quantitaPrenotata;
      stat.totaleFatturato = stat.fatturatoVenduto + stat.fatturatoPrevisto;
      
      totaleVenduto += stat.fatturatoVenduto;
      totalePrevisto += stat.fatturatoPrevisto;
      totaleQtaVenduta += stat.quantitaVenduta;
      totaleQtaPrenotata += stat.quantitaPrenotata;
      
      statsArray.push(stat);
    }
    
    // Ordina per totale fatturato decrescente
    statsArray.sort((a, b) => b.totaleFatturato - a.totaleFatturato);
    
    // 4. Separazione prodotti catalogo vs custom
    const prodottiCatalogo = statsArray.filter(s => !s.isCustom);
    const prodottiCustom = statsArray.filter(s => s.isCustom);
    
    res.json({
      riepilogo: {
        totaleVenduto,
        totalePrevisto,
        totaleFatturato: totaleVenduto + totalePrevisto,
        totaleQtaVenduta,
        totaleQtaPrenotata,
        totaleQtaTotale: totaleQtaVenduta + totaleQtaPrenotata,
        numeroProdottiDistinti: statsArray.length,
        numeroProdottiCatalogo: prodottiCatalogo.length,
        numeroProdottiCustom: prodottiCustom.length,
        ordiniAnalizzati,
        prenotazioniAnalizzate
      },
      prodotti: statsArray,
      prodottiCatalogo,
      prodottiCustom,
      top10: statsArray.slice(0, 10)
    });
    
  } catch (error) {
    console.error('Errore calcolo statistiche prodotti:', error);
    res.status(500).json({ error: 'Errore calcolo statistiche prodotti' });
  }
});

export default router;
