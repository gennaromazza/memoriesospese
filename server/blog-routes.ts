import express, { type NextFunction, type Response } from 'express';
import sharp from 'sharp';
import { authenticateFirebase } from './email-routes.js';
import { storage } from './firebase-admin.js';
import { downloadPublicImage } from './safe-image-download.js';

const router = express.Router();
const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];
const STORAGE_PATH_PATTERN = /^blog-images\/[a-zA-Z0-9_-]{10,128}\/[a-zA-Z0-9_-]{10,128}\.jpg$/;

function requireAdmin(req: any, res: Response, next: NextFunction) {
  if (!ADMIN_EMAILS.includes(req.user?.email || '')) {
    return res.status(403).json({ error: 'Accesso negato: solo admin' });
  }
  next();
}

router.post('/rehost-image', authenticateFirebase, requireAdmin, async (req: any, res) => {
  const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : '';
  const storagePath = typeof req.body?.storagePath === 'string' ? req.body.storagePath.trim() : '';
  if (!imageUrl || !STORAGE_PATH_PATTERN.test(storagePath)) {
    return res.status(400).json({ error: 'imageUrl o storagePath non valido' });
  }

  const bucket = storage.bucket();
  const file = bucket.file(storagePath);
  let clientDisconnected = false;
  res.on('close', () => {
    if (!res.writableEnded) clientDisconnected = true;
  });

  try {
    const downloaded = await downloadPublicImage(imageUrl);
    const normalizedImage = await sharp(downloaded.buffer, {
      limitInputPixels: 40_000_000,
      failOn: 'error',
    })
      .rotate()
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();

    if (normalizedImage.length > 10 * 1024 * 1024) {
      throw new Error('Immagine convertita troppo grande');
    }

    await file.save(normalizedImage, {
      contentType: 'image/jpeg',
      resumable: false,
      metadata: {
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: { originalUrl: imageUrl },
      },
    });
    await file.makePublic();
    if (clientDisconnected) {
      await file.delete({ ignoreNotFound: true });
      return;
    }

    const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
    return res.json({ success: true, url, storagePath });
  } catch (error: any) {
    await file.delete({ ignoreNotFound: true }).catch(cleanupError => {
      console.warn('Cleanup upload WordPress fallito:', storagePath, cleanupError);
    });
    console.error('Rehost immagine WordPress fallito:', error);
    return res.status(422).json({
      error: error?.message || 'Impossibile importare l’immagine',
    });
  }
});

export default router;