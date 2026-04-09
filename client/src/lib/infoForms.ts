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
      sentAt: serverTimestamp(),
      completedAt: null,
    });
    const snap = await getDoc(ref);
    created.push({ id: snap.id, ...snap.data() } as InfoFormSubmission);
  }
  return created;
}

export async function getSubmissionByToken(token: string): Promise<InfoFormSubmission | null> {
  const q = query(collection(db, SUBMISSIONS_COL), where('token', '==', token));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as InfoFormSubmission;
}

export async function getSubmissionsByJobId(jobId: string): Promise<InfoFormSubmission[]> {
  const q = query(collection(db, SUBMISSIONS_COL), where('jobId', '==', jobId), orderBy('sentAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as InfoFormSubmission));
}

export async function submitInfoForm(
  submissionId: string,
  token: string,
  answers: Record<string, any>
): Promise<void> {
  const ref = doc(db, SUBMISSIONS_COL, submissionId);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data()?.token !== token) throw new Error('Modulo non trovato');

  await updateDoc(ref, {
    answers,
    status: 'completed',
    completedAt: serverTimestamp(),
  });

  const data = snap.data();
  await addDoc(collection(db, NOTIFICATIONS_COL), {
    submissionId,
    jobId: data.jobId,
    clientName: data.clientName,
    templateName: data.templateName,
    createdAt: serverTimestamp(),
    isRead: false,
    deepLink: `/admin/dashboard?tab=lavori&job=${data.jobId}&subtab=moduli`,
  });
}

export async function deleteSubmission(id: string): Promise<void> {
  await deleteDoc(doc(db, SUBMISSIONS_COL, id));
}

// ===================== NOTIFICATIONS =====================

export async function getInfoFormNotifications(): Promise<InfoFormNotification[]> {
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const q = query(
    collection(db, NOTIFICATIONS_COL),
    where('isRead', '==', false),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as InfoFormNotification))
    .filter(n => {
      const date = n.createdAt?.toDate ? n.createdAt.toDate() : null;
      return !date || date >= cutoff;
    });
}

export async function markInfoFormNotificationRead(id: string): Promise<void> {
  await updateDoc(doc(db, NOTIFICATIONS_COL, id), { isRead: true });
}
