
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import https from 'https';
import http from 'http';

// Configurazione Firebase (usa le stesse credenziali del client)
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyA4mw3dKOvcDBxgIJOo-r-4yUmyv0knxME",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "wedding-gallery-397b6.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "wedding-gallery-397b6",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "wedding-gallery-397b6.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1072998290999",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:1072998290999:web:8e0d19440d86d15f4f11b2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// URL del tuo vecchio sito WordPress
const OLD_SITE_URL = 'https://gennaromazzacane.it';

interface ImageMatch {
  oldUrl: string;
  newUrl?: string;
  error?: string;
}

/**
 * Scarica un'immagine da un URL
 */
async function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Estrae tutti gli URL delle immagini da un contenuto HTML
 */
function extractImageUrls(content: string): string[] {
  const imageRegex = /<img[^>]+src="([^">]+)"/g;
  const urls: string[] = [];
  let match;

  while ((match = imageRegex.exec(content)) !== null) {
    urls.push(match[1]);
  }

  return urls;
}

/**
 * Carica un'immagine su Firebase Storage
 */
async function uploadToFirebase(buffer: Buffer, fileName: string): Promise<string> {
  const storageRef = ref(storage, `blog-migrated-images/${fileName}`);
  
  // Determina il content type dal nome file
  let contentType = 'image/jpeg';
  if (fileName.endsWith('.png')) contentType = 'image/png';
  if (fileName.endsWith('.gif')) contentType = 'image/gif';
  if (fileName.endsWith('.webp')) contentType = 'image/webp';

  await uploadBytes(storageRef, buffer, {
    contentType
  });

  return await getDownloadURL(storageRef);
}

/**
 * Migra un'immagine dal vecchio sito a Firebase
 */
async function migrateImage(oldUrl: string): Promise<ImageMatch> {
  try {
    console.log(`Scaricamento: ${oldUrl}`);
    
    // Scarica l'immagine
    const imageBuffer = await downloadImage(oldUrl);
    
    // Estrai il nome file dall'URL
    const urlParts = oldUrl.split('/');
    const fileName = urlParts[urlParts.length - 1] || `image_${Date.now()}.jpg`;
    
    // Upload su Firebase
    const newUrl = await uploadToFirebase(imageBuffer, fileName);
    
    console.log(`✓ Migrata: ${fileName}`);
    return { oldUrl, newUrl };
  } catch (error) {
    console.error(`✗ Errore con ${oldUrl}:`, error);
    return { oldUrl, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Aggiorna il contenuto di un post sostituendo i vecchi URL con i nuovi
 */
function updateContent(content: string, migrations: ImageMatch[]): string {
  let updatedContent = content;
  
  migrations.forEach(({ oldUrl, newUrl }) => {
    if (newUrl) {
      updatedContent = updatedContent.replace(new RegExp(oldUrl, 'g'), newUrl);
    }
  });
  
  return updatedContent;
}

/**
 * Funzione principale
 */
async function migrateBlogImages() {
  try {
    console.log('🚀 Inizio migrazione immagini blog...\n');

    // Recupera tutti i post importati da WordPress
    const postsRef = collection(db, 'blogPosts');
    const snapshot = await getDocs(postsRef);
    
    console.log(`📝 Trovati ${snapshot.size} post totali\n`);

    let totalMigrated = 0;
    let totalErrors = 0;

    for (const postDoc of snapshot.docs) {
      const post = postDoc.data();
      
      // Salta post senza wpPostId (non importati da WordPress)
      if (!post.wpPostId) {
        continue;
      }

      console.log(`\n📄 Processando: "${post.title}" (WP ID: ${post.wpPostId})`);

      // Estrai URL immagini dal contenuto
      const imageUrls = extractImageUrls(post.content);
      
      // Filtra solo immagini dal vecchio sito
      const oldSiteImages = imageUrls.filter(url => 
        url.includes(OLD_SITE_URL) || url.startsWith('/wp-content/')
      );

      if (oldSiteImages.length === 0) {
        console.log('   Nessuna immagine da migrare');
        continue;
      }

      console.log(`   Trovate ${oldSiteImages.length} immagini da migrare`);

      // Migra ogni immagine
      const migrations: ImageMatch[] = [];
      for (const imageUrl of oldSiteImages) {
        // Costruisci URL completo se è relativo
        const fullUrl = imageUrl.startsWith('http') 
          ? imageUrl 
          : `${OLD_SITE_URL}${imageUrl}`;
        
        const result = await migrateImage(fullUrl);
        migrations.push(result);
        
        if (result.newUrl) {
          totalMigrated++;
        } else {
          totalErrors++;
        }
      }

      // Aggiorna il contenuto del post
      const updatedContent = updateContent(post.content, migrations);
      
      // Aggiorna anche coverImage se necessario
      let updatedCoverImage = post.coverImage;
      if (post.coverImage && post.coverImage.includes(OLD_SITE_URL)) {
        const coverMigration = await migrateImage(post.coverImage);
        if (coverMigration.newUrl) {
          updatedCoverImage = coverMigration.newUrl;
          console.log(`   ✓ Copertina migrata`);
        }
      }

      // Salva le modifiche
      await updateDoc(doc(db, 'blogPosts', postDoc.id), {
        content: updatedContent,
        coverImage: updatedCoverImage,
        updatedAt: new Date()
      });

      console.log(`   ✓ Post aggiornato con successo`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ Migrazione completata!');
    console.log(`📊 Statistiche:`);
    console.log(`   - Immagini migrate: ${totalMigrated}`);
    console.log(`   - Errori: ${totalErrors}`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Errore durante la migrazione:', error);
    process.exit(1);
  }
}

// Esegui lo script
migrateBlogImages().then(() => {
  console.log('\n✨ Script completato');
  process.exit(0);
}).catch(error => {
  console.error('💥 Errore fatale:', error);
  process.exit(1);
});
