/**
 * Centralizzazione Stati - Booking & Order State Machine
 * 
 * Single source of truth per tutti gli stati di Booking e Order,
 * con transition guards e validation logic.
 */

/**
 * Stati Booking
 */
export const BookingStato = {
  IN_ATTESA: 'in_attesa',
  CONFERMATA: 'confermata',
  COMPLETATA: 'completata',
  ANNULLATA: 'annullata',
} as const;

export type BookingStato = typeof BookingStato[keyof typeof BookingStato];

/**
 * Stati Order
 */
export const OrderStato = {
  BOZZA: 'bozza',
  IN_LAVORAZIONE: 'in_lavorazione',
  COMPLETATO: 'completato',
  ANNULLATO: 'annullato',
} as const;

export type OrderStato = typeof OrderStato[keyof typeof OrderStato];

/**
 * Tipo Pagamento
 */
export const PaymentMethod = {
  CONTANTE: 'contante',
  CARTA: 'carta',
  BONIFICO: 'bonifico',
  PAYPAL: 'paypal',
} as const;

export type PaymentMethod = typeof PaymentMethod[keyof typeof PaymentMethod];

/**
 * Tipo Transaction
 */
export const TransactionType = {
  ACCONTO: 'acconto',
  SALDO: 'saldo',
} as const;

export type TransactionType = typeof TransactionType[keyof typeof TransactionType];

/**
 * State Transition Guards - Booking
 * 
 * Definisce le transizioni valide tra stati booking
 */
const BOOKING_TRANSITIONS: Record<BookingStato, BookingStato[]> = {
  [BookingStato.IN_ATTESA]: [BookingStato.CONFERMATA, BookingStato.ANNULLATA],
  [BookingStato.CONFERMATA]: [BookingStato.COMPLETATA, BookingStato.ANNULLATA],
  [BookingStato.COMPLETATA]: [],
  [BookingStato.ANNULLATA]: [],
};

/**
 * State Transition Guards - Order
 * 
 * Definisce le transizioni valide tra stati order
 */
const ORDER_TRANSITIONS: Record<OrderStato, OrderStato[]> = {
  [OrderStato.BOZZA]: [OrderStato.IN_LAVORAZIONE, OrderStato.ANNULLATO],
  [OrderStato.IN_LAVORAZIONE]: [OrderStato.COMPLETATO, OrderStato.ANNULLATO],
  [OrderStato.COMPLETATO]: [],
  [OrderStato.ANNULLATO]: [],
};

/**
 * Verifica se una transizione di stato booking è valida
 */
export function canTransitionBooking(from: BookingStato, to: BookingStato): boolean {
  return BOOKING_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Verifica se una transizione di stato order è valida
 */
export function canTransitionOrder(from: OrderStato, to: OrderStato): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Ottiene stati possibili da uno stato booking corrente
 */
export function getNextBookingStates(currentStato: BookingStato): BookingStato[] {
  return BOOKING_TRANSITIONS[currentStato] || [];
}

/**
 * Ottiene stati possibili da uno stato order corrente
 */
export function getNextOrderStates(currentStato: OrderStato): OrderStato[] {
  return ORDER_TRANSITIONS[currentStato] || [];
}

/**
 * Mapping colori badge per stati booking
 */
export const BOOKING_STATO_COLORS: Record<BookingStato, string> = {
  [BookingStato.IN_ATTESA]: 'bg-yellow-500 text-white',
  [BookingStato.CONFERMATA]: 'bg-green-500 text-white',
  [BookingStato.COMPLETATA]: 'bg-blue-500 text-white',
  [BookingStato.ANNULLATA]: 'bg-gray-500 text-white',
};

/**
 * Mapping colori badge per stati order
 */
export const ORDER_STATO_COLORS: Record<OrderStato, string> = {
  [OrderStato.BOZZA]: 'bg-gray-400 text-white',
  [OrderStato.IN_LAVORAZIONE]: 'bg-blue-500 text-white',
  [OrderStato.COMPLETATO]: 'bg-green-500 text-white',
  [OrderStato.ANNULLATO]: 'bg-red-500 text-white',
};

/**
 * Mapping label italiani per stati booking
 */
export const BOOKING_STATO_LABELS: Record<BookingStato, string> = {
  [BookingStato.IN_ATTESA]: 'In Attesa',
  [BookingStato.CONFERMATA]: 'Confermata',
  [BookingStato.COMPLETATA]: 'Completata',
  [BookingStato.ANNULLATA]: 'Annullata',
};

/**
 * Mapping label italiani per stati order
 */
export const ORDER_STATO_LABELS: Record<OrderStato, string> = {
  [OrderStato.BOZZA]: 'Bozza',
  [OrderStato.IN_LAVORAZIONE]: 'In Lavorazione',
  [OrderStato.COMPLETATO]: 'Completato',
  [OrderStato.ANNULLATO]: 'Annullato',
};

/**
 * Mapping label italiani per metodi pagamento
 */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CONTANTE]: 'Contante',
  [PaymentMethod.CARTA]: 'Carta',
  [PaymentMethod.BONIFICO]: 'Bonifico',
  [PaymentMethod.PAYPAL]: 'PayPal',
};
