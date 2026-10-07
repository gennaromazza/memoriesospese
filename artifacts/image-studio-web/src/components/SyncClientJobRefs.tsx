import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

interface SyncResult {
  success: boolean;
  totalJobs: number;
  totalClientiConJob: number;
  clientiAggiornati: number;
  clientiNonTrovati: number;
  errori: number;
  message: string;
}

export default function SyncClientJobRefs() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const { toast } = useToast();

  const handleSync = async () => {
    if (!confirm('Questa operazione sincronizzerà i riferimenti ai lavori per tutti i clienti.\n\nQuesto è utile se le statistiche dei clienti non mostrano correttamente i lavori importati.\n\nVuoi procedere?')) {
      return;
    }

    setLoading(true);
    setResult(null);
    
    try {
      const response = await apiRequest('POST', '/api/import/sync-client-jobrefs');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Errore sconosciuto' }));
        throw new Error(errorData.error || 'Errore nella sincronizzazione');
      }

      const data: SyncResult = await response.json();
      setResult(data);
      
      toast({
        title: 'Sincronizzazione completata',
        description: data.message,
      });
    } catch (error: any) {
      toast({
        title: 'Errore',
        description: error.message || 'Errore nella sincronizzazione',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white shadow sm:rounded-lg p-5">
      <h3 className="text-lg font-semibold mb-2">Sincronizza Riferimenti Clienti</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Aggiorna le statistiche dei clienti con i lavori già importati. Usa questa funzione se il conteggio lavori nel dettaglio cliente non è corretto.
      </p>
      
      <Button 
        onClick={handleSync}
        disabled={loading}
        variant="outline"
        className="flex items-center gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/20"
        data-testid="button-sync-client-refs"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Sincronizzazione in corso...' : 'Sincronizza Riferimenti'}
      </Button>
      
      {result && (
        <div className={`mt-4 p-4 rounded-lg ${result.success ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
          <div className="flex items-start gap-2">
            {result.success ? (
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
            )}
            <div className="text-sm">
              <p className={`font-medium ${result.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                {result.message}
              </p>
              <div className="mt-2 space-y-1 text-muted-foreground">
                <p>Lavori analizzati: <strong>{result.totalJobs}</strong></p>
                <p>Clienti con lavori: <strong>{result.totalClientiConJob}</strong></p>
                <p>Clienti aggiornati: <strong>{result.clientiAggiornati}</strong></p>
                {result.clientiNonTrovati > 0 && (
                  <p className="text-amber-600 dark:text-amber-400">Clienti non trovati: {result.clientiNonTrovati}</p>
                )}
                {result.errori > 0 && (
                  <p className="text-red-600 dark:text-red-400">Errori: {result.errori}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
