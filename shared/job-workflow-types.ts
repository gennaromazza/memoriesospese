import { Timestamp } from 'firebase/firestore';

export interface WorkflowStep {
  id: string;
  label: string;
  order: number;
  icon?: string;
  completedAt?: Timestamp;
  completedBy?: string;
}

export interface WorkflowStepConfig {
  id: string;
  label: string;
  order: number;
  icon: string;
  description?: string;
}

export const DEFAULT_WORKFLOW_STEPS: WorkflowStepConfig[] = [
  {
    id: 'creazione',
    label: 'Data creazione',
    order: 1,
    icon: 'calendar-plus',
    description: 'Lavoro creato nel sistema'
  },
  {
    id: 'primo-appuntamento',
    label: 'Primo appuntamento',
    order: 2,
    icon: 'calendar-check',
    description: 'Primo incontro con il cliente'
  },
  {
    id: 'modulo-prenotazione',
    label: 'Modulo di prenotazione',
    order: 3,
    icon: 'file-text',
    description: 'Questionario sposi inviato/compilato'
  },
  {
    id: 'lavoro-confermato',
    label: 'Lavoro confermato',
    order: 4,
    icon: 'check-circle',
    description: 'Cliente ha confermato il servizio'
  },
  {
    id: 'data-lavoro',
    label: 'Data del lavoro',
    order: 5,
    icon: 'calendar',
    description: 'Servizio fotografico eseguito'
  },
  {
    id: 'inizio-lavorazione',
    label: 'Inizio lavorazione',
    order: 6,
    icon: 'image',
    description: 'Post-produzione iniziata'
  },
  {
    id: 'appuntamento-visione',
    label: 'Appuntamento visione file',
    order: 7,
    icon: 'eye',
    description: 'Cliente visualizza le foto'
  },
  {
    id: 'lavoro-completo',
    label: 'Lavoro completo',
    order: 8,
    icon: 'check-circle-2',
    description: 'Consegna finale completata'
  }
];
