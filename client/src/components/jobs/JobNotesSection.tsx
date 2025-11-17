import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { Job } from '@shared/types';
import { Pencil, Save, X, Camera, Trash2, Image as ImageIcon, FileText } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { nanoid } from 'nanoid';

interface NoteFotoItem {
  id: string;
  imageUrl: string;
  nota: string;
  createdAt: Timestamp;
}

interface JobNotesSectionProps {
  job: Job;
}

export default function JobNotesSection({ job }: JobNotesSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [noteText, setNoteText] = useState(job.note || '');
  const [modalitaFoto, setModalitaFoto] = useState(false);
  const [notePerFoto, setNotePerFoto] = useState<NoteFotoItem[]>(
    (job as any).notePerFoto || []
  );
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const fileInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateNoteMutation = useMutation({
    mutationFn: async (updates: { note?: string; notePerFoto?: NoteFotoItem[] }) => {
      const jobRef = doc(db, 'jobs', job.id);
      await updateDoc(jobRef, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${job.id}`] });
      setIsEditing(false);
      toast({
        title: 'Note aggiornate',
        description: 'Le modifiche sono state salvate con successo',
      });
    },
    onError: (error) => {
      console.error('Errore durante il salvataggio:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile salvare le modifiche',
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    if (modalitaFoto) {
      updateNoteMutation.mutate({ notePerFoto });
    } else {
      updateNoteMutation.mutate({ note: noteText });
    }
  };

  const handleCancel = () => {
    setNoteText(job.note || '');
    setNotePerFoto((job as any).notePerFoto || []);
    setIsEditing(false);
  };

  const handleAddFotoNota = () => {
    const newItem: NoteFotoItem = {
      id: nanoid(),
      imageUrl: '',
      nota: '',
      createdAt: Timestamp.now(),
    };
    setNotePerFoto([...notePerFoto, newItem]);
  };

  const handleFileChange = async (index: number, file: File) => {
    if (!file) return;

    setUploadingIndex(index);
    try {
      // Upload to Firebase Storage
      const storageRef = ref(storage, `jobs/${job.id}/note-foto/${nanoid()}-${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      // Update local state
      const updated = [...notePerFoto];
      updated[index].imageUrl = downloadURL;
      setNotePerFoto(updated);

      toast({
        title: 'Foto caricata',
        description: 'La foto è stata caricata con successo',
      });
    } catch (error) {
      console.error('Errore durante il caricamento:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile caricare la foto',
        variant: 'destructive',
      });
    } finally {
      setUploadingIndex(null);
    }
  };

  const handleDeleteFotoNota = async (index: number) => {
    const item = notePerFoto[index];

    // Delete from Storage if exists
    if (item.imageUrl) {
      try {
        const imageRef = ref(storage, item.imageUrl);
        await deleteObject(imageRef);
      } catch (error) {
        console.error('Errore durante la cancellazione della foto:', error);
      }
    }

    // Remove from local state
    const updated = notePerFoto.filter((_, i) => i !== index);
    setNotePerFoto(updated);
  };

  const handleNotaChange = (index: number, nota: string) => {
    const updated = [...notePerFoto];
    updated[index].nota = nota;
    setNotePerFoto(updated);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col gap-2 w-full sm:w-auto">
          <CardTitle>Note</CardTitle>
          {isEditing && (
            <div className="flex items-center gap-2">
              <Switch
                id="modalita-foto"
                checked={modalitaFoto}
                onCheckedChange={setModalitaFoto}
              />
              <Label htmlFor="modalita-foto" className="text-sm font-normal cursor-pointer">
                {modalitaFoto ? (
                  <span className="flex items-center gap-1">
                    <Camera className="h-4 w-4" />
                    Note per foto
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    Nota generale
                  </span>
                )}
              </Label>
            </div>
          )}
        </div>
        {!isEditing ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="w-full sm:w-auto"
          >
            <Pencil className="h-4 w-4 mr-2" />
            Modifica
          </Button>
        ) : (
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="flex-1 sm:flex-none"
            >
              <X className="h-4 w-4 mr-2" />
              Annulla
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={updateNoteMutation.isPending}
              className="flex-1 sm:flex-none"
            >
              <Save className="h-4 w-4 mr-2" />
              Salva
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isEditing ? (
          modalitaFoto ? (
            // Modalità Note per Foto
            <div className="space-y-4">
              {notePerFoto.map((item, index) => (
                <div 
                  key={item.id} 
                  className="border rounded-lg p-3 sm:p-4 space-y-3 bg-gray-50 dark:bg-gray-900"
                >
                  <div className="flex flex-col lg:flex-row gap-4">
                    {/* Foto Section */}
                    <div className="w-full lg:w-1/3">
                      {item.imageUrl ? (
                        <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-gray-200">
                          <img
                            src={item.imageUrl}
                            alt={`Nota foto ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-2 right-2"
                            onClick={() => {
                              const updated = [...notePerFoto];
                              updated[index].imageUrl = '';
                              setNotePerFoto(updated);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div 
                          className="aspect-video w-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                          onClick={() => fileInputRefs.current[index]?.click()}
                        >
                          <Camera className="h-8 w-8 text-gray-400" />
                          <span className="text-sm text-gray-500">
                            {uploadingIndex === index ? 'Caricamento...' : 'Scatta o carica foto'}
                          </span>
                          <input
                            ref={(el) => (fileInputRefs.current[index] = el)}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileChange(index, file);
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Nota Section */}
                    <div className="w-full lg:w-2/3 flex flex-col gap-2">
                      <Label htmlFor={`nota-${index}`} className="text-sm font-medium">
                        Nota
                      </Label>
                      <Textarea
                        id={`nota-${index}`}
                        value={item.nota}
                        onChange={(e) => handleNotaChange(index, e.target.value)}
                        placeholder="Descrivi cosa c'è nella foto..."
                        className="min-h-[100px] w-full resize-none"
                      />
                    </div>
                  </div>

                  {/* Delete Button */}
                  <div className="flex justify-end">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteFotoNota(index)}
                      className="w-full sm:w-auto"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Elimina
                    </Button>
                  </div>
                </div>
              ))}

              <Button
                variant="outline"
                onClick={handleAddFotoNota}
                className="w-full"
              >
                <Camera className="h-4 w-4 mr-2" />
                Aggiungi foto + nota
              </Button>
            </div>
          ) : (
            // Modalità Nota Generale
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Scrivi una nota generale..."
              className="min-h-[100px] w-full resize-none"
            />
          )
        ) : (
          // Visualizzazione Read-Only
          <div>
            {(job as any).notePerFoto && (job as any).notePerFoto.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <ImageIcon className="h-4 w-4" />
                  Note per foto ({(job as any).notePerFoto.length})
                </div>
                {(job as any).notePerFoto.map((item: NoteFotoItem, index: number) => (
                  <div 
                    key={item.id} 
                    className="border rounded-lg p-3 sm:p-4 space-y-3"
                  >
                    <div className="flex flex-col lg:flex-row gap-4">
                      {item.imageUrl && (
                        <div className="w-full lg:w-1/3">
                          <div className="aspect-video w-full rounded-lg overflow-hidden bg-gray-200">
                            <img
                              src={item.imageUrl}
                              alt={`Nota foto ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </div>
                      )}
                      <div className="w-full lg:w-2/3">
                        <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                          {item.nota || 'Nessuna descrizione'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                {job.note || 'Nessuna nota'}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}