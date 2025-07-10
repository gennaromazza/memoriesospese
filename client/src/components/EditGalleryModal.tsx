import { useState, useEffect, useRef, ChangeEvent } from "react";
import { doc, updateDoc, collection, getDocs, addDoc, serverTimestamp, where, query, deleteDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../lib/firebase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { useToast } from "../hooks/use-toast";
import { uploadPhotos, UploadSummary, UploadProgressInfo } from "../lib/photoUploader";
import { UploadCloud, Image, Trash } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../../components/ui/alert-dialog";
import { Progress } from "../../components/ui/progress";

interface GalleryType {
  id: string;
  name: string;
  code: string;
  date: string;
  location?: string;
  description?: string;
  password?: string;
  coverImageUrl?: string;
  youtubeUrl?: string;
  photoCount?: number;
}

interface EditGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  gallery: GalleryType | null;
}

export default function EditGalleryModal({ isOpen, onClose, gallery }: EditGalleryModalProps) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [password, setPassword] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("details");
  const [photos, setPhotos] = useState<any[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: UploadProgressInfo}>({});
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<any | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Carica i dati della galleria quando cambia
  useEffect(() => {
    if (gallery) {
      setName(gallery.name || "");
      setDate(gallery.date || "");
      setLocation(gallery.location || "");
      setDescription(gallery.description || "");
      setPassword(gallery.password || "");
      setYoutubeUrl(gallery.youtubeUrl || "");
      setCoverImageUrl(gallery.coverImageUrl || "");
      
      // Se c'è un'immagine di copertina esistente, impostiamo l'anteprima
      if (gallery.coverImageUrl) {
        setCoverPreview(gallery.coverImageUrl);
      } else {
        setCoverPreview(null);
      }
      
      // Carica le foto
      loadPhotos();
    }
  }, [gallery]);
  
  // Gestisce il caricamento dell'immagine di copertina
  const handleCoverImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return;
    }
    
    const file = e.target.files[0];
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Tipo di file non supportato",
        description: "L'immagine di copertina deve essere un'immagine (JPEG, PNG, ecc.)",
        variant: "destructive"
      });
      return;
    }
    
    setCoverImage(file);
    
    // Crea un'anteprima dell'immagine
    const objectUrl = URL.createObjectURL(file);
    setCoverPreview(objectUrl);
    
    // Cleanup URL quando il componente viene smontato
    return () => URL.revokeObjectURL(objectUrl);
  };
  
  // Carica le foto dalla galleria
  const loadPhotos = async () => {
    if (!gallery) return;
    
    setIsLoading(true);
    try {
      // Carica le foto dalla collezione specifica della galleria
      const photosCollection = collection(db, "galleries", gallery.id, "photos");
      const photosSnapshot = await getDocs(photosCollection);
      
      const loadedPhotos = photosSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || "",
          url: data.url || "",
          contentType: data.contentType || "image/jpeg",
          size: data.size || 0,
          createdAt: data.createdAt,
        };
      });
      
      // Ordina le foto per data di creazione (più recenti prima)
      loadedPhotos.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      
      setPhotos(loadedPhotos);
      
    } catch (error) {
      console.error('Errore nel caricamento foto:', error);
      toast({
        title: "Errore",
        description: "Impossibile caricare le foto della galleria",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Funzione per eliminare una foto sia da Firestore che da Storage
  const deletePhoto = async (photoToDelete: any) => {
    if (!gallery) return;
    
    try {
      setIsDeletingPhoto(true);
      
      // 1. Elimina il documento dalla collezione specifica della galleria
      const photoRef = doc(db, "galleries", gallery.id, "photos", photoToDelete.id);
      await deleteDoc(photoRef);
      
      // 2. Elimina il file da Firebase Storage
      const storagePaths = [
        `gallery-photos/${gallery.id}/${photoToDelete.name}`,
        `galleries/${gallery.id}/photos/${photoToDelete.name}`,
        `galleries/${gallery.id}/${photoToDelete.name}`,
        `galleries/${photoToDelete.name}`,
        `gallery-photos/${photoToDelete.name}`
      ];
      
      let photoDeleted = false;
      
      // Prova a eliminare la foto da tutti i percorsi possibili
      for (const path of storagePaths) {
        try {
          const storageRef = ref(storage, path);
          await deleteObject(storageRef);
          console.log(`Foto eliminata da: ${path}`);
          photoDeleted = true;
          break;
        } catch (storageError) {
          console.log(`Foto non trovata in: ${path}`);
        }
      }
      
      if (!photoDeleted) {
        console.log('Foto non trovata in nessun percorso di storage');
      }
      
      // 3. Aggiorna l'array locale delle foto
      setPhotos(photos.filter(photo => photo.id !== photoToDelete.id));
      
      toast({
        title: "Foto eliminata",
        description: "La foto è stata eliminata con successo dalla galleria."
      });
      
    } catch (error) {
      console.error('Errore durante l\'eliminazione:', error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'eliminazione della foto.",
        variant: "destructive"
      });
    } finally {
      setIsDeletingPhoto(false);
      setIsDeleteDialogOpen(false);
    }
  };

  // Salva le modifiche alla galleria
  const saveGallery = async () => {
    if (!gallery) return;
    
    setIsLoading(true);
    try {
      // Se c'è una nuova immagine di copertina, la carichiamo prima
      let newCoverImageUrl = coverImageUrl;
      if (coverImage) {
        try {
          const storageRef = ref(storage, `galleries/covers/${gallery.code}_cover`);
          await uploadBytesResumable(storageRef, coverImage);
          newCoverImageUrl = await getDownloadURL(storageRef);
        } catch (error) {
          console.error('Errore caricamento cover:', error);
        }
      }
      
      const galleryRef = doc(db, "galleries", gallery.id);
      await updateDoc(galleryRef, {
        name,
        date,
        location,
        description,
        password,
        coverImageUrl: newCoverImageUrl,
        youtubeUrl,
        hasChapters: false,
        updatedAt: new Date()
      });
      
      toast({
        title: "Galleria aggiornata",
        description: "Le modifiche alla galleria sono state salvate con successo"
      });
      
      onClose();
    } catch (error) {
      console.error('Errore salvataggio galleria:', error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante il salvataggio delle modifiche",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Carica nuove foto alla galleria
  const handleUploadPhotos = async () => {
    if (!gallery || selectedFiles.length === 0) return;
    
    setIsUploading(true);
    try {
      // Prepara i file per l'upload
      const filesToUpload = selectedFiles;
      
      // Carica le foto su Firebase Storage
      const uploadedPhotos = await uploadPhotos(
        gallery.id,
        filesToUpload,
        6, // concorrenza
        (progress) => setUploadProgress(progress),
        (summary) => setUploadSummary(summary)
      );
      
      console.log(`${uploadedPhotos.length} foto caricate su Storage`);
      
      // Salva i metadati delle foto in Firestore nella collezione corretta
      const photoPromises = uploadedPhotos.map(async (photo, index) => {
        try {
          // Salva nella collezione specifica della galleria dove vengono lette le foto
          await addDoc(collection(db, "galleries", gallery.id, "photos"), {
            name: photo.name,
            url: photo.url,
            size: photo.size,
            contentType: photo.contentType,
            createdAt: photo.createdAt || serverTimestamp(),
            galleryId: gallery.id,
            uploadedBy: 'admin' // Importante: marca come foto amministratore
          });
        } catch (err) {
          console.error('Errore nel salvare foto:', err);
        }
      });
      
      await Promise.all(photoPromises);
      
      // Aggiorna il numero di foto nella galleria
      const galleryRef = doc(db, "galleries", gallery.id);
      await updateDoc(galleryRef, {
        photoCount: photos.length + uploadedPhotos.length,
        updatedAt: serverTimestamp()
      });
      
      toast({
        title: "Upload completato!",
        description: `${uploadedPhotos.length} foto caricate con successo nella galleria.`
      });
      
      // Reset form
      setSelectedFiles([]);
      setUploadProgress({});
      setUploadSummary(null);
      if (filesInputRef.current) {
        filesInputRef.current.value = '';
      }
      
      // Ricarica le foto
      loadPhotos();
      
    } catch (error) {
      console.error('Errore upload foto:', error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante il caricamento delle foto",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Gestisce la selezione dei file per l'upload
  const handleFileSelection = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
  };

  if (!gallery) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" aria-describedby="edit-gallery-dialog-description">
        <DialogHeader>
          <DialogTitle>Modifica Galleria: {gallery.name}</DialogTitle>
          <DialogDescription id="edit-gallery-dialog-description">
            Modifica i dettagli della galleria e gestisci le foto
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2 shrink-0">
            <TabsTrigger value="details">Dettagli</TabsTrigger>
            <TabsTrigger value="photos">Foto ({photos.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 overflow-y-auto flex-1 pr-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Nome Galleria</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome della galleria"
                />
              </div>
              <div>
                <Label htmlFor="date">Data</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="location">Luogo</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Luogo dell'evento"
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password di accesso"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Descrizione</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrizione della galleria"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="youtubeUrl">URL YouTube (opzionale)</Label>
              <Input
                id="youtubeUrl"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>

            <div>
              <Label htmlFor="coverImage">Immagine di Copertina</Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="coverImage"
                  type="file"
                  accept="image/*"
                  onChange={handleCoverImageChange}
                  ref={coverInputRef}
                />
                {coverPreview && (
                  <img 
                    src={coverPreview} 
                    alt="Anteprima copertina" 
                    className="h-16 w-16 object-cover rounded"
                  />
                )}
              </div>
            </div>

            <DialogFooter>
              <Button onClick={saveGallery} disabled={isLoading}>
                {isLoading ? "Salvando..." : "Salva Modifiche"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="photos" className="space-y-4 overflow-y-auto flex-1 pr-2">
            <div>
              <Label htmlFor="photo-upload">Carica Nuove Foto</Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelection}
                  ref={filesInputRef}
                  disabled={isUploading}
                />
                <Button 
                  onClick={handleUploadPhotos} 
                  disabled={selectedFiles.length === 0 || isUploading}
                >
                  <UploadCloud className="h-4 w-4 mr-2" />
                  {isUploading ? "Caricamento..." : "Carica"}
                </Button>
              </div>
              {selectedFiles.length > 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  {selectedFiles.length} file selezionati
                </p>
              )}
            </div>

            {uploadSummary && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progresso: {uploadSummary.completed}/{uploadSummary.total}</span>
                  <span>{Math.round(uploadSummary.overallProgress)}%</span>
                </div>
                <Progress value={uploadSummary.overallProgress} className="w-full" />
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-96 overflow-y-auto">
              {photos.map((photo) => (
                <div key={photo.id} className="relative group">
                  <img
                    src={photo.url}
                    alt={photo.name}
                    className="w-full h-24 object-cover rounded border"
                  />
                  <AlertDialog open={isDeleteDialogOpen && photoToDelete?.id === photo.id}>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => {
                          setPhotoToDelete(photo);
                          setIsDeleteDialogOpen(true);
                        }}
                      >
                        <Trash className="h-3 w-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent aria-describedby="delete-photo-dialog-description">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Elimina Foto</AlertDialogTitle>
                        <AlertDialogDescription id="delete-photo-dialog-description">
                          Sei sicuro di voler eliminare questa foto? Questa azione non può essere annullata.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setIsDeleteDialogOpen(false)}>
                          Annulla
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deletePhoto(photo)}
                          disabled={isDeletingPhoto}
                        >
                          {isDeletingPhoto ? "Eliminando..." : "Elimina"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}