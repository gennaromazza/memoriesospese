import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { auth } from '@/lib/firebase';
import { Tags, Download, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface JobTypePreview {
  galleriesTotal: number;
  alreadyCategorized: number;
  withoutJobId: number;
  jobMissing: number;
  jobWithoutType: number;
  toUpdate: number;
  galleries: Array<{ id: string; nome: string; jobType: string }>;
}

interface JobTypeStats {
  galleriesTotal: number;
  updated: number;
  skippedAlreadyCategorized: number;
  skippedWithoutJobId: number;
  skippedJobMissing: number;
  skippedJobWithoutType: number;
}

export default function GalleryJobTypeBackfill() {
  const { toast } = useToast();
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [preview, setPreview] = useState<JobTypePreview | null>(null);
  const [result, setResult] = useState<JobTypeStats | null>(null);

  const loadPreview = async () => {
    setIsLoadingPreview(true);
    try {
      if (!auth.currentUser) {
        toast({ title: 'Errore', description: 'Devi essere autenticato', variant: 'destructive' });
        return;
      }
      const response = await apiRequest('GET', '/api/migrations/backfill-gallery-jobtypes/preview');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Errore sconosciuto' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setPreview(data);
      toast({
        title: 'Anteprima caricata',
        description: `${data.toUpdate} gallerie possono ereditare la categoria dal lavoro`,
      });
    } catch (error) {
      console.error('Errore preview backfill categorie:', error);
      toast({ title: 'Errore', description: 'Impossibile caricare anteprima', variant: 'destructive' });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const executeBackfill = async () => {
    if (!confirm('Assegnare la categoria del lavoro collegato alle gallerie che ne sono prive? Operazione sicura e ripetibile.')) {
      return;
    }
    setIsRunning(true);
    setResult(null);
    try {
      if (!auth.currentUser) {
        toast({ title: 'Errore', description: 'Devi essere autenticato', variant: 'destructive' });
        return;
      }
      const response = await apiRequest('POST', '/api/migrations/backfill-gallery-jobtypes');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Errore sconosciuto' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setResult(data.stats);
      toast({
        title: '✅ Backfill completato',
        description: `${data.stats.updated} gallerie aggiornate`,
      });
      loadPreview();
    } catch (error) {
      console.error('Errore backfill categorie:', error);
      toast({ title: 'Errore', description: 'Errore durante il backfill', variant: 'destructive' });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tags className="h-5 w-5" />
          Assegna Categoria alle Gallerie Esistenti
        </CardTitle>
        <CardDescription>
          Le gallerie create prima dell'ereditarietà automatica non hanno una categoria e non
          compaiono nei filtri per categoria. Questo strumento copia la categoria del lavoro
          collegato nelle gallerie che ne sono prive. Le gallerie già categorizzate non vengono
          toccate. Sicuro e ripetibile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            onClick={loadPreview}
            disabled={isLoadingPreview || isRunning}
            variant="outline"
            data-testid="button-jobtype-backfill-preview"
          >
            {isLoadingPreview ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Caricamento...</>
            ) : (
              <><Download className="mr-2 h-4 w-4" /> Anteprima</>
            )}
          </Button>
          <Button
            onClick={executeBackfill}
            disabled={!preview || preview.toUpdate === 0 || isRunning || isLoadingPreview}
            variant="default"
            data-testid="button-jobtype-backfill-run"
          >
            {isRunning ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Esecuzione...</>
            ) : (
              <><Tags className="mr-2 h-4 w-4" /> Esegui Backfill</>
            )}
          </Button>
        </div>

        {preview && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold">Anteprima:</p>
                <ul className="text-sm space-y-1">
                  <li>📂 Gallerie totali: <strong>{preview.galleriesTotal}</strong></li>
                  <li>🏷️ Già categorizzate (non toccate): <strong>{preview.alreadyCategorized}</strong></li>
                  <li>🔗 Senza lavoro collegato: <strong>{preview.withoutJobId}</strong></li>
                  <li>❓ Lavoro inesistente: <strong>{preview.jobMissing}</strong></li>
                  <li>🕳️ Lavoro senza tipo: <strong>{preview.jobWithoutType}</strong></li>
                  <li>✅ Gallerie da aggiornare: <strong>{preview.toUpdate}</strong></li>
                </ul>
                {preview.toUpdate === 0 && (
                  <p className="text-sm text-green-700">
                    Nessuna galleria da aggiornare: tutte quelle collegabili sono già categorizzate.
                  </p>
                )}
                {preview.galleries.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm">
                      Vedi gallerie da aggiornare ({preview.galleries.length})
                    </summary>
                    <ul className="mt-2 text-xs space-y-1 max-h-48 overflow-y-auto">
                      {preview.galleries.map((g) => (
                        <li key={g.id}>
                          {g.nome} → <strong>{g.jobType}</strong>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert className="border-green-600 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold text-green-800">Backfill completato!</p>
                <ul className="text-sm space-y-1">
                  <li>✅ Gallerie aggiornate: <strong>{result.updated}</strong></li>
                  <li>🏷️ Già categorizzate (saltate): <strong>{result.skippedAlreadyCategorized}</strong></li>
                  <li>🔗 Senza lavoro collegato (saltate): <strong>{result.skippedWithoutJobId}</strong></li>
                  <li>❓ Lavoro inesistente (saltate): <strong>{result.skippedJobMissing}</strong></li>
                  <li>🕳️ Lavoro senza tipo (saltate): <strong>{result.skippedJobWithoutType}</strong></li>
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
