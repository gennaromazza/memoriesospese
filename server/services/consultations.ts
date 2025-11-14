/**
 * CONSULTATION SERVICE - Business logic layer
 * Gestisce CRUD operations, conflict detection, client linking per modulo Consulenze
 */

import { db, FieldValue, Timestamp } from '../firebase-admin.js';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import type { 
  ConsultationTemplate, 
  InsertConsultationTemplate, 
  UpdateConsultationTemplate,
  Consultation,
  InsertConsultation,
  UpdateConsultation,
  ConsultationStatus,
  ConsultationSlot,
  ConsultationWorkingHours
} from '../../shared/consultation-types.js';
import { DEFAULT_CONSULTATION_HOURS } from '../../shared/consultation-types.js';
import { getAvailableSlots as getGoogleCalendarSlots, getEvents, checkFreeBusy, type WorkingHours } from '../google-calendar.js';
import type { Booking } from '../../shared/booking-types.js';

/**
 * TEMPLATE OPERATIONS
 */

/**
 * Ottiene tutti i template consulenze
 */
export async function getAllTemplates(): Promise<ConsultationTemplate[]> {
  const snapshot = await db.collection('consultationTemplates')
    .orderBy('nome', 'asc')
    .get();
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt || Timestamp.now(),
    updatedAt: doc.data().updatedAt || Timestamp.now(),
  })) as ConsultationTemplate[];
}

/**
 * Ottiene template per ID
 */
export async function getTemplateById(id: string): Promise<ConsultationTemplate | null> {
  const doc = await db.collection('consultationTemplates').doc(id).get();
  
  if (!doc.exists) {
    return null;
  }
  
  return {
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data()?.createdAt || Timestamp.now(),
    updatedAt: doc.data()?.updatedAt || Timestamp.now(),
  } as ConsultationTemplate;
}

/**
 * Ottiene template attivi per tipo lavoro
 */
export async function getActiveTemplatesByJobType(jobType: string): Promise<ConsultationTemplate[]> {
  const snapshot = await db.collection('consultationTemplates')
    .where('jobType', '==', jobType)
    .where('attiva', '==', true)
    .get();
  
  const templates = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt || Timestamp.now(),
    updatedAt: doc.data().updatedAt || Timestamp.now(),
  })) as ConsultationTemplate[];
  
  return templates.sort((a, b) => a.nome.localeCompare(b.nome));
}

/**
 * Ottiene tipi lavoro unici con template attivi (per index page)
 */
export async function getJobTypesWithActiveTemplates(): Promise<string[]> {
  const snapshot = await db.collection('consultationTemplates')
    .where('attiva', '==', true)
    .get();
  
  const jobTypes = new Set<string>();
  snapshot.docs.forEach((doc: any) => {
    const data = doc.data();
    if (data.jobType) {
      jobTypes.add(data.jobType);
    }
  });
  
  return Array.from(jobTypes).sort();
}

/**
 * Crea nuovo template
 */
export async function createTemplate(data: InsertConsultationTemplate): Promise<string> {
  const now = Timestamp.now();
  
  const docRef = await db.collection('consultationTemplates').add({
    ...data,
    createdAt: now,
    updatedAt: now,
  });
  
  return docRef.id;
}

/**
 * Aggiorna template esistente
 */
export async function updateTemplate(id: string, data: UpdateConsultationTemplate): Promise<void> {
  const docRef = db.collection('consultationTemplates').doc(id);
  const doc = await docRef.get();
  
  if (!doc.exists) {
    throw new Error(`Template ${id} non trovato`);
  }
  
  await docRef.update({
    ...data,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Elimina template
 */
export async function deleteTemplate(id: string): Promise<void> {
  // Verifica che non ci siano consultations attive associate
  const consultations = await db.collection('consultations')
    .where('templateId', '==', id)
    .where('stato', 'in', ['in_attesa', 'confermata'])
    .limit(1)
    .get();
  
  if (!consultations.empty) {
    throw new Error('Impossibile eliminare template con consultations attive');
  }
  
  await db.collection('consultationTemplates').doc(id).delete();
}

/**
 * MIGRATION: Aggiorna customWorkingHours per abilitare sabato
 * Supporta dry-run mode per test senza modifiche
 */
export async function migrateSaturdayHours(options: { dryRun?: boolean; force?: boolean } = {}) {
  const { dryRun = false, force = false } = options;
  
  const templates = await getAllTemplates();
  
  const report = {
    total: templates.length,
    updated: 0,
    skipped: 0,
    excluded: 0,
    missingSaturday: 0,
    details: [] as Array<{
      id: string;
      nome: string;
      action: 'updated' | 'skipped' | 'excluded' | 'missing-saturday';
      reason: string;
      before?: any;
      after?: any;
    }>
  };
  
  for (const template of templates) {
    // Skip template senza customWorkingHours (usano DEFAULT)
    if (!template.customWorkingHours || template.customWorkingHours.length === 0) {
      report.skipped++;
      report.details.push({
        id: template.id,
        nome: template.nome,
        action: 'skipped',
        reason: 'Usa orari di default (nessun customWorkingHours)'
      });
      continue;
    }
    
    // Skip template che escludono sabato intenzionalmente (a meno che force=true)
    if (!force && template.excludedDays && template.excludedDays.includes(6)) {
      report.excluded++;
      report.details.push({
        id: template.id,
        nome: template.nome,
        action: 'excluded',
        reason: 'Sabato escluso intenzionalmente in excludedDays'
      });
      continue;
    }
    
    // Cerca configurazione sabato (giornoSettimana: 6)
    const saturdayIndex = template.customWorkingHours.findIndex(h => h.giornoSettimana === 6);
    
    if (saturdayIndex === -1) {
      report.missingSaturday++;
      report.details.push({
        id: template.id,
        nome: template.nome,
        action: 'missing-saturday',
        reason: 'customWorkingHours non contiene sabato (giornoSettimana: 6)'
      });
      continue;
    }
    
    const saturdayConfig = template.customWorkingHours[saturdayIndex];
    
    // Skip se sabato già attivo
    if (saturdayConfig.attivo) {
      report.skipped++;
      report.details.push({
        id: template.id,
        nome: template.nome,
        action: 'skipped',
        reason: 'Sabato già attivo'
      });
      continue;
    }
    
    // AGGIORNA: sabato da attivo=false a attivo=true con pausa pranzo
    const updatedSaturday: ConsultationWorkingHours = {
      ...saturdayConfig,
      attivo: true,
      pausaInizio: '13:00',
      pausaFine: '14:30'
    };
    
    const updatedWorkingHours = [...template.customWorkingHours];
    updatedWorkingHours[saturdayIndex] = updatedSaturday;
    
    // Se force=true E sabato era in excludedDays, rimuovilo
    const hadExcludedSaturday = template.excludedDays && template.excludedDays.includes(6);
    const updatedExcludedDays = hadExcludedSaturday && force 
      ? template.excludedDays!.filter(day => day !== 6)
      : template.excludedDays;
    
    let reason = 'Sabato abilitato (attivo: false → true) con pausa pranzo 13:00-14:30';
    if (hadExcludedSaturday && force) {
      reason += ' + rimosso da excludedDays (force=true)';
    }
    
    report.details.push({
      id: template.id,
      nome: template.nome,
      action: 'updated',
      reason,
      before: saturdayConfig,
      after: updatedSaturday
    });
    
    // Applica modifica solo se non in dry-run
    if (!dryRun) {
      const updates: any = {
        customWorkingHours: updatedWorkingHours
      };
      
      // Aggiorna excludedDays solo se modificato
      if (hadExcludedSaturday && force) {
        updates.excludedDays = updatedExcludedDays;
      }
      
      await updateTemplate(template.id, updates);
    }
    
    report.updated++;
  }
  
  return report;
}

/**
 * CONSULTATION OPERATIONS
 */

/**
 * Helper: Normalizza email per matching
 */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Helper: Genera document ID deterministico da email
 */
function generateClienteIdFromEmail(email: string): string {
  const normalized = normalizeEmail(email);
  return Buffer.from(normalized).toString('base64url');
}

/**
 * Helper: Collega consultation a cliente (pattern unificato)
 * Riutilizza logica booking per consistency
 */
async function linkConsultationToCliente(
  consultationId: string,
  clienteData: {
    nome: string;
    cognome: string;
    email: string;
    whatsapp: string;
  }
): Promise<void> {
  const normalizedEmail = normalizeEmail(clienteData.email);
  const hashedId = generateClienteIdFromEmail(normalizedEmail);
  
  try {
    // Step 1: Cerca cliente esistente (hash ID o legacy)
    const hashedDocRef = db.collection('clienti').doc(hashedId);
    const hashedDocSnap = await hashedDocRef.get();
    
    let targetRef = hashedDocRef;
    let isNewClient = false;
    
    if (!hashedDocSnap.exists) {
      // Cerca per email (legacy compatibility)
      const legacyQuery = await db.collection('clienti')
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();
      
      if (!legacyQuery.empty) {
        targetRef = legacyQuery.docs[0].ref;
      } else {
        // Nuovo cliente
        isNewClient = true;
      }
    }
    
    // Step 2: Upsert cliente
    if (isNewClient) {
      await targetRef.set({
        nome: clienteData.nome,
        cognome: clienteData.cognome,
        email: normalizedEmail,
        whatsapp: clienteData.whatsapp,
        cellulare1: clienteData.whatsapp,
        via: '',
        citta: '',
        cap: '',
        orarioCasa: '',
        createdAt: Timestamp.now(),
        consultationIds: [consultationId],
      });
    } else {
      // Update cliente esistente (solo campi vuoti)
      const currentData = (await targetRef.get()).data();
      
      await targetRef.update({
        nome: currentData?.nome || clienteData.nome,
        cognome: currentData?.cognome || clienteData.cognome,
        whatsapp: currentData?.whatsapp || clienteData.whatsapp,
        cellulare1: currentData?.cellulare1 || clienteData.whatsapp,
        consultationIds: FieldValue.arrayUnion(consultationId),
      });
    }
    
    // Step 3: Link consultation a cliente
    await db.collection('consultations').doc(consultationId).update({
      clienteId: targetRef.id,
    });
    
  } catch (error: any) {
    console.error('[Link Consultation] Errore:', error.message);
    throw new Error(`Errore linking cliente: ${error.message}`);
  }
}

/**
 * Ottiene tutte le consultations (con filtri opzionali)
 */
export async function getAllConsultations(filters?: {
  stato?: ConsultationStatus[];
  jobType?: string;
  templateId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}): Promise<Consultation[]> {
  let query: any = db.collection('consultations');
  
  if (filters?.stato && filters.stato.length > 0) {
    query = query.where('stato', 'in', filters.stato);
  }
  
  if (filters?.jobType) {
    query = query.where('jobType', '==', filters.jobType);
  }
  
  if (filters?.templateId) {
    query = query.where('templateId', '==', filters.templateId);
  }
  
  // Ordina per data consulenza descending
  query = query.orderBy('dataConsulenza', 'desc');
  
  const snapshot = await query.get();
  
  let results = snapshot.docs.map((doc: QueryDocumentSnapshot) => ({
    id: doc.id,
    ...doc.data(),
  })) as Consultation[];
  
  // Filtri client-side per date range (Firestore non supporta range + in operator)
  if (filters?.dateFrom) {
    const fromTimestamp = Timestamp.fromDate(filters.dateFrom);
    results = results.filter(c => c.dataConsulenza >= fromTimestamp);
  }
  
  if (filters?.dateTo) {
    const toTimestamp = Timestamp.fromDate(filters.dateTo);
    results = results.filter(c => c.dataConsulenza <= toTimestamp);
  }
  
  return results;
}

/**
 * Ottiene consultation per ID
 */
export async function getConsultationById(id: string): Promise<Consultation | null> {
  const doc = await db.collection('consultations').doc(id).get();
  
  if (!doc.exists) {
    return null;
  }
  
  return {
    id: doc.id,
    ...doc.data(),
  } as Consultation;
}

/**
 * Crea nuova consultation
 * NOTA: Verifica conflict detection PRIMA di chiamare questa funzione
 */
export async function createConsultation(
  data: InsertConsultation,
  template: ConsultationTemplate
): Promise<string> {
  const now = Timestamp.now();
  
  // Crea consultation document
  const docRef = await db.collection('consultations').add({
    // Template snapshot
    templateId: data.templateId,
    templateNome: template.nome,
    jobType: template.jobType,
    durataMinuti: template.durataMinuti,
    jobDataFieldsSnapshot: template.jobDataFields,
    
    // Cliente
    cliente: data.cliente,
    // clienteId verrà aggiunto da linkConsultationToCliente
    
    // Slot - convert string or Date to Timestamp
    dataConsulenza: Timestamp.fromDate(new Date(data.dataConsulenza as any)),
    orarioInizio: data.orarioInizio,
    orarioFine: data.orarioFine,
    
    // Job data raccolti
    jobDataCollected: data.jobDataCollected,
    note: data.note,
    
    // Stati workflow
    stato: 'in_attesa' as ConsultationStatus,
    
    // Email tracking
    emailRicevutaInviata: false,
    emailConfermataInviata: false,
    emailAdminInviata: false,
    
    // Conversione job
    jobCreated: false,
    
    // Metadata
    createdAt: now,
    updatedAt: now,
  });
  
  // Link a cliente con compensating transaction (rollback se fallisce)
  try {
    await linkConsultationToCliente(docRef.id, data.cliente);
  } catch (linkError: any) {
    // Rollback: elimina consultation appena creata
    console.error('[createConsultation] Errore linking cliente, eseguo rollback:', linkError.message);
    try {
      await docRef.delete();
      console.log(`[createConsultation] Rollback completato - consultation ${docRef.id} eliminata`);
    } catch (rollbackError: any) {
      console.error('[createConsultation] ERRORE CRITICO: Fallito rollback consultation', rollbackError.message);
    }
    throw new Error(`Errore creazione consultation: ${linkError.message}`);
  }
  
  return docRef.id;
}

/**
 * Aggiorna consultation esistente
 */
export async function updateConsultation(id: string, data: UpdateConsultation): Promise<void> {
  const docRef = db.collection('consultations').doc(id);
  const doc = await docRef.get();
  
  if (!doc.exists) {
    throw new Error(`Consultation ${id} non trovata`);
  }
  
  const updates: any = {
    ...data,
    updatedAt: Timestamp.now(),
  };
  
  // Converti Date a Timestamp combinando data + orario
  if (data.dataConsulenza && data.orarioInizio) {
    // Costruisci ISO string completa per evitare ambiguità timezone
    const combinedDate = new Date(`${data.dataConsulenza}T${data.orarioInizio}:00`);
    updates.dataConsulenza = Timestamp.fromDate(combinedDate);
  }
  
  await docRef.update(updates);
}

/**
 * Elimina consultation
 * Nota: Admin può eliminare consultations in qualsiasi stato (anche confermate)
 * Per consultations confermate, l'evento Google Calendar viene rimosso automaticamente
 */
export async function deleteConsultation(id: string): Promise<void> {
  const doc = await db.collection('consultations').doc(id).get();
  
  if (!doc.exists) {
    throw new Error(`Consultation ${id} non trovata`);
  }
  
  const data = doc.data();
  
  // Rimuovi reference da cliente
  if (data?.clienteId) {
    await db.collection('clienti').doc(data.clienteId).update({
      consultationIds: FieldValue.arrayRemove(id),
    });
  }
  
  await db.collection('consultations').doc(id).delete();
}

/**
 * CONFLICT DETECTION & SLOT AVAILABILITY
 */

/**
 * Verifica se uno slot è disponibile
 * Controlla: consultations + bookings + Google Calendar
 * OTTIMIZZATO: Accetta array pre-caricati per evitare query ridondanti
 */
export async function isSlotAvailable(
  date: Date,
  startTime: string, // "HH:mm"
  endTime: string,   // "HH:mm"
  excludeConsultationId?: string,
  googleCalendarBusyPeriods?: any[],
  preloadedConsultations?: QueryDocumentSnapshot[],
  preloadedBookings?: QueryDocumentSnapshot[]
): Promise<boolean> {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  const slotStart = new Date(date);
  slotStart.setHours(startHour, startMin, 0, 0);
  
  const slotEnd = new Date(date);
  slotEnd.setHours(endHour, endMin, 0, 0);
  
  const isDebug = process.env.NODE_ENV === 'development';
  
  // Check 1: Consultations esistenti (usa array pre-caricato se disponibile)
  let consultationDocs = preloadedConsultations;
  
  if (!consultationDocs) {
    // Fallback: fetch se non pre-caricato (backward compatibility)
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const consultationsQuery = db.collection('consultations')
      .where('stato', 'in', ['in_attesa', 'confermata'])
      .where('dataConsulenza', '>=', Timestamp.fromDate(startOfDay))
      .where('dataConsulenza', '<=', Timestamp.fromDate(endOfDay));
    
    const consultations = await consultationsQuery.get();
    consultationDocs = consultations.docs;
  }
  
  for (const doc of consultationDocs) {
    if (excludeConsultationId && doc.id === excludeConsultationId) {
      continue;
    }
    
    const data = doc.data();
    const [existStartHour, existStartMin] = data.orarioInizio.split(':').map(Number);
    const [existEndHour, existEndMin] = data.orarioFine.split(':').map(Number);
    
    const existStart = new Date(date);
    existStart.setHours(existStartHour, existStartMin, 0, 0);
    
    const existEnd = new Date(date);
    existEnd.setHours(existEndHour, existEndMin, 0, 0);
    
    // Check overlap
    if (slotStart < existEnd && slotEnd > existStart) {
      return false; // Conflict con consultation esistente
    }
  }
  
  // Check 2: Bookings esistenti (usa array pre-caricato se disponibile)
  let bookingDocs = preloadedBookings;
  
  if (!bookingDocs) {
    // Fallback: fetch se non pre-caricato (backward compatibility)
    const bookingStartOfDay = new Date(date);
    bookingStartOfDay.setHours(0, 0, 0, 0);
    
    const bookingEndOfDay = new Date(date);
    bookingEndOfDay.setHours(23, 59, 59, 999);
    
    const bookingsQuery = db.collection('bookings')
      .where('stato', 'in', ['in_attesa', 'confermata'])
      .where('dataShootingInizio', '>=', Timestamp.fromDate(bookingStartOfDay))
      .where('dataShootingInizio', '<=', Timestamp.fromDate(bookingEndOfDay));
    
    const bookings = await bookingsQuery.get();
    bookingDocs = bookings.docs;
  }
  
  if (isDebug && bookingDocs.length > 0) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    console.log(`[Consultations] 📅 Controllo ${bookingDocs.length} bookings per ${year}-${month}-${day}, slot ${startTime}-${endTime}`);
  }
  
  for (const doc of bookingDocs) {
    const data = doc.data();
    const bookingStart = data.dataShootingInizio.toDate();
    const bookingEnd = data.dataShootingFine.toDate();
    
    // Check overlap
    const overlaps = slotStart < bookingEnd && slotEnd > bookingStart;
    
    if (overlaps) {
      if (isDebug) {
        console.log(`[Consultations] ❌ Slot ${startTime}-${endTime} BLOCCATO da booking`);
      }
      return false; // Conflict con booking esistente
    }
  }
  
  // Check 3: Google Calendar events - busy periods (solo se forniti)
  if (Array.isArray(googleCalendarBusyPeriods) && googleCalendarBusyPeriods.length > 0) {
    for (const busy of googleCalendarBusyPeriods) {
      if (!busy.start || !busy.end) continue;
      
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);
      
      // Check sovrapposizione con periodo occupato in Google Calendar
      const overlaps = slotStart < busyEnd && slotEnd > busyStart;
      
      if (overlaps) {
        if (isDebug) {
          console.log(`[Consultations] ❌ Slot ${startTime}-${endTime} BLOCCATO da busy period`);
        }
        return false; // Conflict con evento Google Calendar
      }
    }
  }
  
  return true;
}

/**
 * Calcola slot disponibili per una data
 * Basato su working hours configurabili e template settings
 */
export async function getAvailableSlotsForDate(
  date: Date,
  durataMinuti: number,
  workingHours?: ConsultationWorkingHours[],
  template?: ConsultationTemplate
): Promise<ConsultationSlot[]> {
  const dayOfWeek = date.getDay();
  
  // Check 1: Giorno escluso dal template?
  if (template?.excludedDays && template.excludedDays.includes(dayOfWeek)) {
    console.log(`[getAvailableSlotsForDate] Giorno ${dayOfWeek} escluso dal template ${template.nome}`);
    return []; // Giorno bloccato da template
  }
  
  // Check 2: Determina working hours (priorità: template > parameter > default)
  const hours = template?.customWorkingHours || workingHours || DEFAULT_CONSULTATION_HOURS;
  const dayConfig = hours.find(h => h.giornoSettimana === dayOfWeek);
  
  if (!dayConfig || !dayConfig.attivo) {
    return []; // Giorno non disponibile
  }
  
  // CONTROLLO EVENTI ALL-DAY GOOGLE CALENDAR
  // Se esiste un evento "tutto il giorno", blocca completamente il giorno
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  
  try {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    
    console.log(`[Consultations] Controllo eventi all-day per ${dateStr}`);
    
    const events = await getEvents('primary', dayStart, dayEnd);
    const allDayEvents = events.filter(event => {
      // Eventi all-day hanno 'date' invece di 'dateTime'
      const hasDateStart = event.start?.date && !event.start?.dateTime;
      const hasDateEnd = event.end?.date && !event.end?.dateTime;
      
      if (hasDateStart || hasDateEnd) {
        // Verifica che l'evento copra la data richiesta
        const eventStartDate = event.start?.date || '';
        const eventEndDate = event.end?.date || '';
        
        // Gli eventi all-day hanno end date = giorno dopo (es. evento 20/12 ha end = 21/12)
        // Quindi controlliamo se dateStr è >= start E < end
        return dateStr >= eventStartDate && dateStr < eventEndDate;
      }
      
      return false;
    });
    
    if (allDayEvents.length > 0) {
      console.log(`[Consultations] 🚫 Trovati ${allDayEvents.length} eventi all-day per ${dateStr}:`);
      allDayEvents.forEach(event => {
        console.log(`  - "${event.summary}" (${event.start?.date} → ${event.end?.date})`);
      });
      console.log(`[Consultations] ❌ GIORNO BLOCCATO - Nessuno slot disponibile`);
      
      // Ritorna array vuoto = nessuno slot disponibile
      return [];
    }
    
    console.log(`[Consultations] ✅ Nessun evento all-day trovato per ${dateStr}`);
  } catch (error: any) {
    console.error('[Consultations] ⚠️ Errore controllo eventi all-day Google Calendar:', error.message);
    console.error('[Consultations] Procedo comunque con calcolo slot da Firestore');
    // Se il controllo all-day fallisce, continua con la logica normale
  }
  
  // PERFORMANCE OPTIMIZATION: Pre-carica consultations + bookings UNA VOLTA per l'intera giornata
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  
  const isDebug = process.env.NODE_ENV === 'development';
  
  // Fetch consultations per questa giornata
  let preloadedConsultations: QueryDocumentSnapshot[] = [];
  try {
    const consultationsSnapshot = await db.collection('consultations')
      .where('stato', 'in', ['in_attesa', 'confermata'])
      .where('dataConsulenza', '>=', Timestamp.fromDate(dayStart))
      .where('dataConsulenza', '<=', Timestamp.fromDate(dayEnd))
      .get();
    
    preloadedConsultations = consultationsSnapshot.docs;
    
    if (isDebug) {
      console.log(`[Consultations] ⚡ Pre-caricati ${preloadedConsultations.length} consultations per ${dateStr}`);
    }
  } catch (error: any) {
    console.error('[Consultations] ⚠️ Errore pre-caricamento consultations:', error.message);
  }
  
  // Fetch bookings per questa giornata
  let preloadedBookings: QueryDocumentSnapshot[] = [];
  try {
    const bookingsSnapshot = await db.collection('bookings')
      .where('stato', 'in', ['in_attesa', 'confermata'])
      .where('dataShootingInizio', '>=', Timestamp.fromDate(dayStart))
      .where('dataShootingInizio', '<=', Timestamp.fromDate(dayEnd))
      .get();
    
    preloadedBookings = bookingsSnapshot.docs;
    
    if (isDebug) {
      console.log(`[Consultations] ⚡ Pre-caricati ${preloadedBookings.length} bookings per ${dateStr}`);
    }
  } catch (error: any) {
    console.error('[Consultations] ⚠️ Errore pre-caricamento bookings:', error.message);
  }
  
  // CONTROLLO BUSY PERIODS GOOGLE CALENDAR (una sola chiamata per l'intera giornata)
  let googleBusyPeriods: any[] = [];
  try {
    if (isDebug) {
      console.log(`[Consultations] Fetching Google Calendar busy periods per ${dateStr}`);
    }
    const busyPeriodsResult = await checkFreeBusy('primary', dayStart, dayEnd);
    googleBusyPeriods = Array.isArray(busyPeriodsResult) ? busyPeriodsResult : [];
    
    if (isDebug && googleBusyPeriods.length > 0) {
      console.log(`[Consultations] ✅ Trovati ${googleBusyPeriods.length} busy periods in Google Calendar`);
    }
  } catch (error: any) {
    console.error('[Consultations] ⚠️ Errore fetching busy periods Google Calendar:', error.message);
    // Se il controllo Google Calendar fallisce, continua con la logica normale
  }
  
  // Genera tutti gli slot possibili per la giornata
  const slots: ConsultationSlot[] = [];
  
  const [apH, apM] = dayConfig.apertura.split(':').map(Number);
  const [chH, chM] = dayConfig.chiusura.split(':').map(Number);
  
  let current = new Date(date);
  current.setHours(apH, apM, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(chH, chM, 0, 0);
  
  while (current < endOfDay) {
    const slotEnd = new Date(current.getTime() + durataMinuti * 60000);
    
    if (slotEnd > endOfDay) {
      break; // Slot sfora chiusura
    }
    
    // Check se slot è in pausa pranzo
    if (dayConfig.pausaInizio && dayConfig.pausaFine) {
      const [pIH, pIM] = dayConfig.pausaInizio.split(':').map(Number);
      const [pFH, pFM] = dayConfig.pausaFine.split(':').map(Number);
      
      const pausaStart = new Date(date);
      pausaStart.setHours(pIH, pIM, 0, 0);
      
      const pausaEnd = new Date(date);
      pausaEnd.setHours(pFH, pFM, 0, 0);
      
      // Skip se slot overlap con pausa
      if (current < pausaEnd && slotEnd > pausaStart) {
        current = new Date(pausaEnd);
        continue;
      }
    }
    
    const startTime = `${current.getHours().toString().padStart(2, '0')}:${current.getMinutes().toString().padStart(2, '0')}`;
    const endTime = `${slotEnd.getHours().toString().padStart(2, '0')}:${slotEnd.getMinutes().toString().padStart(2, '0')}`;
    
    // Verifica disponibilità usando array pre-caricati (ZERO query Firestore per slot!)
    const available = await isSlotAvailable(
      date,
      startTime,
      endTime,
      undefined, // excludeConsultationId
      googleBusyPeriods,
      preloadedConsultations, // ⚡ OPTIMIZATION: passa array pre-caricato
      preloadedBookings       // ⚡ OPTIMIZATION: passa array pre-caricato
    );
    
    slots.push({
      start: current.toISOString(),
      end: slotEnd.toISOString(),
      startTime,
      endTime,
      available,
    });
    
    // Avanza di 30 minuti (slot standard)
    current = new Date(current.getTime() + 30 * 60000);
  }
  
  if (isDebug) {
    console.log(`[Consultations] ⚡ Generati ${slots.length} slot totali (${slots.filter(s => s.available).length} disponibili)`);
  }
  
  return slots;
}
