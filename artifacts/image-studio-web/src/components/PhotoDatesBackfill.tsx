import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { auth } from '@/lib/firebase';
import { CalendarClock, Download, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface BackfillPreview {
  modernPhotosTotal: number;
  modernPhotosMissingDate: number;
  legacyPhotosMissingDate: number;
  totalMissingDate: number;
  galleriesAffected: number;
}

interface BackfillStats {
  modernUpdated: number;
  legacyUpdated: number;
  galleriesProcessed: number;
  errors: string[];
}

export default function PhotoDatesBackfill() {
  const { toast } = useToast();
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [preview, setPreview] = useState<BackfillPreview | null>(null);
  const [result, setResult] = useState<BackfillStats | null>(null);

  const loadPreview = async () => {
    setIsLoadingPreview(true);
    try {
      if (!auth.currentUser) {
        toast({ title: 'Errore', description: 'Devi essere autenticato', variant: 'destructive' });
        return;
      }
      const response = await apiRequest('GET', '/api/migrations/backfill-photo-dates/preview');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Errore sconosciuto' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setPreview(data);
      toast({
        title: 'Anteprima caricata',
        description: `${data.totalMissingDate} foto senza data in ${data.galleriesAffected} gallerie`,
      });
    } catch (error) {
      console.error('Errore preview backfill:', error);
      toast({ title: 'Errore', description: 'Impossibile caricare anteprima', variant: 'destructive' });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const executeBackfill = async () => {
    if (!confirm('Assegnare una data alle foto che ne sono prive? Operazione sicura e ripetibile.')) {
      return;
    }
    setIsRunning(true);
    setResult(null);
    try {
      if (!auth.currentUser) {
        toast({ title: 'Errore', description: 'Devi essere autenticato', variant: 'destructive' });
        return;
      }
      const response = await apiRequest('POST', '/api/migrations/backfill-photo-dates');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Errore sconosciuto' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setResult(data.stats);
      toast({
        title: '✅ Backfill completato',
        description: `${data.stats.modernUpdated + data.stats.legacyUpdated} foto aggiornate`,
      });
      loadPreview();
    } catch (error) {
      console.error('Errore backfill:', error);
      toast({ title: 'Errore', description: 'Errore durante il backfill', variant: 'destructive' });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          Assegna Data alle Foto Importate
        </CardTitle>
        <CardDescription>
          Le foto importate senza <code>createdAt</code> vengono scartate dalla paginazione
          ordinata e "perse" dalla galleria. Questo strumento assegna loro una data affidabile
          (derivata da updatedAt o dalla data della galleria) così appaiono nativamente. Sicuro e
          ripetibile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            onClick={loadPreview}
            disabled={isLoadingPreview || isRunning}
            variant="outline"
            data-testid="button-backfill-preview"
          >
            {isLoadingPreview ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Caricamento...</>
            ) : (
              <><Download className="mr-2 h-4 w-4" /> Anteprima</>
            )}
          </Button>
          <Button
            onClick={executeBackfill}
            disabled={!preview || preview.totalMissingDate === 0 || isRunning || isLoadingPreview}
            variant="default"
            data-testid="button-backfill-run"
          >
            {isRunning ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Esecuzione...</>
            ) : (
              <><CalendarClock className="mr-2 h-4 w-4" /> Esegui Backfill</>
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
                  <li>📸 Foto moderne totali: <strong>{preview.modernPhotosTotal}</strong></li>
                  <li>🕳️ Moderne senza data: <strong>{preview.modernPhotosMissingDate}</strong></li>
                  <li>🗂️ Legacy senza data: <strong>{preview.legacyPhotosMissingDate}</strong></li>
                  <li>📂 Gallerie coinvolte: <strong>{preview.galleriesAffected}</strong></li>
                  <li>✅ Foto da aggiornare: <strong>{preview.totalMissingDate}</strong></li>
                </ul>
                {preview.totalMissingDate === 0 && (
                  <p className="text-sm text-green-700">
                    Tutte le foto hanno già una data: nessun backfill necessario.
                  </p>
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
                  <li>📸 Moderne aggiornate: <strong>{result.modernUpdated}</strong></li>
                  <li>🗂️ Legacy aggiornate: <strong>{result.legacyUpdated}</strong></li>
                  <li>📂 Gallerie legacy processate: <strong>{result.galleriesProcessed}</strong></li>
                  {result.errors.length > 0 && (
                    <li className="text-red-600">❌ Errori: <strong>{result.errors.length}</strong></li>
                  )}
                </ul>
                {result.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-red-600">
                      Vedi errori ({result.errors.length})
                    </summary>
                    <ul className="mt-2 text-xs space-y-1">
                      {result.errors.map((error, i) => (
                        <li key={i} className="text-red-600">{error}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
