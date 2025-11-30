import { Router, Request, Response } from 'express';
import { db, Timestamp, storage } from './firebase-admin';
import { LegacyImportParser, ParsedJobData } from './import-parser';
import { authenticateFirebase } from './email-routes';
import fs from 'fs';
import path from 'path';
import multer from 'multer';

interface AuthRequest extends Request {
  user?: {
    uid: string;
    email: string;
  };
}

const router = Router();

// ✅ Setup multer per file upload in memoria
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Solo file Excel (.xlsx, .xls) sono permessi'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // Max 10MB
  },
});

interface ImportResult {
  success: boolean;
  jobsImported: number;
  clientsCreated: number;
  jobTypesCreated: number;
  newJobTypes: Array<{ slug: string; nome: string }>;
  errors: Array<{ job: string; error: string }>;
  warnings: Array<{ job: string; warning: string }>;
  details: Array<{
    jobName: string;
    jobId?: string;
    clientId?: string;
    status: 'success' | 'error' | 'warning';
    message: string;
  }>;
}

// Helper: Genera colore casuale per nuovi tipi di lavoro
function generateRandomColor(): string {
  const colors = [
    '#ec4899', '#60a5fa', '#a78bfa', '#fbbf24', '#34d399',
    '#f472b6', '#94a3b8', '#6366f1', '#f97316', '#14b8a6'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Helper: Normalizza stringa in slug
function toSlug(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ✅ Auto-crea tipi di lavoro mancanti prima dell'import
async function ensureJobTypesExist(jobs: ParsedJobData[]): Promise<{ created: Array<{ slug: string; nome: string }> }> {
  const firestore = db;
  const created: Array<{ slug: string; nome: string }> = [];
  
  // 1. Raccogli tutti i tipi di lavoro unici dai job
  const uniqueJobTypes = new Set<string>();
  for (const job of jobs) {
    const tipoLavoro = job.tipoLavoro?.trim();
    if (tipoLavoro) {
      uniqueJobTypes.add(tipoLavoro);
    }
  }
  
  if (uniqueJobTypes.size === 0) {
    return { created };
  }
  
  // 2. Recupera tutti i tipi esistenti da Firestore
  const existingTypesSnapshot = await firestore.collection('jobTypes').get();
  const existingSlugs = new Set<string>();
  const existingNames = new Set<string>();
  
  existingTypesSnapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.slug) existingSlugs.add(data.slug.toLowerCase());
    if (data.nome) existingNames.add(data.nome.toLowerCase());
  });
  
  // 3. Trova il prossimo ordine disponibile
  let maxOrdine = 0;
  existingTypesSnapshot.docs.forEach(doc => {
    const ordine = doc.data().ordine || 0;
    if (ordine > maxOrdine) maxOrdine = ordine;
  });
  
  // 4. Crea i tipi mancanti
  let batch = firestore.batch();
  let batchCount = 0;
  
  for (const tipoLavoro of uniqueJobTypes) {
    const slug = toSlug(tipoLavoro);
    const nomeLower = tipoLavoro.toLowerCase();
    
    // Salta se già esiste (per slug o nome)
    if (existingSlugs.has(slug) || existingNames.has(nomeLower)) {
      continue;
    }
    
    // Crea nuovo tipo
    maxOrdine++;
    const newTypeRef = firestore.collection('jobTypes').doc();
    const now = Timestamp.now();
    
    batch.set(newTypeRef, {
      nome: tipoLavoro,
      slug: slug,
      attivo: true,
      icona: '📷',
      colore: generateRandomColor(),
      ordine: maxOrdine,
      descrizione: `Tipo lavoro importato automaticamente`,
      createdBy: 'import',
      createdAt: now,
      updatedAt: now,
    });
    
    created.push({ slug, nome: tipoLavoro });
    existingSlugs.add(slug);
    existingNames.add(nomeLower);
    batchCount++;
    
    // Commit batch ogni 450 operazioni (limite Firestore = 500)
    if (batchCount >= 450) {
      await batch.commit();
      batch = firestore.batch(); // ✅ FIX: Crea nuovo batch dopo commit
      batchCount = 0;
    }
  }
  
  // Commit rimanenti
  if (batchCount > 0) {
    await batch.commit();
  }
  
  if (created.length > 0) {
    console.log(`✅ Creati ${created.length} nuovi tipi di lavoro:`, created.map(t => t.nome).join(', '));
  }
  
  return { created };
}

// ✅ NUOVO: Preview import Excel con file upload
router.post('/preview-excel', authenticateFirebase, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.user!;
    
    if (email !== 'gennaro.mazzacane@gmail.com') {
      return res.status(403).json({ error: 'Solo gli amministratori possono importare dati' });
    }

    // Controlla se file è stato caricato
    if (!req.file) {
      return res.status(400).json({ error: 'File Excel richiesto' });
    }

    const parser = new LegacyImportParser();
    const jobs = await parser.parseExcelFromBuffer(req.file.buffer);

    // ✅ Raccogli tipi di lavoro unici con conteggio
    const jobTypesCounts: Record<string, number> = {};
    for (const job of jobs) {
      const tipoLavoro = LegacyImportParser.mapJobType(job.tipoLavoro);
      if (tipoLavoro) {
        jobTypesCounts[tipoLavoro] = (jobTypesCounts[tipoLavoro] || 0) + 1;
      }
    }
    
    const discoveredJobTypes = Object.entries(jobTypesCounts).map(([nome, count]) => ({
      nome,
      slug: toSlug(nome),
      count,
    }));

    // ✅ Recupera tipi esistenti da Firestore
    const existingTypesSnapshot = await db.collection('jobTypes').get();
    const existingJobTypes = existingTypesSnapshot.docs.map(doc => ({
      id: doc.id,
      nome: doc.data().nome,
      slug: doc.data().slug,
      colore: doc.data().colore,
      icona: doc.data().icona || '📷',
      createdBy: doc.data().createdBy,
    }));

    const preview = jobs.map(job => ({
      nome: job.nome,
      dataEvento: job.dataEvento,
      cliente1: job.pdfData?.cliente1?.nome || job.nomeCliente,
      cliente2: job.pdfData?.cliente2?.nome || '',
      location: job.location,
      tipoLavoro: LegacyImportParser.mapJobType(job.tipoLavoro),
      firma: job.firma,
      pdfFileName: job.pdfFileName,
      hasPDF: !!job.pdfFileName,
      totale: job.pdfData?.importoTotale || 0,
      pagamentiCount: job.pdfData?.pagamenti.length || 0,
      prodottiCount: job.pdfData?.prodotti.length || 0,
    }));

    res.json({
      success: true,
      count: jobs.length,
      preview,
      discoveredJobTypes,
      existingJobTypes,
    });
  } catch (error) {
    console.error('Error previewing Excel import:', error);
    res.status(500).json({ error: 'Errore nel preview dei dati Excel' });
  }
});

// Legacy: Preview import CSV
router.post('/preview', authenticateFirebase, async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.user!;
    
    if (email !== 'gennaro.mazzacane@gmail.com') {
      return res.status(403).json({ error: 'Solo gli amministratori possono importare dati' });
    }

    const parser = new LegacyImportParser();
    const jobs = await parser.parseAll();

    const preview = jobs.map(job => ({
      nome: job.nome,
      dataEvento: job.dataEvento,
      cliente: job.nomeCliente,
      email: job.email,
      location: job.location,
      tipoLavoro: LegacyImportParser.mapJobType(job.tipoLavoro),
      provenienza: LegacyImportParser.mapProvenance(job.provenienza),
      hasPDF: !!job.pdfData && (job.pdfData.prodotti.length > 0 || job.pdfData.pagamenti.length > 0),
      prodottiCount: job.pdfData?.prodotti.length || 0,
      pagamentiCount: job.pdfData?.pagamenti.length || 0,
    }));

    res.json({
      success: true,
      count: jobs.length,
      preview,
    });
  } catch (error) {
    console.error('Error previewing import:', error);
    res.status(500).json({ error: 'Errore nel preview dei dati' });
  }
});

// Interfaccia per il mapping dei tipi di lavoro
interface JobTypeMapping {
  originalName: string;
  action: 'map' | 'create' | 'skip';
  targetSlug?: string;  // Solo per action='map'
  newName?: string;     // Solo per action='create' (opzionale, default = originalName)
}

// ✅ Applica mapping personalizzato e crea nuovi tipi se necessario
async function applyJobTypeMapping(
  mappings: JobTypeMapping[]
): Promise<{ 
  created: Array<{ slug: string; nome: string }>;
  mappingTable: Record<string, string>; // originalName -> targetSlug
  skipped: string[];
}> {
  const firestore = db;
  const created: Array<{ slug: string; nome: string }> = [];
  const mappingTable: Record<string, string> = {};
  const skipped: string[] = [];
  
  // Recupera tipi esistenti
  const existingTypesSnapshot = await firestore.collection('jobTypes').get();
  const existingSlugs = new Map<string, string>(); // slug -> nome
  
  existingTypesSnapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.slug) existingSlugs.set(data.slug, data.nome);
  });
  
  // Trova il prossimo ordine disponibile
  let maxOrdine = 0;
  existingTypesSnapshot.docs.forEach(doc => {
    const ordine = doc.data().ordine || 0;
    if (ordine > maxOrdine) maxOrdine = ordine;
  });
  
  let batch = firestore.batch();
  let batchCount = 0;
  
  for (const mapping of mappings) {
    // ✅ FIX: Usa chiave normalizzata (lowercase) per evitare mismatch case-sensitivity
    const normalizedKey = mapping.originalName.toLowerCase().trim();
    
    if (mapping.action === 'skip') {
      skipped.push(normalizedKey);
      continue;
    }
    
    if (mapping.action === 'map' && mapping.targetSlug) {
      // Verifica che il target esista
      if (existingSlugs.has(mapping.targetSlug)) {
        mappingTable[normalizedKey] = mapping.targetSlug;
      } else {
        console.warn(`⚠️ Target slug ${mapping.targetSlug} non esiste, skip mapping per ${mapping.originalName}`);
        skipped.push(normalizedKey);
      }
      continue;
    }
    
    if (mapping.action === 'create') {
      const nome = mapping.newName || mapping.originalName;
      const slug = toSlug(nome);
      
      // Se esiste già, usa quello esistente
      if (existingSlugs.has(slug)) {
        mappingTable[normalizedKey] = slug;
        continue;
      }
      
      // Crea nuovo tipo
      maxOrdine++;
      const newTypeRef = firestore.collection('jobTypes').doc();
      const now = Timestamp.now();
      
      batch.set(newTypeRef, {
        nome,
        slug,
        attivo: true,
        icona: '📷',
        colore: generateRandomColor(),
        ordine: maxOrdine,
        descrizione: `Tipo lavoro importato automaticamente`,
        createdBy: 'import',
        createdAt: now,
        updatedAt: now,
      });
      
      created.push({ slug, nome });
      existingSlugs.set(slug, nome);
      mappingTable[normalizedKey] = slug;
      batchCount++;
      
      if (batchCount >= 450) {
        await batch.commit();
        batch = firestore.batch();
        batchCount = 0;
      }
    }
  }
  
  if (batchCount > 0) {
    await batch.commit();
  }
  
  if (created.length > 0) {
    console.log(`✅ Creati ${created.length} nuovi tipi di lavoro via mapping:`, created.map(t => t.nome).join(', '));
  }
  
  return { created, mappingTable, skipped };
}

// ✅ NUOVO: Execute import Excel con file upload
router.post('/execute-excel', authenticateFirebase, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.user!;
    
    if (email !== 'gennaro.mazzacane@gmail.com') {
      return res.status(403).json({ error: 'Solo gli amministratori possono importare dati' });
    }

    // Controlla se file è stato caricato
    if (!req.file) {
      return res.status(400).json({ error: 'File Excel richiesto' });
    }

    // ✅ Leggi mapping dal body (JSON string nel form data)
    let jobTypeMappings: JobTypeMapping[] | null = null;
    if (req.body.jobTypeMappings) {
      try {
        jobTypeMappings = JSON.parse(req.body.jobTypeMappings);
      } catch (e) {
        console.warn('⚠️ Errore parsing jobTypeMappings, uso auto-create');
      }
    }

    const parser = new LegacyImportParser();
    const jobs = await parser.parseExcelFromBuffer(req.file.buffer);

    let newJobTypes: Array<{ slug: string; nome: string }> = [];
    let mappingTable: Record<string, string> = {};
    let skippedTypes: string[] = [];

    if (jobTypeMappings && jobTypeMappings.length > 0) {
      // ✅ Usa mapping personalizzato
      const mappingResult = await applyJobTypeMapping(jobTypeMappings);
      newJobTypes = mappingResult.created;
      mappingTable = mappingResult.mappingTable;
      skippedTypes = mappingResult.skipped;
    } else {
      // ✅ Fallback: Auto-crea tipi di lavoro mancanti (comportamento legacy)
      const { created } = await ensureJobTypesExist(jobs);
      newJobTypes = created;
    }

    const result: ImportResult = {
      success: true,
      jobsImported: 0,
      clientsCreated: 0,
      jobTypesCreated: newJobTypes.length,
      newJobTypes,
      errors: [],
      warnings: [],
      details: [],
    };

    for (const jobData of jobs) {
      try {
        // ✅ Applica mapping se disponibile
        const originalType = LegacyImportParser.mapJobType(jobData.tipoLavoro);
        // ✅ FIX: Normalizza la chiave per il lookup (stessa logica usata in applyJobTypeMapping)
        const normalizedType = originalType.toLowerCase().trim();
        
        // Se il tipo è stato skippato, salta questo job
        if (skippedTypes.includes(normalizedType)) {
          result.warnings.push({
            job: jobData.nome,
            warning: `Tipo lavoro "${originalType}" escluso dal mapping`,
          });
          result.details.push({
            jobName: jobData.nome,
            status: 'warning',
            message: `Saltato: tipo lavoro "${originalType}" escluso`,
          });
          continue;
        }
        
        // Se c'è un mapping, applica la trasformazione (usa slug come tipoLavoro)
        if (mappingTable[normalizedType]) {
          jobData.tipoLavoro = mappingTable[normalizedType];
        }
        
        await importSingleJob(jobData, result);
      } catch (error: any) {
        result.errors.push({
          job: jobData.nome,
          error: error.message || 'Errore sconosciuto',
        });
        result.details.push({
          jobName: jobData.nome,
          status: 'error',
          message: `Errore: ${error.message}`,
        });
      }
    }

    result.success = result.errors.length === 0;

    res.json(result);
  } catch (error) {
    console.error('Error executing Excel import:', error);
    res.status(500).json({ error: 'Errore nell\'importazione Excel' });
  }
});

// Legacy: Execute import CSV
router.post('/execute', authenticateFirebase, async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.user!;
    
    if (email !== 'gennaro.mazzacane@gmail.com') {
      return res.status(403).json({ error: 'Solo gli amministratori possono importare dati' });
    }

    const parser = new LegacyImportParser();
    const jobs = await parser.parseAll();

    // ✅ Auto-crea tipi di lavoro mancanti PRIMA dell'import
    const { created: newJobTypes } = await ensureJobTypesExist(jobs);

    const result: ImportResult = {
      success: true,
      jobsImported: 0,
      clientsCreated: 0,
      jobTypesCreated: newJobTypes.length,
      newJobTypes,
      errors: [],
      warnings: [],
      details: [],
    };

    for (const jobData of jobs) {
      try {
        await importSingleJob(jobData, result);
      } catch (error: any) {
        result.errors.push({
          job: jobData.nome,
          error: error.message || 'Errore sconosciuto',
        });
        result.details.push({
          jobName: jobData.nome,
          status: 'error',
          message: `Errore: ${error.message}`,
        });
      }
    }

    result.success = result.errors.length === 0;

    res.json(result);
  } catch (error) {
    console.error('Error executing import:', error);
    res.status(500).json({ error: 'Errore nell\'importazione dei dati' });
  }
});

/**
 * Upload PDF a Firebase Storage
 * @param pdfBuffer Buffer del file PDF
 * @param fileName Nome originale file (es. "Lavoro_001.pdf")
 * @param jobId ID del job per path organizzato
 * @returns URL pubblico del PDF caricato
 */
async function uploadPDFToStorage(pdfBuffer: Buffer, fileName: string, jobId: string): Promise<string> {
  const bucket = storage.bucket();
  const timestamp = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `legacy-imports/${jobId}/${timestamp}_${safeName}`;
  
  const file = bucket.file(storagePath);
  
  try {
    // Upload con metadata (file rimane PRIVATO)
    await file.save(pdfBuffer, {
      metadata: {
        contentType: 'application/pdf',
        metadata: {
          uploadedAt: new Date().toISOString(),
          originalName: fileName,
          jobId,
        },
      },
    });
    
    // ✅ FIX SECURITY: Genera signed URL con scadenza 5 anni invece di makePublic()
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + (5 * 365 * 24 * 60 * 60 * 1000), // 5 anni
    });
    
    console.log(`✅ PDF caricato (privato con signed URL): ${fileName}`);
    return signedUrl;
    
  } catch (error: any) {
    console.error(`❌ Errore upload PDF ${fileName}:`, error.message);
    throw new Error(`Upload PDF fallito: ${error.message}`);
  }
}

// Helper: normalizza nome completo in nome + cognome
function splitNomeCompleto(nomeCompleto: string): { nome: string; cognome: string } {
  const parts = nomeCompleto.trim().split(/\s+/);
  if (parts.length >= 2) {
    return {
      nome: parts[0],
      cognome: parts.slice(1).join(' '),
    };
  }
  return {
    nome: nomeCompleto,
    cognome: '',
  };
}

// ✅ NUOVO: Merge intelligente dati cliente - aggiorna solo campi mancanti
async function mergeClienteData(
  clienteRef: FirebaseFirestore.DocumentReference,
  existingData: any,
  newData: {
    via?: string;
    citta?: string;
    cap?: string;
    cellulare?: string;
    orarioCasa?: string;
  }
): Promise<void> {
  const updates: any = {};
  
  // Aggiorna solo campi vuoti/mancanti
  if (!existingData.via && newData.via) updates.via = newData.via;
  if (!existingData.citta && newData.citta) updates.citta = newData.citta;
  if (!existingData.cap && newData.cap) updates.cap = newData.cap;
  if (!existingData.cellulare1 && newData.cellulare) updates.cellulare1 = newData.cellulare;
  if (!existingData.orarioCasa && newData.orarioCasa) updates.orarioCasa = newData.orarioCasa;
  
  // Se ci sono campi da aggiornare, esegui update
  if (Object.keys(updates).length > 0) {
    updates.updatedAt = Timestamp.now();
    await clienteRef.update(updates);
    console.log(`✅ Cliente ${existingData.nome} ${existingData.cognome} aggiornato con campi mancanti:`, Object.keys(updates));
  }
}

// Helper: mappa PagamentoData → Transaction schema (booking-types.ts compliant)
function mapPagamentoToTransaction(pag: any): any {
  let dataTimestamp: FirebaseFirestore.Timestamp;
  try {
    if (pag.data) {
      const convertedDate = LegacyImportParser.convertDate(pag.data);
      const parsedDate = new Date(convertedDate);
      dataTimestamp = Timestamp.fromDate(parsedDate);
    } else {
      dataTimestamp = Timestamp.now();
    }
  } catch {
    dataTimestamp = Timestamp.now();
  }

  return {
    tipo: pag.tipo || 'acconto',
    importo: pag.importo || 0,
    metodo: pag.metodo || 'contante',
    data: dataTimestamp,
    note: `${pag.descrizione || 'Importato da vecchio gestionale'}${pag.pagato ? ' - GIÀ PAGATO' : ' - DA PAGARE'}`,
    pagato: pag.pagato || false,  // ✅ Flag per calcolo totalePagato
    emailInviata: false,  // ✅ Campo obbligatorio schema Transaction
  };
}

async function importSingleJob(jobData: ParsedJobData, result: ImportResult): Promise<void> {
  const firestore = db;

  // 0. Check idempotency - evita duplicati basandosi su nome evento + data evento
  const legacyId = `legacy-${jobData.nome.toLowerCase().replace(/\s+/g, '-')}-${jobData.dataEvento}`;
  const existingJobSnapshot = await firestore.collection('jobs')
    .where('legacyId', '==', legacyId)
    .limit(1)
    .get();

  if (!existingJobSnapshot.empty) {
    result.warnings.push({
      job: jobData.nome,
      warning: 'Job già importato - saltato per evitare duplicati',
    });
    result.details.push({
      jobName: jobData.nome,
      jobId: existingJobSnapshot.docs[0].id,
      status: 'warning',
      message: 'Job già presente nel sistema - importazione saltata',
    });
    return;
  }

  // 1. Crea o trova ENTRAMBI i clienti (sposi)
  const clientiIds: string[] = [];
  const clientiInfo: any[] = [];
  let clientsCreatedCount = 0;

  // Cliente 1 (priorità: pdfData.cliente1, poi CSV)
  const cliente1Data = jobData.pdfData?.cliente1;
  let cliente1Email = cliente1Data?.email || jobData.email;
  
  // ✅ Se non c'è email, usa nome+cognome per cercare cliente esistente
  if (!cliente1Email && cliente1Data?.nome && cliente1Data?.cognome) {
    const cliente1Nome = cliente1Data.nome.trim();
    const cliente1Cognome = cliente1Data.cognome.trim();
    const nomeNormalized = cliente1Nome.toLowerCase();
    const cognomeNormalized = cliente1Cognome.toLowerCase();
    
    // ⚡ Query solo per cognome (no composite index) + filter in memoria
    const allWithSurnameSnapshot = await firestore.collection('clienti')
      .where('cognome', '==', cliente1Cognome)
      .get();

    // Filter in memoria per nome (case-insensitive)
    const matchingDocs = allWithSurnameSnapshot.docs.filter(doc => {
      const data = doc.data();
      return data.nome?.toLowerCase() === nomeNormalized;
    });

    let cliente1Id: string;
    if (matchingDocs.length > 0) {
      const matchedDoc = matchingDocs[0]; // Prendi il primo se ci sono omonimi
      cliente1Id = matchedDoc.id;
      const existingCliente1 = matchedDoc.data();
      
      // ✅ MERGE: Aggiorna campi mancanti del cliente esistente
      await mergeClienteData(
        matchedDoc.ref,
        existingCliente1,
        {
          via: cliente1Data?.via,
          citta: cliente1Data?.citta,
          cap: cliente1Data?.cap,
          cellulare: cliente1Data?.cellulare || jobData.telefono,
          orarioCasa: cliente1Data?.orarioCasa,
        }
      );
    } else {
      // Cliente non trovato - salta questo job
      throw new Error(`Cliente 1 "${cliente1Nome} ${cliente1Cognome}" non trovato nel database. Verifica che il cliente esista.`);
    }

    clientiIds.push(cliente1Id);
    clientiInfo.push({
      clienteId: cliente1Id,
      ruolo: 'principale',
      nome: cliente1Nome,
      cognome: cliente1Cognome,
      email: matchingDocs[0].data().email || '',
      telefono: cliente1Data?.cellulare || jobData.telefono || '',
      ...(cliente1Data?.orarioCasa && { orarioCasa: cliente1Data.orarioCasa }),
    });
  } else if (cliente1Email) {
    cliente1Email = cliente1Email.toLowerCase().trim();
    
    // Cerca cliente esistente per email
    const cliente1Snapshot = await firestore.collection('clienti')
      .where('email', '==', cliente1Email)
      .limit(1)
      .get();

    let cliente1Id: string;
    if (!cliente1Snapshot.empty) {
      cliente1Id = cliente1Snapshot.docs[0].id;
      
      // ✅ MERGE: Aggiorna campi mancanti del cliente esistente
      const existingCliente1 = cliente1Snapshot.docs[0].data();
      await mergeClienteData(
        cliente1Snapshot.docs[0].ref,
        existingCliente1,
        {
          via: cliente1Data?.via,
          citta: cliente1Data?.citta,
          cap: cliente1Data?.cap,
          cellulare: cliente1Data?.cellulare || jobData.telefono,
          orarioCasa: cliente1Data?.orarioCasa,
        }
      );
    } else {
      // Normalizza nome/cognome
      const { nome, cognome } = cliente1Data?.nome && cliente1Data?.cognome 
        ? { nome: cliente1Data.nome, cognome: cliente1Data.cognome }
        : splitNomeCompleto(jobData.nomeCliente || cliente1Data?.nome || '');

      const newCliente1 = {
        nome,
        cognome,
        email: cliente1Email,
        cellulare1: cliente1Data?.cellulare || jobData.telefono || '',
        via: cliente1Data?.via || '',
        citta: cliente1Data?.citta || '',
        cap: cliente1Data?.cap || '',
        
        // Inizializza campi obbligatori
        sourceRefs: {
          bookingIds: [],
          orderIds: [],
          galleryIds: [],
        },
        lifecycle: {
          firstContactAt: Timestamp.now(),
          lastInteractionAt: Timestamp.now(),
          status: 'lead' as const,
        },
        financials: {
          totalRevenue: 0,
          outstandingBalance: 0,
          totalOrders: 0,
        },
        note: `Importato da vecchio gestionale - ${jobData.dataCreazione}`,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: 'import-legacy',
      };

      const cliente1Ref = await firestore.collection('clienti').add(newCliente1);
      cliente1Id = cliente1Ref.id;
      clientsCreatedCount++;
    }

    clientiIds.push(cliente1Id);
    clientiInfo.push({
      clienteId: cliente1Id,
      ruolo: 'principale',
      nome: cliente1Data?.nome || splitNomeCompleto(jobData.nomeCliente).nome,
      cognome: cliente1Data?.cognome || splitNomeCompleto(jobData.nomeCliente).cognome,
      email: cliente1Email,
      telefono: cliente1Data?.cellulare || jobData.telefono || '',
      ...(cliente1Data?.orarioCasa && { orarioCasa: cliente1Data.orarioCasa }),  // ✅ Orario casa cliente 1
    });
  } else {
    console.warn(`⚠️ Cliente 1 senza email per job ${jobData.nome}`);
  }

  // Cliente 2 (da pdfData.cliente2)
  const cliente2Data = jobData.pdfData?.cliente2;
  
  // ✅ Se non c'è email ma c'è nome+cognome, cerca per nome
  if (!cliente2Data?.email && cliente2Data?.nome && cliente2Data?.cognome) {
    const cliente2Nome = cliente2Data.nome.trim();
    const cliente2Cognome = cliente2Data.cognome.trim();
    const nomeNormalized = cliente2Nome.toLowerCase();
    
    // ⚡ Query solo per cognome (no composite index) + filter in memoria
    const allWithSurnameSnapshot = await firestore.collection('clienti')
      .where('cognome', '==', cliente2Cognome)
      .get();

    // Filter in memoria per nome (case-insensitive)
    const matchingDocs = allWithSurnameSnapshot.docs.filter(doc => {
      const data = doc.data();
      return data.nome?.toLowerCase() === nomeNormalized;
    });

    if (matchingDocs.length > 0) {
      const matchedDoc = matchingDocs[0];
      const cliente2Id = matchedDoc.id;
      const existingCliente2 = matchedDoc.data();
      
      // ✅ MERGE: Aggiorna campi mancanti del cliente esistente
      await mergeClienteData(
        matchedDoc.ref,
        existingCliente2,
        {
          via: cliente2Data.via,
          citta: cliente2Data.citta,
          cap: cliente2Data.cap,
          cellulare: cliente2Data.cellulare,
          orarioCasa: cliente2Data.orarioCasa,
        }
      );

      clientiIds.push(cliente2Id);
      clientiInfo.push({
        clienteId: cliente2Id,
        ruolo: 'partner',
        nome: cliente2Nome,
        cognome: cliente2Cognome,
        email: existingCliente2.email || '',
        telefono: cliente2Data.cellulare || '',
        ...(cliente2Data?.orarioCasa && { orarioCasa: cliente2Data.orarioCasa }),
      });
    } else {
      // Cliente 2 non trovato - non è critico, salta semplicemente
      console.warn(`⚠️ Cliente 2 "${cliente2Nome} ${cliente2Cognome}" non trovato - job creato senza Cliente 2`);
    }
  } else if (cliente2Data?.email) {
    const cliente2Email = cliente2Data.email.toLowerCase().trim();
    
    // Cerca cliente esistente per email
    const cliente2Snapshot = await firestore.collection('clienti')
      .where('email', '==', cliente2Email)
      .limit(1)
      .get();

    let cliente2Id: string;
    if (!cliente2Snapshot.empty) {
      cliente2Id = cliente2Snapshot.docs[0].id;
      
      // ✅ MERGE: Aggiorna campi mancanti del cliente esistente
      const existingCliente2 = cliente2Snapshot.docs[0].data();
      await mergeClienteData(
        cliente2Snapshot.docs[0].ref,
        existingCliente2,
        {
          via: cliente2Data.via,
          citta: cliente2Data.citta,
          cap: cliente2Data.cap,
          cellulare: cliente2Data.cellulare,
          orarioCasa: cliente2Data.orarioCasa,
        }
      );
    } else {
      const newCliente2 = {
        nome: cliente2Data.nome || '',
        cognome: cliente2Data.cognome || '',
        email: cliente2Email,
        cellulare1: cliente2Data.cellulare || '',
        via: cliente2Data.via || '',
        citta: cliente2Data.citta || '',
        cap: cliente2Data.cap || '',
        
        // Inizializza campi obbligatori
        sourceRefs: {
          bookingIds: [],
          orderIds: [],
          galleryIds: [],
        },
        lifecycle: {
          firstContactAt: Timestamp.now(),
          lastInteractionAt: Timestamp.now(),
          status: 'lead' as const,
        },
        financials: {
          totalRevenue: 0,
          outstandingBalance: 0,
          totalOrders: 0,
        },
        note: `Importato da vecchio gestionale - ${jobData.dataCreazione}`,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: 'import-legacy',
      };

      const cliente2Ref = await firestore.collection('clienti').add(newCliente2);
      cliente2Id = cliente2Ref.id;
      clientsCreatedCount++;
    }

    clientiIds.push(cliente2Id);
    clientiInfo.push({
      clienteId: cliente2Id,
      ruolo: 'partner',
      nome: cliente2Data.nome || '',
      cognome: cliente2Data.cognome || '',
      email: cliente2Email,
      telefono: cliente2Data.cellulare || '',
      ...(cliente2Data?.orarioCasa && { orarioCasa: cliente2Data.orarioCasa }),  // ✅ Orario casa cliente 2
    });
  } else {
    console.warn(`⚠️ Cliente 2 senza email per job ${jobData.nome} - saltato`);
  }

  // Fallback: se nessun cliente è stato creato, errore
  if (clientiIds.length === 0) {
    throw new Error(`Nessun cliente valido trovato per job "${jobData.nome}". Verifica che i clienti esistano nel database con nome e cognome corretti.`);
  }

  result.clientsCreated += clientsCreatedCount;

  // 2. Mappa pagamenti PDF → Transactions e calcola financials
  const transactions = jobData.pdfData?.pagamenti?.map(mapPagamentoToTransaction) || [];
  
  const totalePreventivato = jobData.pdfData?.importoTotale || 0;
  const totalePagato = transactions
    .filter(t => t.pagato === true)
    .reduce((sum, t) => sum + t.importo, 0);
  const saldoResiduo = Math.max(totalePreventivato - totalePagato, 0);

  const financials = {
    totalePreventivato,
    totaleOrdini: 0,
    totalePagato,
    saldoResiduo,
  };

  // 3. Crea job
  const dataEvento = LegacyImportParser.convertDate(jobData.dataEvento);
  
  // Converti data evento in Timestamp Firestore per compatibilità con query UI
  let eventDateTimestamp: FirebaseFirestore.Timestamp;
  try {
    const parsedDate = new Date(dataEvento);
    if (isNaN(parsedDate.getTime())) {
      throw new Error('Data non valida');
    }
    eventDateTimestamp = Timestamp.fromDate(parsedDate);
  } catch (error) {
    // Fallback a oggi se la data non è parsabile
    console.warn(`⚠️ Data evento non valida per ${jobData.nome}: ${dataEvento}, uso data corrente`);
    eventDateTimestamp = Timestamp.now();
  }
  
  // Prepara prodotti legacy in formato strutturato (deprecato ma mantenuto per compatibilità)
  const legacyProducts = jobData.pdfData?.prodotti?.map(p => ({
    nome: p.nome,
    prezzo: p.prezzo || 0,
    quantita: p.quantita || 1,
    fonte: 'importazione-pdf'
  })) || [];

  // Estrai dati evento dal PDF se disponibili
  const eventoData = jobData.pdfData?.evento;

  const jobDoc = {
    nomeEvento: jobData.nome,
    dataEvento,  // Mantieni stringa per compatibilità legacy
    eventDate: eventDateTimestamp,  // ✅ CRITICO: Timestamp per query UI
    clientiIds,  // ✅ NUOVO: Array con ENTRAMBI i clienti
    location: eventoData?.location || jobData.location || '',
    eventLocation: eventoData?.location || jobData.location || '',
    allDay: false,  // Default - può essere aggiornato manualmente
    
    // ✅ Campi opzionali: ometti se non presenti invece di undefined/''
    ...(eventoData?.orarioInizio && { startTime: eventoData.orarioInizio }),
    ...(eventoData?.orarioFine && { endTime: eventoData.orarioFine }),
    ...(eventoData?.rituLocation && { rituLocation: eventoData.rituLocation }),
    ...(eventoData?.rituTime && { rituTime: eventoData.rituTime }),
    
    jobType: LegacyImportParser.mapJobType(eventoData?.tipoLavoro || jobData.tipoLavoro),
    provenance: LegacyImportParser.mapProvenance(jobData.provenienza),
    clientiInfo,  // ✅ NUOVO: Array con info di ENTRAMBI i clienti
    status: 'lead' as const,
    
    // ✅ NUOVO: Financials calcolati da pagamenti reali
    financials,
    
    // ✅ NUOVO: Transactions mappate correttamente
    transactions,
    
    // Riferimenti vuoti inizialmente
    orderIds: [],
    galleryIds: [],
    quoteIds: [],
    
    // Costi e PDF vuoti inizialmente (verrà aggiornato dopo upload)
    costi: [],
    pdfs: [],
    
    note: jobData.note || '',
    noteOperatori: jobData.operatori ? `Operatori: ${jobData.operatori}` : '',
    noteInterne: '',
    importedFrom: 'legacy',
    legacyId,
    importedAt: new Date().toISOString(),
    
    // ✅ NUOVO: Firma contratto (da Excel)
    ...(jobData.firma !== undefined && { legacyContractSigned: jobData.firma }),
    
    importedData: {
      dataCreazione: jobData.dataCreazione,
      settore: jobData.settore,
      tipoLavoroOriginale: jobData.tipoLavoro,
      provenienzaOriginale: jobData.provenienza,
      prodottiLegacy: legacyProducts,
      importoTotaleLegacy: totalePreventivato,
      cliente1PDF: cliente1Data || null,
      cliente2PDF: cliente2Data || null,
      firma: jobData.firma,  // Flag firma Excel
    },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: 'import-legacy',
    jobSource: 'legacy_import' as const
  };

  const jobRef = await firestore.collection('jobs').add(jobDoc);
  const jobId = jobRef.id;
  
  // ✅ NUOVO: Upload PDF se presente nel job Excel
  if (jobData.pdfFileName) {
    try {
      // ✅ FIX: Cerca PDF in multiple locations (attached_assets/pdf/ poi EXPORTVECCHIOGESTIONALE/)
      const possiblePaths = [
        path.join('attached_assets', 'pdf', jobData.pdfFileName),
        path.join('attached_assets', 'EXPORTVECCHIOGESTIONALE', jobData.pdfFileName),
        ...(jobData.folderPath 
          ? [path.join(jobData.folderPath, 'Modulo di prenotazione', jobData.pdfFileName)]
          : []),
      ];
      
      let pdfPath = null;
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          pdfPath = testPath;
          break;
        }
      }
      
      if (pdfPath) {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const pdfUrl = await uploadPDFToStorage(pdfBuffer, jobData.pdfFileName, jobId);
        
        // Aggiorna job con URL PDF nell'array pdfs
        await jobRef.update({
          pdfs: [{
            type: 'modulo_prenotazione',
            url: pdfUrl,
            fileName: jobData.pdfFileName,
            uploadedAt: new Date().toISOString(),
            uploadedBy: 'import-legacy',
          }],
          updatedAt: Timestamp.now(),
        });
        
        console.log(`✅ PDF ${jobData.pdfFileName} caricato da ${pdfPath} per job ${jobId}`);
      } else {
        console.warn(`⚠️ PDF non trovato in nessuna location per job ${jobData.nome}. Paths testati:`, possiblePaths);
        result.warnings.push({
          job: jobData.nome,
          warning: `PDF non trovato: ${jobData.pdfFileName}`,
        });
      }
    } catch (error: any) {
      console.error(`❌ Errore upload PDF per job ${jobData.nome}:`, error.message);
      result.warnings.push({
        job: jobData.nome,
        warning: `Errore upload PDF: ${error.message}`,
      });
    }
  }
  
  // 4. Aggiorna sourceRefs dei clienti per includere questo job
  for (const clienteId of clientiIds) {
    const clienteRef = firestore.collection('clienti').doc(clienteId);
    const clienteDoc = await clienteRef.get();
    
    if (clienteDoc.exists) {
      const currentSourceRefs = clienteDoc.data()?.sourceRefs || {};
      const jobIds = currentSourceRefs.jobIds || [];
      
      // Aggiungi jobId a jobIds se non già presente
      if (!jobIds.includes(jobId)) {
        await clienteRef.update({
          'sourceRefs.jobIds': [...jobIds, jobId],
          'lifecycle.lastInteractionAt': Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      }
    }
  }
  
  result.jobsImported++;
  
  // Prepara messaggio dettagliato
  const clientiCreati = clientsCreatedCount > 0 ? `${clientsCreatedCount} nuov${clientsCreatedCount === 1 ? 'o cliente' : 'i clienti'}` : 'clienti esistenti';
  const pagamentiInfo = transactions.length > 0 
    ? `${transactions.length} pagament${transactions.length === 1 ? 'o' : 'i'} (€${totalePagato} già pagati su €${totalePreventivato})`
    : 'nessun pagamento';
  
  result.details.push({
    jobName: jobData.nome,
    jobId,
    clientId: clientiIds[0],  // Primo cliente per compatibilità
    status: 'success',
    message: `✅ Job creato con ${clientiCreati}. ${pagamentiInfo}. Totale: €${totalePreventivato}${legacyProducts.length > 0 ? `. ${legacyProducts.length} prodotti in importedData.prodottiLegacy` : ''}`,
  });
}

// DELETE /api/import/delete-legacy - Cancella tutti i job importati (per re-import)
router.delete('/delete-legacy', authenticateFirebase, async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.user!;
    
    if (email !== 'gennaro.mazzacane@gmail.com') {
      return res.status(403).json({ error: 'Solo gli amministratori possono cancellare i dati importati' });
    }

    const firestore = db;
    const jobsSnapshot = await firestore.collection('jobs')
      .where('importedFrom', '==', 'legacy')
      .get();

    const batch = firestore.batch();
    jobsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    res.json({
      success: true,
      deleted: jobsSnapshot.size,
      message: `${jobsSnapshot.size} job legacy cancellati con successo`,
    });
  } catch (error) {
    console.error('Error deleting legacy jobs:', error);
    res.status(500).json({ error: 'Errore nella cancellazione dei job legacy' });
  }
});

// POST /api/import/sync-client-jobrefs - Sincronizza sourceRefs.jobIds per tutti i clienti
// Utile per riparare dati legacy importati prima del fix
router.post('/sync-client-jobrefs', authenticateFirebase, async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.user!;
    
    if (email !== 'gennaro.mazzacane@gmail.com') {
      return res.status(403).json({ error: 'Solo gli amministratori possono eseguire la sincronizzazione' });
    }

    const firestore = db;
    
    console.log('🔄 Avvio sincronizzazione sourceRefs.jobIds...');
    
    // 1. Leggi tutti i job
    const jobsSnapshot = await firestore.collection('jobs').get();
    console.log(`📊 Trovati ${jobsSnapshot.size} job totali`);
    
    // 2. Crea mappa cliente -> jobIds
    const clienteJobsMap = new Map<string, Set<string>>();
    
    jobsSnapshot.docs.forEach(doc => {
      const job = doc.data();
      const jobId = doc.id;
      const clientiIds = job.clientiIds || [];
      
      for (const clienteId of clientiIds) {
        if (!clienteJobsMap.has(clienteId)) {
          clienteJobsMap.set(clienteId, new Set());
        }
        clienteJobsMap.get(clienteId)!.add(jobId);
      }
    });
    
    console.log(`👥 Trovati ${clienteJobsMap.size} clienti con job associati`);
    
    // 3. Aggiorna ogni cliente
    let clientiAggiornati = 0;
    let clientiNonTrovati = 0;
    let errori = 0;
    
    for (const [clienteId, jobIdsSet] of clienteJobsMap) {
      try {
        const clienteRef = firestore.collection('clienti').doc(clienteId);
        const clienteDoc = await clienteRef.get();
        
        if (!clienteDoc.exists) {
          clientiNonTrovati++;
          console.warn(`⚠️ Cliente ${clienteId} non trovato`);
          continue;
        }
        
        const currentSourceRefs = clienteDoc.data()?.sourceRefs || {};
        const currentJobIds = new Set(currentSourceRefs.jobIds || []);
        const newJobIds = Array.from(new Set([...currentJobIds, ...jobIdsSet]));
        
        // Aggiorna solo se ci sono nuovi jobIds da aggiungere
        if (newJobIds.length > currentJobIds.size) {
          await clienteRef.update({
            'sourceRefs.jobIds': newJobIds,
            updatedAt: Timestamp.now(),
          });
          clientiAggiornati++;
          console.log(`✅ Cliente ${clienteId}: ${currentJobIds.size} → ${newJobIds.length} jobIds`);
        }
      } catch (error: any) {
        errori++;
        console.error(`❌ Errore aggiornamento cliente ${clienteId}:`, error.message);
      }
    }
    
    console.log(`🎉 Sincronizzazione completata: ${clientiAggiornati} clienti aggiornati, ${clientiNonTrovati} non trovati, ${errori} errori`);
    
    res.json({
      success: true,
      totalJobs: jobsSnapshot.size,
      totalClientiConJob: clienteJobsMap.size,
      clientiAggiornati,
      clientiNonTrovati,
      errori,
      message: `Sincronizzazione completata: ${clientiAggiornati} clienti aggiornati con i riferimenti ai job`,
    });
  } catch (error: any) {
    console.error('Error syncing client job refs:', error);
    res.status(500).json({ error: error.message || 'Errore nella sincronizzazione' });
  }
});

export default router;
