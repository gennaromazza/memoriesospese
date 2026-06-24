/**
 * Backup System - Complete Firestore Data Export/Import
 * 
 * Esporta TUTTE le collezioni Firestore per disaster recovery:
 * - Dati business: clienti, jobs, quotes, orders, bookings, consultations
 * - Gallerie: metadati galleries, photos, comments, voiceMemos
 * - Configurazione: jobTypes, products, settings, templates
 * - Finanze: cashMovements, paymentSchedules, collaboratori
 * - Contenuti: blogPosts, portfolioSelections, coupleStories
 * 
 * Formato export compatibile con AdminLegacyImporter
 */

import express from 'express';
import { db } from './firebase-admin.js';
import { authenticateFirebase } from './email-routes.js';
import { 
  getDriveConnectionStatus, 
  uploadBackupToDrive, 
  listBackupsFromDrive,
  downloadBackupFromDrive,
  deleteBackupFromDrive
} from './google-drive.js';

const router = express.Router();

const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

function requireAdmin(req: any, res: express.Response, next: express.NextFunction) {
  if (!ADMIN_EMAILS.includes(req.user?.email || '')) {
    return res.status(403).json({ error: 'Accesso negato: solo admin' });
  }
  next();
}

interface CollectionExport {
  name: string;
  count: number;
  documents: Array<{ id: string; data: any }>;
}

interface BackupMetadata {
  version: string;
  createdAt: string;
  createdBy: string;
  totalCollections: number;
  totalDocuments: number;
  collections: Record<string, number>;
}

interface SystemBackup {
  metadata: BackupMetadata;
  clienti: CollectionExport;
  jobs: CollectionExport;
  quotes: CollectionExport;
  orders: CollectionExport;
  bookings: CollectionExport;
  consultations: CollectionExport;
  galleries: CollectionExport;
  gallerySecrets: CollectionExport;
  photos: CollectionExport;
  comments: CollectionExport;
  voiceMemos: CollectionExport;
  likes: CollectionExport;
  jobTypes: CollectionExport;
  jobProvenances: CollectionExport;
  products: CollectionExport;
  productCategories: CollectionExport;
  booking_campaigns: CollectionExport;
  contractClauses: CollectionExport;
  quoteTemplates: CollectionExport;
  consultationTemplates: CollectionExport;
  settings: CollectionExport;
  siteContent: CollectionExport;
  blogPosts: CollectionExport;
  portfolioSelections: CollectionExport;
  weddingVideos: CollectionExport;
  coupleStories: CollectionExport;
  faqSets: CollectionExport;
  subscriptions: CollectionExport;
  users: CollectionExport;
  cashMovements: CollectionExport;
  paymentSchedules: CollectionExport;
  collaboratori: CollectionExport;
  jobCollaboratoreAssignments: CollectionExport;
  emailLogs: CollectionExport;
  jobTimeline: CollectionExport;
  quoteAuditLog: CollectionExport;
  passwordRequests: CollectionExport;
  questionnaireTokens: CollectionExport;
}

const COLLECTIONS_TO_BACKUP = [
  'clienti',
  'jobs',
  'quotes',
  'orders',
  'bookings',
  'consultations',
  'galleries',
  'gallerySecrets',
  'photos',
  'comments',
  'voiceMemos',
  'likes',
  'jobTypes',
  'jobProvenances',
  'products',
  'productCategories',
  'booking_campaigns',
  'contractClauses',
  'quoteTemplates',
  'consultationTemplates',
  'settings',
  'siteContent',
  'blogPosts',
  'portfolioSelections',
  'weddingVideos',
  'coupleStories',
  'faqSets',
  'subscriptions',
  'users',
  'cashMovements',
  'paymentSchedules',
  'collaboratori',
  'jobCollaboratoreAssignments',
  'emailLogs',
  'jobTimeline',
  'quoteAuditLog',
  'passwordRequests',
  'questionnaireTokens',
];

function serializeFirestoreData(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }
  
  if (data.toDate && typeof data.toDate === 'function') {
    return { _type: 'timestamp', _value: data.toDate().toISOString() };
  }
  
  if (data._seconds !== undefined && data._nanoseconds !== undefined) {
    const date = new Date(data._seconds * 1000 + data._nanoseconds / 1000000);
    return { _type: 'timestamp', _value: date.toISOString() };
  }
  
  if (Array.isArray(data)) {
    return data.map(item => serializeFirestoreData(item));
  }
  
  if (typeof data === 'object') {
    const result: any = {};
    for (const key of Object.keys(data)) {
      result[key] = serializeFirestoreData(data[key]);
    }
    return result;
  }
  
  return data;
}

async function exportCollection(collectionName: string): Promise<CollectionExport> {
  try {
    const snapshot = await db.collection(collectionName).get();
    const documents: Array<{ id: string; data: any }> = [];
    
    snapshot.forEach(doc => {
      documents.push({
        id: doc.id,
        data: serializeFirestoreData(doc.data()),
      });
    });
    
    return {
      name: collectionName,
      count: documents.length,
      documents,
    };
  } catch (error: any) {
    console.error(`❌ Error exporting collection ${collectionName}:`, error.message);
    return {
      name: collectionName,
      count: 0,
      documents: [],
    };
  }
}

/**
 * GET /api/backup/export
 * Esporta TUTTO il database Firestore in formato JSON
 * Richiede autenticazione admin
 */
router.get('/export', authenticateFirebase, requireAdmin, async (req, res) => {
  try {
    const userEmail = (req as any).user?.email;
    console.log(`📦 Starting full system backup requested by ${userEmail}`);
    
    const startTime = Date.now();
    const backup: Record<string, any> = {};
    let totalDocuments = 0;
    const collectionCounts: Record<string, number> = {};
    
    for (const collectionName of COLLECTIONS_TO_BACKUP) {
      console.log(`  📁 Exporting ${collectionName}...`);
      const exported = await exportCollection(collectionName);
      backup[collectionName] = exported;
      totalDocuments += exported.count;
      collectionCounts[collectionName] = exported.count;
      console.log(`  ✅ ${collectionName}: ${exported.count} documents`);
    }
    
    const metadata: BackupMetadata = {
      version: '2.0.0',
      createdAt: new Date().toISOString(),
      createdBy: userEmail || 'unknown',
      totalCollections: COLLECTIONS_TO_BACKUP.length,
      totalDocuments,
      collections: collectionCounts,
    };
    
    const fullBackup = {
      metadata,
      ...backup,
    };
    
    const elapsedMs = Date.now() - startTime;
    console.log(`✅ Backup completed in ${elapsedMs}ms: ${totalDocuments} documents from ${COLLECTIONS_TO_BACKUP.length} collections`);
    
    const filename = `image-studio-backup-${new Date().toISOString().split('T')[0]}.json`;
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(fullBackup);
    
  } catch (error: any) {
    console.error('❌ Backup export failed:', error);
    res.status(500).json({
      error: 'Backup export failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/backup/status
 * Ritorna statistiche sulle collezioni per preview backup
 */
router.get('/status', authenticateFirebase, requireAdmin, async (req, res) => {
  try {
    const stats: Record<string, number> = {};
    let total = 0;
    
    for (const collectionName of COLLECTIONS_TO_BACKUP) {
      try {
        const snapshot = await db.collection(collectionName).count().get();
        const count = snapshot.data().count;
        stats[collectionName] = count;
        total += count;
      } catch (e) {
        stats[collectionName] = 0;
      }
    }
    
    res.json({
      collections: stats,
      totalCollections: COLLECTIONS_TO_BACKUP.length,
      totalDocuments: total,
      lastCheck: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get backup status',
      message: error.message,
    });
  }
});

/**
 * POST /api/backup/import
 * Importa backup JSON nel database
 * ATTENZIONE: Sovrascrive dati esistenti con stesso ID!
 */
router.post('/import', authenticateFirebase, requireAdmin, async (req, res) => {
  try {
    const userEmail = (req as any).user?.email;
    const { backup, options } = req.body;
    
    if (!backup || !backup.metadata) {
      return res.status(400).json({
        error: 'Invalid backup format',
        message: 'Missing backup data or metadata',
      });
    }
    
    console.log(`📥 Starting backup import requested by ${userEmail}`);
    console.log(`   Backup version: ${backup.metadata.version}`);
    console.log(`   Created at: ${backup.metadata.createdAt}`);
    console.log(`   Total documents: ${backup.metadata.totalDocuments}`);
    
    const dryRun = options?.dryRun !== false;
    const selectedCollections = options?.collections || COLLECTIONS_TO_BACKUP;
    
    const results: Record<string, { imported: number; errors: number }> = {};
    let totalImported = 0;
    let totalErrors = 0;
    
    for (const collectionName of selectedCollections) {
      const collectionData = backup[collectionName];
      if (!collectionData?.documents) {
        results[collectionName] = { imported: 0, errors: 0 };
        continue;
      }
      
      let imported = 0;
      let errors = 0;
      
      for (const doc of collectionData.documents) {
        try {
          const data = deserializeFirestoreData(doc.data);
          
          if (!dryRun) {
            await db.collection(collectionName).doc(doc.id).set(data, { merge: true });
          }
          
          imported++;
        } catch (e: any) {
          console.error(`Error importing ${collectionName}/${doc.id}:`, e.message);
          errors++;
        }
      }
      
      results[collectionName] = { imported, errors };
      totalImported += imported;
      totalErrors += errors;
      
      console.log(`  ${dryRun ? '🔍' : '✅'} ${collectionName}: ${imported} ${dryRun ? 'would be ' : ''}imported, ${errors} errors`);
    }
    
    res.json({
      success: true,
      dryRun,
      totalImported,
      totalErrors,
      results,
      message: dryRun 
        ? `Dry run completed: ${totalImported} documents would be imported`
        : `Import completed: ${totalImported} documents imported, ${totalErrors} errors`,
    });
    
  } catch (error: any) {
    console.error('❌ Backup import failed:', error);
    res.status(500).json({
      error: 'Backup import failed',
      message: error.message,
    });
  }
});

function deserializeFirestoreData(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }
  
  if (data._type === 'timestamp' && data._value) {
    const { Timestamp } = require('./firebase-admin.js');
    return Timestamp.fromDate(new Date(data._value));
  }
  
  if (Array.isArray(data)) {
    return data.map(item => deserializeFirestoreData(item));
  }
  
  if (typeof data === 'object') {
    const result: any = {};
    for (const key of Object.keys(data)) {
      result[key] = deserializeFirestoreData(data[key]);
    }
    return result;
  }
  
  return data;
}

/**
 * POST /api/backup/validate
 * Valida integrità di un backup senza importarlo
 * Controlla relazioni tra documenti (clienteId esiste, jobId esiste, etc.)
 */
router.post('/validate', authenticateFirebase, requireAdmin, async (req, res) => {
  try {
    const { backup } = req.body;
    
    if (!backup || !backup.metadata) {
      return res.status(400).json({
        valid: false,
        error: 'Invalid backup format',
      });
    }
    
    const issues: Array<{ collection: string; docId: string; issue: string }> = [];
    
    const clientiIds = new Set(backup.clienti?.documents?.map((d: any) => d.id) || []);
    const jobsIds = new Set(backup.jobs?.documents?.map((d: any) => d.id) || []);
    const galleriesIds = new Set(backup.galleries?.documents?.map((d: any) => d.id) || []);
    
    for (const order of backup.orders?.documents || []) {
      if (order.data.clienteId && !clientiIds.has(order.data.clienteId)) {
        issues.push({
          collection: 'orders',
          docId: order.id,
          issue: `clienteId "${order.data.clienteId}" not found in backup`,
        });
      }
      if (order.data.jobId && !jobsIds.has(order.data.jobId)) {
        issues.push({
          collection: 'orders',
          docId: order.id,
          issue: `jobId "${order.data.jobId}" not found in backup`,
        });
      }
    }
    
    for (const quote of backup.quotes?.documents || []) {
      if (quote.data.jobId && !jobsIds.has(quote.data.jobId)) {
        issues.push({
          collection: 'quotes',
          docId: quote.id,
          issue: `jobId "${quote.data.jobId}" not found in backup`,
        });
      }
    }
    
    for (const photo of backup.photos?.documents || []) {
      if (photo.data.galleryId && !galleriesIds.has(photo.data.galleryId)) {
        issues.push({
          collection: 'photos',
          docId: photo.id,
          issue: `galleryId "${photo.data.galleryId}" not found in backup`,
        });
      }
    }
    
    res.json({
      valid: issues.length === 0,
      backupVersion: backup.metadata.version,
      createdAt: backup.metadata.createdAt,
      totalDocuments: backup.metadata.totalDocuments,
      issuesCount: issues.length,
      issues: issues.slice(0, 50),
    });
    
  } catch (error: any) {
    res.status(500).json({
      valid: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/backup/drive/status
 * Verifica stato connessione Google Drive
 */
router.get('/drive/status', authenticateFirebase, requireAdmin, async (req, res) => {
  try {
    const status = await getDriveConnectionStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({
      connected: false,
      needsReconnection: true,
      error: error.message,
    });
  }
});

/**
 * POST /api/backup/drive/upload
 * Esporta e carica backup su Google Drive
 */
router.post('/drive/upload', authenticateFirebase, requireAdmin, async (req, res) => {
  try {
    const userEmail = (req as any).user?.email;
    console.log(`☁️ Starting Google Drive backup upload requested by ${userEmail}`);
    
    const startTime = Date.now();
    const backup: Record<string, any> = {};
    let totalDocuments = 0;
    const collectionCounts: Record<string, number> = {};
    
    for (const collectionName of COLLECTIONS_TO_BACKUP) {
      const exported = await exportCollection(collectionName);
      backup[collectionName] = exported;
      totalDocuments += exported.count;
      collectionCounts[collectionName] = exported.count;
    }
    
    const metadata: BackupMetadata = {
      version: '2.0.0',
      createdAt: new Date().toISOString(),
      createdBy: userEmail || 'unknown',
      totalCollections: COLLECTIONS_TO_BACKUP.length,
      totalDocuments,
      collections: collectionCounts,
    };
    
    const fullBackup = {
      metadata,
      ...backup,
    };
    
    const date = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const time = new Date().toISOString().split('T')[1].slice(0, 5).replace(':', '');
    const filename = `image-studio-backup-${date}-${time}.json`;
    
    const result = await uploadBackupToDrive(fullBackup, filename);
    
    const elapsedMs = Date.now() - startTime;
    console.log(`✅ Backup uploaded to Google Drive in ${elapsedMs}ms: ${filename}`);
    
    res.json({
      success: true,
      filename,
      fileId: result.fileId,
      webViewLink: result.webViewLink,
      totalDocuments,
      elapsedMs,
    });
    
  } catch (error: any) {
    console.error('❌ Google Drive backup upload failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/backup/drive/list
 * Lista backup disponibili su Google Drive
 */
router.get('/drive/list', authenticateFirebase, requireAdmin, async (req, res) => {
  try {
    const backups = await listBackupsFromDrive();
    res.json({
      success: true,
      backups,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      backups: [],
    });
  }
});

/**
 * GET /api/backup/drive/download/:fileId
 * Scarica un backup da Google Drive
 */
router.get('/drive/download/:fileId', authenticateFirebase, requireAdmin, async (req, res) => {
  try {
    const { fileId } = req.params;
    const backup = await downloadBackupFromDrive(fileId);
    res.json(backup);
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to download backup',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/backup/drive/:fileId
 * Elimina un backup da Google Drive
 */
router.delete('/drive/:fileId', authenticateFirebase, requireAdmin, async (req, res) => {
  try {
    const { fileId } = req.params;
    await deleteBackupFromDrive(fileId);
    res.json({
      success: true,
      message: 'Backup deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
