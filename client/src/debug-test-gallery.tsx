// Debug script per verificare la galleria "test"
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './lib/firebase';

export async function debugTestGallery() {
  try {
    const galleriesRef = collection(db, "galleries");
    const q = query(galleriesRef, where("code", "==", "test"));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log('🔍 Galleria "test" non trovata');
      return;
    }

    const galleryData = querySnapshot.docs[0].data();
    console.log('🔍 Galleria "test" trovata:');
    console.log('📝 Nome:', galleryData.name);
    console.log('🔐 Ha password:', !!galleryData.password);
    console.log('🛡️ requiresSecurityQuestion:', galleryData.requiresSecurityQuestion);
    console.log('❓ securityQuestionType:', galleryData.securityQuestionType);
    console.log('📝 securityQuestionCustom:', galleryData.securityQuestionCustom);
    console.log('✅ securityAnswer:', galleryData.securityAnswer ? '[PRESENTE]' : '[ASSENTE]');
    console.log('📊 Dati completi:', galleryData);

  } catch (error) {
    console.error('❌ Errore nel debug:', error);
  }
}