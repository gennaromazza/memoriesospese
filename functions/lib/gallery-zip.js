"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateGalleryZip = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const archiver = require("archiver");
const db = admin.firestore();
const storage = admin.storage();
const bucket = storage.bucket();
// Generate ZIP file for gallery download (Premium only)
exports.generateGalleryZip = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Devi essere autenticato per scaricare la galleria');
    }
    const { galleryId } = data;
    const userId = context.auth.uid;
    try {
        // Check user subscription
        const subscriptionDoc = await db.doc(`users/${userId}/subscription/current`).get();
        const subscription = subscriptionDoc.data();
        if (!subscription || subscription.plan !== 'premium' || !subscription.active) {
            throw new functions.https.HttpsError('permission-denied', 'Il download ZIP è disponibile solo per gli utenti Premium');
        }
        // Get gallery data
        const galleryDoc = await db.doc(`galleries/${galleryId}`).get();
        if (!galleryDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Galleria non trovata');
        }
        const gallery = galleryDoc.data();
        // Check if user owns the gallery
        if (gallery?.userId !== userId) {
            throw new functions.https.HttpsError('permission-denied', 'Non hai i permessi per scaricare questa galleria');
        }
        // Get all photos from the gallery
        const photosSnapshot = await db.collection('photos')
            .where('galleryId', '==', galleryId)
            .get();
        if (photosSnapshot.empty) {
            throw new functions.https.HttpsError('not-found', 'Nessuna foto trovata nella galleria');
        }
        // Create ZIP archive
        const archive = archiver('zip', {
            zlib: { level: 9 } // Maximum compression
        });
        // Create a temporary file in Cloud Storage
        const zipFileName = `gallery-downloads/${galleryId}/${Date.now()}-gallery.zip`;
        const zipFile = bucket.file(zipFileName);
        const zipStream = zipFile.createWriteStream({
            metadata: {
                contentType: 'application/zip',
                metadata: {
                    firebaseStorageDownloadTokens: admin.firestore.FieldValue.serverTimestamp(),
                }
            }
        });
        // Pipe archive to Cloud Storage
        archive.pipe(zipStream);
        // Add photos to archive
        let photoCount = 0;
        for (const doc of photosSnapshot.docs) {
            const photo = doc.data();
            if (photo.url) {
                try {
                    // Extract file path from URL
                    const urlParts = new URL(photo.url);
                    const filePath = decodeURIComponent(urlParts.pathname.split('/o/')[1].split('?')[0]);
                    // Get file from storage
                    const file = bucket.file(filePath);
                    const [exists] = await file.exists();
                    if (exists) {
                        const readStream = file.createReadStream();
                        const fileName = photo.fileName || `photo_${photoCount + 1}.jpg`;
                        archive.append(readStream, { name: fileName });
                        photoCount++;
                    }
                }
                catch (error) {
                    console.error(`Error adding photo to archive: ${error}`);
                }
            }
        }
        // Finalize archive
        await archive.finalize();
        // Wait for upload to complete
        await new Promise((resolve, reject) => {
            zipStream.on('finish', resolve);
            zipStream.on('error', reject);
        });
        // Generate signed URL valid for 5 minutes
        const [downloadUrl] = await zipFile.getSignedUrl({
            action: 'read',
            expires: Date.now() + 5 * 60 * 1000, // 5 minutes
        });
        // Schedule deletion after 5 minutes
        setTimeout(async () => {
            try {
                await zipFile.delete();
                console.log(`Deleted temporary ZIP file: ${zipFileName}`);
            }
            catch (error) {
                console.error(`Error deleting ZIP file: ${error}`);
            }
        }, 5 * 60 * 1000);
        return {
            downloadUrl,
            photoCount,
            expiresIn: 5 * 60, // seconds
        };
    }
    catch (error) {
        console.error('Error generating gallery ZIP:', error);
        throw new functions.https.HttpsError('internal', `Errore generazione ZIP: ${error.message}`);
    }
});
//# sourceMappingURL=gallery-zip.js.map