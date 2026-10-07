import { useQuery, useMutation, useQueryClient, UseMutationResult } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  getJobTypes,
  createJobType,
  updateJobType,
  deleteJobType,
  reorderJobTypes,
  toggleJobTypeStatus
} from '@/lib/job-types';
import {
  getJobProvenances,
  createJobProvenance,
  updateJobProvenance,
  deleteJobProvenance,
  reorderJobProvenances,
  toggleJobProvenanceStatus
} from '@/lib/job-provenances';
import type { JobType } from '@shared/job-types';
import type { JobProvenance } from '@shared/job-provenances';

type EntityType = 'jobType' | 'provenance';
type Entity = JobType | JobProvenance;

interface EntityConfig {
  queryKey: string[];
  labels: {
    singular: string;
    plural: string;
    createButton: string;
    createTitle: string;
    createDescription: string;
    editTitle: string;
    editDescription: string;
    deleteTitle: string;
    deleteWarning: string;
    emptyState: string;
    emptyStateSubtitle: string;
  };
  getFn: () => Promise<Entity[]>;
  createFn: (data: any) => Promise<string>;
  updateFn: (id: string, data: any) => Promise<void>;
  deleteFn: (id: string) => Promise<void>;
  reorderFn: (ids: string[]) => Promise<void>;
  toggleFn: (id: string) => Promise<void>;
}

const configs: Record<EntityType, EntityConfig> = {
  jobType: {
    queryKey: ['jobTypes'],
    labels: {
      singular: 'Tipo lavoro',
      plural: 'Tipi di lavoro',
      createButton: 'Nuovo tipo',
      createTitle: 'Nuovo tipo di lavoro',
      createDescription: 'Crea un nuovo tipo di lavoro personalizzato per il tuo studio',
      editTitle: 'Modifica tipo di lavoro',
      editDescription: 'Aggiorna le informazioni del tipo di lavoro',
      deleteTitle: 'Conferma eliminazione',
      deleteWarning: 'Non puoi eliminare un tipo se ci sono lavori o template clausole associati.',
      emptyState: 'Nessun tipo di lavoro configurato',
      emptyStateSubtitle: 'Crea il tuo primo tipo personalizzato'
    },
    getFn: getJobTypes,
    createFn: createJobType,
    updateFn: updateJobType,
    deleteFn: deleteJobType,
    reorderFn: reorderJobTypes,
    toggleFn: toggleJobTypeStatus
  },
  provenance: {
    queryKey: ['jobProvenances'],
    labels: {
      singular: 'Provenienza',
      plural: 'Provenienze',
      createButton: 'Nuova provenienza',
      createTitle: 'Nuova provenienza',
      createDescription: 'Crea una nuova provenienza per tracciare l\'origine dei clienti',
      editTitle: 'Modifica provenienza',
      editDescription: 'Aggiorna le informazioni della provenienza',
      deleteTitle: 'Conferma eliminazione',
      deleteWarning: 'Non puoi eliminare una provenienza se ci sono lavori associati.',
      emptyState: 'Nessuna provenienza configurata',
      emptyStateSubtitle: 'Crea la tua prima provenienza personalizzata'
    },
    getFn: getJobProvenances,
    createFn: createJobProvenance,
    updateFn: updateJobProvenance,
    deleteFn: deleteJobProvenance,
    reorderFn: reorderJobProvenances,
    toggleFn: toggleJobProvenanceStatus
  }
};

export function useJobEntity(type: EntityType) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const config = configs[type];

  const { data: items = [], isLoading } = useQuery<Entity[]>({
    queryKey: config.queryKey,
    queryFn: config.getFn as any
  });

  const toggleMutation = useMutation({
    mutationFn: config.toggleFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: config.queryKey });
      toast({
        title: 'Stato aggiornato',
        description: `${config.labels.singular} aggiornato con successo`
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: config.deleteFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: config.queryKey });
      toast({
        title: `${config.labels.singular} eliminato`,
        description: 'Operazione completata con successo'
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Impossibile eliminare',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const reorderMutation = useMutation({
    mutationFn: config.reorderFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: config.queryKey });
    }
  });

  const move = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...items];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newOrder.length) return;

    [newOrder[index], newOrder[targetIndex]] = [
      newOrder[targetIndex],
      newOrder[index]
    ];

    const reorderedIds = newOrder.map(item => item.id);
    reorderMutation.mutate(reorderedIds);
  };

  return {
    items,
    isLoading,
    config,
    mutations: {
      toggle: toggleMutation,
      delete: deleteMutation,
      reorder: reorderMutation
    },
    move
  };
}
