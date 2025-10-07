import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { 
  BookOpen, 
  Upload, 
  Eye, 
  Check, 
  X, 
  FileText,
  Sparkles,
  Quote,
  AlertCircle,
  Info,
  Loader2 // Import Loader2 for the uploading state
} from 'lucide-react';
import StoryService from '@/lib/storyService';
import { CoupleStory, normalizeImportedStory } from '@shared/schema';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';

interface StoryUploadFormProps {
  galleryId: string;
  galleryName?: string;
  existingStory?: CoupleStory | null;
  onStoryUploaded?: (story: CoupleStory) => void;
  onCancel?: () => void;
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
  normalizedData?: any;
  stats?: {
    chaptersCount: number;
    quotesCount: number;
    notesCount: number;
    hasProlog: boolean;
  };
}

export default function StoryUploadForm({ 
  galleryId, 
  galleryName,
  existingStory,
  onStoryUploaded,
  onCancel 
}: StoryUploadFormProps) {
  const [jsonInput, setJsonInput] = useState('');
  const [metadata, setMetadata] = useState({
    titolo: '',
    sottotitolo: '',
    stile: '',
    tema: '',
    colore_principale: '#6d7e6d'
  });
  
  // 🔧 Pre-compila il form se c'è una storia esistente
  useEffect(() => {
    if (existingStory) {
      // Crea il JSON dalla storia esistente (escludi campi sistema)
      const { id, galleryId: gId, createdAt, updatedAt, createdBy, updatedBy, ...storyData } = existingStory;
      setJsonInput(JSON.stringify(storyData, null, 2));
      
      // Pre-compila metadata se presenti
      if (existingStory.metadata) {
        setMetadata({
          titolo: existingStory.metadata.titolo || '',
          sottotitolo: existingStory.metadata.sottotitolo || '',
          stile: existingStory.metadata.stile || '',
          tema: existingStory.metadata.tema || '',
          colore_principale: existingStory.metadata.colore_principale || '#6d7e6d'
        });
      }
    }
  }, [existingStory]);
  const [validationResult, setValidationResult] = useState<ValidationResult>({ isValid: false });
  const [isValidating, setIsValidating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showPreview, setShowPreview] = useState(false);

  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const isAdmin = useIsAdmin();

  // Early return if not admin
  if (!isAdmin) {
    return (
      <div className="w-full max-w-4xl mx-auto p-6">
        <Card className="shadow-lg border-red-200 bg-red-50">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-16 w-16 mx-auto text-red-600 mb-4" />
            <h2 className="text-xl font-bold text-red-900 mb-2">
              Accesso Negato
            </h2>
            <p className="text-red-700">
              Solo gli amministratori possono caricare storie delle coppie.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Valida il JSON in tempo reale
  useEffect(() => {
    if (!jsonInput.trim()) {
      setValidationResult({ isValid: false });
      return;
    }

    setIsValidating(true);
    const timeoutId = setTimeout(() => {
      try {
        const parsedJson = JSON.parse(jsonInput);
        const result = StoryService.validateImportJson(parsedJson);

        if (result.isValid && result.normalizedData) {
          // Calcola statistiche
          const stats = {
            chaptersCount: 0,
            quotesCount: 0,
            notesCount: 0,
            hasProlog: !!result.normalizedData.prologo
          };

          // Conta capitoli
          const chapters = ['capitolo_1_lattesa', 'capitolo_2_incontro', 'capitolo_3_festa', 'capitolo_4_promesse', 'capitolo_5_celebrazione', 'capitolo_6_eternita'];
          stats.chaptersCount = chapters.filter(ch => {
            const chapterData = (result.normalizedData as any)?.[ch];
            return chapterData && Array.isArray(chapterData) && chapterData.length > 0;
          }).length;

          // Conta citazioni
          stats.quotesCount = (result.normalizedData.citazioni_poetiche?.length || 0) + 
                             (result.normalizedData.citazioni_religiose?.length || 0) + 
                             (result.normalizedData.citazioni_moderne?.length || 0);

          // Conta note
          stats.notesCount = result.normalizedData.note_fotografo?.length || 0;

          setValidationResult({ ...result, stats });
        } else {
          setValidationResult(result);
        }
      } catch (error) {
        setValidationResult({
          isValid: false,
          error: 'JSON non valido: ' + (error as Error).message
        });
      }
      setIsValidating(false);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [jsonInput]);

  // Carica il JSON e salva la storia
  const handleUpload = async () => {
    if (!validationResult.isValid || !user || !isAdmin) {
      toast({
        title: "Errore",
        description: "Solo gli amministratori possono caricare storie.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      // Parse del JSON
      const parsedJson = JSON.parse(jsonInput);
      setUploadProgress(30);

      // Normalizza i dati
      const normalizedData = normalizeImportedStory(parsedJson);
      setUploadProgress(50);

      // Aggiungi metadata se forniti
      if (metadata.titolo || metadata.sottotitolo || metadata.stile || metadata.tema) {
        normalizedData.metadata = {
          titolo: metadata.titolo || undefined,
          sottotitolo: metadata.sottotitolo || undefined,
          stile: metadata.stile || undefined,
          tema: metadata.tema || undefined,
          colore_principale: metadata.colore_principale || '#6d7e6d'
        };
      }
      setUploadProgress(70);

      // Salva su Firebase
      await StoryService.saveStory(galleryId, normalizedData, user.email || undefined);
      setUploadProgress(90);

      // Recupera la storia salvata
      const savedStory = await StoryService.getStoryByGalleryId(galleryId);
      setUploadProgress(100);

      toast({
        title: "Storia caricata con successo!",
        description: `La storia della coppia è ora disponibile nella galleria "${galleryName}".`,
      });

      // Callback di successo
      if (onStoryUploaded && savedStory) {
        onStoryUploaded(savedStory);
      }

      // Reset form
      setJsonInput('');
      setMetadata({
        titolo: '',
        sottotitolo: '',
        stile: '',
        tema: '',
        colore_principale: '#6d7e6d'
      });

    } catch (error) {
      console.error('Errore caricamento storia:', error);
      toast({
        title: "Errore",
        description: "Errore durante il caricamento della storia. Riprova.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const renderValidationStatus = () => {
    if (isValidating) {
      return (
        <Alert className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            Validazione JSON in corso...
          </AlertDescription>
        </Alert>
      );
    }

    if (!jsonInput.trim()) {
      return (
        <Alert className="border-gray-200 bg-gray-50">
          <FileText className="h-4 w-4 text-gray-600" />
          <AlertDescription className="text-gray-700">
            Incolla qui il JSON generato da ChatGPT con la storia della coppia
          </AlertDescription>
        </Alert>
      );
    }

    if (!validationResult.isValid) {
      return (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            {validationResult.error}
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <Alert className="border-green-200 bg-green-50">
        <Check className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800">
          JSON valido! {validationResult.stats && (
            <>
              <br />
              <div className="mt-2 flex flex-wrap gap-2">
                {validationResult.stats.hasProlog && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    ✓ Prologo
                  </Badge>
                )}
                {validationResult.stats.chaptersCount > 0 && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    {validationResult.stats.chaptersCount} Capitoli
                  </Badge>
                )}
                {validationResult.stats.quotesCount > 0 && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    {validationResult.stats.quotesCount} Citazioni
                  </Badge>
                )}
                {validationResult.stats.notesCount > 0 && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    {validationResult.stats.notesCount} Note
                  </Badge>
                )}
              </div>
            </>
          )}
        </AlertDescription>
      </Alert>
    );
  };

  const renderPreview = () => {
    if (!validationResult.isValid || !validationResult.normalizedData) {
      return null;
    }

    const data = validationResult.normalizedData;

    return (
      <Card className="mt-4 bg-sage-50 border-sage-200">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Anteprima Storia
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Prologo */}
          {data.prologo && (
            <div>
              <h4 className="font-medium text-blue-gray-900 mb-2 flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Prologo
              </h4>
              <p className="text-sm text-blue-gray-700 italic line-clamp-3">
                "{data.prologo.testo}"
              </p>
            </div>
          )}

          {/* Capitoli */}
          <div>
            <h4 className="font-medium text-blue-gray-900 mb-2">Capitoli:</h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'capitolo_1_lattesa', title: "L'Attesa" },
                { key: 'capitolo_2_incontro', title: "L'Incontro" },
                { key: 'capitolo_3_festa', title: "La Festa" },
                { key: 'capitolo_4_promesse', title: "Le Promesse" },
                { key: 'capitolo_5_celebrazione', title: "La Celebrazione" },
                { key: 'capitolo_6_eternita', title: "L'Eternità" }
              ].map(({ key, title }) => (
                <div key={key} className={`text-sm p-2 rounded ${
                  data[key] && data[key].length > 0 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {data[key] && data[key].length > 0 ? '✓' : '○'} {title}
                </div>
              ))}
            </div>
          </div>

          {/* Citazioni */}
          {(data.citazioni_poetiche?.length > 0 || data.citazioni_religiose?.length > 0 || data.citazioni_moderne?.length > 0) && (
            <div>
              <h4 className="font-medium text-blue-gray-900 mb-2 flex items-center gap-2">
                <Quote className="h-4 w-4" />
                Citazioni
              </h4>
              <div className="flex flex-wrap gap-2">
                {data.citazioni_poetiche?.length > 0 && (
                  <Badge variant="outline" className="border-sage-300">
                    {data.citazioni_poetiche.length} Poetiche
                  </Badge>
                )}
                {data.citazioni_religiose?.length > 0 && (
                  <Badge variant="outline" className="border-blue-gray-300">
                    {data.citazioni_religiose.length} Religiose
                  </Badge>
                )}
                {data.citazioni_moderne?.length > 0 && (
                  <Badge variant="outline" className="border-terracotta-300">
                    {data.citazioni_moderne.length} Moderne
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <Card className="shadow-lg border-sage-200">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-terracotta-600 to-cream-600 rounded-full flex items-center justify-center mb-4">
            <BookOpen className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-playfair font-bold text-blue-gray-900">
            {existingStory ? 'Modifica Storia della Coppia' : 'Carica Storia della Coppia'}
          </CardTitle>
          <p className="text-terracotta-700 mt-2">
            {existingStory 
              ? 'Modifica il contenuto della storia esistente o aggiungi nuovi dettagli' 
              : 'Incolla il JSON generato da ChatGPT per creare il libro digitale'
            }
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Metadata opzionali */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="title" className="text-sm font-medium text-terracotta-700">
                Titolo del Libro (opzionale)
              </Label>
              <Input
                id="title"
                placeholder="La Nostra Storia"
                value={metadata.titolo}
                onChange={(e) => setMetadata(prev => ({ ...prev, titolo: e.target.value }))}
                className="border-terracotta-300 focus:border-terracotta-500"
              />
            </div>
            <div>
              <Label htmlFor="subtitle" className="text-sm font-medium text-terracotta-700">
                Sottotitolo (opzionale)
              </Label>
              <Input
                id="subtitle"
                placeholder="Un amore senza tempo"
                value={metadata.sottotitolo}
                onChange={(e) => setMetadata(prev => ({ ...prev, sottotitolo: e.target.value }))}
                className="border-terracotta-300 focus:border-terracotta-500"
              />
            </div>
            <div>
              <Label htmlFor="style" className="text-sm font-medium text-terracotta-700">
                Stile (opzionale)
              </Label>
              <Input
                id="style"
                placeholder="Romantico, Elegante, Moderno..."
                value={metadata.stile}
                onChange={(e) => setMetadata(prev => ({ ...prev, stile: e.target.value }))}
                className="border-terracotta-300 focus:border-terracotta-500"
              />
            </div>
            <div>
              <Label htmlFor="theme" className="text-sm font-medium text-terracotta-700">
                Tema (opzionale)
              </Label>
              <Input
                id="theme"
                placeholder="Autunno, Mare, Montagna..."
                value={metadata.tema}
                onChange={(e) => setMetadata(prev => ({ ...prev, tema: e.target.value }))}
                className="border-terracotta-300 focus:border-terracotta-500"
              />
            </div>
          </div>

          {/* JSON Input */}
          <div className="space-y-2">
            <Label htmlFor="json-input" className="text-sm font-medium text-terracotta-700">
              JSON della Storia
            </Label>
            <Textarea
              id="json-input"
              placeholder='{"prologo": {"testo": "..."}, "capitolo_1_lattesa": [{"testo": "..."}], ...}'
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              className="min-h-[200px] border-terracotta-300 focus:border-terracotta-500 font-mono text-sm"
            />
            <p className="text-xs text-terracotta-600">
              Incolla qui il JSON completo generato da ChatGPT con la storia della coppia
            </p>
          </div>

          {/* Validation Status */}
          {renderValidationStatus()}

          {/* Preview Toggle */}
          {validationResult.isValid && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="border-terracotta-500 text-terracotta-800 hover:bg-terracotta-100 font-medium shadow-sm"
              >
                <Eye className="h-4 w-4 mr-2" />
                {showPreview ? 'Nascondi' : 'Mostra'} Anteprima
              </Button>
            </div>
          )}

          {/* Preview */}
          {showPreview && renderPreview()}

          {/* Upload Progress */}
          {isUploading && (
            <Card className="bg-terracotta-50 border-terracotta-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-5 h-5 border-2 border-terracotta-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="font-medium text-blue-gray-900">Caricamento storia...</span>
                  <span className="ml-auto text-terracotta-700 font-bold">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="w-full h-2" />
                <p className="text-xs text-terracotta-700 mt-2">
                  La storia sta per essere salvata nella galleria...
                </p>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-sage-200">
            {onCancel && (
              <Button
                variant="outline"
                onClick={onCancel}
                disabled={isUploading}
                className="border-sage-400 text-sage-700 hover:bg-sage-100 font-medium"
              >
                Annulla
              </Button>
            )}

            <div className="flex items-center gap-3">
              <Button
                onClick={handleUpload}
                disabled={!validationResult.isValid || isUploading || !user || !isAdmin}
                className="bg-terracotta-600 hover:bg-terracotta-700 text-white font-semibold shadow-md disabled:bg-terracotta-400 disabled:text-white disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Caricamento...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    {existingStory ? 'Aggiorna Storia' : 'Carica Storia'}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Help */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-2">Come usare questo strumento:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Genera la storia della coppia usando ChatGPT</li>
                    <li>Copia il JSON risultante</li>
                    <li>Incollalo nell'area di testo sopra</li>
                    <li>Opzionalmente aggiungi titolo e metadata</li>
                    <li>Clicca "Carica Storia" per creare il libro digitale</li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}