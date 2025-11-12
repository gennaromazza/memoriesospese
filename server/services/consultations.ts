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
  
  // Converti Date a Timestamp se presente
  if (data.dataConsulenza) {
    updates.dataConsulenza = Timestamp.fromDate(new Date(data.dataConsulenza as any));
  }
  
  await docRef.update(updates);
}

/**
 * Elimina consultation (solo se in_attesa o annullata)
 */
export async function deleteConsultation(id: string): Promise<void> {
  const doc = await db.collection('consultations').doc(id).get();
  
  if (!doc.exists) {
    throw new Error(`Consultation ${id} non trovata`);
  }
  
  const data = doc.data();
  if (data?.stato === 'confermata' || data?.stato === 'completata') {
    throw new Error('Impossibile eliminare consultation confermata o completata');
  }
  
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
 */
export async function isSlotAvailable(
  date: Date,
  startTime: string, // "HH:mm"
  endTime: string,   // "HH:mm"
  excludeConsultationId?: string,
  googleCalendarBusyPeriods?: any[]
): Promise<boolean> {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  const slotStart = new Date(date);
  slotStart.setHours(startHour, startMin, 0, 0);
  
  const slotEnd = new Date(date);
  slotEnd.setHours(endHour, endMin, 0, 0);
  
  // Check 1: Consultations esistenti
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const consultationsQuery = db.collection('consultations')
    .where('stato', 'in', ['in_attesa', 'confermata'])
    .where('dataConsulenza', '>=', Timestamp.fromDate(startOfDay))
    .where('dataConsulenza', '<=', Timestamp.fromDate(endOfDay));
  
  const consultations = await consultationsQuery.get();
  
  for (const doc of consultations.docs) {
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
  
  // Check 2: Bookings esistenti (stessa logica)
  const bookingStartOfDay = new Date(date);
  bookingStartOfDay.setHours(0, 0, 0, 0);
  
  const bookingEndOfDay = new Date(date);
  bookingEndOfDay.setHours(23, 59, 59, 999);
  
  const bookingsQuery = db.collection('bookings')
    .where('stato', 'in', ['in_attesa', 'confermata'])
    .where('dataShootingInizio', '>=', Timestamp.fromDate(bookingStartOfDay))
    .where('dataShootingInizio', '<=', Timestamp.fromDate(bookingEndOfDay));
  
  const bookings = await bookingsQuery.get();
  
  for (const doc of bookings.docs) {
    const data = doc.data();
    const bookingStart = data.dataShootingInizio.toDate();
    const bookingEnd = data.dataShootingFine.toDate();
    
    // Check overlap
    if (slotStart < bookingEnd && slotEnd > bookingStart) {
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
      if (slotStart < busyEnd && slotEnd > busyStart) {
        return false; // Conflict con evento Google Calendar
      }
    }
  }
  
  return true;
}

/**
 * Calcola slot disponibili per una data
 * Basato su working hours configurabili
 */
export async function getAvailableSlotsForDate(
  date: Date,
  durataMinuti: number,
  workingHours?: ConsultationWorkingHours[]
): Promise<ConsultationSlot[]> {
  const dayOfWeek = date.getDay();
  const hours = workingHours || DEFAULT_CONSULTATION_HOURS;
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
  
  // CONTROLLO BUSY PERIODS GOOGLE CALENDAR (una sola chiamata per l'intera giornata)
  let googleBusyPeriods: any[] = [];
  try {
    const calendarDayStart = new Date(date);
    calendarDayStart.setHours(0, 0, 0, 0);
    
    const calendarDayEnd = new Date(date);
    calendarDayEnd.setHours(23, 59, 59, 999);
    
    console.log(`[Consultations] Fetching Google Calendar busy periods per ${dateStr}`);
    const busyPeriodsResult = await checkFreeBusy('primary', calendarDayStart, calendarDayEnd);
    googleBusyPeriods = Array.isArray(busyPeriodsResult) ? busyPeriodsResult : [];
    console.log(`[Consultations] ✅ Trovati ${googleBusyPeriods.length} busy periods in Google Calendar`);
  } catch (error: any) {
    console.error('[Consultations] ⚠️ Errore fetching busy periods Google Calendar:', error.message);
    console.error('[Consultations] Procedo senza controllo Google Calendar busy periods');
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
    
    // Verifica disponibilità (consultations + bookings + Google Calendar)
    const available = await isSlotAvailable(date, startTime, endTime, undefined, googleBusyPeriods);
    
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
  
  return slots;
}
