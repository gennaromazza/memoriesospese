import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import Papa from 'papaparse';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { validateImportRow, importClienti, getAllClienti } from '@/lib/clienti';
import type { ImportCSVRow, ImportPreview } from '@shared/clienti-types';

interface ImportClientiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'complete';

export default function ImportClientiDialog({
  open,
  onOpenChange,
  onImportComplete,
}: ImportClientiDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<ImportStep>('upload');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{
    imported: number;
    updated: number;
    failed: number;
  } | null>(null);

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Verifica tipo file
      if (!file.name.endsWith('.csv')) {
        toast({
          title: 'Errore',
          description: 'Il file deve essere in formato CSV',
          variant: 'destructive',
        });
        return;
      }

      try {
        // Carica clienti esistenti
        const existingClienti = await getAllClienti();
        const existingEmails = new Set(existingClienti.map(c => c.email.toLowerCase()));

        // Parse CSV
        Papa.parse<ImportCSVRow>(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const rows = results.data;
            const validatedRows: ImportPreview['rows'] = [];
            let validCount = 0;
            let invalidCount = 0;
            let duplicateCount = 0;

            // Traccia email nel file per duplicati intra-file
            const fileEmails = new Map<string, number>();

            rows.forEach((row, index) => {
              const validation = validateImportRow(row, existingEmails);
              
              // Check duplicati intra-file
              const emailKey = row.Email?.toLowerCase().trim();
              const isDuplicate = emailKey && !emailKey.includes('nomail@') 
                ? fileEmails.has(emailKey) 
                : false;
              
              if (emailKey && !emailKey.includes('nomail@')) {
                fileEmails.set(emailKey, index);
              }

              // Trova cliente esistente
              const existingCliente = existingClienti.find(
                c => c.email.toLowerCase() === emailKey
              );

              validatedRows.push({
                index: index + 1,
                original: row,
                validation,
                isDuplicate,
                existingClienteId: existingCliente?.id,
              });

              if (validation.valid) validCount++;
              else invalidCount++;
              if (isDuplicate || existingCliente) duplicateCount++;
            });

            setPreview({
              totalRows: rows.length,
              validRows: validCount,
              invalidRows: invalidCount,
              duplicateRows: duplicateCount,
              rows: validatedRows,
            });

            setStep('preview');
          },
          error: (error) => {
            toast({
              title: 'Errore parsing CSV',
              description: error.message,
              variant: 'destructive',
            });
          },
        });
      } catch (error) {
        toast({
          title: 'Errore',
          description: error instanceof Error ? error.message : 'Errore durante la lettura del file',
          variant: 'destructive',
        });
      }

      // Reset input
      event.target.value = '';
    },
    [toast]
  );

  const handleImport = async () => {
    if (!preview) return;

    setStep('importing');
    setImportProgress(0);

    try {
      const validRows = preview.rows
        .filter(r => r.validation.valid)
        .map(r => ({
          validation: r.validation,
          existingClienteId: r.existingClienteId,
        }));

      // Simula progresso durante import
      const progressInterval = setInterval(() => {
        setImportProgress(prev => Math.min(prev + 5, 90));
      }, 200);

      const result = await importClienti(validRows);

      clearInterval(progressInterval);
      setImportProgress(100);

      setImportResult({
        imported: result.imported,
        updated: result.updated,
        failed: result.failed,
      });

      setStep('complete');

      if (result.success) {
        toast({
          title: 'Import completato',
          description: `${result.imported} clienti importati, ${result.updated} aggiornati. Ricorda di cliccare su "Sincronizza" per aggregare le attività!`,
        });
        onImportComplete?.();
      } else {
        toast({
          title: 'Import parziale',
          description: `${result.failed} righe non importate. Controlla i dettagli. Ricorda di cliccare su "Sincronizza" per aggregare le attività!`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Errore import',
        description: error instanceof Error ? error.message : 'Errore sconosciuto',
        variant: 'destructive',
      });
      setStep('preview');
    }
  };

  const handleClose = () => {
    setStep('upload');
    setPreview(null);
    setImportProgress(0);
    setImportResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importa Clienti da CSV
          </DialogTitle>
          <DialogDescription>
            Importa clienti dal tuo vecchio gestionale. Il sistema rileverà automaticamente i duplicati.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-12 text-center">
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">Carica file CSV</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Il file deve contenere le colonne: Nome, Cognome, Email, Phone, Città
              </p>
              <Button asChild>
                <label htmlFor="csv-upload" className="cursor-pointer">
                  <Upload className="h-4 w-4 mr-2" />
                  Seleziona File
                  <input
                    id="csv-upload"
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileUpload}
                    data-testid="input-csv-upload"
                  />
                </label>
              </Button>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Formato richiesto:</strong> CSV con colonne Nome, Cognome, Email, Phone, Città.
                Le email "nomail@..." saranno convertite in email locali uniche.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            {/* Statistiche */}
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{preview.totalRows}</div>
                <div className="text-sm text-muted-foreground">Totale</div>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{preview.validRows}</div>
                <div className="text-sm text-muted-foreground">Validi</div>
              </div>
              <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{preview.duplicateRows}</div>
                <div className="text-sm text-muted-foreground">Duplicati</div>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{preview.invalidRows}</div>
                <div className="text-sm text-muted-foreground">Invalidi</div>
              </div>
            </div>

            {/* Anteprima righe */}
            <ScrollArea className="h-[400px] border rounded-lg">
              <div className="p-4 space-y-2">
                {preview.rows.slice(0, 50).map((row) => (
                  <div
                    key={row.index}
                    className={`p-3 rounded-lg border ${
                      row.validation.valid
                        ? 'bg-background'
                        : 'bg-red-50 dark:bg-red-950 border-red-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">
                            #{row.index} - {row.original.Nome} {row.original.Cognome}
                          </span>
                          {row.validation.valid ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          {row.isDuplicate && (
                            <Badge variant="outline" className="text-orange-600">
                              Duplicato nel file
                            </Badge>
                          )}
                          {row.existingClienteId && (
                            <Badge variant="outline" className="text-blue-600">
                              Già esistente - verrà aggiornato
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {row.original.Email} • {row.original.Phone || 'N/A'} • {row.original.Città || 'N/A'}
                        </div>
                        {row.validation.warnings.length > 0 && (
                          <div className="text-xs text-orange-600 mt-1">
                            ⚠ {row.validation.warnings.join(', ')}
                          </div>
                        )}
                        {row.validation.errors.length > 0 && (
                          <div className="text-xs text-red-600 mt-1">
                            ✗ {row.validation.errors.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {preview.rows.length > 50 && (
                  <div className="text-sm text-muted-foreground text-center p-4">
                    ... e altre {preview.rows.length - 50} righe
                  </div>
                )}
              </div>
            </ScrollArea>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Verranno importati <strong>{preview.validRows}</strong> clienti.
                I duplicati esistenti verranno aggiornati con i nuovi dati.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {step === 'importing' && (
          <div className="space-y-4 py-8">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary mb-4" />
              <h3 className="font-semibold mb-2">Importazione in corso...</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Questo può richiedere alcuni minuti per grandi quantità di dati
              </p>
            </div>
            <Progress value={importProgress} className="w-full" />
            <p className="text-sm text-center text-muted-foreground">
              {importProgress}% completato
            </p>
          </div>
        )}

        {step === 'complete' && importResult && (
          <div className="space-y-4 py-8">
            <div className="text-center">
              <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Import completato!</h3>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-600">{importResult.imported}</div>
                <div className="text-sm text-muted-foreground">Importati</div>
              </div>
              <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-600">{importResult.updated}</div>
                <div className="text-sm text-muted-foreground">Aggiornati</div>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg text-center">
                <div className="text-2xl font-bold text-red-600">{importResult.failed}</div>
                <div className="text-sm text-muted-foreground">Falliti</div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={handleClose} data-testid="button-cancel-import">
              Annulla
            </Button>
          )}

          {step === 'preview' && (
            <>
              <Button
                variant="outline"
                onClick={() => setStep('upload')}
                data-testid="button-back-upload"
              >
                Indietro
              </Button>
              <Button
                onClick={handleImport}
                disabled={!preview || preview.validRows === 0}
                data-testid="button-start-import"
              >
                Importa {preview?.validRows} Clienti
              </Button>
            </>
          )}

          {step === 'complete' && (
            <Button onClick={handleClose} data-testid="button-close-import">
              Chiudi
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
