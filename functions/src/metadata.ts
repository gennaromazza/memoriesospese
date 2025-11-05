import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps?.length) admin.initializeApp();

// ✅ CORS Configuration - v1 Setup
const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:3000",
  "https://gennaromazzacane.it",
  "https://www.gennaromazzacane.it"
]);

// Helper per verificare se origin è consentito
function isOriginAllowed(origin: string): boolean {
  return allowedOrigins.has(origin) || 
         origin.includes('.replit.dev') || 
         origin.includes('replit.app');
}

/**
 * Cloud Function per recuperare metadata galleria sicuri (senza password)
 * Usa SOLO questa function dal client, MAI query Firestore dirette
 * 
 * REGIONE: us-central1 (deve corrispondere al client)
 * TIPO: onRequest con CORS manuale (v1)
 */
export const getGalleryMetadata = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    try {
      // ✅ CORS Headers - Gestione manuale per v1
      const origin = req.headers.origin || '';
      const allowOrigin = isOriginAllowed(origin) ? origin : '*';

      // Gestione preflight OPTIONS
      if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Origin', allowOrigin);
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.set('Access-Control-Max-Age', '3600');
        res.status(204).send('');
        return;
      }

      // Set CORS per risposta principale
      res.set('Access-Control-Allow-Origin', allowOrigin);
      res.set('Access-Control-Allow-Credentials', 'true');

      // Solo POST accettato
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const { data } = req.body;
      const galleryCode = String(data?.galleryCode || '').trim();
      
      if (!galleryCode) {
        res.status(400).json({ error: 'galleryCode is required' });
        return;
      }

      const db = admin.firestore();

      // Ricerca per campo "code"
      const byCode = await db.collection('galleries')
        .where('code', '==', galleryCode)
        .limit(1)
        .get();

      const doc = byCode.empty
        ? await db.collection('galleries').doc(galleryCode).get()
        : byCode.docs[0];

      if (!doc || (('exists' in doc) && !doc.exists)) {
        functions.logger.warn('Gallery not found:', { galleryCode });
        res.status(404).json({ error: 'Gallery not found' });
        return;
      }

      const d: any = ('data' in doc) ? (doc as any).data() : (doc as any).data();
      if (!d) {
        res.status(500).json({ error: 'Gallery data is empty' });
        return;
      }

      const hasQ = d?.requiresSecurityQuestion && d?.securityQuestionType && d?.securityAnswer;
      const questionMap: Record<string, string> = {
        groomName: 'Nome dello sposo',
        brideName: 'Nome della sposa',
        weddingDate: 'Data del matrimonio (gg/mm/aaaa)',
        weddingLocation: 'Luogo del matrimonio',
        custom: d?.customSecurityQuestion || 'Domanda personalizzata'
      };

      const result = {
        id: doc.id,
        name: d?.name,
        code: d?.code || galleryCode,
        requiresSecurityQuestion: !!hasQ,
        securityQuestion: hasQ ? questionMap[d.securityQuestionType] : undefined
      };

      functions.logger.info('Gallery metadata retrieved:', { galleryCode, hasSecurityQuestion: !!hasQ });
      res.status(200).json({ result });
      
    } catch (err: any) {
      functions.logger.error('Error retrieving gallery metadata:', err);
      res.status(500).json({ error: 'Failed to retrieve gallery metadata' });
    }
  });