/**
 * Firestore Service per il sistema Moduli Informativi
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { InfoFormTemplate, InfoFormField, InfoFormSubmission, InfoFormNotification } from '@shared/info-form-types';

const TEMPLATES_COL = 'infoFormTemplates';
const SUBMISSIONS_COL = 'infoFormSubmissions';
const NOTIFICATIONS_COL = 'infoFormNotifications';

// ===================== TEMPLATES =====================

export async function getAllTemplates(): Promise<InfoFormTemplate[]> {
  const q = query(collection(db, TEMPLATES_COL), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as InfoFormTemplate));
}

export async function getTemplateById(id: string): Promise<InfoFormTemplate | null> {
  const ref = doc(db, TEMPLATES_COL, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as InfoFormTemplate;
}

export async function createTemplate(data: { name: string; description?: string; fields: InfoFormField[] }): Promise<string> {
  const ref = await addDoc(collection(db, TEMPLATES_COL), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTemplate(id: string, data: Partial<{ name: string; description: string; fields: InfoFormField[] }>): Promise<void> {
  await updateDoc(doc(db, TEMPLATES_COL, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, TEMPLATES_COL, id));
}

// ===================== SUBMISSIONS =====================

export interface SendFormClient {
  clienteId?: string;
  clientEmail: string;
  clientName: string;
}

export async function sendInfoForm(
  jobId: string,
  template: InfoFormTemplate,
  clients: SendFormClient[]
): Promise<InfoFormSubmission[]> {
  const created: InfoFormSubmission[] = [];
  for (const client of clients) {
    const token = crypto.randomUUID();
    const ref = await addDoc(collection(db, SUBMISSIONS_COL), {
      jobId,
      templateId: template.id,
      templateName: template.name,
      templateFields: template.fields,
      token,
      clienteId: client.clienteId || null,
      clientEmail: client.clientEmail,
      clientName: client.clientName,
      status: 'pending',
      answers: {},
      editorialConsent: false,
      editorialConsentAt: null,
      sentAt: serverTimestamp(),
      completedAt: null,
    });
    const snap = await getDoc(ref);
    created.push({ id: snap.id, ...snap.data() } as InfoFormSubmission);
  }
  return created;
}

export async function getSubmissionByToken(token: string): Promise<InfoFormSubmission | null> {
  // Endpoint pubblico server-side: l'utente NON è autenticato e le Firestore Rules
  // bloccano la lettura diretta di `infoFormSubmissions`. Il server (admin SDK)
  // valida il token e restituisce la submission.
  const res = await fetch(`/api/info-forms/by-token/${encodeURIComponent(token)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Errore nel caricamento del modulo');
  return (await res.json()) as InfoFormSubmission;
}

export async function getSubmissionsByJobId(jobId: string): Promise<InfoFormSubmission[]> {
  const q = query(collection(db, SUBMISSIONS_COL), where('jobId', '==', jobId));
  const snap = await getDocs(q);
  const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as InfoFormSubmission));
  return results.sort((a, b) => {
    const aTime = a.sentAt?.toDate ? a.sentAt.toDate().getTime() : 0;
    const bTime = b.sentAt?.toDate ? b.sentAt.toDate().getTime() : 0;
    return bTime - aTime;
  });
}

export async function submitInfoForm(
  submissionId: string,
  token: string,
  answers: Record<string, any>,
  editorialConsent: boolean = false,
): Promise<void> {
  // Endpoint pubblico server-side: il server valida il token, completa la
  // submission e crea la notifica admin. Il parametro submissionId è mantenuto
  // per retro-compatibilità della firma ma non più usato (il server lo deduce
  // dal token).
  void submissionId;
  const res = await fetch(
    `/api/info-forms/by-token/${encodeURIComponent(token)}/submit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, editorialConsent }),
    }
  );
  if (!res.ok) {
    let msg = 'Errore durante l\'invio del modulo';
    try {
      const err = await res.json();
      if (err?.error) msg = err.error;
    } catch (_) { /* ignore */ }
    throw new Error(msg);
  }
}

export async function deleteSubmission(id: string): Promise<void> {
  await deleteDoc(doc(db, SUBMISSIONS_COL, id));
}

// ===================== NOTIFICATIONS =====================

export async function getInfoFormNotifications(): Promise<InfoFormNotification[]> {
  const cutoff = new Date(Date.now() - 48 * 3600 * 1000);
  const q = query(
    collection(db, NOTIFICATIONS_COL),
    where('isRead', '==', false)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as InfoFormNotification))
    .filter(n => {
      const date = n.createdAt?.toDate ? n.createdAt.toDate() : null;
      return !date || date >= cutoff;
    })
    .sort((a, b) => {
      const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return bTime - aTime;
    });
}

export async function markInfoFormNotificationRead(id: string): Promise<void> {
  await updateDoc(doc(db, NOTIFICATIONS_COL, id), { isRead: true });
}
