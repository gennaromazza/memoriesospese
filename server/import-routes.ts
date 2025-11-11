import { Router, Request, Response } from 'express';
import { db, Timestamp } from './firebase-admin';
import { LegacyImportParser, ParsedJobData } from './import-parser';
import { authenticateFirebase } from './email-routes';

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

  // 1. Cerca o crea cliente
  let clienteId: string;
  let isNewClient = false;

  if (jobData.email) {
    const clientiSnapshot = await firestore.collection('clienti')
      .where('email', '==', jobData.email.toLowerCase().trim())
      .limit(1)
      .get();

    if (!clientiSnapshot.empty) {
      clienteId = clientiSnapshot.docs[0].id;
    } else {
      const clienteData = {
        nome: jobData.nomeCliente || '',
        email: jobData.email.toLowerCase().trim(),
        telefono: jobData.telefono || '',
        cellulare1: jobData.telefono || '',
        indirizzo: jobData.pdfData?.indirizzo || '',
        cap: jobData.pdfData?.cap || '',
        citta: jobData.pdfData?.citta || '',
        provincia: jobData.pdfData?.provincia || '',
        codiceFiscale: jobData.pdfData?.codiceFiscale || '',
        note: `Importato da vecchio gestionale - ${jobData.dataCreazione}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const clienteRef = await firestore.collection('clienti').add(clienteData);
      clienteId = clienteRef.id;
      isNewClient = true;
      result.clientsCreated++;
    }
  } else {
    throw new Error('Email cliente mancante');
  }

  // 2. Crea job
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
  
  // Prepara prodotti legacy in formato strutturato
  const legacyProducts = jobData.pdfData?.prodotti?.map(p => ({
    nome: p.nome,
    prezzo: p.prezzo || 0,
    quantita: p.quantita || 1,
    fonte: 'importazione-pdf'
  })) || [];

  const jobDoc = {
    nomeEvento: jobData.nome,
    dataEvento,  // Mantieni stringa per compatibilità legacy
    eventDate: eventDateTimestamp,  // ✅ CRITICO: Timestamp per query UI
    clientiIds: [clienteId],  // ✅ CRITICO: Array per query UI
    location: jobData.location || '',
    jobType: LegacyImportParser.mapJobType(jobData.tipoLavoro),
    jobProvenance: LegacyImportParser.mapProvenance(jobData.provenienza),
    clientiInfo: [{
      clienteId,
      ruolo: 'principale',
      nome: jobData.nomeCliente,
      email: jobData.email,
      telefono: jobData.telefono || '',
      whatsapp: jobData.telefono || '',
      cellulare1: jobData.telefono || '',
    }],
    status: 'lead',
    
    // ✅ CRITICO: Financials richiesto da JobsManager
    financials: {
      totalePreventivato: jobData.pdfData?.importoTotale || 0,
      totaleOrdini: 0,
      totalePagato: 0,
      saldoResiduo: jobData.pdfData?.importoTotale || 0
    },
    
    // Riferimenti vuoti inizialmente
    orderIds: [],
    galleryIds: [],
    quoteIds: [],
    
    // Costi e PDF vuoti
    costi: [],
    pdfs: [],
    
    note: jobData.note || '',
    noteOperatori: jobData.operatori ? `Operatori: ${jobData.operatori}` : '',
    noteInterne: '',
    importedFrom: 'legacy',
    legacyId,
    importedAt: new Date().toISOString(),
    importedData: {
      dataCreazione: jobData.dataCreazione,
      settore: jobData.settore,
      tipoLavoroOriginale: jobData.tipoLavoro,
      provenienzaOriginale: jobData.provenienza,
      prodottiLegacy: legacyProducts,
      importoTotaleLegacy: jobData.pdfData?.importoTotale || null,
    },
    transactions: [] as any[],
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: 'import-legacy',
    jobSource: 'import'
  };

  // 3. Aggiungi transazioni se ci sono pagamenti dal PDF
  if (jobData.pdfData?.pagamenti && jobData.pdfData.pagamenti.length > 0) {
    jobDoc.transactions = jobData.pdfData.pagamenti.map((pag, index) => ({
      id: `import-${Date.now()}-${index}`,
      descrizione: pag.descrizione,
      importo: pag.importo || 0,
      dataScadenza: pag.data ? LegacyImportParser.convertDate(pag.data) : '',
      pagato: false,
      dataPagamento: null,
      metodoPagamento: null,
      note: 'Importato da vecchio gestionale',
    }));
  }

  const jobRef = await firestore.collection('jobs').add(jobDoc);
  const jobId = jobRef.id;
  
  result.jobsImported++;
  result.details.push({
    jobName: jobData.nome,
    jobId,
    clientId: clienteId,
    status: 'success',
    message: `Job creato${isNewClient ? ' con nuovo cliente' : ' con cliente esistente'}. ${legacyProducts.length} prodotti salvati, ${jobData.pdfData?.pagamenti.length || 0} pagamenti.${jobData.pdfData?.importoTotale ? ` Importo totale: €${jobData.pdfData.importoTotale}` : ''}`,
  });

  // 4. Se non ci sono pagamenti ma c'è un totale, crea una transazione generica
  if ((!jobData.pdfData?.pagamenti || jobData.pdfData.pagamenti.length === 0) && 
      jobData.pdfData?.importoTotale) {
    await firestore.collection('jobs').doc(jobId).update({
      transactions: [{
        id: `import-total-${Date.now()}`,
        descrizione: 'Importo totale (da verificare)',
        importo: jobData.pdfData.importoTotale,
        dataScadenza: dataEvento,
        pagato: false,
        dataPagamento: null,
        metodoPagamento: null,
        note: 'Totale estratto dal PDF - verificare e suddividere',
      }],
    });

    result.warnings.push({
      job: jobData.nome,
      warning: 'Creata transazione generica con importo totale - da verificare manualmente',
    });
  }

  // 5. Aggiungi nota con riepilogo prodotti per referenza rapida
  if (legacyProducts.length > 0) {
    const prodottiText = legacyProducts
      .map(p => `- ${p.nome}${p.prezzo ? ` (€${p.prezzo})` : ''}`)
      .join('\n');
    
    const notaCompleta = `${jobDoc.note}\n\n📦 Prodotti dal vecchio gestionale (disponibili in importedData.prodottiLegacy):\n${prodottiText}${jobData.pdfData?.importoTotale ? `\n\nImporto totale originale: €${jobData.pdfData.importoTotale}` : ''}`;
    
    await firestore.collection('jobs').doc(jobId).update({
      note: notaCompleta,
    });
  }
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
