import { Timestamp } from 'firebase/firestore';

// Firestore document structure for JobType configuration
export interface JobType {
  id: string;
  nome: string;
  slug: string;
  attivo: boolean;
  icona: string;
  colore: string;
  ordine: number;
  descrizione?: string;
  imageUrl?: string;
  createdBy?: 'import' | 'manual';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Frontend representation - Date oggetti convertiti da Timestamp
export interface JobTypeFE extends Omit<JobType, 'createdAt' | 'updatedAt'> {
  createdAt: Date;
  updatedAt: Date;
}

export type JobTypeSlug = string;

export const DEFAULT_JOB_TYPES: Omit<JobType, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    nome: 'Matrimonio',
    slug: 'matrimonio',
    attivo: true,
    icona: '💍',
    colore: '#ec4899',
    ordine: 1
  },
  {
    nome: 'Battesimo',
    slug: 'battesimo',
    attivo: true,
    icona: '👶',
    colore: '#60a5fa',
    ordine: 2
  },
  {
    nome: 'Comunione',
    slug: 'comunione',
    attivo: true,
    icona: '🕊️',
    colore: '#a78bfa',
    ordine: 3
  },
  {
    nome: 'Compleanno',
    slug: 'compleanno',
    attivo: true,
    icona: '🎂',
    colore: '#fbbf24',
    ordine: 4
  },
  {
    nome: 'Famiglia',
    slug: 'famiglia',
    attivo: true,
    icona: '👨‍👩‍👧‍👦',
    colore: '#34d399',
    ordine: 5
  },
  {
    nome: 'Evento',
    slug: 'evento',
    attivo: true,
    icona: '🎉',
    colore: '#f472b6',
    ordine: 6
  },
  {
    nome: 'Altro',
    slug: 'altro',
    attivo: true,
    icona: '📸',
    colore: '#94a3b8',
    ordine: 7
  },
  {
    nome: 'Generico',
    slug: 'generico',
    attivo: true,
    icona: '✨',
    colore: '#6366f1',
    ordine: 8
  }
];
