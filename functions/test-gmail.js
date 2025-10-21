const admin = require('firebase-admin');
const { getFunctions, httpsCallable } = require('firebase/functions');

// Test rapido della configurazione Gmail
async function testGmail() {
  try {
    console.log('🧪 Test configurazione Gmail...');
    
    const functions = getFunctions(undefined, 'us-central1');
    const testEmail = httpsCallable(functions, 'testEmailConfiguration');
    
    const result = await testEmail({ testRecipient: 'gennaro.mazzacane@gmail.com' });
    console.log('✅ Email inviata con successo:', result.data);
  } catch (error) {
    console.error('❌ Errore:', error);
  }
}

testGmail();
