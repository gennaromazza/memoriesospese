import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './lib/firebase';

// Debug diretto per la galleria "test"
export async function debugGalleryTest() {
  console.log('🔍 DEBUGGING GALLERIA TEST');
  
  try {
    const galleriesRef = collection(db, "galleries");
    const q = query(galleriesRef, where("code", "==", "test"));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log('❌ Galleria "test" NON TROVATA');
      return;
    }

    const galleryDoc = querySnapshot.docs[0];
    const galleryData = galleryDoc.data();
    
    console.log('✅ Galleria "test" TROVATA');
    console.log('📋 ID:', galleryDoc.id);
    console.log('📋 Nome:', galleryData.name);
    console.log('🔐 Password:', galleryData.password);
    console.log('🛡️ requiresSecurityQuestion:', galleryData.requiresSecurityQuestion);
    console.log('❓ securityQuestionType:', galleryData.securityQuestionType);
    console.log('📝 securityQuestionCustom:', galleryData.securityQuestionCustom);
    console.log('✅ securityAnswer:', galleryData.securityAnswer ? '[PRESENTE]' : '[ASSENTE]');
    console.log('📊 DATI COMPLETI GALLERIA:', galleryData);
    
    // Verifica logica
    if (!galleryData.requiresSecurityQuestion) {
      console.log('⚠️ PROBLEMA: requiresSecurityQuestion è FALSE o undefined');
    } else {
      console.log('✅ OK: requiresSecurityQuestion è TRUE');
    }
    
  } catch (error) {
    console.error('❌ ERRORE DEBUG:', error);
  }
}

// Chiamalo dalla console del browser con: debugGalleryTest()
(window as any).debugGalleryTest = debugGalleryTest;