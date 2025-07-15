import { useState, useEffect, useRef, ChangeEvent } from "react";
import { doc, updateDoc, collection, getDocs, addDoc, serverTimestamp, where, query, deleteDoc, Timestamp } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../lib/firebase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { useToast } from "../hooks/use-toast";
import { uploadPhotos, UploadSummary, UploadProgressInfo } from "../lib/photoUploader";
import { notifyNewPhotos } from "../lib/email";
import { UploadCloud, Image, Trash } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
import { Progress } from "./ui/progress";

interface PhotoData {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: Timestamp;
  galleryId: string;
  uploaderEmail?: string;
  uploaderName?: string;
  uploaderRole?: string;
  uploadedBy?: 'admin' | 'guest' | 'legacy';
}

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
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: UploadProgressInfo}>({});
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<PhotoData | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
  const [photoFilter, setPhotoFilter] = useState<'all' | 'admin' | 'guest' | 'legacy'>('all');
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
      // 1. Carica foto dal nuovo sistema (collezione photos con uploadedBy)
      const photosQuery = query(
        collection(db, "photos"),
        where("galleryId", "==", gallery.id)
      );
      
      const photosSnapshot = await getDocs(photosQuery);
      
      const loadedPhotos: PhotoData[] = [];
      
      // Aggiungi foto dal nuovo sistema
      photosSnapshot.docs.forEach(doc => {
        const data = doc.data();
        // Foto caricata dal nuovo sistema
        loadedPhotos.push({
          id: doc.id,
          name: data.name || "",
          url: data.url || "",
          contentType: data.contentType || "image/jpeg",
          size: data.size || 0,
          createdAt: data.createdAt || new Date(),
          galleryId: data.galleryId || gallery.id,
          uploaderEmail: data.uploaderEmail,
          uploaderName: data.uploaderName,
          uploaderRole: data.uploaderRole,
          uploadedBy: data.uploadedBy || 'legacy'
        } as PhotoData);
      });
      
      // 2. COMPATIBILITÀ: Carica foto ospiti dalla vecchia collezione galleries/{galleryId}/photos
      try {
        const oldGuestPhotosRef = collection(db, "galleries", gallery.id, "photos");
        const oldGuestPhotosSnapshot = await getDocs(oldGuestPhotosRef);
        
        // Ottieni nomi foto già caricate per evitare duplicati
        const existingPhotoNames = new Set(loadedPhotos.map(p => p.name));
        
        oldGuestPhotosSnapshot.docs.forEach(doc => {
          const photoData = doc.data();
          const photoName = photoData.name || "";
          const photoUrl = photoData.url || "";
          
          // Determina se è una foto ospite basandoci sull'URL del Storage
          
          // Evita duplicati basandoci sul nome della foto
          if (!existingPhotoNames.has(photoName)) {
            // Determina se è una foto ospite basandoci sull'URL del Storage
            const isGuestPhoto = photoUrl.includes('/guests/') || 
                               photoUrl.includes('guest-') ||
                               photoData.uploadedBy === 'guest' ||
                               photoData.uploaderRole === 'guest';
            
            const oldPhoto: PhotoData = {
              id: `old-guest-${doc.id}`, // ID speciale per foto vecchie
              name: photoName,
              url: photoUrl,
              contentType: photoData.contentType || "image/jpeg",
              size: photoData.size || 0,
              createdAt: photoData.createdAt || new Date(),
              galleryId: gallery.id,
              uploaderEmail: photoData.uploaderEmail || (isGuestPhoto ? 'guest@legacy' : 'admin@legacy'),
              uploaderName: photoData.uploaderName || (isGuestPhoto ? 'Ospite Legacy' : 'Admin Legacy'),
              uploaderRole: isGuestPhoto ? 'guest' : 'admin',
              uploadedBy: isGuestPhoto ? 'guest' : 'legacy' // Marchia correttamente il tipo
            } as PhotoData;
            
            loadedPhotos.push(oldPhoto);
            existingPhotoNames.add(photoName);
          }
        });
        
        // Foto ospiti legacy caricate con successo
        
      } catch (legacyError) {
        console.warn('⚠️ Errore caricamento foto ospiti legacy:', legacyError);
      }

      // 3. Carica foto dal vecchio sistema (solo Storage) se ce ne sono poche in Firestore
      if (loadedPhotos.length < (gallery.photoCount || 0)) {
        console.log('🔍 Cercando foto aggiuntive nel Storage...');
        
        try {
          const { listAll, getDownloadURL, getMetadata } = await import('firebase/storage');
          const { ref } = await import('firebase/storage');
          
          const storageRef = ref(storage, `gallery-photos/${gallery.id}`);
          const storageList = await listAll(storageRef);
          console.log('📦 Foto trovate in Storage:', storageList.items.length);
          
          // Ottieni nomi foto già caricate da Firestore
          const existingNames = new Set(loadedPhotos.map(p => p.name));
          
          // Carica foto dal Storage che non sono in Firestore
          const storagePromises = storageList.items
            .filter(item => !existingNames.has(item.name))
            .map(async (item) => {
              try {
                const url = await getDownloadURL(item);
                const metadata = await getMetadata(item);
                
                return {
                  id: `storage-${item.name}`, // ID speciale per foto di storage
                  name: item.name,
                  url: url,
                  contentType: metadata.contentType || 'image/jpeg',
                  size: metadata.size || 0,
                  createdAt: metadata.timeCreated ? new Date(metadata.timeCreated) : new Date(),
                  galleryId: gallery.id,
                  uploaderEmail: 'legacy@storage',
                  uploaderName: 'Sistema Legacy',
                  uploaderRole: 'admin',
                  uploadedBy: 'legacy'
                } as PhotoData;
              } catch (error) {
                console.warn('⚠️ Errore caricamento foto Storage:', item.name, error);
                return null;
              }
            });
          
          const storagePhotos = (await Promise.all(storagePromises)).filter(Boolean) as PhotoData[];
          console.log('✅ Foto legacy caricate:', storagePhotos.length);
          
          loadedPhotos.push(...storagePhotos);
        } catch (storageError) {
          console.warn('⚠️ Errore accesso Storage:', storageError);
        }
      }
      
      // Ordina tutte le foto per data di creazione (più recenti prima)
      loadedPhotos.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        
        // Gestione per diversi tipi di timestamp
        let aTime: number;
        let bTime: number;
        
        if (a.createdAt.seconds) {
          aTime = a.createdAt.seconds * 1000;
        } else {
          aTime = new Date(a.createdAt).getTime();
        }
        
        if (b.createdAt.seconds) {
          bTime = b.createdAt.seconds * 1000;
        } else {
          bTime = new Date(b.createdAt).getTime();
        }
        
        return bTime - aTime;
      });
      
      // Foto caricate con successo, incluse quelle legacy compatibili
      
      setPhotos(loadedPhotos);
      
    } catch (error) {
      console.error('❌ Errore nel caricamento foto:', error);
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
  const deletePhoto = async (photoToDelete: PhotoData) => {
    if (!gallery) return;
    
    try {
      setIsDeletingPhoto(true);
      
      // 1. Elimina il documento da Firestore (nuovo sistema o vecchia collezione ospiti)
      if (photoToDelete.id.startsWith('old-guest-')) {
        // Foto ospite dalla vecchia collezione galleries/{galleryId}/photos
        const oldGuestPhotoId = photoToDelete.id.replace('old-guest-', '');
        console.log(`🗑️ Eliminando foto ospite legacy: ${oldGuestPhotoId}`);
        const oldGuestPhotoRef = doc(db, "galleries", gallery.id, "photos", oldGuestPhotoId);
        await deleteDoc(oldGuestPhotoRef);
        console.log(`✅ Foto ospite legacy eliminata da collezione vecchia`);
      } else if (!photoToDelete.id.startsWith('storage-')) {
        // Foto dal nuovo sistema (collezione globale photos)
        console.log(`🗑️ Eliminando documento Firestore: ${photoToDelete.id}`);
        const photoRef = doc(db, "photos", photoToDelete.id);
        await deleteDoc(photoRef);
        console.log(`✅ Documento Firestore eliminato`);
      } else {
        console.log(`📦 Foto legacy solo Storage, skip Firestore`);
      }
      
      // 2. Elimina il file da Firebase Storage
      let photoDeleted = false;
      
      try {
        const url = new URL(photoToDelete.url);
        const pathMatch = url.pathname.match(/\/o\/(.+?)(\?|$)/);
        
        if (pathMatch) {
          const fullPath = decodeURIComponent(pathMatch[1]);
          console.log(`🗑️ Eliminando foto da Storage: ${fullPath}`);
          
          const storageRef = ref(storage, fullPath);
          await deleteObject(storageRef);
          console.log(`✅ Foto eliminata da Storage: ${fullPath}`);
          photoDeleted = true;
        } else {
          console.warn(`⚠️ Impossibile estrarre path da URL: ${photoToDelete.url}`);
        }
      } catch (storageError) {
        console.warn(`⚠️ Errore eliminazione Storage:`, storageError);
        // Continua comunque - l'eliminazione da Firestore è più importante
      }
      
      // 3. Aggiorna conteggio foto nella galleria
      try {
        const newPhotoCount = Math.max(0, (gallery.photoCount || 0) - 1);
        const galleryRef = doc(db, "galleries", gallery.id);
        await updateDoc(galleryRef, { 
          photoCount: newPhotoCount,
          updatedAt: serverTimestamp()
        });
      } catch (countError) {
        console.warn('⚠️ Errore aggiornamento conteggio foto:', countError);
      }
      
      // 4. Aggiorna l'array locale delle foto
      setPhotos(photos.filter(photo => photo.id !== photoToDelete.id));
      
      const photoType = photoToDelete.uploadedBy === 'admin' ? 'admin' : 
                       photoToDelete.uploadedBy === 'guest' ? 'ospite' : 'legacy';
      
      toast({
        title: "Foto eliminata",
        description: `La foto ${photoType} è stata eliminata con successo dalla galleria.`
      });
      
      // 5. Forza il refresh della galleria principale
      window.dispatchEvent(new CustomEvent('galleryPhotosUpdated'));
      
    } catch (error) {
      console.error('❌ Errore durante l\'eliminazione:', error);
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
  
  // Controlla se un file è già stato caricato
  const checkForDuplicates = (files: File[]): { uniqueFiles: File[], duplicates: string[] } => {
    const existingPhotoNames = new Set(photos.map(p => p.name));
    const uniqueFiles: File[] = [];
    const duplicates: string[] = [];
    
    files.forEach(file => {
      if (existingPhotoNames.has(file.name)) {
        duplicates.push(file.name);
      } else {
        uniqueFiles.push(file);
      }
    });
    
    return { uniqueFiles, duplicates };
  };

  // Carica nuove foto alla galleria
  const handleUploadPhotos = async () => {
    if (!gallery || selectedFiles.length === 0) return;
    
    // Controlla duplicati
    const { uniqueFiles, duplicates } = checkForDuplicates(selectedFiles);
    
    // Mostra avviso per i duplicati
    if (duplicates.length > 0) {
      toast({
        title: "File duplicati trovati",
        description: `${duplicates.length} file sono già stati caricati: ${duplicates.slice(0, 3).join(', ')}${duplicates.length > 3 ? '...' : ''}`,
        variant: "destructive"
      });
    }
    
    // Se non ci sono file unici da caricare, ferma l'upload
    if (uniqueFiles.length === 0) {
      toast({
        title: "Nessun file da caricare",
        description: "Tutti i file selezionati sono già stati caricati in precedenza.",
        variant: "destructive"
      });
      return;
    }
    
    // Mostra info sui file che verranno caricati
    if (duplicates.length > 0) {
      toast({
        title: "Upload in corso",
        description: `Caricamento di ${uniqueFiles.length} file nuovi (${duplicates.length} duplicati saltati)`,
      });
    }
    
    setIsUploading(true);
    try {
      // Prepara i file per l'upload (solo quelli unici)
      const filesToUpload = uniqueFiles;
      
      // Carica le foto su Firebase Storage
      const uploadedPhotos = await uploadPhotos(
        gallery.id,
        filesToUpload,
        2, // concorrenza ridotta per stabilità
        (progress) => setUploadProgress(progress),
        (summary) => setUploadSummary(summary)
      );
      
      console.log(`${uploadedPhotos.length} foto caricate su Storage`);
      
      // Salva i metadati delle foto in Firestore nella collezione globale photos
      const photoPromises = uploadedPhotos.map(async (photo, index) => {
        try {
          console.log(`💾 Salvando metadati foto ${index + 1}/${uploadedPhotos.length}: ${photo.name}`);
          // Salva nella collezione globale photos come fanno gli ospiti
          const docRef = await addDoc(collection(db, "photos"), {
            name: photo.name,
            url: photo.url,
            size: photo.size,
            contentType: photo.contentType,
            createdAt: photo.createdAt || serverTimestamp(),
            galleryId: gallery.id,
            uploadedBy: 'admin', // Importante: marca come foto amministratore
            uploaderEmail: 'admin@wedding-gallery.app',
            uploaderName: 'Fotografo',
            uploaderUid: 'admin',
            likeCount: 0,
            commentCount: 0,
            position: 0
          });
          console.log(`✅ Foto salvata in Firestore: ${docRef.id}`);
        } catch (err) {
          console.error('❌ Errore nel salvare foto:', photo.name, err);
          throw err; // Re-throw per far fallire l'upload se c'è un errore Firestore
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
      
      // Forza il refresh della galleria principale
      window.dispatchEvent(new CustomEvent('galleryPhotosUpdated'));

      // Invia notifiche ai subscribers (non-blocking)
      notifyNewPhotos(gallery.id, gallery.name, 'Admin', uploadedPhotos.length)
        .catch(notificationError => {
          console.warn('⚠️ Errore invio notifiche:', notificationError);
          // Non bloccare l'upload per errori di notifica
        });
      
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
                <>
                  <p className="text-sm text-gray-500 mt-1">
                    {selectedFiles.length} file selezionati
                  </p>
                  {/* Anteprima controllo duplicati */}
                  {(() => {
                    const { uniqueFiles, duplicates } = checkForDuplicates(selectedFiles);
                    return (
                      <div className="mt-2 space-y-1">
                        {uniqueFiles.length > 0 && (
                          <div className="flex items-center gap-2 text-sm">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="text-green-600">{uniqueFiles.length} nuovi file da caricare</span>
                          </div>
                        )}
                        {duplicates.length > 0 && (
                          <div className="flex items-center gap-2 text-sm">
                            <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                            <span className="text-orange-600">{duplicates.length} file duplicati (verranno saltati)</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
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

            {/* Sezione foto esistenti */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Tutte le Foto della Galleria ({photos.length})</h4>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={loadPhotos}
                  disabled={isLoading}
                >
                  {isLoading ? "Caricamento..." : "Ricarica"}
                </Button>
              </div>
              
              {/* Tab filtri foto */}
              <div className="flex gap-2 mb-4">
                <Button
                  variant={photoFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPhotoFilter('all')}
                >
                  Tutte ({photos.length})
                </Button>
                <Button
                  variant={photoFilter === 'admin' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPhotoFilter('admin')}
                  className="flex items-center gap-1"
                >
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  Admin ({photos.filter(p => p.uploadedBy === 'admin').length})
                </Button>
                <Button
                  variant={photoFilter === 'guest' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPhotoFilter('guest')}
                  className="flex items-center gap-1"
                >
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  Ospiti ({photos.filter(p => p.uploadedBy === 'guest').length})
                </Button>
                <Button
                  variant={photoFilter === 'legacy' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPhotoFilter('legacy')}
                  className="flex items-center gap-1"
                >
                  <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                  Legacy ({photos.filter(p => p.uploadedBy === 'legacy').length})
                </Button>
              </div>
              
              {photos.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Image className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2">Nessuna foto caricata nella galleria</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-96 overflow-y-auto">
                  {photos
                    .filter(photo => {
                      if (photoFilter === 'all') return true;
                      return photo.uploadedBy === photoFilter;
                    })
                    .map((photo) => (
                <div key={photo.id} className="relative group">
                  <img
                    src={photo.url}
                    alt={photo.name}
                    className="w-full h-24 object-cover rounded border"
                  />
                  
                  {/* Indicatore tipo foto */}
                  <div className={`absolute top-1 left-1 w-3 h-3 rounded-full ${
                    photo.uploadedBy === 'admin' ? 'bg-blue-500' :
                    photo.uploadedBy === 'guest' ? 'bg-green-500' :
                    'bg-orange-500'
                  }`} title={
                    photo.uploadedBy === 'admin' ? 'Foto Admin' :
                    photo.uploadedBy === 'guest' ? 'Foto Ospite' :
                    'Foto Legacy'
                  }></div>
                  
                  {/* Nome uploader */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 rounded-b">
                    {photo.uploadedBy === 'admin' ? 'Admin' :
                     photo.uploadedBy === 'guest' ? (photo.uploaderName || 'Ospite') :
                     'Legacy'}
                  </div>
                  
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
                          Sei sicuro di voler eliminare questa foto {photo.uploadedBy === 'admin' ? 'admin' : 
                          photo.uploadedBy === 'guest' ? 'dell\'ospite' : 'legacy'}? Questa azione non può essere annullata.
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
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}