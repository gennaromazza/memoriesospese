/**
 * Script di migrazione: Aggrega clienti da bookings, orders, galleries
 * 
 * Esegui con: npx tsx scripts/migrate-clienti.ts
 * 
 * Strategia:
 * 1. Itera tutti bookings e estrae dati cliente
 * 2. Itera tutti orders e estrae dati cliente
 * 3. Itera galleries per trovare clienti registrati
 * 4. Deduplica per email (case-insensitive)
 * 5. Crea documento `clienti` per ogni cliente unico
 * 6. Usa 'N/D' per campi mancanti
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Inizializza Firebase Admin con project ID
initializeApp({
  projectId: 'wedding-gallery-397b6'
});
const db = getFirestore();

interface ClienteSource {
  email: string;
  nome?: string;
  cognome?: string;
  whatsapp?: string;
  cellulare1?: string;
  
  // Collegamenti
  bookingIds: string[];
  orderIds: string[];
  galleryIds: string[];
  
  // Analytics
  firstContactAt: Timestamp;
  lastInteractionAt: Timestamp;
  totalRevenue: number;
  outstandingBalance: number;
  totalOrders: number;
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

async function migrateClienti() {
  console.log('🚀 Inizio migrazione clienti...\n');
  
  const clientiMap = new Map<string, ClienteSource>();
  
  // ========================================
  // STEP 1: Aggrega da bookings
  // ========================================
  console.log('📅 Step 1: Aggregazione da bookings...');
  const bookingsSnapshot = await db.collection('bookings').get();
  
  for (const doc of bookingsSnapshot.docs) {
    const booking = doc.data();
    const email = normalizeEmail(booking.cliente?.email || 'nessuna_email@nd.com');
    
    if (!clientiMap.has(email)) {
      clientiMap.set(email, {
        email,
        nome: booking.cliente?.nome || 'N/D',
        cognome: booking.cliente?.cognome || 'N/D',
        whatsapp: booking.cliente?.whatsapp,
        bookingIds: [],
        orderIds: [],
        galleryIds: [],
        firstContactAt: booking.createdAt || Timestamp.now(),
        lastInteractionAt: booking.updatedAt || booking.createdAt || Timestamp.now(),
        totalRevenue: 0,
        outstandingBalance: 0,
        totalOrders: 0,
      });
    }
    
    const cliente = clientiMap.get(email)!;
    cliente.bookingIds.push(doc.id);
    
    // Aggiorna firstContactAt se questo booking è più vecchio
    if (booking.createdAt && booking.createdAt.toMillis() < cliente.firstContactAt.toMillis()) {
      cliente.firstContactAt = booking.createdAt;
    }
    
    // Aggiorna lastInteractionAt se questo booking è più recente
    const bookingUpdatedAt = booking.updatedAt || booking.createdAt;
    if (bookingUpdatedAt && bookingUpdatedAt.toMillis() > cliente.lastInteractionAt.toMillis()) {
      cliente.lastInteractionAt = bookingUpdatedAt;
    }
  }
  
  console.log(`✅ Aggregati ${clientiMap.size} clienti unici da ${bookingsSnapshot.size} bookings\n`);
  
  // ========================================
  // STEP 2: Aggrega da orders
  // ========================================
  console.log('💰 Step 2: Aggregazione da orders...');
  const ordersSnapshot = await db.collection('orders').get();
  
  for (const doc of ordersSnapshot.docs) {
    const order = doc.data();
    const email = normalizeEmail(order.emailCliente || 'nessuna_email@nd.com');
    
    if (!clientiMap.has(email)) {
      // Cliente nuovo trovato solo in orders
      const nomeCompleto = order.nomeCliente || 'N/D';
      const [nome, ...cognomeParts] = nomeCompleto.split(' ');
      const cognome = cognomeParts.join(' ') || 'N/D';
      
      clientiMap.set(email, {
        email,
        nome,
        cognome,
        whatsapp: order.whatsappCliente,
        bookingIds: [],
        orderIds: [],
        galleryIds: [],
        firstContactAt: order.createdAt || Timestamp.now(),
        lastInteractionAt: order.updatedAt || order.createdAt || Timestamp.now(),
        totalRevenue: 0,
        outstandingBalance: 0,
        totalOrders: 0,
      });
    }
    
    const cliente = clientiMap.get(email)!;
    cliente.orderIds.push(doc.id);
    cliente.totalOrders++;
    
    // Aggiungi dati finanziari
    cliente.totalRevenue += order.acconto || 0;
    cliente.outstandingBalance += order.saldo || 0;
    
    // Aggiorna date
    if (order.createdAt && order.createdAt.toMillis() < cliente.firstContactAt.toMillis()) {
      cliente.firstContactAt = order.createdAt;
    }
    
    const orderUpdatedAt = order.updatedAt || order.createdAt;
    if (orderUpdatedAt && orderUpdatedAt.toMillis() > cliente.lastInteractionAt.toMillis()) {
      cliente.lastInteractionAt = orderUpdatedAt;
    }
  }
  
  console.log(`✅ Processati ${ordersSnapshot.size} orders. Totale clienti unici: ${clientiMap.size}\n`);
  
  // ========================================
  // STEP 3: Aggrega da galleries (opzionale)
  // ========================================
  console.log('🖼️ Step 3: Aggregazione da galleries...');
  const galleriesSnapshot = await db.collection('galleries').get();
  
  for (const doc of galleriesSnapshot.docs) {
    const gallery = doc.data();
    
    // Cerca email cliente in gallery metadata
    const emailCliente = gallery.emailCliente || gallery.email;
    if (emailCliente) {
      const email = normalizeEmail(emailCliente);
      
      if (clientiMap.has(email)) {
        const cliente = clientiMap.get(email)!;
        cliente.galleryIds.push(doc.id);
      } else {
        // Nuovo cliente solo da gallery
        const nomeCompleto = gallery.nomeCliente || gallery.name || 'N/D';
        const [nome, ...cognomeParts] = nomeCompleto.split(' ');
        const cognome = cognomeParts.join(' ') || 'N/D';
        
        clientiMap.set(email, {
          email,
          nome,
          cognome,
          bookingIds: [],
          orderIds: [],
          galleryIds: [doc.id],
          firstContactAt: gallery.createdAt || Timestamp.now(),
          lastInteractionAt: gallery.updatedAt || gallery.createdAt || Timestamp.now(),
          totalRevenue: 0,
          outstandingBalance: 0,
          totalOrders: 0,
        });
      }
    }
  }
  
  console.log(`✅ Processate ${galleriesSnapshot.size} galleries. Totale clienti unici: ${clientiMap.size}\n`);
  
  // ========================================
  // STEP 4: Crea documenti clienti
  // ========================================
  console.log('💾 Step 4: Creazione documenti clienti in Firestore...\n');
  
  let created = 0;
  const batch = db.batch();
  const batchSize = 500;
  let batchCount = 0;
  
  for (const [email, source] of clientiMap.entries()) {
    const clienteRef = db.collection('clienti').doc();
    
    // Determina status basato su interazioni
    let status: 'lead' | 'prospect' | 'cliente_attivo' | 'archiviato' = 'lead';
    if (source.totalOrders > 0) {
      status = 'cliente_attivo';
    } else if (source.bookingIds.length > 0) {
      status = 'prospect';
    }
    
    const clienteData = {
      nome: source.nome || 'N/D',
      cognome: source.cognome || 'N/D',
      email: source.email,
      cellulare1: source.cellulare1 || source.whatsapp || 'N/D',
      whatsapp: source.whatsapp || 'N/D',
      sourceRefs: {
        bookingIds: source.bookingIds,
        orderIds: source.orderIds,
        galleryIds: source.galleryIds,
      },
      lifecycle: {
        firstContactAt: source.firstContactAt,
        lastInteractionAt: source.lastInteractionAt,
        status,
      },
      financials: {
        totalRevenue: source.totalRevenue,
        outstandingBalance: source.outstandingBalance,
        totalOrders: source.totalOrders,
      },
      tags: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    
    batch.set(clienteRef, clienteData);
    batchCount++;
    created++;
    
    // Commit batch ogni 500 documenti (limite Firestore)
    if (batchCount >= batchSize) {
      await batch.commit();
      console.log(`  ✅ Committati ${created} clienti...`);
      batchCount = 0;
    }
  }
  
  // Commit batch finale
  if (batchCount > 0) {
    await batch.commit();
  }
  
  console.log(`\n✅ Migrazione completata!`);
  console.log(`📊 Statistiche:`);
  console.log(`   - Clienti totali creati: ${created}`);
  console.log(`   - Bookings processati: ${bookingsSnapshot.size}`);
  console.log(`   - Orders processati: ${ordersSnapshot.size}`);
  console.log(`   - Galleries processate: ${galleriesSnapshot.size}`);
  
  // Stats per status
  const statsMap = new Map<string, number>();
  for (const source of clientiMap.values()) {
    let status: string = 'lead';
    if (source.totalOrders > 0) status = 'cliente_attivo';
    else if (source.bookingIds.length > 0) status = 'prospect';
    
    statsMap.set(status, (statsMap.get(status) || 0) + 1);
  }
  
  console.log(`\n📈 Distribuzione per status:`);
  for (const [status, count] of statsMap.entries()) {
    console.log(`   - ${status}: ${count}`);
  }
}

// Esegui migrazione
migrateClienti()
  .then(() => {
    console.log('\n🎉 Migrazione completata con successo!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Errore durante la migrazione:', error);
    process.exit(1);
  });
