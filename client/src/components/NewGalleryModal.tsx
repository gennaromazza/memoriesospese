import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { collection, addDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../lib/firebase";
import { format } from "date-fns";
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

  useEffect(() => {
    if (isOpen) {
      // Reset form when opening
      setName("");
      setDate(new Date());
      setCode("");
      setLocation("");
      setDescription("");
      setPassword("");
      setYoutubeUrl("");
      setCoverImageFile(null);
      setCoverImageUrl("");
      setUploadProgress(0);
      setSelectedFiles([]);
      setOriginalSize(undefined);
      setCompressedSize(undefined);
      setCompressionRatio(undefined);
    }
  }, [isOpen]);

  const generateRandomCode = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const length = 8;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    setCode(result);
  };

  useEffect(() => {
    generateRandomCode();
  }, []);

  const handleCoverImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      
      // Salva la dimensione originale
      setOriginalSize(file.size);
      setIsCompressing(true);
      
      try {
        // Compressione dell'immagine
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1200,
          useWebWorker: true
        };
        
        const compressedFile = await imageCompression(file, options);
        setCompressedSize(compressedFile.size);
        
        // Calcola il rapporto di compressione (originale / compresso)
        const ratio = file.size / compressedFile.size;
        setCompressionRatio(ratio);
        
        setCoverImageFile(compressedFile);
        
        // Crea un oggetto URL per la preview
        const reader = new FileReader();
        reader.onload = (e) => {
          setCoverImageUrl(e.target?.result as string);
        };
        reader.readAsDataURL(compressedFile);
      } catch (error) {
        
        toast({
          title: "Errore di compressione",
          description: "Si è verificato un errore durante la compressione dell'immagine. Riprova.",
          variant: "destructive"
        });
      } finally {
        setIsCompressing(false);
      }
    }
  };

  const handlePhotoSelection = (files: File[]) => {
    setSelectedFiles(files);
  };

  const handleCreateGallery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code || !date) {
      toast({
        title: "Dati mancanti",
        description: "Nome, codice e data sono campi obbligatori.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    setUploadProgress(0);

    try {
      let coverImageStorageUrl = "";

      // Upload cover image if selected
      if (coverImageFile) {
        const fileExtension = coverImageFile.name.split('.').pop();
        const coverImageRef = ref(storage, `gallery-covers/${code}_${Date.now()}.${fileExtension}`);
        
        await uploadBytes(coverImageRef, coverImageFile);
        coverImageStorageUrl = await getDownloadURL(coverImageRef);
      }

      // Create gallery document in Firestore
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
        active: true, // Nuove gallerie sono attive per default
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      
      const galleryRef = await addDoc(collection(db, "galleries"), galleryData);

      // Funzionalità capitoli rimossa
      

      // Upload photos if any are selected
      if (selectedFiles.length > 0) {
        try {
          

          let completedUploads = 0;
          
          // Carica ogni foto
          for (const file of selectedFiles) {
            // Verifica che file.name esista prima di fare lo split
            const fileExtension = file.name && file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
            const uniqueFileName = `${Date.now()}_${uuidv4()}.${fileExtension}`;
            const fileRef = ref(storage, `gallery-photos/${galleryRef.id}/${uniqueFileName}`);
            
            try {
              // Comprimi l'immagine prima del caricamento
              const options = {
                maxSizeMB: 1,
                maxWidthOrHeight: 1800,
                useWebWorker: true,
              };
              
              const compressedFile = await imageCompression(file, options);
              
              // Carica il file compresso
              await uploadBytes(fileRef, compressedFile);
              const downloadURL = await getDownloadURL(fileRef);
                
              // Aggiungi i metadati della foto a Firestore
              const photoData = {
                name: file.name,
                url: downloadURL,
                size: compressedFile.size,
                contentType: file.type,
                sortOrder: completedUploads, // Usa l'ordine di caricamento
                createdAt: serverTimestamp(),
                galleryId: galleryRef.id,
                path: `gallery-photos/${galleryRef.id}/${uniqueFileName}`
              };
              
              await addDoc(collection(db, "photos"), photoData);
              
              completedUploads++;
              const progress = Math.round((completedUploads / selectedFiles.length) * 100);
              setUploadProgress(progress);
              
            } catch (error) {
              
              // Continua con gli altri file anche se uno fallisce
            }
          }
          
          // Aggiorna il conteggio delle foto nella galleria
          await updateDoc(doc(db, "galleries", galleryRef.id), {
            photoCount: completedUploads,
            updatedAt: serverTimestamp()
          });
          
          
          
          toast({
            title: "Galleria creata con successo",
            description: `Sono state caricate ${completedUploads} foto.`,
            variant: "default"
          });
          
          onSuccess();
        } catch (error) {
          
          toast({
            title: "Errore di caricamento",
            description: "Si è verificato un errore durante il caricamento delle foto.",
            variant: "destructive"
          });
        }
      } else {
        toast({
          title: "Galleria creata",
          description: "La galleria è stata creata con successo. Nessuna foto è stata caricata.",
          variant: "default"
        });
        onSuccess();
      }
    } catch (error) {
      
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante la creazione della galleria.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
      
      // Reset form
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
      setOriginalSize(undefined);
      setCompressedSize(undefined);
      setCompressionRatio(undefined);
      
      onClose();
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crea nuova galleria</DialogTitle>
            <DialogDescription>
              Inserisci i dettagli della nuova galleria fotografica.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateGallery} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome della galleria</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Matrimonio di Marco e Sara"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">Codice galleria</Label>
                <div className="flex space-x-2">
                  <Input
                    id="code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="codice-univoco"
                    required
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={generateRandomCode}
                  >
                    Genera
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Data evento</Label>
                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, "PPP") : <span>Seleziona una data</span>}
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

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password per accedere alla galleria"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Luogo</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="es. Villa Rossi, Milano"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrizione</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Breve descrizione dell'evento"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="youtubeUrl">URL Video YouTube</Label>
              <Input
                id="youtubeUrl"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="coverImage">Immagine di copertina</Label>
              <div className="flex items-center space-x-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-40"
                  disabled={isCompressing}
                >
                  {isCompressing ? "Compressione..." : "Seleziona immagine"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  id="coverImage"
                  className="hidden"
                  accept="image/*"
                  onChange={handleCoverImageChange}
                />
                {coverImageUrl && (
                  <div className="relative h-20 w-20 rounded overflow-hidden">
                    <img
                      src={coverImageUrl}
                      alt="Cover preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
              </div>
              {(originalSize !== undefined || compressedSize !== undefined) && (
                <ImageCompressionInfo
                  originalSize={originalSize}
                  compressedSize={compressedSize}
                  fileName={coverImageFile?.name || ""}
                  isCompressing={isCompressing}
                  compressionRatio={compressionRatio}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Carica foto</Label>
              <FileUpload
                onFilesSelected={handlePhotoSelection}
                accept="image/*"
                multiple={true}
                maxFiles={500}
              />
              {selectedFiles.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {selectedFiles.length} file selezionati
                </p>
              )}
            </div>

            <div className="flex justify-end items-center">
              <div className="flex items-center space-x-2">
                {isLoading && uploadProgress > 0 && (
                  <div className="text-sm">
                    Caricamento: {uploadProgress}%
                  </div>
                )}
                <Button 
                  type="submit" 
                  disabled={isLoading || isCompressing}
                  className="min-w-24"
                >
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
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}