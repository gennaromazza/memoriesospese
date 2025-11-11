import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Upload, CheckCircle, XCircle, AlertCircle, FileText } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface PreviewJob {
  nome: string;
  dataEvento: string;
  cliente: string;
  email: string;
  location: string;
  tipoLavoro: string;
  provenienza: string;
  hasPDF: boolean;
  prodottiCount: number;
  pagamentiCount: number;
}

interface ImportDetail {
  jobName: string;
  jobId?: string;
  clientId?: string;
  status: 'success' | 'error' | 'warning';
  message: string;
}

interface ImportResult {
  success: boolean;
  jobsImported: number;
  clientsCreated: number;
  errors: Array<{ job: string; error: string }>;
  warnings: Array<{ job: string; warning: string }>;
  details: ImportDetail[];
}

export default function ImportDataPage() {
  const [preview, setPreview] = useState<PreviewJob[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const loadPreview = async () => {
    setLoading(true);
    try {
      const response = await apiRequest('POST', '/api/import/preview');

      if (!response.ok) {
        throw new Error('Errore nel caricamento preview');
      }

      const data = await response.json();
      setPreview(data.preview);
      
      toast({
        title: 'Preview caricata',
        description: `Trovati ${data.count} lavori da importare`,
      });
    } catch (error: any) {
      toast({
        title: 'Errore',
        description: error.message || 'Errore nel caricamento preview',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const executeImport = async () => {
    setImporting(true);
    setProgress(0);
    setResult(null);

    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 5, 90));
    }, 500);

    try {
      const response = await apiRequest('POST', '/api/import/execute');

      clearInterval(progressInterval);

      if (!response.ok) {
        throw new Error('Errore nell\'importazione');
      }

      const data: ImportResult = await response.json();
      setResult(data);
      setProgress(100);

      if (data.success) {
        toast({
          title: 'Importazione completata',
          description: `${data.jobsImported} lavori importati, ${data.clientsCreated} nuovi clienti creati`,
        });
      } else {
        toast({
          title: 'Importazione completata con errori',
          description: `${data.errors.length} errori riscontrati`,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      clearInterval(progressInterval);
      toast({
        title: 'Errore',
        description: error.message || 'Errore nell\'importazione',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Importa Dati Legacy
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Importa lavori e clienti dal vecchio gestionale
          </p>
        </div>

        {!preview && !result && (
          <Card>
            <CardHeader>
              <CardTitle>Carica Preview</CardTitle>
              <CardDescription>
                Visualizza i dati che verranno importati dal vecchio gestionale
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={loadPreview}
                disabled={loading}
                data-testid="button-load-preview"
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                {loading ? 'Caricamento...' : 'Carica Preview Dati'}
              </Button>
            </CardContent>
          </Card>
        )}

        {preview && !result && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Preview Importazione</CardTitle>
                <CardDescription>
                  {preview.length} lavori pronti per l'importazione
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="h-[400px] rounded-md border p-4">
                  <div className="space-y-3">
                    {preview.map((job, index) => (
                      <div
                        key={index}
                        className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-800"
                        data-testid={`preview-job-${index}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900 dark:text-gray-100">
                              {job.nome}
                            </h4>
                            <div className="mt-1 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                              <p>Cliente: {job.cliente} ({job.email})</p>
                              <p>Data: {job.dataEvento} - {job.location}</p>
                              <p>Tipo: {job.tipoLavoro} | Provenienza: {job.provenienza}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 text-xs">
                            {job.hasPDF && (
                              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                <FileText className="h-3 w-3" />
                                PDF disponibile
                              </span>
                            )}
                            {job.prodottiCount > 0 && (
                              <span className="text-gray-600 dark:text-gray-400">
                                {job.prodottiCount} prodotti
                              </span>
                            )}
                            {job.pagamentiCount > 0 && (
                              <span className="text-gray-600 dark:text-gray-400">
                                {job.pagamentiCount} pagamenti
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setPreview(null)}
                    disabled={importing}
                    data-testid="button-cancel"
                  >
                    Annulla
                  </Button>
                  <Button
                    onClick={executeImport}
                    disabled={importing}
                    data-testid="button-execute-import"
                    className="flex-1"
                  >
                    {importing ? 'Importazione in corso...' : 'Esegui Importazione'}
                  </Button>
                </div>

                {importing && (
                  <div className="space-y-2">
                    <Progress value={progress} className="w-full" />
                    <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                      {progress}% completato
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {result && (
          <>
            <Alert variant={result.success ? 'default' : 'destructive'}>
              <AlertTitle className="flex items-center gap-2">
                {result.success ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <XCircle className="h-5 w-5" />
                )}
                {result.success ? 'Importazione Completata' : 'Importazione Completata con Errori'}
              </AlertTitle>
              <AlertDescription>
                <div className="mt-2 space-y-1">
                  <p>Jobs importati: {result.jobsImported}</p>
                  <p>Nuovi clienti creati: {result.clientsCreated}</p>
                  {result.errors.length > 0 && (
                    <p className="text-red-600 dark:text-red-400">
                      Errori: {result.errors.length}
                    </p>
                  )}
                  {result.warnings.length > 0 && (
                    <p className="text-yellow-600 dark:text-yellow-400">
                      Warning: {result.warnings.length}
                    </p>
                  )}
                </div>
              </AlertDescription>
            </Alert>

            <Card>
              <CardHeader>
                <CardTitle>Dettagli Importazione</CardTitle>
                <CardDescription>
                  Risultato dettagliato per ogni lavoro
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {result.details.map((detail, index) => (
                      <div
                        key={index}
                        className={`border rounded-lg p-3 ${
                          detail.status === 'success'
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                            : detail.status === 'error'
                            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                            : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                        }`}
                        data-testid={`result-detail-${index}`}
                      >
                        <div className="flex items-start gap-3">
                          {detail.status === 'success' ? (
                            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                          ) : detail.status === 'error' ? (
                            <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900 dark:text-gray-100">
                              {detail.jobName}
                            </h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {detail.message}
                            </p>
                            {detail.jobId && (
                              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                ID Job: {detail.jobId}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <div className="mt-4 pt-4 border-t flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setResult(null);
                      setPreview(null);
                      setProgress(0);
                    }}
                    data-testid="button-reset"
                  >
                    Nuova Importazione
                  </Button>
                </div>
              </CardContent>
            </Card>

            {result.errors.length > 0 && (
              <Card className="border-red-200 dark:border-red-800">
                <CardHeader>
                  <CardTitle className="text-red-600 dark:text-red-400">
                    Errori Rilevati
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {result.errors.map((error, index) => (
                      <li
                        key={index}
                        className="text-sm text-red-600 dark:text-red-400"
                      >
                        <strong>{error.job}:</strong> {error.error}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {result.warnings.length > 0 && (
              <Card className="border-yellow-200 dark:border-yellow-800">
                <CardHeader>
                  <CardTitle className="text-yellow-600 dark:text-yellow-400">
                    Avvisi
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {result.warnings.map((warning, index) => (
                      <li
                        key={index}
                        className="text-sm text-yellow-600 dark:text-yellow-400"
                      >
                        <strong>{warning.job}:</strong> {warning.warning}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
