/**
 * TypeScript Types per Modulo Booking
 * Collections Firestore: products, booking_campaigns, bookings, orders, photo_selections
 */

import { Timestamp } from 'firebase/firestore';

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
  categoria: 'album' | 'stampe' | 'digitale' | 'video' | 'pacchetto';
  attivo: boolean;
  immagini: string[]; // Array URLs immagini prodotto da Firebase Storage
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InsertProduct {
  nome: string;
  descrizione: string;
  prezzo: number;
  sconto: number;
  numeroFoto: number;
  categoria: 'album' | 'stampe' | 'digitale' | 'video' | 'pacchetto';
  attivo: boolean;
  immagini?: string[]; // Opzionale in fase di creazione
}

/**
 * BOOKING CAMPAIGNS - Campagne di prenotazione stagionali
 */
export interface BookingCampaign {
  id: string;
  nome: string; // es. "Shooting Natalizio 2025"
  slug: string; // es. "natale-2025" per URL
  descrizione: string;
  
  // Date validità
  dataInizio: Timestamp;
  dataFine: Timestamp;
  
  // Tema associato
  tema: 'none' | 'natale' | 'carnevale' | 'san-valentino' | 'pasqua' | 'halloween';
  
  // Orari lavorativi
  orarioApertura: string; // es. "09:00"
  orarioPausaInizio: string; // es. "13:00"
  orarioPausaFine: string; // es. "14:30"
  orarioChiusura: string; // es. "19:00"
  
  // Durata shooting (in minuti)
  durataShootingMinuti: number; // es. 120 per 2 ore
  
  // Prodotti disponibili per questa campagna
  prodottiDisponibili: string[]; // Array di productId
  
  // Google Calendar
  googleCalendarId?: string; // ID calendario Google da sincronizzare
  
  attivo: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InsertBookingCampaign {
  nome: string;
  slug: string;
  descrizione: string;
  dataInizio: Date;
  dataFine: Date;
  tema: 'none' | 'natale' | 'carnevale' | 'san-valentino' | 'pasqua' | 'halloween';
  orarioApertura: string;
  orarioPausaInizio: string;
  orarioPausaFine: string;
  orarioChiusura: string;
  durataShootingMinuti: number;
  prodottiDisponibili: string[];
  googleCalendarId?: string;
  attivo: boolean;
}

/**
 * BOOKINGS - Prenotazioni clienti
 */
export interface Booking {
  id: string;
  campaignId: string; // Riferimento a booking_campaigns
  
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
  
  // Tracking email/calendar
  emailConfermataInviata: boolean;
  googleCalendarEventId?: string; // ID evento creato su Google Calendar
  
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
}

/**
 * ORDERS - Ordini collegati a gallerie
 */
export interface Order {
  id: string;
  
  // Collegamenti
  bookingId?: string; // Opzionale - collegamento a prenotazione
  galleryId: string; // Obbligatorio - ogni ordine è per una galleria
  
  // Prodotto
  prodottoId: string;
  prodottoNome: string; // Snapshot
  prodottoNumeroFoto: number; // Snapshot
  
  // Prezzi
  totale: number;
  acconto: number;
  saldo: number; // Auto-calcolato: totale - acconto
  
  // Metodo pagamento acconto
  metodoPagamentoAcconto?: 'contante' | 'carta' | 'bonifico' | 'paypal';
  dataAcconto?: Timestamp;
  
  // Metodo pagamento saldo
  metodoPagamentoSaldo?: 'contante' | 'carta' | 'bonifico' | 'paypal';
  dataSaldo?: Timestamp;
  
  // Stato
  stato: 'bozza' | 'in_lavorazione' | 'completato' | 'annullato';
  
  // Notifiche
  emailSaldoInviata: boolean;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InsertOrder {
  bookingId?: string;
  galleryId: string;
  prodottoId: string;
  prodottoNome: string;
  prodottoNumeroFoto: number;
  totale: number;
  acconto: number;
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
