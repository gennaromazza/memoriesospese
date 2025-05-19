import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { collection, addDoc, doc, updateDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../lib/firebase";
import { format } from "date-fns";
import { formatDateString } from "@/lib/dateFormatter";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { v4 as uuidv4 } from 'uuid';
import ImageCompressionInfo from "./ImageCompressionInfo";
import imageCompression from "browser-image-compression";
import FileUpload from '@/components/ui/file-upload';

interface NewGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function NewGalleryModal({ isOpen, onClose, onSuccess }: NewGalleryModalProps) {
  const [name, setName] = useState("");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [code, setCode] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [password, setPassword] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Variabili per la compressione dell'immagine di copertina
  const [originalSize, setOriginalSize] = useState<number | undefined>(undefined);
  const [compressedSize, setCompressedSize] = useState<number | undefined>(undefined);
  const [compressionRatio, setCompressionRatio] = useState<number | undefined>(undefined);
  const [isCompressing, setIsCompressing] = useState(false);

  // Formato del codice della galleria: COGN-MM-YYYY
  useEffect(() => {
    if (name && date) {
      // Estrae il cognome dalla prima parola del nome galleria
      const firstWord = name.split(' ')[0];
      const formattedDate = format(date, "MM-yyyy");
      setCode(`${firstWord.toUpperCase()}-${formattedDate}`);
    }
  }, [name, date]);

  const handleCoverImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    setOriginalSize(file.size);

    try {
      // Opzioni per la compressione dell'immagine di copertina
      const options = {
        maxSizeMB: 2,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      };

      const compressedFile = await imageCompression(file, options);
      setCompressedSize(compressedFile.size);
      setCompressionRatio(file.size / compressedFile.size);

      setCoverImageFile(compressedFile);

      // Crea un URL per la preview
      const previewUrl = URL.createObjectURL(compressedFile);
      setCoverImageUrl(previewUrl);

    } catch (error) {
      console.error("Errore nella compressione dell'immagine:", error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante la compressione dell'immagine",
        variant: "destructive",
      });
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !code) {
      toast({
        title: "Errore",
        description: "Nome e Codice sono campi obbligatori",
        variant: "destructive",
      });
      return;
    }

    if (typeof onSuccess !== 'function') {
      console.warn('onSuccess callback is not defined');
    }

    setIsLoading(true);

    try {
      // Carica prima l'immagine di copertina, se presente
      let coverImageStorageUrl = "";
      if (coverImageFile) {
        const coverImageStorageRef = ref(storage, `cover-images/${uuidv4()}-${coverImageFile.name}`);
        await uploadBytes(coverImageStorageRef, coverImageFile);
        coverImageStorageUrl = await getDownloadURL(coverImageStorageRef);
      }

      // Crea la galleria nel database
      const galleryData = {
        name,
        code,
        date: date ? date.toISOString() : new Date().toISOString(),
        location: location || "",
        description: description || "",
        password: password || "",
        coverImageUrl: coverImageStorageUrl,
        youtubeUrl: youtubeUrl || "",
        photoCount: 0, // Sarà aggiornato dopo il caricamento delle foto
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      console.log("Creazione galleria con dati:", galleryData);
      const galleryRef = await addDoc(collection(db, "galleries"), galleryData);

      // Funzionalità capitoli rimossa
      console.log("Capitoli disabilitati");

      // Upload photos if any are selected
      if (selectedFiles.length > 0) {
        try {
          console.log(`Iniziato caricamento di ${selectedFiles.length} foto`);

          // Visualizza l'assegnazione dei capitoli alle foto per il debug
          console.log("Associazioni foto-capitoli prima del caricamento:");
          // Utilizziamo Map invece di un oggetto per evitare problemi TypeScript
          const chapterCountMap = new Map<string, number>();
          for (const photo of selectedFiles) {
            if (photo.chapterId) {
              const currentCount = chapterCountMap.get(photo.chapterId) || 0;
              chapterCountMap.set(photo.chapterId, currentCount + 1);
            }
          }
          console.log("Conteggio foto per capitolo:", Object.fromEntries(chapterCountMap));

          setUploadProgress(0);

          // Crea un batch Firestore per salvare le foto
          let currentBatch = writeBatch(db);
          let operationsInCurrentBatch = 0;
          const BATCH_LIMIT = 500; // Limite di operazioni per batch
          let totalProcessed = 0;
          let photosCollection = collection(db, "galleries", galleryRef.id, "photos");

          // Funzione per gestire il batch quando necessario
          const checkAndCommitBatchIfNeeded = async () => {
            if (operationsInCurrentBatch >= BATCH_LIMIT) {
              try {
                // Commit del batch corrente e creazione di uno nuovo
                console.log(`Commit del batch con ${operationsInCurrentBatch} operazioni`);
                await currentBatch.commit();
                currentBatch = writeBatch(db);
                operationsInCurrentBatch = 0;
              } catch (batchError) {
                console.error("Errore durante il commit del batch:", batchError);
                // Ricrea un nuovo batch in caso di errore
                currentBatch = writeBatch(db);
                operationsInCurrentBatch = 0;
              }
            }
          };

          const totalPhotos = selectedFiles.length;
          console.log(`Elaborazione di ${totalPhotos} foto totali`);

          // Carica le foto in batch di 20 per gestire meglio la memoria
          const CHUNK_SIZE = 20;
          for (let i = 0; i < selectedFiles.length; i += CHUNK_SIZE) {
            const chunk = selectedFiles.slice(i, i + CHUNK_SIZE);
            console.log(`Elaborazione chunk ${i / CHUNK_SIZE + 1} (${chunk.length} foto)`);

            // Carica ogni foto nel chunk
            for (const photo of chunk) {
              try {
                // Carica la foto nello storage
                // Genera un ID unico per la foto
                const photoUuid = uuidv4();
                const storageRef = ref(storage, `gallery-photos/${galleryRef.id}/${photoUuid}-${photo.name}`);
                await uploadBytes(storageRef, photo.file);
                const photoUrl = await getDownloadURL(storageRef);

                // Ottieni l'ID del capitolo mappato se esiste
                let chapterId = null;
                if (photo.chapterId && chapterIdMap.has(photo.chapterId)) {
                  chapterId = chapterIdMap.get(photo.chapterId);
                  console.log(`Assegnata foto ${photo.name} al capitolo ${chapterId} (originale: ${photo.chapterId})`);
                } else if (photo.chapterId) {
                  console.warn(`ID capitolo non trovato nella mappa: ${photo.chapterId} per la foto ${photo.name}`);
                }

                // Salva la foto nel database
                const photoData = {
                  name: photo.name,
                  url: photoUrl,
                  size: photo.file.size,
                  contentType: photo.file.type,
                  position: photo.position,
                  chapterId: chapterId,
                  chapterPosition: photo.position, // Aggiungiamo una posizione anche nel capitolo
                  folderPath: photo.folderPath || "",
                  createdAt: serverTimestamp(),
                  uuid: photoUuid // Salviamo l'UUID generato in precedenza
                };

                // Verifica e commit del batch se necessario
                await checkAndCommitBatchIfNeeded();

                // Usa il batch corrente per la collezione galleries/{galleryId}/photos
                const newPhotoRef = doc(photosCollection);
                currentBatch.set(newPhotoRef, photoData);
                operationsInCurrentBatch++;
                
                // Aggiungi anche alla collezione gallery-photos (necessario per la visualizzazione)
                const galleryPhotoRef = doc(collection(db, "gallery-photos"));
                const galleryPhotoData = {
                  ...photoData,
                  galleryId: galleryRef.id,  // Aggiungi l'ID della galleria per filtraggio
                };
                currentBatch.set(galleryPhotoRef, galleryPhotoData);
                operationsInCurrentBatch++;

                totalProcessed++;
                const progress = Math.round((totalProcessed / totalPhotos) * 100);
                setUploadProgress(progress);

              } catch (uploadError) {
                console.error(`Errore durante il caricamento della foto ${photo.name}:`, uploadError);
              }
            }

            // Piccola pausa tra un chunk e l'altro per gestire la memoria
            if (i + CHUNK_SIZE < selectedFiles.length) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }

          // Commit del batch finale se ci sono operazioni in sospeso
          if (operationsInCurrentBatch > 0) {
            await currentBatch.commit();
          }

          // Aggiorna il conteggio delle foto nella galleria
          await updateDoc(doc(db, "galleries", galleryRef.id), {
            photoCount: totalPhotos,
            updatedAt: serverTimestamp()
          });

          console.log(`Caricamento completato di ${totalPhotos} foto`);

        } catch (uploadError) {
          console.error("Errore durante il caricamento delle foto:", uploadError);
          toast({
            title: "Errore",
            description: "Si è verificato un errore durante il caricamento delle foto",
            variant: "destructive",
          });
        }
      }

      toast({
        title: "Successo",
        description: "Galleria creata con successo!",
      });

      if (typeof onSuccess === 'function') {
        onSuccess();
      }
      onClose();

    } catch (error) {
      console.error("Errore durante la creazione della galleria:", error);

      // Mostra dettagli dell'errore per il debug
      let errorMessage = "Si è verificato un errore durante la creazione della galleria";
      if (error instanceof Error) {
        errorMessage += `: ${error.message}`;
        console.error("Stack trace:", error.stack);
      } else {
        console.error("Dettagli errore:", JSON.stringify(error));
      }

      toast({
        title: "Errore",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
    }
  };

  const handleClose = () => {
    // Pulisci lo stato prima di chiudere
    setName("");
    setDate(new Date());
    setCode("");
    setLocation("");
    setDescription("");
    setPassword("");
    setYoutubeUrl("");
    setCoverImageFile(null);
    setCoverImageUrl("");
    setSelectedFiles([]);
    setChapters([]);
    setOriginalSize(undefined);
    setCompressedSize(undefined);
    setCompressionRatio(undefined);

    onClose();
  };

  const handleChaptersExtracted = (result: { 
    chapters: Chapter[]; 
    photosWithChapters: PhotoWithChapter[];
  }) => {
    console.log(`Capitoli estratti: ${result.chapters.length}, foto assegnate: ${result.photosWithChapters.length}`);

    // Aggiorna lo stato con i capitoli e le foto
    setChapters(result.chapters);
    setSelectedFiles(result.photosWithChapters);

    // Mostra conferma all'utente
    toast({
      title: "Cartelle rilevate",
      description: `Sono stati creati ${result.chapters.length} capitoli dalle cartelle`,
    });
  };

  const handleFilesSelected = (files: File[] | PhotoWithChapter[]) => {
    console.log("File selezionati:", files.length);

    // Converti File[] in PhotoWithChapter[] se necessario
    if (files.length > 0 && !(files[0] as PhotoWithChapter).id) {
      const filesWithChapters: PhotoWithChapter[] = (files as File[]).map((file, index) => ({
        id: `photo-${Date.now()}-${index}`,
        file: file,
        url: URL.createObjectURL(file),
        name: file.name,
        position: index,
      }));
      setSelectedFiles(filesWithChapters);
    } else {
      setSelectedFiles(files as PhotoWithChapter[]);
    }
  };

  const handleOpenChaptersModal = () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "Nessuna foto selezionata",
        description: "Seleziona delle foto prima di organizzarle in capitoli",
        variant: "destructive",
      });
      return;
    }
    setShowChaptersModal(true);
  };

  const handleSaveChapters = () => {
    console.log("Capitoli salvati:", chapters);
    console.log("Foto aggiornate con capitoli:", selectedFiles);
    setShowChaptersModal(false);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuova galleria</DialogTitle>
            <DialogDescription>
              Crea una nuova galleria fotografica
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Nome galleria*</Label>
                  <Input 
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Es. Rossi Matrimonio"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="date">Data evento</Label>
                  <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(date, "PPP") : <span>Seleziona data</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={(date) => {
                          setDate(date);
                          setIsDatePickerOpen(false);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <Label htmlFor="code">Codice galleria*</Label>
                  <Input 
                    id="code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Es. ROSSI-05-2023"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Generato automaticamente, puoi modificarlo se necessario
                  </p>
                </div>

                <div>
                  <Label htmlFor="location">Luogo</Label>
                  <Input 
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Es. Firenze, Italia"
                  />
                </div>

                <div>
                  <Label htmlFor="password">Password galleria</Label>
                  <Input 
                    id="password"
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password per accedere alla galleria"
                  />
                </div>

                <div>
                  <Label htmlFor="youtubeUrl">URL Video YouTube</Label>
                  <Input 
                    id="youtubeUrl"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="Es. https://www.youtube.com/watch?v=..."
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="description">Descrizione</Label>
                  <Textarea 
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Inserisci una descrizione della galleria"
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="coverImage">Immagine di copertina</Label>
                  <div className="mt-1 flex flex-col space-y-2">
                    <Input
                      id="coverImage"
                      type="file"
                      accept="image/*"
                      ref={fileInputRef}
                      onChange={handleCoverImageSelect}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Seleziona immagine
                    </Button>

                    {isCompressing && (
                      <div className="flex items-center mt-2">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-sm text-muted-foreground">
                          Compressione in corso...
                        </span>
                      </div>
                    )}

                    {coverImageFile && (
                      <ImageCompressionInfo
                        originalSize={originalSize}
                        compressedSize={compressedSize}
                        compressionRatio={compressionRatio}
                        fileName={coverImageFile.name}
                        isCompressing={isCompressing}
                      />
                    )}

                    {coverImageUrl && (
                      <div className="relative mt-2 h-48 rounded-md overflow-hidden">
                        <img
                          src={coverImageUrl}
                          alt="Anteprima copertina"
                          className="object-cover w-full h-full"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <Label>Carica foto</Label>
              <FileUpload 
                onFilesSelected={handleFilesSelected} 
                multiple={true}
                enableFolderUpload={true}
                onChaptersExtracted={handleChaptersExtracted}
              />

              {selectedFiles.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm">
                    {selectedFiles.length} foto selezionate
                  </p>
                  <Button type="button" variant="outline" onClick={handleOpenChaptersModal}>
                    Organizza in capitoli
                  </Button>
                </div>
              )}
            </div>

            {isLoading && uploadProgress > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Caricamento in corso: {uploadProgress}%</p>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-primary h-2.5 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-4">
              <Button type="button" variant="outline" onClick={handleClose}>
                Annulla
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creazione in corso...
                  </>
                ) : (
                  "Crea galleria"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Componente capitoli rimosso */}
    </>
  );
}