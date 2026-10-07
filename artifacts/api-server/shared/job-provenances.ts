/**
 * JOB PROVENANCES - Dynamic job provenance types
 * Collection Firestore: jobProvenances
 * Provenienze dinamiche personalizzabili per tracciare origine clienti
 */

export interface JobProvenance {
  id: string;
  nome: string;
  slug: string;
  attivo: boolean;
  icona: string;
  colore: string;
  ordine: number;
  createdAt: Date;
  updatedAt: Date;
}

export type JobProvenanceSlug = string;

export const DEFAULT_JOB_PROVENANCES: Omit<JobProvenance, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    nome: 'Instagram',
    slug: 'instagram',
    attivo: true,
    icona: '📱',
    colore: '#E1306C',
    ordine: 1
  },
  {
    nome: 'Facebook',
    slug: 'facebook',
    attivo: true,
    icona: '👥',
    colore: '#1877F2',
    ordine: 2
  },
  {
    nome: 'Passaparola',
    slug: 'passaparola',
    attivo: true,
    icona: '💬',
    colore: '#10b981',
    ordine: 3
  },
  {
    nome: 'Google',
    slug: 'google',
    attivo: true,
    icona: '🔍',
    colore: '#4285F4',
    ordine: 4
  },
  {
    nome: 'Sito Web',
    slug: 'sito_web',
    attivo: true,
    icona: '🌐',
    colore: '#6366f1',
    ordine: 5
  },
  {
    nome: 'Fiera',
    slug: 'fiera',
    attivo: true,
    icona: '🎪',
    colore: '#f59e0b',
    ordine: 6
  },
  {
    nome: 'Altro',
    slug: 'altro',
    attivo: true,
    icona: '📌',
    colore: '#94a3b8',
    ordine: 7
  }
];
