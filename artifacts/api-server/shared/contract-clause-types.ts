/**
 * CONTRACT CLAUSES - Types & Interfaces
 * Template clausole contrattuali per tipo lavoro
 */

import { Timestamp } from 'firebase/firestore';
import { JobType } from './jobs-types';

/**
 * Clausola singola
 */
export interface Clause {
  id: string;
  text: string;                 // Testo clausola (supporta HTML semplice)
  required: boolean;            // Obbligatoria per firma
  ordine: number;               // Ordine visualizzazione
}

/**
 * CONTRACT CLAUSE TEMPLATE
 * Template clausole per tipo lavoro
 */
export interface ContractClauseTemplate {
  id: string;
  jobType: string;              // Slug del tipo lavoro (riferimento a JobType.slug)
  titolo: string;               // Es. "Clausole standard Matrimonio"
  
  clauses: Clause[];
  
  // Stato
  attivo: boolean;
  predefinito?: boolean;        // Se true, usato di default per quel jobType
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

/**
 * INSERT CONTRACT CLAUSE TEMPLATE
 */
export interface InsertContractClauseTemplate {
  jobType: string;              // Slug del tipo lavoro
  titolo: string;
  clauses: Omit<Clause, 'id'>[];
  attivo?: boolean;
  predefinito?: boolean;
}

/**
 * Clausole predefinite per tipo lavoro
 */
export const DEFAULT_CLAUSES: Record<JobType, Omit<Clause, 'id'>[]> = {
  matrimonio: [
    {
      text: 'Autorizzo Image Studio all\'utilizzo delle fotografie per il proprio portfolio, social media e materiale promozionale.',
      required: false,
      ordine: 1
    },
    {
      text: 'Accetto i tempi di consegna indicati nel preventivo (solitamente 60 giorni dalla data del servizio).',
      required: true,
      ordine: 2
    },
    {
      text: 'Ho letto e accettato l\'informativa privacy e il trattamento dei dati personali secondo GDPR.',
      required: true,
      ordine: 3
    },
    {
      text: 'Mi impegno a comunicare eventuali modifiche di data o location con almeno 15 giorni di anticipo.',
      required: true,
      ordine: 4
    }
  ],
  battesimo: [
    {
      text: 'In qualità di genitore/tutore legale, autorizzo le riprese fotografiche del/la minore.',
      required: true,
      ordine: 1
    },
    {
      text: 'Autorizzo Image Studio all\'utilizzo delle fotografie per il proprio portfolio e social media.',
      required: false,
      ordine: 2
    },
    {
      text: 'Ho letto e accettato l\'informativa privacy per il trattamento dei dati del minore secondo GDPR.',
      required: true,
      ordine: 3
    },
    {
      text: 'Accetto i tempi di consegna indicati nel preventivo.',
      required: true,
      ordine: 4
    }
  ],
  famiglia: [
    {
      text: 'Autorizzo Image Studio all\'utilizzo delle fotografie per il proprio portfolio e social media.',
      required: false,
      ordine: 1
    },
    {
      text: 'Ho letto e accettato l\'informativa privacy secondo GDPR.',
      required: true,
      ordine: 2
    },
    {
      text: 'Accetto i tempi di consegna indicati nel preventivo.',
      required: true,
      ordine: 3
    }
  ],
  evento: [
    {
      text: 'Autorizzo Image Studio alla pubblicazione delle foto dell\'evento per scopi promozionali.',
      required: false,
      ordine: 1
    },
    {
      text: 'Ho letto e accettato l\'informativa privacy secondo GDPR.',
      required: true,
      ordine: 2
    },
    {
      text: 'Accetto i tempi di consegna indicati nel preventivo.',
      required: true,
      ordine: 3
    }
  ],
  comunione: [
    {
      text: 'In qualità di genitore/tutore legale, autorizzo le riprese fotografiche del/la minore.',
      required: true,
      ordine: 1
    },
    {
      text: 'Autorizzo Image Studio all\'utilizzo delle fotografie per il proprio portfolio e social media.',
      required: false,
      ordine: 2
    },
    {
      text: 'Ho letto e accettato l\'informativa privacy per il trattamento dei dati del minore secondo GDPR.',
      required: true,
      ordine: 3
    }
  ],
  compleanno: [
    {
      text: 'Autorizzo Image Studio all\'utilizzo delle fotografie per il proprio portfolio e social media.',
      required: false,
      ordine: 1
    },
    {
      text: 'Ho letto e accettato l\'informativa privacy secondo GDPR.',
      required: true,
      ordine: 2
    }
  ],
  altro: [
    {
      text: 'Autorizzo Image Studio all\'utilizzo delle fotografie per il proprio portfolio e social media.',
      required: false,
      ordine: 1
    },
    {
      text: 'Ho letto e accettato l\'informativa privacy secondo GDPR.',
      required: true,
      ordine: 2
    },
    {
      text: 'Accetto i tempi di consegna indicati nel preventivo.',
      required: true,
      ordine: 3
    }
  ]
};
