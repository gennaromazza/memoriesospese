import { Router, Request, Response } from 'express';
import { db, Timestamp, storage } from './firebase-admin';
import { LegacyImportParser, ParsedJobData } from './import-parser';
import { authenticateFirebase } from './email-routes';
import fs from 'fs';
import path from 'path';

interface AuthRequest extends Request {
  user?: {
    uid: string;
    email: string;
  };
}

const router = Router();

interface ImportResult {
  success: boolean;
  jobsImported: number;
  clientsCreated: number;
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

// ✅ NUOVO: Preview import Excel
router.post('/preview-excel', authenticateFirebase, async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.user!;
    
    if (email !== 'gennaro.mazzacane@gmail.com') {
      return res.status(403).json({ error: 'Solo gli amministratori possono importare dati' });
    }

    const parser = new LegacyImportParser();
    const jobs = await parser.parseAllExcel();

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

// ✅ NUOVO: Execute import Excel
router.post('/execute-excel', authenticateFirebase, async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.user!;
    
    if (email !== 'gennaro.mazzacane@gmail.com') {
      return res.status(403).json({ error: 'Solo gli amministratori possono importare dati' });
    }

    const parser = new LegacyImportParser();
    const jobs = await parser.parseAllExcel();

    const result: ImportResult = {
      success: true,
      jobsImported: 0,
      clientsCreated: 0,
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

    const result: ImportResult = {
      success: true,
      jobsImported: 0,
      clientsCreated: 0,
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
  
  if (cliente1Email) {
    cliente1Email = cliente1Email.toLowerCase().trim();
    
    // Cerca cliente esistente per email
    const cliente1Snapshot = await firestore.collection('clienti')
      .where('email', '==', cliente1Email)
      .limit(1)
      .get();

    let cliente1Id: string;
    if (!cliente1Snapshot.empty) {
      cliente1Id = cliente1Snapshot.docs[0].id;
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
  if (cliente2Data?.email) {
    const cliente2Email = cliente2Data.email.toLowerCase().trim();
    
    // Cerca cliente esistente per email
    const cliente2Snapshot = await firestore.collection('clienti')
      .where('email', '==', cliente2Email)
      .limit(1)
      .get();

    let cliente2Id: string;
    if (!cliente2Snapshot.empty) {
      cliente2Id = cliente2Snapshot.docs[0].id;
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
    throw new Error('Nessun cliente valido trovato (servono almeno email)');
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
      const bookingIds = currentSourceRefs.bookingIds || [];
      
      // Aggiungi jobId a bookingIds se non già presente
      if (!bookingIds.includes(jobId)) {
        await clienteRef.update({
          'sourceRefs.bookingIds': [...bookingIds, jobId],
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

export default router;
