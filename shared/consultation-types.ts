/**
 * CONSULTATION SYSTEM - Types & Interfaces
 * Sistema prenotazione consulenze pre-lavoro con raccolta dati anticipata
 */

import { Timestamp } from 'firebase/firestore';
import { z } from 'zod';

/**
 * Definizione campo job da raccogliere durante consulenza
 * DISCRIMINATED UNION per type safety e validazione metadata
 */

// Base comune tutti i campi
interface ConsultationJobFieldBase {
  fieldKey: string;           // Chiave canonica (es. "eventDate", "eventLocation")
  label: string;              // Label UI (es. "Data Evento", "Location Ricevimento")
  required: boolean;          // Campo obbligatorio o facoltativo
  placeholder?: string;       // Placeholder per input
  helperText?: string;        // Testo di aiuto sotto il campo
}

// Campo data
export interface ConsultationJobFieldDate extends ConsultationJobFieldBase {
  type: 'date';
  min?: string;               // Data minima (ISO string)
  max?: string;               // Data massima (ISO string)
}

// Campo testo breve
export interface ConsultationJobFieldText extends ConsultationJobFieldBase {
  type: 'text';
  minLength?: number;
  maxLength?: number;
}

// Campo numerico
export interface ConsultationJobFieldNumber extends ConsultationJobFieldBase {
  type: 'number';
  min?: number;               // Valore minimo
  max?: number;               // Valore massimo
  step?: number;              // Incremento (es. 0.5, 10)
}

// Campo select singolo
export interface ConsultationJobFieldSelect extends ConsultationJobFieldBase {
  type: 'select';
  options: string[];          // Opzioni obbligatorie per select
}

// Campo textarea
export interface ConsultationJobFieldTextarea extends ConsultationJobFieldBase {
  type: 'textarea';
  minLength?: number;
  maxLength?: number;
  rows?: number;              // Altezza textarea
}

// Campo multi-select
export interface ConsultationJobFieldMultiSelect extends ConsultationJobFieldBase {
  type: 'multi-select';
  options: string[];          // Opzioni obbligatorie per multi-select
  minSelections?: number;     // Minimo selezioni richieste
  maxSelections?: number;     // Massimo selezioni consentite
}

// Discriminated union completa
export type ConsultationJobField = 
  | ConsultationJobFieldDate
  | ConsultationJobFieldText
  | ConsultationJobFieldNumber
  | ConsultationJobFieldSelect
  | ConsultationJobFieldTextarea
  | ConsultationJobFieldMultiSelect;

// Type alias per backwards compatibility e type narrowing
export type ConsultationJobFieldType = ConsultationJobField['type'];

/**
 * Valore campo job raccolto (union tipizzata)
 */
export type ConsultationJobFieldValue = 
  | string      // text, textarea, date (ISO string), select
  | number      // number
  | string[];   // multi-select

/**
 * Stati workflow consulenza (allineato a booking)
 */
export type ConsultationStatus = 
  | 'in_attesa'    // Prenotazione ricevuta, in attesa approvazione
  | 'confermata'   // Approvata da admin, evento creato su Google Calendar
  | 'rifiutata'    // Rifiutata da admin
  | 'completata'   // Consulenza svolta
  | 'annullata';   // Annullata

/**
 * CONSULTATION TEMPLATE - Template configurabile per tipo lavoro
 * Collection: consultation_templates
 */
export interface ConsultationTemplate {
  id: string;
  nome: string;                           // "Chiacchierata conoscitiva", "Visione impaginato"
  jobType: string;                        // "Matrimonio", "Battesimo" (usa JobType da jobs-types.ts)
  durataMinuti: number;                   // 30, 60, 90, 120
  descrizione: string;                    // Testo guida cliente
  
  // Campi job da raccogliere (configurazione dinamica)
  jobDataFields: ConsultationJobField[];  // Array campi configurabili
  
  // Disponibilità e orari personalizzati
  excludedDays?: number[];                // Giorni settimana esclusi (0-6: 0=Dom, 6=Sab)
  customWorkingHours?: ConsultationWorkingHours[];  // Orari custom (sovrascrive DEFAULT se presente)
  
  // Immagini template (Firebase Storage URLs)
  imageUrls?: string[];                   // Array URLs immagini per preview cliente
  
  attiva: boolean;                        // Template disponibile per prenotazione
  ordine: number;                         // Ordinamento display (default 0)
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * INSERT CONSULTATION TEMPLATE - Dati creazione template
 */
export interface InsertConsultationTemplate {
  nome: string;
  jobType: string;
  durataMinuti: number;
  descrizione: string;
  jobDataFields: ConsultationJobField[];
  excludedDays?: number[];
  customWorkingHours?: ConsultationWorkingHours[];
  imageUrls?: string[];
  attiva: boolean;
  ordine: number;
}

/**
 * UPDATE CONSULTATION TEMPLATE - Dati aggiornamento template
 */
export interface UpdateConsultationTemplate {
  nome?: string;
  durataMinuti?: number;
  descrizione?: string;
  jobDataFields?: ConsultationJobField[];
  excludedDays?: number[];
  customWorkingHours?: ConsultationWorkingHours[];
  imageUrls?: string[];
  attiva?: boolean;
  ordine?: number;
}

/**
 * CONSULTATION - Prenotazione consulenza cliente
 * Collection: consultations
 */
export interface Consultation {
  id: string;
  
  // Template usato (snapshot per audit)
  templateId: string;
  templateNome: string;                   // Snapshot nome template
  jobType: string;                        // Snapshot tipo lavoro
  durataMinuti: number;                   // Snapshot durata
  jobDataFieldsSnapshot: ConsultationJobField[];  // Snapshot configurazione campi per auditability
  
  // Cliente (pattern unificato come booking)
  clienteId?: string;                     // Link collezione clienti (opzionale per legacy)
  cliente: {
    nome: string;
    cognome: string;
    email: string;
    whatsapp: string;
  };
  
  // Slot prenotato
  dataConsulenza: Timestamp;              // Data + ora consulenza
  orarioInizio: string;                   // "10:00" (HH:mm)
  orarioFine: string;                     // "11:00" (HH:mm)
  
  // Dati job anticipati raccolti (facoltativi - basati su template)
  jobDataCollected: Record<string, ConsultationJobFieldValue>;
  // Es: { eventDate: "2025-06-15", eventLocation: "Villa Rosa", numeroOspiti: 120 }
  
  // Note cliente
  note: string;
  
  // Stati workflow
  stato: ConsultationStatus;
  
  // Google Calendar integration
  googleCalendarEventId?: string;         // ID evento creato su Google Calendar
  
  // Email tracking
  emailRicevutaInviata: boolean;          // Email "Prenotazione Ricevuta"
  emailConfermataInviata: boolean;        // Email "Consulenza Confermata"
  emailAdminInviata: boolean;             // Notifica admin
  reminderEmailSent?: boolean;            // Email reminder inviata (es. promemoria 24h prima)
  
  // Tracking visualizzazione admin
  dataVisualizzazione?: Timestamp;        // Timestamp prima visualizzazione admin
  
  // Conversione in job
  jobCreated: boolean;                    // Flag conversione effettuata
  jobId?: string;                         // ID job creato da consulenza
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  confermataDa?: string;                  // UID admin che ha confermato
  confermatail?: Timestamp;               // Timestamp conferma
}

/**
 * INSERT CONSULTATION - Dati creazione prenotazione
 */
export interface InsertConsultation {
  templateId: string;
  cliente: {
    nome: string;
    cognome: string;
    email: string;
    whatsapp: string;
  };
  dataConsulenza: string;  // ISO string (frontend → backend), coerced to Date in schema
  orarioInizio: string;
  orarioFine: string;
  jobDataCollected: Record<string, ConsultationJobFieldValue>;
  note: string;
}

/**
 * UPDATE CONSULTATION - Dati aggiornamento consulenza
 */
export interface UpdateConsultation {
  cliente?: {
    nome: string;
    cognome: string;
    email: string;
    whatsapp: string;
  };
  dataConsulenza?: string;  // ISO string, coerced to Date in schema
  orarioInizio?: string;
  orarioFine?: string;
  jobDataCollected?: Record<string, ConsultationJobFieldValue>;
  note?: string;
  stato?: ConsultationStatus;
  googleCalendarEventId?: string;
  jobCreated?: boolean;
  jobId?: string;
}

/**
 * ZOD SCHEMAS - Validazione runtime
 */

// Base schema comuni
const ConsultationJobFieldBaseSchema = z.object({
  fieldKey: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean(),
  placeholder: z.string().optional(),
  helperText: z.string().optional(),
});

// Schema discriminated union per ogni tipo di campo
const ConsultationJobFieldDateSchema = ConsultationJobFieldBaseSchema.extend({
  type: z.literal('date'),
  min: z.string().optional(),
  max: z.string().optional(),
});

const ConsultationJobFieldTextSchema = ConsultationJobFieldBaseSchema.extend({
  type: z.literal('text'),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
});

const ConsultationJobFieldNumberSchema = ConsultationJobFieldBaseSchema.extend({
  type: z.literal('number'),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
});

const ConsultationJobFieldSelectSchema = ConsultationJobFieldBaseSchema.extend({
  type: z.literal('select'),
  options: z.array(z.string()).min(1, "Select richiede almeno 1 opzione"),
});

const ConsultationJobFieldTextareaSchema = ConsultationJobFieldBaseSchema.extend({
  type: z.literal('textarea'),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  rows: z.number().optional(),
});

const ConsultationJobFieldMultiSelectSchema = ConsultationJobFieldBaseSchema.extend({
  type: z.literal('multi-select'),
  options: z.array(z.string()).min(1, "Multi-select richiede almeno 1 opzione"),
  minSelections: z.number().optional(),
  maxSelections: z.number().optional(),
});

// Discriminated union schema completo
export const ConsultationJobFieldSchema = z.discriminatedUnion('type', [
  ConsultationJobFieldDateSchema,
  ConsultationJobFieldTextSchema,
  ConsultationJobFieldNumberSchema,
  ConsultationJobFieldSelectSchema,
  ConsultationJobFieldTextareaSchema,
  ConsultationJobFieldMultiSelectSchema,
]);

// Schema working hours per validazione
const ConsultationWorkingHoursSchema = z.object({
  giornoSettimana: z.number().min(0).max(6),
  apertura: z.string().regex(/^\d{2}:\d{2}$/, "Formato ora non valido (HH:mm)"),
  pausaInizio: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  pausaFine: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  chiusura: z.string().regex(/^\d{2}:\d{2}$/, "Formato ora non valido (HH:mm)"),
  attivo: z.boolean(),
});

// Schema template inserimento
export const InsertConsultationTemplateSchema = z.object({
  nome: z.string().min(1, "Nome template obbligatorio"),
  jobType: z.string().min(1, "Tipo lavoro obbligatorio"),
  durataMinuti: z.number().min(15).max(480, "Durata massima 8 ore"),
  descrizione: z.string().min(1, "Descrizione obbligatoria"),
  jobDataFields: z.array(ConsultationJobFieldSchema),
  excludedDays: z.array(z.number().min(0).max(6)).optional(),
  customWorkingHours: z.array(ConsultationWorkingHoursSchema).optional(),
  imageUrls: z.array(z.string().url()).optional(),
  attiva: z.boolean(),
  ordine: z.number().int().default(0),
});

// Schema template aggiornamento
export const UpdateConsultationTemplateSchema = InsertConsultationTemplateSchema.partial();

// Schema cliente (riutilizzabile)
const ClienteDataSchema = z.object({
  nome: z.string().min(1, "Nome obbligatorio"),
  cognome: z.string().min(1, "Cognome obbligatorio"),
  email: z.string().email("Email non valida"),
  whatsapp: z.string().min(1, "WhatsApp obbligatorio"),
});

// Schema job data value (validazione flessibile)
const JobDataValueSchema = z.union([
  z.string(),
  z.number(),
  z.array(z.string()),
]);

// Schema consulenza inserimento
export const InsertConsultationSchema = z.object({
  templateId: z.string().min(1, "Template obbligatorio"),
  cliente: ClienteDataSchema,
  dataConsulenza: z.coerce.date(),  // Coerce string ISO → Date
  orarioInizio: z.string().regex(/^\d{2}:\d{2}$/, "Formato orario non valido (HH:mm)"),
  orarioFine: z.string().regex(/^\d{2}:\d{2}$/, "Formato orario non valido (HH:mm)"),
  jobDataCollected: z.record(z.string(), JobDataValueSchema),
  note: z.string().default(""),
});

// Schema consulenza aggiornamento
export const UpdateConsultationSchema = z.object({
  cliente: ClienteDataSchema.optional(),
  dataConsulenza: z.coerce.date().optional(),  // Coerce string ISO → Date
  orarioInizio: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  orarioFine: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  jobDataCollected: z.record(z.string(), JobDataValueSchema).optional(),
  note: z.string().optional(),
  stato: z.enum(['in_attesa', 'confermata', 'completata', 'annullata']).optional(),
  googleCalendarEventId: z.string().optional(),
  jobCreated: z.boolean().optional(),
  jobId: z.string().optional(),
});

/**
 * HELPER TYPES - Filtri e query
 */

// Filtri ricerca consultations
export interface ConsultationFilters {
  stato?: ConsultationStatus[];
  jobType?: string[];
  templateId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  searchQuery?: string;
}

// Stats aggregate per dashboard
export interface ConsultationStats {
  totalConsultations: number;
  byStatus: Record<ConsultationStatus, number>;
  byJobType: Record<string, number>;
  conversionRate: number;  // % consultations convertite in job
}

/**
 * SLOT AVAILABILITY - Calcolo slot disponibili
 */
export interface ConsultationSlot {
  start: string;      // ISO string
  end: string;        // ISO string
  startTime: string;  // "HH:mm"
  endTime: string;    // "HH:mm"
  available: boolean;
}

/**
 * WORKING HOURS CONFIG - Configurazione orari consulenze
 * Può essere hardcoded o gestito da admin panel in futuro
 */
export interface ConsultationWorkingHours {
  giornoSettimana: number;  // 0=Dom, 1=Lun, ..., 6=Sab
  apertura: string;         // "09:00"
  pausaInizio?: string;     // "13:00" (opzionale)
  pausaFine?: string;       // "14:30" (opzionale)
  chiusura: string;         // "18:00"
  attivo: boolean;          // Giorno attivo per consulenze
}

// Configurazione default orari consulenze (Lun-Sab 9-18 con pausa 13-14:30)
export const DEFAULT_CONSULTATION_HOURS: ConsultationWorkingHours[] = [
  { giornoSettimana: 0, apertura: '09:00', chiusura: '18:00', attivo: false }, // Dom
  { giornoSettimana: 1, apertura: '09:00', pausaInizio: '13:00', pausaFine: '14:30', chiusura: '18:00', attivo: true }, // Lun
  { giornoSettimana: 2, apertura: '09:00', pausaInizio: '13:00', pausaFine: '14:30', chiusura: '18:00', attivo: true }, // Mar
  { giornoSettimana: 3, apertura: '09:00', pausaInizio: '13:00', pausaFine: '14:30', chiusura: '18:00', attivo: true }, // Mer
  { giornoSettimana: 4, apertura: '09:00', pausaInizio: '13:00', pausaFine: '14:30', chiusura: '18:00', attivo: true }, // Gio
  { giornoSettimana: 5, apertura: '09:00', pausaInizio: '13:00', pausaFine: '14:30', chiusura: '18:00', attivo: true }, // Ven
  { giornoSettimana: 6, apertura: '09:00', pausaInizio: '13:00', pausaFine: '14:30', chiusura: '18:00', attivo: true }, // Sab
];
