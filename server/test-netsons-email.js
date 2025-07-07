#!/usr/bin/env node

/**
 * Test per verificare il sistema email Netsons SMTP
 * Questo script testa la configurazione centralizzata
 */

import { sendWelcomeEmail, sendNewPhotosNotification, verifyEmailConfig } from './mailer';

async function testNetsonsEmail() {
  console.log('🧪 Test Sistema Email Netsons SMTP');
  console.log('=' .repeat(50));
  
  try {
    // 1. Verifica configurazione SMTP
    console.log('1️⃣ Verifica configurazione SMTP...');
    await verifyEmailConfig();
    console.log('✅ Configurazione SMTP verificata');
    
    // 2. Test email di benvenuto
    console.log('\n2️⃣ Test email di benvenuto...');
    const welcomeResult = await sendWelcomeEmail(
      'gennaro.mazzacane@gmail.com',
      'Test Gallery Wedding',
      'Test System'
    );
    
    if (welcomeResult) {
      console.log('✅ Email di benvenuto inviata con successo');
    } else {
      console.log('❌ Errore invio email di benvenuto');
    }
    
    // 3. Test notifica nuove foto
    console.log('\n3️⃣ Test notifica nuove foto...');
    const notificationResult = await sendNewPhotosNotification(
      'gennaro.mazzacane@gmail.com',
      'Test Gallery Wedding',
      3,
      'Sistema Test',
      'https://wedgallery.test/gallery/123'
    );
    
    if (notificationResult) {
      console.log('✅ Notifica nuove foto inviata con successo');
    } else {
      console.log('❌ Errore invio notifica nuove foto');
    }
    
    console.log('\n🎉 Test completato!');
    console.log('📧 Controlla la inbox per verificare la ricezione');
    
  } catch (error) {
    console.error('\n❌ Errore durante il test:', error);
    console.log('\n🔧 Possibili soluzioni:');
    console.log('   • Verifica credenziali Netsons');
    console.log('   • Controlla connessione internet');
    console.log('   • Verifica firewall/antivirus');
  }
}

// Esegui il test se chiamato direttamente
if (import.meta.url === `file://${process.argv[1]}`) {
  testNetsonsEmail();
}