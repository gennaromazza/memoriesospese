/**
 * Tipi condivisi per il sistema Moduli Informativi
 * Sistema separato dai questionari narrativi — orientato a raccolta dati logistici per il giorno dell'evento.
 */

export interface InfoFormField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'number' | 'instagram' | 'vendor';
  required: boolean;
  options?: string[];
  placeholder?: string;
  // Solo per type === 'instagram': indica di quale cliente del job aggiornare
  // automaticamente il profilo Instagram (client1 = primo, client2 = secondo).
  clientTarget?: 'client1' | 'client2';
  // I campi editoriali restano privati finché il cliente non concede il
  // consenso separato e l'admin non seleziona la singola risposta.
  editorialUse?: boolean;
  editorialCategory?: 'story' | 'vendor';
}

export interface InfoFormTemplate {
  id: string;
  name: string;
  description?: string;
  fields: InfoFormField[];
  createdAt: any;
  updatedAt: any;
}

export interface InfoFormSubmission {
  id: string;
  jobId: string;
  templateId: string;
  templateName: string;
  templateFields: InfoFormField[];
  token: string;
  clienteId?: string;
  clientEmail: string;
  clientName: string;
  status: 'pending' | 'completed';
  answers: Record<string, any>;
  editorialConsent?: boolean;
  editorialConsentAt?: any;
  sentAt: any;
  completedAt?: any;
}

export interface InfoFormNotification {
  id: string;
  submissionId: string;
  jobId: string;
  clientName: string;
  templateName: string;
  createdAt: any;
  isRead: boolean;
  deepLink: string;
}
