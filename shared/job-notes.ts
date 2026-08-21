import type { NoteFotoItem } from './jobs-types';

export interface JobNotesDraft {
  originalNote?: string;
  originalNotePerFoto?: NoteFotoItem[];
  note: string;
  notePerFoto: NoteFotoItem[];
}

export interface JobNotesUpdates {
  note?: string;
  notePerFoto?: NoteFotoItem[];
}

/**
 * Prepara un update parziale: ogni sezione viene scritta solo se l'utente
 * l'ha cambiata. In questo modo un salvataggio non può sovrascrivere una
 * sezione esistente che l'utente non ha toccato.
 */
export function getChangedJobNotes({
  originalNote,
  originalNotePerFoto,
  note,
  notePerFoto,
}: JobNotesDraft): JobNotesUpdates {
  const updates: JobNotesUpdates = {};

  if (note !== (originalNote ?? '')) {
    updates.note = note;
  }

  if (JSON.stringify(notePerFoto) !== JSON.stringify(originalNotePerFoto ?? [])) {
    updates.notePerFoto = notePerFoto;
  }

  return updates;
}