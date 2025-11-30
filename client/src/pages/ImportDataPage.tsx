import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Upload, CheckCircle, XCircle, AlertCircle, FileText, FileSpreadsheet, Check, X } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { auth } from '@/lib/firebase';

interface PreviewJob {
  nome: string;
  dataEvento: string;
  cliente1: string;
  cliente2: string;
  location: string;
  tipoLavoro: string;
  firma: boolean;
  pdfFileName: string;
  hasPDF: boolean;
  totale: number;
  pagamentiCount: number;
  prodottiCount: number;
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
  jobTypesCreated: number;
  newJobTypes: Array<{ slug: string; nome: string }>;
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { toast } = useToast();

  const loadPreview = async () => {
    if (!selectedFile) {
      toast({
        title: 'File richiesto',
        description: 'Seleziona un file Excel prima di caricare la preview',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';

      const response = await fetch('/api/import/preview-excel', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Errore sconosciuto' }));
        throw new Error(errorData.error || `Errore HTTP ${response.status}`);
      }

      const data = await response.json();
      setPreview(data.preview);
      
      toast({
        title: 'Preview caricata',
        description: `Trovati ${data.count} lavori da importare`,
      });
    } catch (error: any) {
      console.error('Errore preview Excel:', error);
      toast({
        title: 'Errore',
        description: error.message || 'Errore nel caricamento preview',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteLegacyJobs = async () => {
    if (!confirm('Sei sicuro di voler cancellare tutti i job legacy importati? Questa azione non può essere annullata.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest('DELETE', '/api/import/delete-legacy');

      if (!response.ok) {
        throw new Error('Errore nella cancellazione');
      }

      const data = await response.json();
      
      toast({
        title: 'Job legacy cancellati',
        description: data.message,
      });

      setResult(null);
      setPreview(null);
    } catch (error: any) {
      toast({
        title: 'Errore',
        description: error.message || 'Errore nella cancellazione',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const executeImport = async () => {
    if (!selectedFile) {
      toast({
        title: 'File richiesto',
        description: 'Seleziona un file Excel prima di eseguire l\'importazione',
        variant: 'destructive',
      });
      return;
    }

    setImporting(true);
    setProgress(0);
    setResult(null);

    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 5, 90));
    }, 500);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';

      const response = await fetch('/api/import/execute-excel', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Importa Dati da Excel
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Importa lavori e clienti dal file Excel del vecchio gestionale
          </p>
        </div>

        {!preview && !result && (
          <>
            <Card className="border-blue-200 dark:border-blue-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Formato File Excel
                </CardTitle>
                <CardDescription>
                  Il file Excel deve contenere le seguenti colonne
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="space-y-1">
                    <p className="font-medium text-gray-900 dark:text-gray-100">📄 File PDF</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">📅 Data</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">📸 Tipo Lavoro</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">📍 Location</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">👤 Cliente 1 (Nome, Indirizzo, Telefono)</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">👥 Cliente 2 (Nome, Indirizzo, Telefono)</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-gray-900 dark:text-gray-100">🕐 Orario Casa Cliente 1</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">🕑 Orario Casa Cliente 2</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">✅ Firma Presente (✅/❌)</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">🛍️ Prodotti / Servizi</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">💰 Totale / Acconto / Da Saldare</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">💳 Metodo Pagamento</p>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>Nota:</strong> I file PDF devono essere nella cartella <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">attached_assets/EXPORTVECCHIOGESTIONALE/</code>
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Seleziona File Excel</CardTitle>
                <CardDescription>
                  Carica il file riepilogo_lavori.xlsx dal tuo computer
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-gray-900 dark:text-gray-100 
                               file:mr-4 file:py-2 file:px-4
                               file:rounded-md file:border-0
                               file:text-sm file:font-semibold
                               file:bg-blue-50 dark:file:bg-blue-900/30
                               file:text-blue-700 dark:file:text-blue-300
                               hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50
                               file:cursor-pointer cursor-pointer"
                    data-testid="input-excel-file"
                  />
                </div>
                
                {selectedFile && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <FileSpreadsheet className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <p className="text-sm text-green-800 dark:text-green-200">
                      File selezionato: <strong>{selectedFile.name}</strong>
                    </p>
                  </div>
                )}
                
                <Button
                  onClick={loadPreview}
                  disabled={loading || !selectedFile}
                  data-testid="button-load-preview"
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {loading ? 'Caricamento...' : 'Carica Preview Dati Excel'}
                </Button>
                
                <Button
                  onClick={deleteLegacyJobs}
                  disabled={loading}
                  variant="destructive"
                  data-testid="button-delete-legacy"
                  className="w-full"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancella Job Legacy Importati
                </Button>
              </CardContent>
            </Card>
          </>
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
                <ScrollArea className="h-[500px] rounded-md border p-4">
                  <div className="space-y-3">
                    {preview.map((job, index) => (
                      <div
                        key={index}
                        className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800"
                        data-testid={`preview-job-${index}`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h4 className="font-medium text-lg text-gray-900 dark:text-gray-100">
                              {job.nome}
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {job.dataEvento} - {job.location}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                              job.firma 
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                            }`}>
                              {job.firma ? (
                                <>
                                  <Check className="h-3 w-3" />
                                  Firmato
                                </>
                              ) : (
                                <>
                                  <X className="h-3 w-3" />
                                  Non firmato
                                </>
                              )}
                            </span>
                            <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                              {formatCurrency(job.totale)}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="font-medium text-gray-700 dark:text-gray-300">Cliente 1:</p>
                            <p className="text-gray-600 dark:text-gray-400">{job.cliente1}</p>
                          </div>
                          {job.cliente2 && (
                            <div>
                              <p className="font-medium text-gray-700 dark:text-gray-300">Cliente 2:</p>
                              <p className="text-gray-600 dark:text-gray-400">{job.cliente2}</p>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-4 mt-3 pt-3 border-t text-xs text-gray-500 dark:text-gray-400">
                          {job.hasPDF && (
                            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              <FileText className="h-3 w-3" />
                              {job.pdfFileName}
                            </span>
                          )}
                          {job.prodottiCount > 0 && (
                            <span>{job.prodottiCount} prodotti</span>
                          )}
                          {job.pagamentiCount > 0 && (
                            <span>{job.pagamentiCount} pagamenti</span>
                          )}
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
                  {result.jobTypesCreated > 0 && (
                    <p className="text-blue-600 dark:text-blue-400">
                      Nuovi tipi di lavoro creati: {result.jobTypesCreated}
                    </p>
                  )}
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

            {result.newJobTypes && result.newJobTypes.length > 0 && (
              <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
                <CardHeader>
                  <CardTitle className="text-blue-600 dark:text-blue-400 flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5" />
                    Nuovi Tipi di Lavoro Creati
                  </CardTitle>
                  <CardDescription>
                    Questi tipi sono stati creati automaticamente durante l'importazione
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {result.newJobTypes.map((jobType, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200"
                        data-testid={`new-job-type-${jobType.slug}`}
                      >
                        📷 {jobType.nome}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Puoi gestire questi tipi nella sezione{' '}
                    <a
                      href="/admin?tab=lavori"
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      Admin → Lavori → Tipi di Lavoro
                    </a>
                  </p>
                </CardContent>
              </Card>
            )}

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
