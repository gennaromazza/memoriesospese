/**
 * useStudioSuggestions - Hook centrale per il sistema suggerimenti
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { auth } from '@/lib/firebase';
import type { 
  StudioSuggestion, 
  StudioSuggestionsResponse, 
  SuggestionAction,
  PendingReason 
} from '@shared/studio-assistant-types';

export interface UseStudioSuggestionsOptions {
  mode: 'full' | 'compact' | 'job-specific';
  jobId?: string;
  enabled?: boolean;
}

export interface UseStudioSuggestionsReturn {
  suggestions: StudioSuggestion[];
  unsignedQuotes: StudioSuggestion[];
  pendingDeliveries: StudioSuggestion[];
  consultations: StudioSuggestion[];
  needsWorkJobs: StudioSuggestion[];
  loading: boolean;
  error: Error | null;
  stats: {
    totalActions: number;
    estimatedMinutes: number;
    highPriority: number;
  };
  markAsDone: (suggestionId: string, jobId?: string) => Promise<void>;
  dismiss: (suggestionId: string) => Promise<void>;
  markAsNeedsWork: (jobId: string, reason: PendingReason) => Promise<void>;
  markAsDelivered: (jobId: string) => Promise<void>;
  performAction: (suggestionId: string, action: SuggestionAction, data?: any) => Promise<void>;
  refetch: () => void;
}

async function fetchSuggestions(jobId?: string): Promise<StudioSuggestionsResponse> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Non autenticato');
  
  const url = jobId 
    ? `/api/studio-assistant/suggestions?jobId=${jobId}`
    : '/api/studio-assistant/suggestions';
  
  console.log('🔍 Studio Assistant: Fetching suggestions from', url);
    
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('❌ Studio Assistant API error:', response.status, errorData);
    throw new Error(errorData.message || errorData.error || `Errore ${response.status}`);
  }
  
  return response.json();
}

async function performSuggestionAction(
  suggestionId: string, 
  action: SuggestionAction,
  data?: { pendingReason?: PendingReason; jobId?: string }
): Promise<void> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Non autenticato');
  
  const response = await fetch(`/api/studio-assistant/suggestions/${suggestionId}/action`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action, ...data })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Errore esecuzione azione');
  }
}

async function updateJobWorkStatus(
  jobId: string, 
  needsWork: boolean, 
  pendingReason?: PendingReason
): Promise<void> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Non autenticato');
  
  const response = await fetch(`/api/jobs/${jobId}/work-status`, {
    method: 'PATCH',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ needsWork, pendingReason })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Errore aggiornamento stato lavoro');
  }
}

export function useStudioSuggestions(options: UseStudioSuggestionsOptions): UseStudioSuggestionsReturn {
  const { mode, jobId, enabled = true } = options;
  const { user } = useFirebaseAuth();
  const queryClient = useQueryClient();
  
  const queryKey = jobId 
    ? ['studio-suggestions', jobId] 
    : ['studio-suggestions'];
  
  const { data, isLoading, error, refetch } = useQuery<StudioSuggestionsResponse>({
    queryKey,
    queryFn: () => fetchSuggestions(jobId),
    enabled: enabled && !!user,
    refetchInterval: 5 * 60 * 1000, // Refresh ogni 5 minuti
    staleTime: 2 * 60 * 1000,
  });
  
  const actionMutation = useMutation({
    mutationFn: ({ suggestionId, action, data }: { 
      suggestionId: string; 
      action: SuggestionAction; 
      data?: any 
    }) => performSuggestionAction(suggestionId, action, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studio-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    }
  });
  
  const workStatusMutation = useMutation({
    mutationFn: ({ jobId, needsWork, pendingReason }: {
      jobId: string;
      needsWork: boolean;
      pendingReason?: PendingReason;
    }) => updateJobWorkStatus(jobId, needsWork, pendingReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studio-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    }
  });
  
  const unsignedQuotes = data?.data?.unsignedQuotes ?? [];
  const pendingDeliveries = data?.data?.pendingDeliveries ?? [];
  const consultations = data?.data?.consultations ?? [];
  const needsWorkJobs = data?.data?.needsWorkJobs ?? [];
  
  const allSuggestions = [
    ...unsignedQuotes,
    ...pendingDeliveries,
    ...consultations
  ];
  
  // Filtra per modalità
  const filteredSuggestions = mode === 'compact' 
    ? allSuggestions.filter(s => s.priority === 'high').slice(0, 3)
    : allSuggestions;
  
  return {
    suggestions: filteredSuggestions,
    unsignedQuotes,
    pendingDeliveries,
    consultations,
    needsWorkJobs,
    loading: isLoading,
    error: error as Error | null,
    stats: data?.stats ?? { totalActions: 0, estimatedMinutes: 0, highPriority: 0 },
    
    markAsDone: async (suggestionId: string, jobId?: string) => {
      await actionMutation.mutateAsync({ 
        suggestionId, 
        action: 'completed',
        data: { jobId }
      });
    },
    
    dismiss: async (suggestionId: string) => {
      await actionMutation.mutateAsync({ 
        suggestionId, 
        action: 'archived' 
      });
    },
    
    markAsNeedsWork: async (jobId: string, reason: PendingReason) => {
      await workStatusMutation.mutateAsync({ 
        jobId, 
        needsWork: true, 
        pendingReason: reason 
      });
    },
    
    markAsDelivered: async (jobId: string) => {
      await workStatusMutation.mutateAsync({ 
        jobId, 
        needsWork: false 
      });
    },
    
    performAction: async (suggestionId: string, action: SuggestionAction, data?: any) => {
      await actionMutation.mutateAsync({ suggestionId, action, data });
    },
    
    refetch: () => refetch()
  };
}
