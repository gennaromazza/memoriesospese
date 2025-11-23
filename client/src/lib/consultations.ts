/**
 * CONSULTATIONS API CLIENT
 * TanStack Query wrapper per modulo Consulenze
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "./queryClient";
import { auth } from "./firebase";
import type {
  ConsultationTemplate,
  Consultation,
  InsertConsultationTemplate,
  UpdateConsultationTemplate,
  InsertConsultation,
} from "@shared/consultation-types";

export const CONSULTATION_KEYS = {
  all: ["consultations"] as const,
  templates: () => [...CONSULTATION_KEYS.all, "templates"] as const,
  template: (id: string) => [...CONSULTATION_KEYS.templates(), id] as const,
  templatesByJobType: (jobType: string) =>
    [...CONSULTATION_KEYS.templates(), "job-type", jobType] as const,
  jobTypes: () => [...CONSULTATION_KEYS.all, "job-types"] as const,
  consultations: () => [...CONSULTATION_KEYS.all, "list"] as const,
  consultation: (id: string) =>
    [...CONSULTATION_KEYS.consultations(), id] as const,
};

export function useTemplates(authReady: boolean = true) {
  return useQuery<ConsultationTemplate[]>({
    queryKey: CONSULTATION_KEYS.templates(),
    queryFn: async () => {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";
      const res = await fetch("/api/consultations/templates", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Templates fetch error:", res.status, errorText);
        throw new Error(`Failed to fetch templates: ${res.status}`);
      }
      return res.json();
    },
    enabled: authReady,
  });
}

export function useTemplate(id: string | undefined) {
  return useQuery<ConsultationTemplate>({
    queryKey: CONSULTATION_KEYS.template(id!),
    queryFn: async () => {
      const res = await fetch(`/api/consultations/templates/${id}`);
      if (!res.ok) throw new Error("Failed to fetch template");
      const template = await res.json();

      // FIX: Garantisci che excludedDays sia sempre un array (fix clonazione template)
      return {
        ...template,
        excludedDays: template.excludedDays || [],
      };
    },
    enabled: !!id,
  });
}

export function useTemplatesByJobType(jobType: string | undefined) {
  return useQuery<ConsultationTemplate[]>({
    queryKey: CONSULTATION_KEYS.templatesByJobType(jobType!),
    queryFn: async () => {
      const res = await fetch(
        `/api/consultations/templates/by-job-type/${jobType}`,
      );
      if (!res.ok) throw new Error("Failed to fetch templates");
      const templates = await res.json();

      // FIX: Garantisci che excludedDays sia sempre un array per tutti i template
      return templates.map((template: ConsultationTemplate) => ({
        ...template,
        excludedDays: template.excludedDays || [],
      }));
    },
    enabled: !!jobType,
  });
}

export function useJobTypes() {
  return useQuery<string[]>({
    queryKey: CONSULTATION_KEYS.jobTypes(),
    queryFn: async () => {
      const res = await fetch("/api/consultations/job-types");
      if (!res.ok) throw new Error("Failed to fetch job types");
      return res.json();
    },
  });
}

export function useConsultations(authReady: boolean = true) {
  return useQuery<Consultation[]>({
    queryKey: CONSULTATION_KEYS.consultations(),
    queryFn: async () => {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";
      const res = await fetch("/api/consultations", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch consultations");
      return res.json();
    },
    enabled: authReady,
  });
}

export function useConsultation(id: string | undefined) {
  return useQuery<Consultation>({
    queryKey: CONSULTATION_KEYS.consultation(id!),
    queryFn: async () => {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";
      const res = await fetch(`/api/consultations/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch consultation");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  return useMutation({
    mutationFn: async (data: InsertConsultationTemplate) => {
      return apiRequest("POST", "/api/consultations/templates", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: CONSULTATION_KEYS.templates(),
      });
    },
  });
}

export function useUpdateTemplate() {
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateConsultationTemplate;
    }) => {
      return apiRequest("PATCH", `/api/consultations/templates/${id}`, data);
    },
    onSuccess: (
      _: unknown,
      variables: { id: string; data: UpdateConsultationTemplate },
    ) => {
      queryClient.invalidateQueries({
        queryKey: CONSULTATION_KEYS.templates(),
      });
      queryClient.invalidateQueries({
        queryKey: CONSULTATION_KEYS.template(variables.id),
      });
    },
  });
}

export function useDeleteTemplate() {
  return useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/consultations/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: CONSULTATION_KEYS.templates(),
      });
    },
  });
}

export function useAvailableSlots() {
  return useMutation({
    mutationFn: async (data: { templateId: string; date: string }) => {
      const res = await apiRequest(
        "POST",
        "/api/consultations/available-slots",
        data,
      );
      return res.json();
    },
  });
}

// NEW CALENDAR ENGINE V2 — Unified API with better timezone handling and user-friendly messages
export function useAvailableSlotsV2() {
  return useMutation({
    mutationFn: async (data: { templateId: string; date: string }) => {
      const res = await apiRequest(
        "POST",
        "/api/consultations/v2/available-slots",
        data,
      );
      return res.json();
    },
  });
}

export function useCreateConsultation() {
  return useMutation({
    mutationFn: async (data: InsertConsultation) => {
      const res = await apiRequest("POST", "/api/consultations/v2/create", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: CONSULTATION_KEYS.consultations(),
      });
    },
  });
}

export function useApproveConsultation() {
  return useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/consultations/v2/${id}/approve`);
    },
    onSuccess: (_: unknown, id: string) => {
      queryClient.invalidateQueries({
        queryKey: CONSULTATION_KEYS.consultations(),
      });
      queryClient.invalidateQueries({
        queryKey: CONSULTATION_KEYS.consultation(id),
      });
    },
  });
}

export function useRejectConsultation() {
  return useMutation({
    mutationFn: async ({
      id,
      motivazione,
    }: {
      id: string;
      motivazione: string;
    }) => {
      return apiRequest("PATCH", `/api/consultations/${id}/reject`, {
        motivazione,
      });
    },
    onSuccess: (_: unknown, variables: { id: string; motivazione: string }) => {
      queryClient.invalidateQueries({
        queryKey: CONSULTATION_KEYS.consultations(),
      });
      queryClient.invalidateQueries({
        queryKey: CONSULTATION_KEYS.consultation(variables.id),
      });
    },
  });
}

export function useCompleteConsultation() {
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      return apiRequest("PATCH", `/api/consultations/${id}/complete`, { note });
    },
    onSuccess: (_: unknown, variables: { id: string; note?: string }) => {
      queryClient.invalidateQueries({
        queryKey: CONSULTATION_KEYS.consultations(),
      });
      queryClient.invalidateQueries({
        queryKey: CONSULTATION_KEYS.consultation(variables.id),
      });
    },
  });
}

export function useConvertToJob() {
  return useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/consultations/${id}/convert-to-job`);
    },
    onSuccess: (_: unknown, id: string) => {
      queryClient.invalidateQueries({
        queryKey: CONSULTATION_KEYS.consultations(),
      });
      queryClient.invalidateQueries({
        queryKey: CONSULTATION_KEYS.consultation(id),
      });
    },
  });
}

export function useDeleteConsultation() {
  return useMutation({
    mutationFn: async ({
      id,
      cancellationReason,
    }: {
      id: string;
      cancellationReason?: string;
    }) => {
      const params = cancellationReason
        ? `?cancellationReason=${encodeURIComponent(cancellationReason)}`
        : "";
      return apiRequest("DELETE", `/api/consultations/${id}${params}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: CONSULTATION_KEYS.consultations(),
      });
    },
  });
}

export function useMarkConsultationViewed() {
  return useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/consultations/${id}/mark-viewed`);
    },
    onSuccess: (_: unknown, id: string) => {
      queryClient.invalidateQueries({
        queryKey: CONSULTATION_KEYS.consultations(),
      });
      queryClient.invalidateQueries({
        queryKey: CONSULTATION_KEYS.consultation(id),
      });
    },
  });
}