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
      
      // Usa la funzione compressImages esistente senza opzioni personalizzate
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
      
      // 2. Carica le immagini compresse a Firebase Storage
      // e crea i documenti in Firestore usando writeBatch per l'efficienza
      const batch = writeBatch(db);
      const uploadTasks = compressedFiles.map(async (file, index) => {
        // Crea un riferimento unico per il file in Firebase Storage
        const storageRef = ref(storage, `gallery-photos/${galleryId}/${file.name}`);
        
        // Carica il file con il monitoraggio del progresso
        const uploadTask = uploadBytesResumable(storageRef, file);
        
        return new Promise<PhotoWithChapter>((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snapshot) => {
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
              console.error(`Errore durante l'upload di ${file.name}:`, error);
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
                // L'upload è completato, ottieni l'URL di download
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                
                // Crea un documento in Firestore per la foto
                const photoData = {
                  name: file.name,
                  url: downloadURL,
                  contentType: file.type,
                  size: file.size,
                  createdAt: serverTimestamp(),
                  galleryId: galleryId,
                  chapterId: chapterId, // Assegna direttamente al capitolo selezionato
                  position: index, // La posizione è l'indice nell'array delle foto caricate
                  chapterPosition: index // Per compatibilità
                };
                
                // Crea un documento nella collezione gallery-photos
                const photoRef = await addDoc(collection(db, "gallery-photos"), photoData);
                
                // Crea un documento nella sottocollezione galleries/{galleryId}/photos se galleryId è definito
                if (galleryId) {
                  const galleryPhotoRef = doc(collection(db, "galleries", galleryId, "photos"));
                  batch.set(galleryPhotoRef, {
                    ...photoData,
                    id: photoRef.id // Mantieni lo stesso ID per riferimento incrociato
                  });
                }
                
                // Aggiorna lo stato del progresso
                setUploadProgress(prev => ({
                  ...prev,
                  [file.name]: {
                    ...prev[file.name],
                    isUploading: false,
                    isComplete: true
                  }
                }));
                
                // Crea un oggetto PhotoWithChapter per aggiornare l'interfaccia
                const photoWithChapter: PhotoWithChapter = {
                  id: photoRef.id, // Usiamo l'ID del documento in gallery-photos
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
      });
      
      // Attendi il completamento di tutti gli upload
      uploadedPhotos = await Promise.all(uploadTasks);
      
      // Esegui il commit del batch per salvare tutti i documenti in una sola operazione
      await batch.commit();
      
      toast({
        title: "Caricamento completato",
        description: `${uploadedPhotos.length} foto caricate con successo nel capitolo "${chapterTitle}".`
      });
      
      // Notifica il componente padre delle nuove foto caricate
      onPhotosUploaded(uploadedPhotos);
      
      // Pulisci lo stato dopo un breve ritardo per consentire all'utente di vedere il completamento
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