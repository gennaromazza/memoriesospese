"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGalleryMetadata = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
if (!admin.apps.length)
    admin.initializeApp();
exports.getGalleryMetadata = functions.https.onCall(async (data) => {
    try {
        const galleryCode = String(data?.galleryCode || '').trim();
        if (!galleryCode) {
            throw new functions.https.HttpsError('invalid-argument', 'galleryCode is required');
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
            throw new functions.https.HttpsError('not-found', 'Gallery not found', { galleryCode });
        }
        const d = ('data' in doc) ? doc.data() : doc.data();
        if (!d)
            throw new functions.https.HttpsError('internal', 'Gallery data is empty');
        const hasQ = d?.requiresSecurityQuestion && d?.securityQuestionType && d?.securityAnswer;
        const questionMap = {
            groomName: 'Nome dello sposo',
            brideName: 'Nome della sposa',
            weddingDate: 'Data del matrimonio (gg/mm/aaaa)',
            weddingLocation: 'Luogo del matrimonio',
            custom: d?.customSecurityQuestion || 'Domanda personalizzata'
        };
        return {
            id: ('id' in doc && doc.id) ? doc.id : galleryCode,
            name: d?.name,
            code: d?.code || galleryCode,
            requiresSecurityQuestion: !!hasQ,
            securityQuestion: hasQ ? questionMap[d.securityQuestionType] : undefined
        };
    }
    catch (err) {
        if (err instanceof functions.https.HttpsError)
            throw err;
        throw new functions.https.HttpsError('internal', 'Failed to retrieve gallery metadata');
    }
});
//# sourceMappingURL=metadata.js.map