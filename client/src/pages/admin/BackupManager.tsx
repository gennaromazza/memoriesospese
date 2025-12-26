import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { getAuth } from "firebase/auth";
import { 
  Download, 
  Upload, 
  HardDrive, 
  Database, 
  Shield, 
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  FileJson,
  Clock,
  ArrowLeft,
  Cloud,
  CloudUpload,
  Trash2,
  ExternalLink
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface BackupStatus {
  collections: Record<string, number>;
  totalCollections: number;
  totalDocuments: number;
  lastCheck: string;
}

interface ImportResult {
  success: boolean;
  dryRun: boolean;
  totalImported: number;
  totalErrors: number;
  results: Record<string, { imported: number; errors: number }>;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  backupVersion: string;
  createdAt: string;
  totalDocuments: number;
  issuesCount: number;
  issues: Array<{ collection: string; docId: string; issue: string }>;
}

interface DriveBackup {
  id: string;
  name: string;
  createdTime: string;
  size: string;
  webViewLink?: string;
}

interface DriveStatus {
  connected: boolean;
  email?: string;
  needsReconnection: boolean;
  error?: string;
}

export default function BackupManager() {
  const isAdmin = useIsAdmin();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<any>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [progress, setProgress] = useState(0);
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);
  const [driveBackups, setDriveBackups] = useState<DriveBackup[]>([]);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Accesso Negato</AlertTitle>
              <AlertDescription>
                Solo gli amministratori possono accedere a questa pagina.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getAuthHeaders = async () => {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  const loadBackupStatus = async () => {
    setIsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/backup/status', { headers });
      
      if (!response.ok) {
        throw new Error('Errore nel caricamento stato backup');
      }
      
      const data = await response.json();
      setBackupStatus(data);
      
      toast({
        title: "Stato aggiornato",
        description: `${data.totalDocuments} documenti in ${data.totalCollections} collezioni`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const downloadBackup = async () => {
    setIsLoading(true);
    setProgress(10);
    
    try {
      const headers = await getAuthHeaders();
      setProgress(30);
      
      const response = await fetch('/api/backup/export', { headers });
      setProgress(70);
      
      if (!response.ok) {
        throw new Error('Errore durante l\'export del backup');
      }
      
      const blob = await response.blob();
      setProgress(90);
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().split('T')[0];
      a.download = `image-studio-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setProgress(100);
      
      toast({
        title: "Backup completato",
        description: "Il file di backup è stato scaricato con successo",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore backup",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setImportFile(file);
    setValidationResult(null);
    setImportResult(null);
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setImportData(data);
      
      if (!data.metadata) {
        throw new Error('File non valido: manca metadata');
      }
      
      toast({
        title: "File caricato",
        description: `Backup del ${new Date(data.metadata.createdAt).toLocaleDateString('it-IT')} - ${data.metadata.totalDocuments} documenti`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore lettura file",
        description: error.message,
      });
      setImportFile(null);
      setImportData(null);
    }
  };

  const validateBackup = async () => {
    if (!importData) return;
    
    setIsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/backup/validate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ backup: importData }),
      });
      
      const result = await response.json();
      setValidationResult(result);
      
      if (result.valid) {
        toast({
          title: "Validazione completata",
          description: "Il backup è valido e può essere importato",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Problemi trovati",
          description: `${result.issuesCount} problemi di integrità rilevati`,
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore validazione",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const executeImport = async () => {
    if (!importData) return;
    
    setIsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/backup/import', {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          backup: importData,
          options: { dryRun }
        }),
      });
      
      const result = await response.json();
      setImportResult(result);
      
      if (result.success) {
        toast({
          title: dryRun ? "Simulazione completata" : "Import completato",
          description: result.message,
        });
      } else {
        throw new Error(result.message || 'Errore durante l\'import');
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore import",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatNumber = (num: number) => num.toLocaleString('it-IT');

  const checkDriveStatus = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/backup/drive/status', { headers });
      const data = await response.json();
      setDriveStatus(data);
      return data;
    } catch (error: any) {
      setDriveStatus({ connected: false, needsReconnection: true, error: error.message });
      return null;
    }
  };

  const loadDriveBackups = async () => {
    setIsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/backup/drive/list', { headers });
      const data = await response.json();
      if (data.success) {
        setDriveBackups(data.backups);
      } else {
        throw new Error(data.error || 'Errore nel caricamento backup');
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const uploadBackupToDrive = async () => {
    setIsUploadingToDrive(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/backup/drive/upload', {
        method: 'POST',
        headers,
      });
      
      const data = await response.json();
      if (data.success) {
        toast({
          title: "Backup caricato su Google Drive",
          description: `${data.filename} - ${data.totalDocuments.toLocaleString('it-IT')} documenti`,
        });
        loadDriveBackups();
      } else {
        throw new Error(data.error || 'Errore upload');
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore upload",
        description: error.message,
      });
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  const downloadFromDrive = async (backup: DriveBackup) => {
    setIsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/backup/drive/download/${backup.id}`, { headers });
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.message || data.error);
      }
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = backup.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Download completato",
        description: backup.name,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore download",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteFromDrive = async (backup: DriveBackup) => {
    if (!confirm(`Eliminare definitivamente "${backup.name}" da Google Drive?`)) return;
    
    setIsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/backup/drive/${backup.id}`, {
        method: 'DELETE',
        headers,
      });
      
      const data = await response.json();
      if (data.success) {
        toast({
          title: "Backup eliminato",
          description: backup.name,
        });
        loadDriveBackups();
      } else {
        throw new Error(data.error || 'Errore eliminazione');
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <div className="flex items-center gap-4 mb-8">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate('/admin/dashboard')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Gestione Backup</h1>
            <p className="text-muted-foreground">
              Esporta e ripristina i dati del sistema per disaster recovery
            </p>
          </div>
        </div>

        <Tabs defaultValue="export" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="export" className="gap-2" data-testid="tab-export">
              <Download className="h-4 w-4" />
              Esporta
            </TabsTrigger>
            <TabsTrigger value="cloud" className="gap-2" data-testid="tab-cloud" onClick={() => { checkDriveStatus(); loadDriveBackups(); }}>
              <Cloud className="h-4 w-4" />
              Google Drive
            </TabsTrigger>
            <TabsTrigger value="import" className="gap-2" data-testid="tab-import">
              <Upload className="h-4 w-4" />
              Ripristina
            </TabsTrigger>
          </TabsList>

          <TabsContent value="export" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Stato Database
                </CardTitle>
                <CardDescription>
                  Visualizza le statistiche del database prima dell'export
                </CardDescription>
              </CardHeader>
              <CardContent>
                {backupStatus ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-muted p-4 rounded-lg text-center">
                        <div className="text-2xl font-bold text-primary">
                          {formatNumber(backupStatus.totalDocuments)}
                        </div>
                        <div className="text-sm text-muted-foreground">Documenti totali</div>
                      </div>
                      <div className="bg-muted p-4 rounded-lg text-center">
                        <div className="text-2xl font-bold text-primary">
                          {backupStatus.totalCollections}
                        </div>
                        <div className="text-sm text-muted-foreground">Collezioni</div>
                      </div>
                      <div className="bg-muted p-4 rounded-lg text-center col-span-2">
                        <div className="text-sm font-medium flex items-center justify-center gap-2">
                          <Clock className="h-4 w-4" />
                          Ultimo controllo
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(backupStatus.lastCheck).toLocaleString('it-IT')}
                        </div>
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <div>
                      <h4 className="text-sm font-medium mb-3">Dettaglio collezioni</h4>
                      <ScrollArea className="h-[200px]">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {Object.entries(backupStatus.collections)
                            .sort(([,a], [,b]) => b - a)
                            .map(([name, count]) => (
                              <div key={name} className="flex justify-between items-center p-2 bg-muted/50 rounded text-sm">
                                <span className="font-mono truncate">{name}</span>
                                <Badge variant="secondary">{formatNumber(count)}</Badge>
                              </div>
                            ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Clicca "Aggiorna Stato" per visualizzare le statistiche</p>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex gap-4">
                <Button 
                  variant="outline" 
                  onClick={loadBackupStatus}
                  disabled={isLoading}
                  data-testid="button-refresh-status"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Aggiorna Stato
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5" />
                  Scarica Backup Completo
                </CardTitle>
                <CardDescription>
                  Esporta tutti i dati del sistema in un file JSON
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertTitle>Cosa viene incluso nel backup</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                      <li>Clienti, lavori, preventivi e ordini</li>
                      <li>Prenotazioni e consulenze</li>
                      <li>Gallerie (metadati) e foto (URLs)</li>
                      <li>Configurazione: tipi lavoro, prodotti, templates</li>
                      <li>Movimenti cassa e scadenze pagamento</li>
                      <li>Contenuti: blog, portfolio, storie</li>
                      <li>Utenti e impostazioni sistema</li>
                    </ul>
                  </AlertDescription>
                </Alert>
                
                {progress > 0 && (
                  <div className="mt-4">
                    <Progress value={progress} className="h-2" />
                    <p className="text-sm text-muted-foreground mt-2 text-center">
                      Export in corso... {progress}%
                    </p>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={downloadBackup}
                  disabled={isLoading}
                  className="w-full"
                  size="lg"
                  data-testid="button-download-backup"
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-5 w-5 mr-2" />
                  )}
                  Scarica Backup Completo
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="cloud" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cloud className="h-5 w-5" />
                  Backup su Google Drive
                </CardTitle>
                <CardDescription>
                  Salva e gestisci i backup nel cloud per maggiore sicurezza
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {driveStatus && (
                  <Alert variant={driveStatus.connected ? "default" : "destructive"}>
                    {driveStatus.connected ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    <AlertTitle>
                      {driveStatus.connected ? "Connesso a Google Drive" : "Connessione non attiva"}
                    </AlertTitle>
                    <AlertDescription>
                      {driveStatus.connected 
                        ? `Account: ${driveStatus.email || 'Google Drive'}`
                        : driveStatus.error || "Riconnetti l'integrazione Google Drive nelle impostazioni"
                      }
                    </AlertDescription>
                  </Alert>
                )}
                
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">Crea nuovo backup</h4>
                      <p className="text-sm text-muted-foreground">
                        Esporta e carica automaticamente su Google Drive
                      </p>
                    </div>
                    <Button
                      onClick={uploadBackupToDrive}
                      disabled={isUploadingToDrive || (driveStatus && !driveStatus.connected)}
                      data-testid="button-upload-drive"
                    >
                      {isUploadingToDrive ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CloudUpload className="h-4 w-4 mr-2" />
                      )}
                      Carica su Drive
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5" />
                  Backup Salvati
                </CardTitle>
                <CardDescription>
                  {driveBackups.length} backup trovati su Google Drive
                </CardDescription>
              </CardHeader>
              <CardContent>
                {driveBackups.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Cloud className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nessun backup trovato su Google Drive</p>
                    <p className="text-sm">Clicca "Carica su Drive" per creare il primo backup</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-3">
                      {driveBackups.map((backup) => (
                        <div 
                          key={backup.id}
                          className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{backup.name}</p>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(backup.createdTime).toLocaleString('it-IT')}
                              </span>
                              <span>{backup.size}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {backup.webViewLink && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => window.open(backup.webViewLink, '_blank')}
                                title="Apri in Google Drive"
                                data-testid={`button-view-drive-${backup.id}`}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => downloadFromDrive(backup)}
                              disabled={isLoading}
                              title="Scarica backup"
                              data-testid={`button-download-drive-${backup.id}`}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteFromDrive(backup)}
                              disabled={isLoading}
                              className="text-destructive hover:text-destructive"
                              title="Elimina backup"
                              data-testid={`button-delete-drive-${backup.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  onClick={loadDriveBackups}
                  disabled={isLoading}
                  className="w-full"
                  data-testid="button-refresh-drive"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Aggiorna Lista
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="import" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileJson className="h-5 w-5" />
                  Carica File Backup
                </CardTitle>
                <CardDescription>
                  Seleziona un file JSON di backup per ripristinare i dati
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-file-backup"
                />
                
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                >
                  <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    {importFile ? importFile.name : 'Clicca o trascina un file JSON'}
                  </p>
                </div>
                
                {importData?.metadata && (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>File caricato</AlertTitle>
                    <AlertDescription>
                      <div className="mt-2 space-y-1 text-sm">
                        <p><strong>Versione:</strong> {importData.metadata.version}</p>
                        <p><strong>Data creazione:</strong> {new Date(importData.metadata.createdAt).toLocaleString('it-IT')}</p>
                        <p><strong>Creato da:</strong> {importData.metadata.createdBy}</p>
                        <p><strong>Documenti totali:</strong> {formatNumber(importData.metadata.totalDocuments)}</p>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={validateBackup}
                  disabled={!importData || isLoading}
                  variant="outline"
                  className="w-full"
                  data-testid="button-validate-backup"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Shield className="h-4 w-4 mr-2" />
                  )}
                  Valida Integrità Backup
                </Button>
              </CardFooter>
            </Card>

            {validationResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {validationResult.valid ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    )}
                    Risultato Validazione
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge variant={validationResult.valid ? "default" : "destructive"}>
                      {validationResult.valid ? 'Valido' : 'Problemi rilevati'}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {validationResult.issuesCount} problemi trovati
                    </span>
                  </div>
                  
                  {validationResult.issues.length > 0 && (
                    <ScrollArea className="h-[150px]">
                      <div className="space-y-2">
                        {validationResult.issues.map((issue, idx) => (
                          <div key={idx} className="text-sm p-2 bg-muted rounded">
                            <span className="font-mono text-xs">{issue.collection}/{issue.docId}</span>
                            <p className="text-muted-foreground">{issue.issue}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            )}

            {importData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Esegui Ripristino
                  </CardTitle>
                  <CardDescription>
                    Importa i dati dal backup nel database
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Attenzione</AlertTitle>
                    <AlertDescription>
                      L'import sovrascriverà i documenti esistenti con stesso ID.
                      Si consiglia di eseguire prima una simulazione (dry run).
                    </AlertDescription>
                  </Alert>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="dryRun" 
                      checked={dryRun}
                      onCheckedChange={(checked) => setDryRun(checked as boolean)}
                      data-testid="checkbox-dry-run"
                    />
                    <Label htmlFor="dryRun" className="text-sm font-medium">
                      Modalità simulazione (dry run) - non modifica il database
                    </Label>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    onClick={executeImport}
                    disabled={isLoading}
                    variant={dryRun ? "outline" : "destructive"}
                    className="w-full"
                    size="lg"
                    data-testid="button-execute-import"
                  >
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-5 w-5 mr-2" />
                    )}
                    {dryRun ? 'Esegui Simulazione' : 'Esegui Ripristino'}
                  </Button>
                </CardFooter>
              </Card>
            )}

            {importResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    Risultato {importResult.dryRun ? 'Simulazione' : 'Import'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {formatNumber(importResult.totalImported)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {importResult.dryRun ? 'Sarebbero importati' : 'Importati'}
                      </div>
                    </div>
                    <div className="bg-red-50 dark:bg-red-950 p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold text-red-600">
                        {formatNumber(importResult.totalErrors)}
                      </div>
                      <div className="text-sm text-muted-foreground">Errori</div>
                    </div>
                  </div>
                  
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2">
                      {Object.entries(importResult.results)
                        .filter(([, r]) => r.imported > 0 || r.errors > 0)
                        .map(([collection, result]) => (
                          <div key={collection} className="flex justify-between items-center p-2 bg-muted/50 rounded text-sm">
                            <span className="font-mono">{collection}</span>
                            <div className="flex gap-2">
                              <Badge variant="default">{result.imported}</Badge>
                              {result.errors > 0 && (
                                <Badge variant="destructive">{result.errors} err</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
