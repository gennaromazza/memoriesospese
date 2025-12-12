/**
 * TypeScript Types per Modulo Booking
 * Collections Firestore: products, booking_campaigns, bookings, orders, photo_selections
 */

import { Timestamp } from 'firebase/firestore';
import { WorkflowState } from './schema';

/**
 * PRODUCTS - Catalogo prodotti fotografici
 */
export interface Product {
  id: string;
  nome: string;
  descrizione: string;
  prezzo: number; // Prezzo base in euro
  sconto: number; // Sconto in percentuale (0-100)
  prezzoFinale: number; // Calcolato automaticamente
  numeroFoto: number; // Numero foto incluse nel prodotto (es. 20 per album)
  categoria: string; // Riferimento a ProductCategory.value
  attivo: boolean;
  immagini: string[]; // Array URLs immagini prodotto da Firebase Storage
  displayOrder?: number; // Ordine di visualizzazione (opzionale per backward compatibility)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InsertProduct {
  nome: string;
  descrizione: string;
  prezzo: number;
  sconto: number;
  numeroFoto: number;
  categoria: string; // Riferimento a ProductCategory.value
  attivo: boolean;
  immagini?: string[]; // Opzionale in fase di creazione
}

/**
 * PRODUCT CATEGORIES - Categorie prodotti dinamiche
 */
export interface ProductCategory {
  id: string;
  nome: string; // Nome visualizzato (es. "Album Fotografico")
  value: string; // Valore tecnico univoco (es. "album")
  attivo: boolean;
  displayOrder: number; // Ordine di visualizzazione nei dropdown
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InsertProductCategory {
  nome: string;
  value: string;
  attivo: boolean;
  displayOrder: number;
}

export const DEFAULT_PRODUCT_CATEGORIES: InsertProductCategory[] = [
  {
    nome: 'Album Fotografico',
    value: 'album',
    displayOrder: 1,
    attivo: true
  },
  {
    nome: 'Stampe',
    value: 'stampe',
    displayOrder: 2,
    attivo: true
  },
  {
    nome: 'File Digitali',
    value: 'digitale',
    displayOrder: 3,
    attivo: true
  },
  {
    nome: 'Video/Montaggio',
    value: 'video',
    displayOrder: 4,
    attivo: true
  },
  {
    nome: 'Pacchetto Completo',
    value: 'pacchetto',
    displayOrder: 5,
    attivo: true
  }
];

/**
 * BOOKING CAMPAIGNS - Campagne di prenotazione stagionali
 */
export interface BookingCampaign {
  id: string;
  nome: string; // es. "Shooting Natalizio 2025"
  code: string; // es. "ABC123XY" - 8 char alphanumeric per URL /prenota/[code]
  descrizione: string;
  
  // Date validità (Date per compatibilità client-side)
  dataInizio: Date;
  dataFine: Date;
  
  // Anticipo slider homepage (opzionale)
  giorniAnticipoSlider?: number; // Giorni prima di dataInizio in cui lo slider appare in homepage (default: 0)
  bloccaPrenotazioniPrimaInizio?: boolean; // Se true, blocca prenotazioni prima di dataInizio anche se slider visibile (default: false)
  
  // Tema associato (null se nessun tema)
  temaStagionale: string | null; // 'natale' | 'carnevale' | 'san-valentino' | 'pasqua' | 'halloween' | null
  
  // Orari lavorativi
  orarioApertura: string; // es. "09:00"
  orarioPausaInizio: string; // es. "13:00"
  orarioPausaFine: string; // es. "14:30"
  orarioChiusura: string; // es. "19:00"
  
  // Durata shooting (in minuti)
  durataShootingMinuti: number; // es. 120 per 2 ore
  
  // Giorni esclusi dalla prenotazione (0=Domenica, 1=Lunedì, ..., 6=Sabato)
  excludedDays?: number[]; // es. [0] per escludere la domenica
  
  // Prodotti disponibili per questa campagna
  prodottiDisponibili: string[]; // Array di productId
  
  // Immagini personalizzate (opzionali)
  immagineSlider?: string; // URL immagine per slider homepage (opzionale)
  immaginePaginaBooking?: string; // URL immagine hero pagina booking pubblica (per preview WhatsApp/social)
  
  attiva: boolean; // Femminile: "campagna attiva"
  createdAt: Date;
}

/**
 * BOOKINGS - Prenotazioni clienti
 */
export interface Booking {
  id: string;
  campaignId: string; // Riferimento a booking_campaigns
  
  // Collegamenti
  clienteId?: string; // NUOVO: Riferimento a collection clienti (opzionale per backward compatibility)
  
  // Dati cliente
  cliente: {
    nome: string;
    cognome: string;
    email: string;
    whatsapp: string;
  };
  
  // Slot prenotato
  dataShootingInizio: Timestamp; // es. 2025-12-15 10:00
  dataShootingFine: Timestamp; // es. 2025-12-15 12:00
  
  // Prodotto scelto (opzionale)
  prodottoId?: string; // null se "da decidere in sede"
  prodottoNome?: string; // Snapshot nome prodotto
  
  // Note cliente
  note: string;
  
  // Stato prenotazione
  stato: 'in_attesa' | 'confermata' | 'completata' | 'annullata';
  
  // Stato workflow operativo (gestione commesse)
  statoWorkflow?: WorkflowState; // Stato nel workflow operativo
  
  // Tracking email/calendar
  emailRicevutaInviata: boolean; // Email "Prenotazione Ricevuta" (automatica dopo creazione)
  emailConfermataInviata: boolean; // Email "Prenotazione Confermata" (dopo approvazione admin)
  emailAdminInviata?: boolean; // Email notifica admin (automatica dopo creazione)
  reminderEmailSent?: boolean; // Email reminder inviata (es. promemoria 24h prima)
  googleCalendarEventId?: string; // ID evento creato su Google Calendar
  
  // Tracking visualizzazione admin
  dataVisualizzazione?: Timestamp; // Timestamp prima volta che admin vede prenotazione
  
  // Prenotazione manuale (walk-in)
  isManual?: boolean; // true se creata da admin, false/undefined se da form pubblico
  createdByAdmin?: string; // Email admin che ha creato prenotazione manuale
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
  confermataDa?: string; // UID admin che ha confermato
  confermatail?: Timestamp;
}

export interface InsertBooking {
  campaignId: string;
  cliente: {
    nome: string;
    cognome: string;
    email: string;
    whatsapp: string;
  };
  dataShootingInizio: Date;
  dataShootingFine: Date;
  prodottoId?: string;
  prodottoNome?: string;
  note: string;
  isManual?: boolean; // Flag per prenotazioni manuali (walk-in)
  createdByAdmin?: string; // Email admin per prenotazioni manuali
}

/**
 * ORDER ITEM - Singolo prodotto in un ordine
 */
export interface OrderItem {
  prodottoId: string; // Per prodotti custom inizia con "custom_"
  prodottoNome: string; // Snapshot nome al momento ordine
  prodottoPrezzo: number; // Snapshot prezzo al momento ordine
  prodottoNumeroFoto: number; // Snapshot numero foto
  quantita: number; // Default 1
  isCustom?: boolean; // true se prodotto personalizzato (non da catalogo)
}

/**
 * TRANSACTION - Singola transazione di pagamento (acconto o saldo)
 */
export interface Transaction {
  tipo: 'acconto' | 'saldo';
  importo: number; // Importo pagato in euro
  metodo: 'contante' | 'carta' | 'bonifico' | 'paypal';
  data: Timestamp;
  note?: string; // Note opzionali (es. "Primo acconto", "Bonifico IBAN: IT...")
  emailInviata: boolean; // Flag per tracking notifica email cliente
}

/**
 * ORDERS - Ordini collegati a gallerie
 */
export interface Order {
  id: string;
  
  // Collegamenti
  clienteId?: string; // NUOVO: Riferimento a collection clienti (opzionale per backward compatibility)
  bookingId?: string; // Opzionale - collegamento a prenotazione
  galleryId?: string; // Opzionale - collegamento a galleria (può essere null se ordine standalone)
  
  // Data servizio (per previsioni incasso e financial dashboard)
  dataServizio?: Timestamp; // Data servizio fotografico (copiata da booking.dataShootingInizio)
  
  // Dati cliente (snapshot per email notifications)
  nomeCliente?: string; // Nome completo cliente
  emailCliente?: string; // Email cliente per notifiche
  whatsappCliente?: string; // WhatsApp cliente
  
  // Prodotti (array embedded - supporta multipli prodotti)
  prodotti: OrderItem[];
  
  // Prezzi
  totale: number; // Somma (prodotto.prezzo * quantita) per tutti prodotti
  acconto: number; // Somma totale acconti (kept in sync con sum(transactions.filter(t => t.tipo === 'acconto')))
  saldo: number; // Auto-calcolato: totale - acconto
  
  // Storico pagamenti (NEW: supporta acconti multipli + saldo)
  transactions: Transaction[]; // Array di tutte le transazioni (acconti + saldo)
  
  // Legacy fields (mantenuti per backward compatibility - deprecati)
  metodoPagamentoAcconto?: 'contante' | 'carta' | 'bonifico' | 'paypal';
  dataAcconto?: Timestamp;
  metodoPagamentoSaldo?: 'contante' | 'carta' | 'bonifico' | 'paypal';
  dataSaldo?: Timestamp;
  
  // Stato
  stato: 'bozza' | 'in_lavorazione' | 'completato' | 'annullato';
  
  // Stato workflow operativo (gestione commesse) - sincronizzato con booking
  statoWorkflow?: WorkflowState; // Stato nel workflow operativo
  
  // Notifiche
  emailSaldoInviata: boolean;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InsertOrder {
  bookingId?: string;
  galleryId?: string; // Opzionale
  jobId?: string; // Opzionale - per auto-link ordine a job
  nomeCliente: string;
  emailCliente: string;
  whatsappCliente?: string;
  prodotti: OrderItem[]; // Array di prodotti (almeno 1)
  acconto: number; // Totale calcolato automaticamente dalla somma prodotti
  note?: string;
  stato?: 'bozza' | 'in_lavorazione' | 'completato' | 'annullato';
  metodoPagamentoAcconto?: 'contante' | 'carta' | 'bonifico' | 'paypal';
}

/**
 * PHOTO SELECTIONS - Foto selezionate da clienti
 */
export interface PhotoSelection {
  id: string;
  
  // Collegamenti
  galleryId: string; // Galleria di appartenenza
  orderId?: string; // Opzionale - collegamento a ordine specifico
  
  // Foto selezionata
  photoId: string; // ID documento in collection photos
  photoName: string; // Nome file per export Lightroom
  photoUrl: string; // URL per preview admin
  
  // Chi ha selezionato (se tracciato)
  selectedBy?: string; // UID utente o "guest"
  selectedByName?: string;
  
  selectedAt: Timestamp;
}

export interface InsertPhotoSelection {
  galleryId: string;
  orderId?: string;
  photoId: string;
  photoName: string;
  photoUrl: string;
  selectedBy?: string;
  selectedByName?: string;
}

/**
 * GALLERY - Estensione interfaccia galleria esistente per modalità selezione
 */
export interface GallerySelectionSettings {
  selectionEnabled: boolean; // Modalità selezione attiva
  maxPhotosSelectable: number; // Limite massimo foto selezionabili
  selectionLinkedToOrder?: string; // ID ordine collegato (opzionale)
}
