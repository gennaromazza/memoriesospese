import { db } from './server/firebase-admin';

async function fixRemaining() {
  console.log('🔧 CORREZIONE QUOTE RIMANENTI\n');
  
  const problematicQuoteIds = [
    '1cjz403zqy8ha3soyf4uio',
    '1e5r2xok6gvpa04rqcc41',
    '7klziu2a08uc4z8a1gzxp5',
    '9amo1c406ya9wxgm7ipf4m',
    'apji739ga98hjjoj7bufvo',
    'ek96g3ydkoii0scs6bqzs',
    'gek6n1km2dn23ruko3cpsdh',
    'h0uxhf0aevcuiqefdgs12o',
    'muxceh03pbwr36wj68tqn',
    'q1w13367b7ht41zhhio9en',
    'ygug62xosyrnjq3c3v9cq'
  ];
  
  for (const quoteId of problematicQuoteIds) {
    const quoteDoc = await db.collection('quotes').doc(quoteId).get();
    if (!quoteDoc.exists) {
      console.log(`❌ ${quoteId}: non trovato`);
      continue;
    }
    
    const quote = quoteDoc.data()!;
    console.log(`\n📋 ${quoteId}:`);
    console.log(`   Status: ${quote.status}`);
    console.log(`   signedAt (root): ${quote.signedAt || 'MANCANTE'}`);
    console.log(`   signature: ${quote.signature ? JSON.stringify(quote.signature) : 'MANCANTE'}`);
    console.log(`   signature.signedAt: ${quote.signature?.signedAt || 'MANCANTE'}`);
    
    // Determine signedAt value
    let signedAtValue = quote.signature?.signedAt;
    
    if (!signedAtValue) {
      // Se non c'è signature.signedAt, usa createdAt o updatedAt
      signedAtValue = quote.updatedAt || quote.createdAt || new Date();
      console.log(`   → Uso data alternativa: ${signedAtValue}`);
    }
    
    // Fix the quote
    try {
      await db.collection('quotes').doc(quoteId).update({
        signedAt: signedAtValue,
        updatedAt: new Date()
      });
      console.log(`   ✅ signedAt impostato`);
    } catch (e: any) {
      console.log(`   ❌ Errore: ${e.message}`);
    }
  }
  
  console.log('\n✨ Correzione completata!');
}

fixRemaining().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
