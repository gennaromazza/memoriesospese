import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Upload, User, Camera } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { auth, storage, db } from '@/lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore';
import imageCompression from 'browser-image-compression';

interface GuestUploadProps {
  galleryId: string;
  galleryName: string;
  onPhotosUploaded?: (count: number) => void;
}

export default function GuestUpload({ galleryId, galleryName, onPhotosUploaded }: GuestUploadProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const fileArray = Array.from(files);
      // Filtra solo i file immagine
      const imageFiles = fileArray.filter(file => file.type.startsWith('image/'));
      setSelectedFiles(imageFiles);
    }
  };

  const compressImage = async (file: File): Promise<File> => {
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
    };

    try {
      return await imageCompression(file, options);
    } catch (error) {
      console.error('Errore nella compressione:', error);
      return file; // Se la compressione fallisce, usa il file originale
    }
  };

  const handleUpload = async () => {
    if (!guestName.trim()) {
      toast({
        title: "Nome richiesto",
        description: "Inserisci il tuo nome per procedere",
        variant: "destructive",
      });
      return;
    }

    if (selectedFiles.length === 0) {
      toast({
        title: "Nessuna foto selezionata",
        description: "Seleziona almeno una foto da caricare",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Accesso anonimo a Firebase
      const userCredential = await signInAnonymously(auth);
      const user = userCredential.user;

      let uploadedCount = 0;

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        
        try {
          // Comprimi l'immagine
          const compressedFile = await compressImage(file);
          
          // Crea un nome file unico
          const fileName = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${file.name}`;
          const storageRef = ref(storage, `galleries/${galleryId}/${fileName}`);
          
          // Upload del file
          const snapshot = await uploadBytes(storageRef, compressedFile);
          const downloadURL = await getDownloadURL(snapshot.ref);
          
          // Salva i metadati nel database
          await addDoc(collection(db, 'photos'), {
            galleryId,
            name: file.name,
            url: downloadURL,
            size: compressedFile.size,
            contentType: file.type,
            createdAt: serverTimestamp(),
            uploadedBy: user.uid,
            uploaderName: guestName.trim(),
            uploaderRole: 'guest'
          });

          uploadedCount++;
          setUploadProgress(Math.round((uploadedCount / selectedFiles.length) * 100));
          
        } catch (error) {
          console.error(`Errore nell'upload di ${file.name}:`, error);
        }
      }

      if (uploadedCount > 0) {
        // Aggiorna il conteggio foto nella galleria
        const galleryRef = doc(db, 'galleries', galleryId);
        await updateDoc(galleryRef, {
          photoCount: increment(uploadedCount)
        });

        // Notifica il server per inviare email ai subscribers
        try {
          await fetch(`/api/galleries/${galleryId}/notify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              galleryName,
              newPhotosCount: uploadedCount,
              uploaderName: guestName.trim(),
              uploaderRole: 'guest'
            }),
          });
        } catch (error) {
          console.error('Errore nell\'invio notifiche:', error);
        }

        toast({
          title: "Upload completato!",
          description: `${uploadedCount} foto caricate con successo`,
        });

        onPhotosUploaded?.(uploadedCount);
        setIsDialogOpen(false);
        setSelectedFiles([]);
        setGuestName('');
        setUploadProgress(0);
      } else {
        toast({
          title: "Errore nell'upload",
          description: "Nessuna foto è stata caricata correttamente",
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error('Errore nell\'upload:', error);
      toast({
        title: "Errore nell'upload",
        description: "Si è verificato un errore durante il caricamento",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200"
        >
          <Camera className="h-4 w-4 mr-2" />
          Carica le tue foto
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-rose-600" />
            Carica foto come ospite
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Condividi le tue foto della galleria <strong>"{galleryName}"</strong>
          </p>
          
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Il tuo nome
              </label>
              <Input
                type="text"
                placeholder="Come ti chiami?"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="w-full"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Seleziona foto
              </label>
              <Input
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileSelect}
                className="w-full"
              />
              {selectedFiles.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {selectedFiles.length} foto selezionate
                </p>
              )}
            </div>
            
            {isUploading && (
              <div className="space-y-2">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-rose-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-center text-gray-600">
                  Upload in corso... {uploadProgress}%
                </p>
              </div>
            )}
            
            <div className="flex gap-2">
              <Button 
                onClick={handleUpload}
                disabled={isUploading || !guestName.trim() || selectedFiles.length === 0}
                className="flex-1"
              >
                {isUploading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Caricamento...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Carica foto
                  </>
                )}
              </Button>
              
              <Button 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
                disabled={isUploading}
              >
                Annulla
              </Button>
            </div>
          </div>

          <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
            <p><strong>Nota:</strong> Le foto verranno caricate con il tuo nome e saranno visibili a tutti gli ospiti della galleria. Le immagini verranno automaticamente ottimizzate per il web.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}