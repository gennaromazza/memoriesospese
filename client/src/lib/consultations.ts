/**
 * CONSULTATIONS API CLIENT
 * TanStack Query wrapper per modulo Consulenze
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from './queryClient';
import { auth, db } from './firebase';
import { collection, getDocs, getDoc, doc, query, where, orderBy } from 'firebase/firestore';
import type {
  ConsultationTemplate,
  Consultation,
  InsertConsultationTemplate,
  UpdateConsultationTemplate,
  InsertConsultation
} from '@shared/consultation-types';

/**
 * FIRESTORE DIRECT FUNCTIONS - No HTTP API needed
 */

// Get all consultation templates from Firestore
export async function getAllTemplates(): Promise<ConsultationTemplate[]> {
  try {
    const templatesRef = collection(db, 'consultation_templates');
    const q = query(templatesRef, orderBy('ordine', 'asc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as ConsultationTemplate));
  } catch (error) {
    console.error('[consultations] Error fetching templates from Firestore:', error);
    return [];
  }
}

// Get all consultations from Firestore
export async function getAllConsultations(): Promise<Consultation[]> {
  try {
    const consultationsRef = collection(db, 'consultations');
    const q = query(consultationsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Consultation));
  } catch (error) {
    console.error('[consultations] Error fetching consultations from Firestore:', error);
    return [];
  }
}

// Get single template by ID
export async function getTemplateById(id: string): Promise<ConsultationTemplate | null> {
  try {
    const templateRef = doc(db, 'consultation_templates', id);
    const snapshot = await getDoc(templateRef);
    
    if (!snapshot.exists()) {
      return null;
    }
    
    return {
      id: snapshot.id,
      ...snapshot.data()
    } as ConsultationTemplate;
  } catch (error) {
    console.error('[consultations] Error fetching template by ID:', error);
    return null;
  }
}

// Get templates by job type
export async function getTemplatesByJobType(jobType: string): Promise<ConsultationTemplate[]> {
  try {
    const templatesRef = collection(db, 'consultation_templates');
    const q = query(
      templatesRef,
      where('jobType', '==', jobType),
      where('attiva', '==', true),
      orderBy('ordine', 'asc')
    );
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as ConsultationTemplate));
  } catch (error) {
    console.error('[consultations] Error fetching templates by job type:', error);
    return [];
  }
}

export const CONSULTATION_KEYS = {
  all: ['consultations'] as const,
  templates: () => [...CONSULTATION_KEYS.all, 'templates'] as const,
  template: (id: string) => [...CONSULTATION_KEYS.templates(), id] as const,
  templatesByJobType: (jobType: string) => [...CONSULTATION_KEYS.templates(), 'job-type', jobType] as const,
  jobTypes: () => [...CONSULTATION_KEYS.all, 'job-types'] as const,
  consultations: () => [...CONSULTATION_KEYS.all, 'list'] as const,
  consultation: (id: string) => [...CONSULTATION_KEYS.consultations(), id] as const,
};

export function useTemplates(authReady: boolean = true) {
  return useQuery<ConsultationTemplate[]>({
    queryKey: CONSULTATION_KEYS.templates(),
    queryFn: getAllTemplates,
    enabled: authReady,
    retry: 2,
    staleTime: 60000 // Cache for 1 minute
  });
}

export function useTemplate(id: string | undefined) {
  return useQuery<ConsultationTemplate | null>({
    queryKey: CONSULTATION_KEYS.template(id!),
    queryFn: async () => {
      if (!id) return null;
      return await getTemplateById(id);
    },
    enabled: !!id,
    retry: 2
  });
}

export function useTemplatesByJobType(jobType: string | undefined) {
  return useQuery<ConsultationTemplate[]>({
    queryKey: CONSULTATION_KEYS.templatesByJobType(jobType!),
    queryFn: async () => {
      if (!jobType) return [];
      return await getTemplatesByJobType(jobType);
    },
    enabled: !!jobType,
    retry: 2
  });
}

export function useJobTypes() {
  return useQuery<string[]>({
    queryKey: CONSULTATION_KEYS.jobTypes(),
    queryFn: async () => {
      try {
        // Usa la funzione esistente getJobTypes da job-types.ts
        const { getJobTypes } = await import('./job-types');
        const jobTypes = await getJobTypes();
        return jobTypes.map(jt => jt.slug);
      } catch (error) {
        console.error('[consultations] Error fetching job types:', error);
        return [];
      }
    },
    retry: 2,
    staleTime: 300000 // Cache for 5 minutes
  });
}

export function useConsultations(authReady: boolean = true) {
  return useQuery<Consultation[]>({
    queryKey: CONSULTATION_KEYS.consultations(),
    queryFn: getAllConsultations,
    enabled: authReady,
    retry: 2,
    staleTime: 30000 // Cache for 30 seconds
  });
}

export function useConsultation(id: string | undefined) {
  return useQuery<Consultation | null>({
    queryKey: CONSULTATION_KEYS.consultation(id!),
    queryFn: async () => {
      if (!id) return null;
      try {
        const consultationRef = doc(db, 'consultations', id);
        const snapshot = await getDoc(consultationRef);
        
        if (!snapshot.exists()) {
          return null;
        }
        
        return {
          id: snapshot.id,
          ...snapshot.data()
        } as Consultation;
      } catch (error) {
        console.error('[consultations] Error fetching consultation by ID:', error);
        return null;
      }
    },
    enabled: !!id,
    retry: 2
  });
}

export function useCreateTemplate() {
  return useMutation({
    mutationFn: async (data: InsertConsultationTemplate) => {
      return apiRequest('POST', '/api/consultations/templates', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.templates() });
    }
  });
}

export function useUpdateTemplate() {
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateConsultationTemplate }) => {
      return apiRequest('PATCH', `/api/consultations/templates/${id}`, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.templates() });
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.template(variables.id) });
    }
  });
}

export function useDeleteTemplate() {
  return useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/consultations/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.templates() });
    }
  });
}

export function useAvailableSlots() {
  return useMutation({
    mutationFn: async (data: {
      templateId: string;
      date: string;
    }) => {
      const res = await apiRequest('POST', '/api/consultations/available-slots', data);
      return res.json();
    }
  });
}

export function useCreateConsultation() {
  return useMutation({
    mutationFn: async (data: InsertConsultation) => {
      const res = await apiRequest('POST', '/api/consultations/create', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.consultations() });
    }
  });
}

export function useApproveConsultation() {
  return useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('PATCH', `/api/consultations/${id}/approve`);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.consultations() });
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.consultation(id) });
    }
  });
}

export function useRejectConsultation() {
  return useMutation({
    mutationFn: async ({ id, motivazione }: { id: string; motivazione: string }) => {
      return apiRequest('PATCH', `/api/consultations/${id}/reject`, { motivazione });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.consultations() });
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.consultation(variables.id) });
    }
  });
}

export function useCompleteConsultation() {
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      return apiRequest('PATCH', `/api/consultations/${id}/complete`, { note });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.consultations() });
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.consultation(variables.id) });
    }
  });
}

export function useConvertToJob() {
  return useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('POST', `/api/consultations/${id}/convert-to-job`);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.consultations() });
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.consultation(id) });
    }
  });
}

export function useDeleteConsultation() {
  return useMutation({
    mutationFn: async ({ id, cancellationReason }: { id: string; cancellationReason?: string }) => {
      const params = cancellationReason ? `?cancellationReason=${encodeURIComponent(cancellationReason)}` : '';
      return apiRequest('DELETE', `/api/consultations/${id}${params}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.consultations() });
    }
  });
}

export function useMarkConsultationViewed() {
  return useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('PATCH', `/api/consultations/${id}/mark-viewed`);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.consultations() });
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.consultation(id) });
    }
  });
}
