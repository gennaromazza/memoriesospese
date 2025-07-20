import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as Papa from 'papaparse';

const db = admin.firestore();

// Export gallery access data to CSV (Pro/Premium only)
export const exportGalleryAccessCSV = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Devi essere autenticato per esportare i dati'
    );
  }

  const { galleryId } = data;
  const userId = context.auth.uid;

  try {
    // Check user subscription
    const subscriptionDoc = await db.doc(`users/${userId}/subscription/current`).get();
    const subscription = subscriptionDoc.data();

    if (!subscription || !subscription.active || 
        (subscription.plan !== 'pro' && subscription.plan !== 'premium')) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'L\'esportazione CSV è disponibile solo per gli utenti Pro e Premium'
      );
    }

    // Get gallery data
    const galleryDoc = await db.doc(`galleries/${galleryId}`).get();
    if (!galleryDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Galleria non trovata');
    }

    const gallery = galleryDoc.data();
    
    // Check if user owns the gallery
    if (gallery?.userId !== userId) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Non hai i permessi per esportare i dati di questa galleria'
      );
    }

    // Get all access requests from gallery-access collection
    const accessSnapshot = await db.collection('gallery-access')
      .where('galleryId', '==', galleryId)
      .orderBy('createdAt', 'desc')
      .get();

    if (accessSnapshot.empty) {
      throw new functions.https.HttpsError(
        'not-found', 
        'Nessun accesso registrato per questa galleria'
      );
    }

    // Prepare data for CSV
    const csvData = accessSnapshot.docs.map(doc => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate?.() || new Date();
      
      return {
        'Email': data.email || '',
        'Nome': data.name || '',
        'Data Richiesta': createdAt.toLocaleDateString('it-IT'),
        'Ora Richiesta': createdAt.toLocaleTimeString('it-IT'),
        'Accesso Garantito': data.accessGranted ? 'Sì' : 'No',
        'Metodo Accesso': data.accessMethod || 'password',
        'Note': data.notes || ''
      };
    });

    // Generate CSV
    const csv = Papa.unparse(csvData, {
      header: true,
      delimiter: ',',
      newline: '\n',
      quotes: true,
    });

    // Add BOM for Excel compatibility
    const csvWithBom = '\ufeff' + csv;

    // Return base64 encoded CSV
    const base64Csv = Buffer.from(csvWithBom).toString('base64');

    return {
      csv: base64Csv,
      fileName: `accessi_${gallery?.name?.replace(/[^a-z0-9]/gi, '_') || galleryId}_${new Date().toISOString().split('T')[0]}.csv`,
      recordCount: csvData.length,
    };
  } catch (error: any) {
    console.error('Error exporting gallery access CSV:', error);
    throw new functions.https.HttpsError(
      'internal',
      `Errore esportazione CSV: ${error.message}`
    );
  }
});