"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGalleryMetadataHttp = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors");
if (!admin.apps.length)
    admin.initializeApp();
const corsHandler = cors({
    origin: [
        'https://gennaromazzacane.it',
        'https://www.gennaromazzacane.it',
        /\.replit\.dev$/ // consentito in sviluppo
    ],
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
});
exports.getGalleryMetadataHttp = functions.https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
        try {
            if (req.method === 'OPTIONS')
                return res.status(204).end();
            if (req.method !== 'POST')
                return res.status(405).json({ error: 'Method not allowed' });
            const galleryCode = String(req.body?.galleryCode || '').trim();
            if (!galleryCode)
                return res.status(400).json({ error: 'invalid-argument', message: 'galleryCode is required' });
            const db = admin.firestore();
            const byCode = await db.collection('galleries').where('code', '==', galleryCode).limit(1).get();
            const doc = byCode.empty ? await db.collection('galleries').doc(galleryCode).get() : byCode.docs[0];
            if (!doc || (('exists' in doc) && !doc.exists)) {
                return res.status(404).json({ error: 'not-found' });
            }
            const d = ('data' in doc) ? doc.data() : doc.data();
            const hasQ = d?.requiresSecurityQuestion && d?.securityQuestionType && d?.securityAnswer;
            const qmap = {
                groomName: 'Nome dello sposo',
                brideName: 'Nome della sposa',
                weddingDate: 'Data del matrimonio (gg/mm/aaaa)',
                weddingLocation: 'Luogo del matrimonio',
                custom: d?.customSecurityQuestion || 'Domanda personalizzata'
            };
            return res.json({
                id: ('id' in doc && doc.id) ? doc.id : galleryCode,
                name: d?.name,
                code: d?.code || galleryCode,
                requiresSecurityQuestion: !!hasQ,
                securityQuestion: hasQ ? qmap[d.securityQuestionType] : undefined
            });
        }
        catch (e) {
            functions.logger.error('getGalleryMetadataHttp FAIL', e);
            return res.status(500).json({ error: 'internal' });
        }
    });
});
//# sourceMappingURL=metadata-http.js.map