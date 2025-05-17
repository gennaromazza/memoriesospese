import { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { uploadBytesResumable, ref, getDownloadURL } from 'firebase/storage';
import { doc, collection, addDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { useToast } from "@/hooks/use-toast";
import { UploadCloud, X } from 'lucide-react';
import { Card } from "@/components/ui/card";
import { compressImages } from '@/lib/imageCompression';
import ImageCompressionInfo from '@/components/ImageCompressionInfo';
import { PhotoWithChapter } from '@/components/ChaptersManager';

interface UploadProgressInfo {
  progress: number;
  originalSize?: number;
  compressedSize?: number;
  isCompressing: boolean;
  isUploading: boolean;
  isComplete: boolean;
  error?: string;
}

interface PhotoUploadToChapterProps {
  isOpen: boolean;
  onClose: () => void;
  galleryId: string;
  chapterId: string;
  chapterTitle: string;
  onPhotosUploaded: (photos: PhotoWithChapter[]) => void;
}

export default function PhotoUploadToChapter({
  isOpen,
  onClose,
  galleryId,
  chapterId,
  chapterTitle,
  onPhotosUploaded
}: PhotoUploadToChapterProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: UploadProgressInfo}>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const files = Array.from(e.target.files);
    setSelectedFiles(files);
    
    // Inizializza il progresso per ogni file
    const progressObj: {[key: string]: UploadProgressInfo} = {};
    files.forEach(file => {
      progressObj[file.name] = {
        progress: 0,
        isCompressing: false,
        isUploading: false,
        isComplete: false,
        originalSize: file.size
      };
    });
    
    setUploadProgress(progressObj);
  };
  
  const removeFile = (fileName: string) => {
    setSelectedFiles(prev => prev.filter(file => file.name !== fileName));
    setUploadProgress(prev => {
      const newProgress = { ...prev };
      delete newProgress[fileName];
      return newProgress;
    });
  };
  
  const uploadPhotos = async () => {
    if (selectedFiles.length === 0) return;
    if (!galleryId) {
      toast({
        title: "Errore",
        description: "ID Galleria mancante. Impossibile caricare le foto.",
        variant: "destructive"
      });
      return;
    }
    
    setIsUploading(true);
    let uploadedPhotos: PhotoWithChapter[] = [];
    
    try {
      // 1. Comprimi le immagini prima dell'upload
      const updatedProgress = { ...uploadProgress };
      selectedFiles.forEach(file => {
        updatedProgress[file.name] = {
          ...updatedProgress[file.name],
          isCompressing: true
        };
      });
      setUploadProgress(updatedProgress);
      
      // Comprimi le immagini
      const compressedFiles = await compressImages(selectedFiles);
      
      // Aggiorna lo stato di progresso dopo la compressione
      selectedFiles.forEach((file, index) => {
        setUploadProgress(prev => ({
          ...prev,
          [file.name]: {
            ...prev[file.name],
            isCompressing: false,
            isUploading: true,
            compressedSize: compressedFiles[index].size
          }
        }));
      });
      
      // 2. Carica le immagini compresse a Firebase Storage e crea i documenti in Firestore
      const batch = writeBatch(db);
      
      // Prepara le promesse di caricamento
      const uploadPromises = compressedFiles.map(async (file, index) => {
        try {
          // Crea un riferimento per il file in Storage
          const storagePath = `gallery-photos/${galleryId}/${file.name}`;
          const storageRef = ref(storage, storagePath);
          
          // Carica il file con monitoraggio del progresso
          const uploadTask = uploadBytesResumable(storageRef, file);
          
          return new Promise<PhotoWithChapter>((resolve, reject) => {
            uploadTask.on(
              'state_changed',
              (snapshot) => {
                // Aggiorna il progresso dell'upload
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(prev => ({
                  ...prev,
                  [file.name]: {
                    ...prev[file.name],
                    progress: progress
                  }
                }));
              },
              (error) => {
                // Gestione errori durante l'upload
                console.error(`Errore nell'upload di ${file.name}:`, error);
                setUploadProgress(prev => ({
                  ...prev,
                  [file.name]: {
                    ...prev[file.name],
                    isUploading: false,
                    error: error.message
                  }
                }));
                reject(error);
              },
              async () => {
                try {
                  // Upload completato, ottieni l'URL
                  const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                  
                  // Prepara i dati della foto
                  // Verifica che l'ID galleria sia valido
                  if (!galleryId) {
                    throw new Error("ID galleria non valido");
                  }
                  
                  // Crea il documento nella collezione gallery-photos
                  const photoData = {
                    name: file.name,
                    url: downloadURL,
                    contentType: file.type,
                    size: file.size,
                    createdAt: serverTimestamp(),
                    galleryId: galleryId,
                    chapterId: chapterId,
                    position: index,
                    chapterPosition: index
                  };
                  
                  const photoRef = await addDoc(collection(db, "gallery-photos"), photoData);
                  
                  // Crea il documento nella sottocollezione della galleria
                  const galleryPhotoRef = doc(collection(db, "galleries", galleryId, "photos"));
                  batch.set(galleryPhotoRef, {
                    ...photoData,
                    id: photoRef.id
                  });
                  
                  // Aggiorna lo stato del progresso
                  setUploadProgress(prev => ({
                    ...prev,
                    [file.name]: {
                      ...prev[file.name],
                      isUploading: false,
                      isComplete: true
                    }
                  }));
                  
                  // Crea l'oggetto PhotoWithChapter per l'interfaccia
                  const photoWithChapter: PhotoWithChapter = {
                    id: photoRef.id,
                    file: file,
                    url: downloadURL,
                    name: file.name,
                    chapterId: chapterId,
                    position: index,
                    contentType: file.type,
                    size: file.size,
                    galleryId: galleryId
                  };
                  
                  resolve(photoWithChapter);
                } catch (error) {
                  console.error(`Errore durante la creazione del documento per ${file.name}:`, error);
                  reject(error);
                }
              }
            );
          });
        } catch (error) {
          console.error(`Errore durante il caricamento di ${file.name}:`, error);
          throw error;
        }
      });
      
      // Attendi il completamento di tutti gli upload
      uploadedPhotos = await Promise.all(uploadPromises);
      
      // Esegui il commit del batch
      await batch.commit();
      
      // Mostra toast di successo
      toast({
        title: "Caricamento completato",
        description: `${uploadedPhotos.length} foto caricate con successo nel capitolo "${chapterTitle}".`
      });
      
      // Notifica il componente padre
      onPhotosUploaded(uploadedPhotos);
      
      // Pulisci lo stato
      setTimeout(() => {
        setSelectedFiles([]);
        setUploadProgress({});
        onClose();
      }, 1500);
      
    } catch (error) {
      console.error("Errore durante il caricamento delle foto:", error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante il caricamento delle foto.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  // Calcola progresso totale
  const totalProgress = Object.values(uploadProgress).reduce((acc, curr) => {
    return acc + curr.progress;
  }, 0) / (Object.keys(uploadProgress).length || 1);
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md md:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-center font-playfair">
            Carica foto nel capitolo "{chapterTitle}"
          </DialogTitle>
        </DialogHeader>
        
        <div className="mt-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            multiple
            className="hidden"
          />
          
          <Button 
            variant="outline" 
            className="w-full h-24 border-dashed border-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <UploadCloud className="mr-2 h-5 w-5" />
            Seleziona foto da caricare
          </Button>
          
          {selectedFiles.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-2">
                {selectedFiles.length} file selezionati
              </p>
              
              <div className="max-h-60 overflow-y-auto">
                {selectedFiles.map((file) => (
                  <Card key={file.name} className="flex items-center p-2 mb-2">
                    <div className="flex-1 mr-2 overflow-hidden">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      
                      <ImageCompressionInfo
                        fileName={file.name}
                        originalSize={uploadProgress[file.name]?.originalSize}
                        compressedSize={uploadProgress[file.name]?.compressedSize}
                        isCompressing={uploadProgress[file.name]?.isCompressing || false}
                        compressionRatio={
                          uploadProgress[file.name]?.originalSize && uploadProgress[file.name]?.compressedSize
                            ? (1 - uploadProgress[file.name]?.compressedSize! / uploadProgress[file.name]?.originalSize!) * 100
                            : undefined
                        }
                      />
                      
                      <Progress
                        value={uploadProgress[file.name]?.progress || 0}
                        className="h-1 mt-1"
                      />
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removeFile(file.name)}
                      disabled={isUploading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {selectedFiles.length > 0 && (
          <div className="mt-4">
            <Progress value={totalProgress} className="h-2" />
            <p className="text-xs text-center mt-1 text-gray-500">
              {isUploading ? `Caricamento: ${Math.round(totalProgress)}%` : 'Pronto per il caricamento'}
            </p>
          </div>
        )}
        
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={isUploading}>
            Annulla
          </Button>
          <Button 
            onClick={uploadPhotos} 
            disabled={selectedFiles.length === 0 || isUploading}
          >
            {isUploading ? 'Caricamento in corso...' : 'Carica foto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}