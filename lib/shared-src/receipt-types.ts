
/**
 * Types per sistema ricevute fiscali - Movimenti cassa
 */

export interface ReceiptData {
  // Dati movimento cassa
  movementId: string;
  numero: number; // Numero progressivo ricevuta
  data: Date;
  categoria: string;
  descrizione: string;
  importo: number;
  metodoPagamento: 'contante' | 'carta' | 'bonifico' | 'paypal' | 'altro';
  note?: string;

  // Dati cliente (opzionali)
  clienteNome?: string;
  clienteCognome?: string;
  clienteEmail?: string;
  clienteCellulare?: string;
  clienteCodiceFiscale?: string;
  clientePartitaIva?: string;
  clienteIndirizzo?: string;

  // Dati studio (da settings/studio)
  studioName: string;
  studioAddress?: string;
  studioPhone?: string;
  studioEmail?: string;
  studioPartitaIVA?: string;
  studioCodiceFiscale?: string;
}

export interface SendReceiptRequest {
  movementId: string;
  method: 'email' | 'whatsapp';
  recipient: string; // email o numero WhatsApp
  clienteNome?: string;
  clienteCognome?: string;
}
