import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { auth } from '@/lib/firebase';
import { Download, Upload, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface MigrationPreview {
  galleriesWithLegacyPhotos: number;
  totalLegacyPhotos: number;
  potentialDuplicates: number;
  galleries: Array<{
    id: string;
    nome: string;
    legacyPhotosCount: number;
    duplicates: number;
  }>;
}

interface MigrationStats {
  galleriesScanned: number;
  photosFound: number;
  photosMigrated: number;
  photosDuplicate: number;
  errors: string[];
}

export default function PhotosMigration() {
  const { toast } = useToast();
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [migrationResult, setMigrationResult] = useState<MigrationStats | null>(null);

  const loadPreview = async () => {
    setIsLoadingPreview(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        toast({
          title: 'Errore',
          description: 'Devi essere autenticato',
          variant: 'destructive'
        });
        return;
      }

      const response = await apiRequest('GET', '/api/migrations/legacy-photos/preview');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Errore sconosciuto' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setPreview(data);

      toast({
        title: 'Preview caricata',
        description: `Trovate ${data.totalLegacyPhotos} foto legacy in ${data.galleriesWithLegacyPhotos} gallerie`
      });
    } catch (error) {
      console.error('Errore preview:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile caricare preview',
        variant: 'destructive'
      });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const executeMigration = async () => {
    if (!confirm('Sei sicuro di voler migrare tutte le foto legacy? Questa operazione potrebbe richiedere alcuni minuti.')) {
      return;
    }

    setIsMigrating(true);
    setMigrationResult(null);

    try {
      const user = auth.currentUser;
      if (!user) {
        toast({
          title: 'Errore',
          description: 'Devi essere autenticato',
          variant: 'destructive'
        });
        return;
      }

      const response = await apiRequest('POST', '/api/migrations/legacy-photos');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Errore sconosciuto' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      setMigrationResult(result.stats);

      toast({
        title: '✅ Migrazione completata',
        description: `Migrate ${result.stats.photosMigrated} foto (${result.stats.photosDuplicate} duplicate saltate)`
      });

      // Reload preview
      loadPreview();
    } catch (error) {
      console.error('Errore migrazione:', error);
      toast({
        title: 'Errore',
        description: 'Errore durante la migrazione',
        variant: 'destructive'
      });
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Migrazione Foto Legacy
        </CardTitle>
        <CardDescription>
          Migra le foto dalle sottocollezioni legacy (galleries/{'{id}'}/photos) alla collezione globale (photos)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            onClick={loadPreview}
            disabled={isLoadingPreview || isMigrating}
            variant="outline"
          >
            {isLoadingPreview ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Caricamento...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Anteprima Migrazione
              </>
            )}
          </Button>

          <Button
            onClick={executeMigration}
            disabled={!preview || isMigrating || isLoadingPreview}
            variant="default"
          >
            {isMigrating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Migrazione in corso...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Esegui Migrazione
              </>
            )}
          </Button>
        </div>

        {preview && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold">Anteprima migrazione:</p>
                <ul className="text-sm space-y-1">
                  <li>📂 Gallerie con foto legacy: <strong>{preview.galleriesWithLegacyPhotos}</strong></li>
                  <li>📸 Foto legacy totali: <strong>{preview.totalLegacyPhotos}</strong></li>
                  <li>🔄 Foto già migrate (duplicate): <strong>{preview.potentialDuplicates}</strong></li>
                  <li>✅ Foto da migrare: <strong>{preview.totalLegacyPhotos - preview.potentialDuplicates}</strong></li>
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {preview && preview.galleries.length > 0 && (
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-3">Dettaglio gallerie ({preview.galleries.length})</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {preview.galleries.map((gallery) => (
                <div key={gallery.id} className="flex justify-between items-center text-sm p-2 bg-muted rounded">
                  <span className="font-medium">{gallery.nome}</span>
                  <div className="flex gap-4 text-muted-foreground">
                    <span>Legacy: {gallery.legacyPhotosCount}</span>
                    {gallery.duplicates > 0 && (
                      <span className="text-orange-600">Duplicate: {gallery.duplicates}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {migrationResult && (
          <Alert className="border-green-600 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold text-green-800">Migrazione completata con successo!</p>
                <ul className="text-sm space-y-1">
                  <li>📂 Gallerie scansionate: <strong>{migrationResult.galleriesScanned}</strong></li>
                  <li>📸 Foto legacy trovate: <strong>{migrationResult.photosFound}</strong></li>
                  <li>✅ Foto migrate: <strong>{migrationResult.photosMigrated}</strong></li>
                  <li>⏭️  Foto duplicate (saltate): <strong>{migrationResult.photosDuplicate}</strong></li>
                  {migrationResult.errors.length > 0 && (
                    <li className="text-red-600">❌ Errori: <strong>{migrationResult.errors.length}</strong></li>
                  )}
                </ul>
                {migrationResult.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-red-600">
                      Vedi errori ({migrationResult.errors.length})
                    </summary>
                    <ul className="mt-2 text-xs space-y-1">
                      {migrationResult.errors.map((error, i) => (
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
