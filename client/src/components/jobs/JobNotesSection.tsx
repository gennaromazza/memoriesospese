import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { Job } from '@shared/jobs-types';
import { Pencil, Save, X, Camera, Trash2, FileText, Loader2, ZoomIn, ImagePlus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { nanoid } from 'nanoid';
import { compressImage } from '@/lib/imageCompression';

interface NoteFotoItem {
  id: string;
  imageUrl: string;
  nota: string;
  createdAt: Timestamp;
  storagePath?: string;
}

interface JobNotesSectionProps {
  job: Job;
}

const MAX_FILE_SIZE_MB = 25;
const draftKey = (jobId: string) => `job-notes-draft-${jobId}`;

// Estrae il path interno Storage da un download URL pubblico (fallback per item legacy senza storagePath)
function pathFromDownloadUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/o\/([^?]+)/);
    if (!match) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

async function deleteStorageObjectSafe(item: { storagePath?: string; imageUrl?: string }) {
  if (!item.imageUrl && !item.storagePath) return;
  try {
    if (item.storagePath) {
      await deleteObject(ref(storage, item.storagePath));
      return;
    }
    const path = pathFromDownloadUrl(item.imageUrl || '');
    if (path) await deleteObject(ref(storage, path));
  } catch (err) {
    console.warn('[JobNotes] delete storage non riuscita (verrà lasciato orfano):', err);
  }
}

export default function JobNotesSection({ job }: JobNotesSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [noteText, setNoteText] = useState(job?.note || '');
  const [modalitaFoto, setModalitaFoto] = useState(
    !!(job?.notePerFoto && job.notePerFoto.length > 0)
  );
  const [notePerFoto, setNotePerFoto] = useState<NoteFotoItem[]>(job?.notePerFoto || []);
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [confirmSwitchTo, setConfirmSwitchTo] = useState<boolean | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Path Storage caricati in QUESTA sessione di edit (servono per la pulizia su "Annulla")
  const sessionUploadedPathsRef = useRef<Set<string>>(new Set());
  // Path che esistevano nel job all'inizio dell'edit (NON vanno mai puliti)
  const initialPathsRef = useRef<Set<string>>(new Set());
  // "Generazione" della sessione di editing: serve per invalidare gli upload in volo dopo cancel/switch/job-change
  const editGenerationRef = useRef(0);

  const singleFileInputRef = useRef<HTMLInputElement | null>(null);
  const multiFileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSingleIdRef = useRef<string | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Reset completo dello stato quando il job cambia (fix bug: state mantenuto da un job all'altro)
  useEffect(() => {
    setIsEditing(false);
    setNoteText(job?.note || '');
    setNotePerFoto(job?.notePerFoto || []);
    setModalitaFoto(!!(job?.notePerFoto && job.notePerFoto.length > 0));
    setUploadingIds(new Set());
    setConfirmSwitchTo(null);
    setConfirmCancel(false);
    setConfirmDeleteId(null);
    setLightboxImage(null);
    sessionUploadedPathsRef.current = new Set();
    initialPathsRef.current = new Set();
    pendingSingleIdRef.current = null;
    if (singleFileInputRef.current) singleFileInputRef.current.value = '';
    if (multiFileInputRef.current) multiFileInputRef.current.value = '';
    // Invalida eventuali upload in volo della sessione precedente
    editGenerationRef.current += 1;
  }, [job?.id]);

  // Autosave bozza in localStorage durante l'edit (protegge da chiusura accidentale)
  useEffect(() => {
    if (!isEditing || !job?.id) return;
    const draft = { noteText, notePerFoto, modalitaFoto, savedAt: Date.now() };
    try {
      localStorage.setItem(draftKey(job.id), JSON.stringify(draft));
    } catch {}
  }, [isEditing, noteText, notePerFoto, modalitaFoto, job?.id]);

  const enterEditMode = useCallback(() => {
    // Snapshot dei path iniziali (per non cancellarli mai su "Annulla")
    const initial = new Set<string>();
    for (const it of job?.notePerFoto || []) {
      if (it.storagePath) initial.add(it.storagePath);
      else {
        const p = pathFromDownloadUrl(it.imageUrl || '');
        if (p) initial.add(p);
      }
    }
    initialPathsRef.current = initial;
    sessionUploadedPathsRef.current = new Set();

    // Recupera bozza locale se presente
    try {
      const raw = localStorage.getItem(draftKey(job.id));
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft?.savedAt && Date.now() - draft.savedAt < 1000 * 60 * 60 * 24 * 7) {
          if (typeof draft.noteText === 'string') setNoteText(draft.noteText);
          if (Array.isArray(draft.notePerFoto)) {
            // Rehydrate: createdAt diventa plain object dopo JSON roundtrip → ricostruisco Timestamp
            const rehydrated: NoteFotoItem[] = draft.notePerFoto.map((it: any) => {
              let createdAt: Timestamp;
              if (it?.createdAt && typeof it.createdAt === 'object') {
                if (typeof it.createdAt.seconds === 'number' && typeof it.createdAt.nanoseconds === 'number') {
                  createdAt = new Timestamp(it.createdAt.seconds, it.createdAt.nanoseconds);
                } else if (typeof it.createdAt.toMillis === 'function') {
                  createdAt = it.createdAt as Timestamp;
                } else {
                  createdAt = Timestamp.now();
                }
              } else {
                createdAt = Timestamp.now();
              }
              return {
                id: typeof it?.id === 'string' ? it.id : nanoid(),
                imageUrl: typeof it?.imageUrl === 'string' ? it.imageUrl : '',
                nota: typeof it?.nota === 'string' ? it.nota : '',
                storagePath: typeof it?.storagePath === 'string' ? it.storagePath : undefined,
                createdAt,
              };
            });
            setNotePerFoto(rehydrated);
          }
          if (typeof draft.modalitaFoto === 'boolean') setModalitaFoto(draft.modalitaFoto);
          toast({ title: 'Bozza recuperata', description: 'Ho ripristinato le modifiche non salvate.' });
        }
      }
    } catch {}

    setIsEditing(true);
  }, [job, toast]);

  const updateNoteMutation = useMutation({
    mutationFn: async (updates: { note?: string; notePerFoto?: NoteFotoItem[] }) => {
      const jobRef = doc(db, 'jobs', job.id);
      await updateDoc(jobRef, updates);
      return updates;
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ['/api/jobs', job.id] });
      const previousJob = queryClient.getQueryData(['/api/jobs', job.id]);
      queryClient.setQueryData(['/api/jobs', job.id], (old: any) => {
        if (!old) return old;
        return { ...old, ...updates };
      });
      return { previousJob };
    },
    onSuccess: () => {
      // Su salvataggio: ciò che era "session" diventa "iniziale" e niente più va pulito
      try {
        localStorage.removeItem(draftKey(job.id));
      } catch {}
      sessionUploadedPathsRef.current = new Set();
      setIsEditing(false);
      toast({ title: 'Note aggiornate', description: 'Le modifiche sono state salvate con successo' });
    },
    onError: (error, _variables, context) => {
      if (context?.previousJob) {
        queryClient.setQueryData(['/api/jobs', job.id], context.previousJob);
      }
      console.error('Errore durante il salvataggio:', error);
      toast({ title: 'Errore', description: 'Impossibile salvare le modifiche', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', job.id] });
    },
  });

  const handleSave = () => {
    if (modalitaFoto) updateNoteMutation.mutate({ notePerFoto });
    else updateNoteMutation.mutate({ note: noteText });
  };

  const hasUnsavedChanges = useCallback(() => {
    if (modalitaFoto) {
      const original = JSON.stringify(job?.notePerFoto || []);
      const current = JSON.stringify(notePerFoto);
      return original !== current;
    }
    return (job?.note || '') !== noteText;
  }, [modalitaFoto, noteText, notePerFoto, job]);

  const cleanupSessionUploads = useCallback(async () => {
    // Invalida tutti gli upload in volo: i loro callback non aggiorneranno piu` lo state ne` registreranno il path
    editGenerationRef.current += 1;
    const paths = Array.from(sessionUploadedPathsRef.current).filter(
      (p) => !initialPathsRef.current.has(p)
    );
    sessionUploadedPathsRef.current = new Set();
    await Promise.all(paths.map((p) => deleteStorageObjectSafe({ storagePath: p })));
  }, []);

  const handleCancelClick = () => {
    if (hasUnsavedChanges() || sessionUploadedPathsRef.current.size > 0) {
      setConfirmCancel(true);
    } else {
      doCancel();
    }
  };

  const doCancel = async () => {
    setConfirmCancel(false);
    setNoteText(job?.note || '');
    setNotePerFoto(job?.notePerFoto || []);
    setModalitaFoto(!!(job?.notePerFoto && job.notePerFoto.length > 0));
    setIsEditing(false);
    try {
      localStorage.removeItem(draftKey(job.id));
    } catch {}
    await cleanupSessionUploads();
  };

  const handleToggleModalita = (checked: boolean) => {
    const hasFotoContent =
      notePerFoto.length > 0 && notePerFoto.some((it) => it.imageUrl || it.nota);
    const hasGeneralContent = noteText.trim().length > 0;

    if (!checked && hasFotoContent) {
      setConfirmSwitchTo(checked);
      return;
    }
    if (checked && hasGeneralContent) {
      setConfirmSwitchTo(checked);
      return;
    }
    setModalitaFoto(checked);
  };

  const confirmSwitchModalita = async () => {
    if (confirmSwitchTo === null) return;
    const target = confirmSwitchTo;
    setConfirmSwitchTo(null);

    if (!target) {
      // Passando a "nota generale" pulisco le foto caricate in sessione (non quelle preesistenti del job)
      await cleanupSessionUploads();
      // E rimuovo dallo state le foto-note la cui foto non era nel job iniziale
      setNotePerFoto((prev) =>
        prev.filter((it) => {
          const path = it.storagePath || pathFromDownloadUrl(it.imageUrl || '');
          return path ? initialPathsRef.current.has(path) : false;
        })
      );
    } else {
      setNoteText('');
    }
    setModalitaFoto(target);
  };

  const handleAddFotoNota = () => {
    const newItem: NoteFotoItem = {
      id: nanoid(),
      imageUrl: '',
      nota: '',
      createdAt: Timestamp.now(),
    };
    setNotePerFoto((prev) => [...prev, newItem]);
  };

  const uploadOneFile = useCallback(
    async (file: File, targetItemId: string) => {
      if (!file.type.startsWith('image/')) {
        toast({
          title: 'Formato non valido',
          description: `"${file.name}" non è un'immagine`,
          variant: 'destructive',
        });
        return;
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast({
          title: 'File troppo grande',
          description: `"${file.name}" supera ${MAX_FILE_SIZE_MB}MB. Riduci la dimensione e riprova.`,
          variant: 'destructive',
        });
        return;
      }

      // Cattura la generazione corrente: se cambia (cancel/switch/job-change) l'upload viene scartato
      const myGeneration = editGenerationRef.current;
      const myJobId = job.id;

      setUploadingIds((prev) => new Set(prev).add(targetItemId));
      let storagePath: string | null = null;
      try {
        const compressed = await compressImage(file, {
          maxSizeMB: 1,
          maxWidthOrHeight: 1920,
        });
        const safeName = file.name.replace(/[^\w.\-]+/g, '_');
        storagePath = `jobs/${myJobId}/note-foto/${nanoid()}-${safeName}`;
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, compressed);
        const downloadURL = await getDownloadURL(storageRef);

        // Se la sessione e` cambiata nel frattempo, il risultato non e` piu` valido: pulisco e basta
        if (myGeneration !== editGenerationRef.current || myJobId !== job.id) {
          await deleteStorageObjectSafe({ storagePath });
          return;
        }

        sessionUploadedPathsRef.current.add(storagePath);
        // Aggancio per id (resistente a riordini/cancellazioni concorrenti)
        setNotePerFoto((prev) =>
          prev.map((it) =>
            it.id === targetItemId ? { ...it, imageUrl: downloadURL, storagePath: storagePath! } : it
          )
        );
      } catch (error) {
        console.error('Errore durante il caricamento:', error);
        // Se siamo ancora nella stessa sessione, notifico; altrimenti l'utente ha gia` cambiato contesto
        if (myGeneration === editGenerationRef.current && myJobId === job.id) {
          toast({
            title: 'Errore',
            description: `Impossibile caricare "${file.name}"`,
            variant: 'destructive',
          });
        }
        // Best effort cleanup di una eventuale upload parziale
        if (storagePath) {
          await deleteStorageObjectSafe({ storagePath });
        }
      } finally {
        // Aggiorno lo spinner solo se sono ancora nella stessa sessione
        if (myGeneration === editGenerationRef.current && myJobId === job.id) {
          setUploadingIds((prev) => {
            const next = new Set(prev);
            next.delete(targetItemId);
            return next;
          });
        }
      }
    },
    [job?.id, toast]
  );

  const handleSingleFilePicked = async (file: File | undefined) => {
    if (!file || !pendingSingleIdRef.current) return;
    const id = pendingSingleIdRef.current;
    pendingSingleIdRef.current = null;
    await uploadOneFile(file, id);
  };

  const triggerSingleUpload = (itemId: string) => {
    pendingSingleIdRef.current = itemId;
    singleFileInputRef.current?.click();
  };

  const handleMultiFilesPicked = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Crea N item vuoti e fai partire upload in parallelo agganciandoli per id
    const list = Array.from(files);
    const newItems: NoteFotoItem[] = list.map(() => ({
      id: nanoid(),
      imageUrl: '',
      nota: '',
      createdAt: Timestamp.now(),
    }));
    setNotePerFoto((prev) => [...prev, ...newItems]);
    await Promise.all(list.map((file, i) => uploadOneFile(file, newItems[i].id)));
  };

  const handleRemoveImageFromItem = async (itemId: string) => {
    const item = notePerFoto.find((it) => it.id === itemId);
    if (!item) return;
    const path = item.storagePath || pathFromDownloadUrl(item.imageUrl || '');
    // Pulisci da Storage SOLO se l'avevamo caricata in questa sessione (le foto preesistenti
    // restano su Storage finché l'utente non salva la rimozione: così se annulla, non perde nulla)
    if (path && sessionUploadedPathsRef.current.has(path)) {
      await deleteStorageObjectSafe({ storagePath: path });
      sessionUploadedPathsRef.current.delete(path);
    }
    setNotePerFoto((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, imageUrl: '', storagePath: undefined } : it))
    );
  };

  const handleDeleteFotoNota = async (itemId: string) => {
    const item = notePerFoto.find((it) => it.id === itemId);
    setConfirmDeleteId(null);
    if (!item) return;
    const path = item.storagePath || pathFromDownloadUrl(item.imageUrl || '');
    if (path && sessionUploadedPathsRef.current.has(path)) {
      await deleteStorageObjectSafe({ storagePath: path });
      sessionUploadedPathsRef.current.delete(path);
    }
    // Le foto preesistenti del job vengono "marcate per rimozione" rimuovendole dallo state;
    // la cancellazione effettiva da Storage avviene al salvataggio (se si vuole) — per ora le
    // lascio orfane su Storage finché non si decide policy retention. Sicuro: nessun dato perso.
    setNotePerFoto((prev) => prev.filter((it) => it.id !== itemId));
    toast({ title: 'Nota eliminata', description: 'La nota è stata rimossa.' });
  };

  const handleNotaChange = (itemId: string, nota: string) => {
    setNotePerFoto((prev) => prev.map((it) => (it.id === itemId ? { ...it, nota } : it)));
  };

  if (!job) return null;

  return (
    <Card>
      <CardHeader
        className={
          isEditing
            ? 'flex flex-col gap-3 sticky top-0 z-20 bg-card border-b shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4'
            : 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'
        }
      >
        <div className="flex flex-col gap-2 w-full sm:w-auto">
          <CardTitle>Note</CardTitle>
          {isEditing && (
            <div className="flex items-center gap-2">
              <Switch
                id="modalita-foto"
                checked={modalitaFoto}
                onCheckedChange={handleToggleModalita}
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
            onClick={enterEditMode}
            className="w-full sm:w-auto"
            data-testid="button-edit-notes"
          >
            <Pencil className="h-4 w-4 mr-2" />
            Modifica
          </Button>
        ) : (
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelClick}
              className="flex-1 sm:flex-none"
              data-testid="button-cancel-notes"
            >
              <X className="h-4 w-4 mr-2" />
              Annulla
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={updateNoteMutation.isPending || uploadingIds.size > 0}
              className="flex-1 sm:flex-none"
              data-testid="button-save-notes"
            >
              {updateNoteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salva
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isEditing ? (
          modalitaFoto ? (
            <div className="space-y-4">
              {notePerFoto.map((item, index) => (
                <div
                  key={item.id}
                  className="border rounded-lg p-3 sm:p-4 space-y-3 bg-gray-50 dark:bg-gray-900 relative"
                >
                  {/* Icona cestino in alto a destra (sostituisce il bottone rosso a piena larghezza) */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setConfirmDeleteId(item.id)}
                    className="absolute top-2 right-2 h-11 w-11 text-destructive hover:bg-destructive/10"
                    aria-label="Elimina questa nota"
                    data-testid={`button-delete-note-${index}`}
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>

                  <div className="flex flex-col lg:flex-row gap-4 pr-12 lg:pr-14">
                    <div className="w-full lg:w-1/3">
                      {item.imageUrl ? (
                        <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-gray-200 group">
                          <img
                            src={item.imageUrl}
                            alt={`Nota foto ${index + 1}`}
                            loading="lazy"
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => setLightboxImage(item.imageUrl)}
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none flex items-center justify-center">
                            <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-2 right-2 z-10 h-11 w-11"
                            onClick={() => handleRemoveImageFromItem(item.id)}
                            aria-label="Rimuovi foto"
                          >
                            <X className="h-5 w-5" />
                          </Button>
                        </div>
                      ) : (
                        <div
                          className="aspect-video w-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors p-2"
                          onClick={() => !uploadingIds.has(item.id) && triggerSingleUpload(item.id)}
                        >
                          {uploadingIds.has(item.id) ? (
                            <>
                              <Loader2 className="h-8 w-8 text-primary animate-spin" />
                              <span className="text-sm text-primary font-medium text-center">
                                Compressione e caricamento...
                              </span>
                            </>
                          ) : (
                            <>
                              <Camera className="h-8 w-8 text-gray-400" />
                              <span className="text-sm text-gray-500 text-center">
                                Scatta o carica foto
                              </span>
                              <span className="text-xs text-gray-400 text-center">
                                Compressa in automatico
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="w-full lg:w-2/3 flex flex-col gap-2">
                      <Label htmlFor={`nota-${item.id}`} className="text-sm font-medium">
                        Nota
                      </Label>
                      <Textarea
                        id={`nota-${item.id}`}
                        value={item.nota}
                        onChange={(e) => handleNotaChange(item.id, e.target.value)}
                        placeholder="Descrivi cosa c'è nella foto..."
                        className="min-h-[100px] w-full"
                      />
                    </div>
                  </div>
                </div>
              ))}

              {/* Input file nascosti (uno per upload singolo, uno per multi) */}
              <input
                ref={singleFileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleSingleFilePicked(e.target.files?.[0])}
              />
              <input
                ref={multiFileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleMultiFilesPicked(e.target.files);
                  if (e.target) e.target.value = '';
                }}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button variant="outline" onClick={handleAddFotoNota} className="w-full">
                  <Camera className="h-4 w-4 mr-2" />
                  Aggiungi singola
                </Button>
                <Button
                  variant="outline"
                  onClick={() => multiFileInputRef.current?.click()}
                  className="w-full"
                >
                  <ImagePlus className="h-4 w-4 mr-2" />
                  Carica più foto
                </Button>
              </div>
            </div>
          ) : (
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Scrivi una nota generale..."
              className="min-h-[120px] w-full"
            />
          )
        ) : (
          // Visualizzazione Read-Only
          <div>
            {job.notePerFoto && job.notePerFoto.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 pb-2 border-b">
                  <Camera className="h-4 w-4" />
                  Note per foto ({job.notePerFoto.length})
                </div>
                {job.notePerFoto.map((item: NoteFotoItem, index: number) => (
                  <div
                    key={item.id}
                    className="border rounded-lg p-4 space-y-3 bg-gray-50 dark:bg-gray-900/50"
                  >
                    <div className="flex flex-col lg:flex-row gap-4">
                      {item.imageUrl && (
                        <div className="w-full lg:w-1/3">
                          <div
                            className="aspect-video w-full rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-800 group relative cursor-pointer"
                            onClick={() => setLightboxImage(item.imageUrl)}
                          >
                            <img
                              src={item.imageUrl}
                              alt={`Nota foto ${index + 1}`}
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none flex items-center justify-center">
                              <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        </div>
                      )}
                      <div className={`w-full ${item.imageUrl ? 'lg:w-2/3' : ''}`}>
                        {item.nota ? (
                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                            {item.nota}
                          </p>
                        ) : (
                          <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                            Nessuna descrizione
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                {job?.note ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 pb-2 border-b">
                      <FileText className="h-4 w-4" />
                      Nota generale
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                      {job.note}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                    Nessuna nota disponibile
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Lightbox */}
      <Dialog open={!!lightboxImage} onOpenChange={() => setLightboxImage(null)}>
        <DialogContent
          className="max-w-7xl w-[95vw] p-0 bg-black/95 border-none"
          aria-describedby="lightbox-description"
        >
          <div className="relative w-full h-[90vh] flex items-center justify-center p-4">
            {lightboxImage && (
              <>
                <span id="lightbox-description" className="sr-only">
                  Visualizzazione foto ingrandita
                </span>
                <img
                  src={lightboxImage}
                  alt="Foto ingrandita"
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 text-white hover:bg-white/20 h-11 w-11"
              onClick={() => setLightboxImage(null)}
              aria-label="Chiudi"
            >
              <X className="h-6 w-6" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Conferma cambio modalità */}
      <AlertDialog open={confirmSwitchTo !== null} onOpenChange={(o) => !o && setConfirmSwitchTo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiare modalità?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmSwitchTo
                ? 'Passando a "Note per foto" perderai la nota generale non salvata. Continuare?'
                : 'Passando a "Nota generale" perderai le note per foto non salvate. Continuare?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSwitchModalita}>Continua</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conferma annulla con modifiche non salvate */}
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annullare le modifiche?</AlertDialogTitle>
            <AlertDialogDescription>
              Ci sono modifiche non salvate. Se annulli verranno perse e le foto caricate ora
              saranno rimosse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Torna indietro</AlertDialogCancel>
            <AlertDialogAction onClick={doCancel}>Annulla modifiche</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conferma elimina singola nota */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa nota?</AlertDialogTitle>
            <AlertDialogDescription>
              La nota verrà rimossa. L'operazione è definitiva al salvataggio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeleteId && handleDeleteFotoNota(confirmDeleteId)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
