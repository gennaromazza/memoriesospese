/**
 * Script per aggiornare retroattivamente commenti e voice memos
 * con le immagini profilo degli utenti esistenti
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc, query, where } = require('firebase/firestore');

// Configurazione Firebase (usa le stesse variabili d'ambiente del client)
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyBvOTzlxJrGpTXZjCGUjNZdPNkZu-I8sTs",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "wedding-gallery-397b6.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "wedding-gallery-397b6",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "wedding-gallery-397b6.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:123456789:web:abcdef"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function updateProfileImages() {
  console.log('🔄 Inizio aggiornamento immagini profilo...');
  
  try {
    // 1. Ottieni tutti i profili utente con immagine
    console.log('📊 Caricamento profili utente...');
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const userProfiles = new Map();
    
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.profileImageUrl) {
        userProfiles.set(userData.uid, userData.profileImageUrl);
      }
    });
    
    console.log(`✅ Trovati ${userProfiles.size} utenti con immagine profilo`);
    
    // 2. Aggiorna commenti
    console.log('🔄 Aggiornamento commenti...');
    const commentsSnapshot = await getDocs(collection(db, 'comments'));
    let commentsUpdated = 0;
    
    for (const commentDoc of commentsSnapshot.docs) {
      const commentData = commentDoc.data();
      
      // Cerca l'immagine profilo per questo utente
      const profileImageUrl = userProfiles.get(commentData.userId);
      
      if (profileImageUrl && !commentData.userProfileImageUrl) {
        await updateDoc(doc(db, 'comments', commentDoc.id), {
          userProfileImageUrl: profileImageUrl
        });
        commentsUpdated++;
        console.log(`✅ Aggiornato commento per ${commentData.userName}`);
      }
    }
    
    console.log(`✅ Aggiornati ${commentsUpdated} commenti`);
    
    // 3. Aggiorna voice memos
    console.log('🔄 Aggiornamento voice memos...');
    const voiceMemosSnapshot = await getDocs(collection(db, 'voiceMemos'));
    let voiceMemosUpdated = 0;
    
    for (const voiceMemoDoc of voiceMemosSnapshot.docs) {
      const voiceMemoData = voiceMemoDoc.data();
      
      // Cerca l'immagine profilo per questo utente (usa userEmail come chiave)
      let profileImageUrl = null;
      
      // Cerca per email negli utenti
      for (const [uid, imageUrl] of userProfiles.entries()) {
        // Trova l'utente corrispondente
        const userQuery = query(collection(db, 'users'), where('uid', '==', uid));
        const userSnapshot = await getDocs(userQuery);
        
        if (!userSnapshot.empty) {
          const userData = userSnapshot.docs[0].data();
          if (userData.email === voiceMemoData.userEmail || userData.email === voiceMemoData.guestEmail) {
            profileImageUrl = imageUrl;
            break;
          }
        }
      }
      
      if (profileImageUrl && !voiceMemoData.userProfileImageUrl) {
        await updateDoc(doc(db, 'voiceMemos', voiceMemoDoc.id), {
          userProfileImageUrl: profileImageUrl,
          guestEmail: voiceMemoData.userEmail || voiceMemoData.guestEmail // Aggiungi guestEmail se mancante
        });
        voiceMemosUpdated++;
        console.log(`✅ Aggiornato voice memo per ${voiceMemoData.guestName}`);
      }
    }
    
    console.log(`✅ Aggiornati ${voiceMemosUpdated} voice memos`);
    
    console.log('🎉 Aggiornamento completato!');
    console.log(`📊 Riepilogo:`);
    console.log(`   - Profili utente trovati: ${userProfiles.size}`);
    console.log(`   - Commenti aggiornati: ${commentsUpdated}`);
    console.log(`   - Voice memos aggiornati: ${voiceMemosUpdated}`);
    
  } catch (error) {
    console.error('❌ Errore durante l\'aggiornamento:', error);
  }
}

// Esegui solo se chiamato direttamente
if (require.main === module) {
  updateProfileImages().then(() => {
    console.log('✅ Script terminato');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Script fallito:', error);
    process.exit(1);
  });
}

module.exports = { updateProfileImages };