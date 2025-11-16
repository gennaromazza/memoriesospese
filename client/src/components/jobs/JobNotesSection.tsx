
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { db, storage } from '@/lib/firebase';
import { doc, updateDoc, getDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  Camera, 
  Upload, 
  X, 
  StickyNote, 
  Palette,
  FileText,
  Trash2,
  Plus,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { nanoid } from 'nanoid';
import { cn } from '@/lib/utils';

interface JobNote {
  id: string;
  tipo: 'generale' | 'laboratorio' | 'personalizzazione' | 'colori_tessuti';
  testo: string;
  foto?: string[]; // URLs Firebase Storage
  metadata?: {
    coloreAlbum?: string;
    tessutoAlbum?: string;
    rilegatura?: string;
    personalizzazioni?: string;
    altro?: string;
  };
  createdAt: Timestamp;
  createdBy: string;
}

interface JobNotesSectionProps {
  jobId: string;
  isAdmin?: boolean;
}

const TIPO_LABELS: Record<JobNote['tipo'], { label: string; icon: any; color: string }> = {
  generale: { label: 'Note Generali', icon: StickyNote, color: 'bg-blue-100 text-blue-700' },
  laboratorio: { label: 'Info Laboratorio', icon: FileText, color: 'bg-purple-100 text-purple-700' },
  personalizzazione: { label: 'Personalizzazioni', icon: Palette, color: 'bg-pink-100 text-pink-700' },
  colori_tessuti: { label: 'Colori e Tessuti', icon: Palette, color: 'bg-orange-100 text-orange-700' }
};

export default function JobNotesSection({ jobId, isAdmin = false }: JobNotesSectionProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [noteType, setNoteType] = useState<JobNote['tipo']>('generale');
  const [noteText, setNoteText] = useState('');
  const [uploadingPhotos, setUploadingPhotos] = useState<File[]>([]);
  const [photosPreviews, setPhotosPreviews] = useState<string[]>([]);
  
  // Metadata colori/tessuti
  const [coloreAlbum, setColoreAlbum] = useState('');
  const [tessutoAlbum, setTessutoAlbum] = useState('');
  const [rilegatura, setRilegatura] = useState('');
  const [personalizzazioni, setPersonalizzazioni] = useState('');
  const [altro, setAltro] = useState('');

  // Query note job
  const { data: notes = [], isLoading } = useQuery<JobNote[]>({
    queryKey: ['job-notes', jobId],
    queryFn: async () => {
      const jobDoc = await getDoc(doc(db, 'jobs', jobId));
      if (!jobDoc.exists()) return [];
      return (jobDoc.data().notes || []) as JobNote[];
    }
  });

  // Handle camera/file input
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadingPhotos(prev => [...prev, ...files]);
    
    // Generate previews
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotosPreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index: number) => {
    setUploadingPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotosPreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: async () => {
      if (!noteText.trim() && uploadingPhotos.length === 0) {
        throw new Error('Aggiungi almeno una foto o del testo');
      }

      // 1. Upload foto se presenti
      const photoUrls: string[] = [];
      for (const file of uploadingPhotos) {
        const storageRef = ref(storage, `jobs/${jobId}/notes/${nanoid()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        photoUrls.push(url);
      }

      // 2. Crea nota
      const newNote: JobNote = {
        id: nanoid(),
        tipo: noteType,
        testo: noteText.trim(),
        foto: photoUrls.length > 0 ? photoUrls : undefined,
        metadata: noteType === 'colori_tessuti' ? {
          coloreAlbum: coloreAlbum.trim() || undefined,
          tessutoAlbum: tessutoAlbum.trim() || undefined,
          rilegatura: rilegatura.trim() || undefined,
          personalizzazioni: personalizzazioni.trim() || undefined,
          altro: altro.trim() || undefined
        } : undefined,
        createdAt: Timestamp.now(),
        createdBy: 'admin' // TODO: get from auth context
      };

      // 3. Salva in Firestore
      await updateDoc(doc(db, 'jobs', jobId), {
        notes: arrayUnion(newNote),
        updatedAt: Timestamp.now()
      });

      return newNote;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-notes', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      
      // Reset form
      setNoteText('');
      setUploadingPhotos([]);
      setPhotosPreviews([]);
      setColoreAlbum('');
      setTessutoAlbum('');
      setRilegatura('');
      setPersonalizzazioni('');
      setAltro('');
      setAddingNote(false);
      
      toast({
        title: 'Nota aggiunta',
        description: 'La nota è stata salvata correttamente'
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const jobDoc = await getDoc(doc(db, 'jobs', jobId));
      if (!jobDoc.exists()) throw new Error('Job non trovato');
      
      const currentNotes = (jobDoc.data().notes || []) as JobNote[];
      const updatedNotes = currentNotes.filter(n => n.id !== noteId);
      
      await updateDoc(doc(db, 'jobs', jobId), {
        notes: updatedNotes,
        updatedAt: Timestamp.now()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-notes', jobId] });
      toast({
        title: 'Nota eliminata',
        description: 'La nota è stata rimossa'
      });
    }
  });

  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <StickyNote className="h-5 w-5" />
            Note e Personalizzazioni ({notes.length})
          </CardTitle>
          {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {/* Lista note esistenti */}
          {notes.length > 0 && (
            <div className="space-y-3">
              {notes.map(note => {
                const config = TIPO_LABELS[note.tipo];
                const Icon = config.icon;
                
                return (
                  <div key={note.id} className="border rounded-lg p-4 space-y-3 bg-gray-50">
                    <div className="flex items-start justify-between gap-2">
                      <Badge className={cn('flex items-center gap-1', config.color)}>
                        <Icon className="h-3 w-3" />
                        {config.label}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteNoteMutation.mutate(note.id)}
                        disabled={deleteNoteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>

                    {note.testo && (
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.testo}</p>
                    )}

                    {/* Metadata colori/tessuti */}
                    {note.metadata && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-white p-3 rounded border">
                        {note.metadata.coloreAlbum && (
                          <div>
                            <span className="font-semibold">Colore: </span>
                            {note.metadata.coloreAlbum}
                          </div>
                        )}
                        {note.metadata.tessutoAlbum && (
                          <div>
                            <span className="font-semibold">Tessuto: </span>
                            {note.metadata.tessutoAlbum}
                          </div>
                        )}
                        {note.metadata.rilegatura && (
                          <div>
                            <span className="font-semibold">Rilegatura: </span>
                            {note.metadata.rilegatura}
                          </div>
                        )}
                        {note.metadata.personalizzazioni && (
                          <div className="sm:col-span-2">
                            <span className="font-semibold">Personalizzazioni: </span>
                            {note.metadata.personalizzazioni}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Foto allegate */}
                    {note.foto && note.foto.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                        {note.foto.map((url, idx) => (
                          <img
                            key={idx}
                            src={url}
                            alt={`Foto ${idx + 1}`}
                            className="w-full h-24 sm:h-32 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => window.open(url, '_blank')}
                          />
                        ))}
                      </div>
                    )}

                    <div className="text-xs text-gray-500 pt-2 border-t">
                      {format(note.createdAt.toDate(), 'PPp', { locale: it })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Form nuova nota */}
          {!addingNote ? (
            <Button
              onClick={() => setAddingNote(true)}
              className="w-full"
              variant="outline"
            >
              <Plus className="h-4 w-4 mr-2" />
              Aggiungi Nota
            </Button>
          ) : (
            <div className="border rounded-lg p-4 space-y-4 bg-blue-50">
              {/* Tipo nota */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(Object.keys(TIPO_LABELS) as JobNote['tipo'][]).map(tipo => {
                  const config = TIPO_LABELS[tipo];
                  const Icon = config.icon;
                  return (
                    <Button
                      key={tipo}
                      variant={noteType === tipo ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setNoteType(tipo)}
                      className={cn('justify-start text-sm', noteType === tipo && config.color)}
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      <span className="truncate">{config.label}</span>
                    </Button>
                  );
                })}
              </div>

              {/* Testo nota */}
              <div>
                <Label>Note</Label>
                <Textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Scrivi qui le tue note..."
                  rows={4}
                  className="resize-none"
                />
              </div>

              {/* Campi specifici per Colori/Tessuti */}
              {noteType === 'colori_tessuti' && (
                <div className="space-y-3 p-3 bg-white rounded border">
                  <h4 className="font-semibold text-sm">Dettagli Album</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Colore Album</Label>
                      <Input
                        value={coloreAlbum}
                        onChange={(e) => setColoreAlbum(e.target.value)}
                        placeholder="es. Rosso bordeaux"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Tessuto</Label>
                      <Input
                        value={tessutoAlbum}
                        onChange={(e) => setTessutoAlbum(e.target.value)}
                        placeholder="es. Velluto, Seta, Ecopelle"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Rilegatura</Label>
                      <Input
                        value={rilegatura}
                        onChange={(e) => setRilegatura(e.target.value)}
                        placeholder="es. Cucita a mano, Incollata"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Altro</Label>
                      <Input
                        value={altro}
                        onChange={(e) => setAltro(e.target.value)}
                        placeholder="Note aggiuntive"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Personalizzazioni Speciali</Label>
                      <Textarea
                        value={personalizzazioni}
                        onChange={(e) => setPersonalizzazioni(e.target.value)}
                        placeholder="es. Iniziali ricamate, incisioni, decorazioni..."
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Upload foto */}
              <div>
                <Label className="mb-2 block">Allega Foto</Label>
                <div className="space-y-3">
                  {/* Preview foto */}
                  {photosPreviews.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {photosPreviews.map((preview, idx) => (
                        <div key={idx} className="relative">
                          <img
                            src={preview}
                            alt={`Preview ${idx}`}
                            className="w-full h-20 sm:h-24 object-cover rounded"
                          />
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                            onClick={() => removePhoto(idx)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Input foto */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Label
                      htmlFor="camera-input"
                      className="cursor-pointer border-2 border-dashed rounded-lg p-3 sm:p-4 text-center hover:bg-gray-100 transition-colors"
                    >
                      <Camera className="h-5 w-5 sm:h-6 sm:w-6 mx-auto mb-2 text-gray-400" />
                      <span className="text-xs sm:text-sm text-gray-600">Fotocamera</span>
                      <Input
                        id="camera-input"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        onChange={handlePhotoSelect}
                        className="hidden"
                      />
                    </Label>

                    <Label
                      htmlFor="gallery-input"
                      className="cursor-pointer border-2 border-dashed rounded-lg p-3 sm:p-4 text-center hover:bg-gray-100 transition-colors"
                    >
                      <Upload className="h-5 w-5 sm:h-6 sm:w-6 mx-auto mb-2 text-gray-400" />
                      <span className="text-xs sm:text-sm text-gray-600">Galleria</span>
                      <Input
                        id="gallery-input"
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handlePhotoSelect}
                        className="hidden"
                      />
                    </Label>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={() => addNoteMutation.mutate()}
                  disabled={addNoteMutation.isPending || (!noteText.trim() && uploadingPhotos.length === 0)}
                  className="flex-1 w-full"
                >
                  {addNoteMutation.isPending ? 'Salvataggio...' : 'Salva Nota'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAddingNote(false);
                    setNoteText('');
                    setUploadingPhotos([]);
                    setPhotosPreviews([]);
                  }}
                  className="w-full sm:w-auto"
                >
                  Annulla
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
