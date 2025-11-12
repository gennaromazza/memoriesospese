/**
 * PRESETS API CLIENT
 * Funzioni per interagire con le API dei preset
 */

import { apiRequest } from './queryClient';
import { JobPreset, InsertJobPreset, UpdateJobPreset } from '@shared/presets-types';

/**
 * GET /api/presets
 * Lista preset dell'utente corrente
 */
export async function getPresets(): Promise<JobPreset[]> {
  const response = await apiRequest<JobPreset[]>('/api/presets', {
    method: 'GET',
  });
  return response;
}

/**
 * GET /api/presets/:id
 * Dettaglio preset singolo
 */
export async function getPresetById(id: string): Promise<JobPreset> {
  const response = await apiRequest<JobPreset>(`/api/presets/${id}`, {
    method: 'GET',
  });
  return response;
}

/**
 * POST /api/presets
 * Crea nuovo preset
 */
export async function createPreset(data: InsertJobPreset): Promise<JobPreset> {
  const response = await apiRequest<JobPreset>('/api/presets', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return response;
}

/**
 * PATCH /api/presets/:id
 * Aggiorna preset esistente
 */
export async function updatePreset(id: string, data: UpdateJobPreset): Promise<JobPreset> {
  const response = await apiRequest<JobPreset>(`/api/presets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return response;
}

/**
 * DELETE /api/presets/:id
 * Elimina preset
 */
export async function deletePreset(id: string): Promise<{ success: boolean; message: string }> {
  const response = await apiRequest<{ success: boolean; message: string }>(`/api/presets/${id}`, {
    method: 'DELETE',
  });
  return response;
}
