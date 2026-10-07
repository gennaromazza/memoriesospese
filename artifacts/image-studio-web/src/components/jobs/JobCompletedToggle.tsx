/**
 * JOB COMPLETED TOGGLE
 * Toggle per marcare un lavoro come "Consegnato" (stato finale)
 * Layout orizzontale responsive per desktop e mobile
 */

import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { updateJobStatus } from '@/lib/jobs';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Job, JobStatus } from '@shared/jobs-types';

interface JobCompletedToggleProps {
  jobId: string;
  currentJob: Job; // Pass full job object to access previousStatus
  className?: string;
}

export default function JobCompletedToggle({ 
  jobId, 
  currentJob,
  className 
}: JobCompletedToggleProps) {
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  
  const isCompleted = currentJob.status === 'consegnato';

  // Mutation per aggiornare lo status
  // Quando togli il toggle, ripristina lo status precedente salvato in previousStatus
  // oppure fallback a 'confermato' se non disponibile
  const toggleMutation = useMutation({
    mutationFn: async (completed: boolean) => {
      if (!user) throw new Error('User not authenticated');
      
      let newStatus: JobStatus;
      if (completed) {
        // Marca come consegnato (salverà automaticamente previousStatus in updateJobStatus)
        newStatus = 'consegnato';
      } else {
        // Ripristina status precedente o fallback a 'confermato'
        newStatus = currentJob.previousStatus || 'confermato';
      }
      
      await updateJobStatus(jobId, newStatus, user.uid, currentJob);
    },
    onSuccess: (_, completed) => {
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast({
        title: completed ? '✅ Lavoro completato!' : 'Status aggiornato',
        description: completed 
          ? 'Il lavoro è stato marcato come consegnato' 
          : 'Il lavoro è stato rimosso dallo stato consegnato'
      });
    },
    onError: (error) => {
      toast({
        title: 'Errore',
        description: error instanceof Error ? error.message : 'Impossibile aggiornare lo status',
        variant: 'destructive'
      });
    }
  });

  const handleToggle = (checked: boolean) => {
    toggleMutation.mutate(checked);
  };

  return (
    <div 
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all",
        isCompleted 
          ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900" 
          : "bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-700",
        className
      )}
      data-testid="job-completed-toggle"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <CheckCircle2 
          className={cn(
            "h-5 w-5 flex-shrink-0 transition-colors",
            isCompleted 
              ? "text-green-600 dark:text-green-400" 
              : "text-gray-400 dark:text-gray-600"
          )} 
        />
        <div className="flex-1 min-w-0">
          <Label 
            htmlFor="completed-toggle" 
            className={cn(
              "text-sm font-medium cursor-pointer transition-colors",
              isCompleted 
                ? "text-green-900 dark:text-green-100" 
                : "text-gray-700 dark:text-gray-300"
            )}
          >
            Lavoro Completo / Consegnato
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isCompleted 
              ? 'Il lavoro è stato completato e consegnato al cliente' 
              : 'Marca come consegnato quando il lavoro è terminato'}
          </p>
        </div>
      </div>
      
      {toggleMutation.isPending ? (
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      ) : (
        <Switch
          id="completed-toggle"
          checked={isCompleted}
          onCheckedChange={handleToggle}
          disabled={toggleMutation.isPending}
          className="data-[state=checked]:bg-green-600"
          data-testid="switch-completed"
        />
      )}
    </div>
  );
}
