import { useState, useEffect, useRef, ChangeEvent } from "react";
import { doc, updateDoc, collection, getDocs, addDoc, serverTimestamp, where, query, deleteDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { uploadPhotos, UploadSummary, UploadProgressInfo } from "@/lib/photoUploader";
import { UploadCloud, Image, Trash } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";

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
  const [photoToDelete, setPhotoToDelete] = useState<File | null>(null);
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
    
    // Crea URL anteprima
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
      // Carica le foto
      const photosCollection = collection(db, "photos");
      const photosQuery = query(photosCollection, where("galleryId", "==", gallery.id));
      const photosSnapshot = await getDocs(photosQuery);
      
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
      console.log(`Caricate ${loadedPhotos.length} foto per la galleria ${gallery.id}`);
    } catch (error) {
      console.error("Error loading photos:", error);
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
      console.log(`Eliminazione foto: ${photoToDelete.name} (ID: ${photoToDelete.id})`);
      
      // 1. Elimina il documento da Firestore nella collezione photos
      const photoRef = doc(db, "photos", photoToDelete.id);
      await deleteDoc(photoRef);
      console.log(`✓ Eliminato documento da photos/${photoToDelete.id}`);
      
      // 2. Trova e elimina il documento corrispondente in gallery-photos
      const galleryPhotosQuery = query(
        collection(db, "gallery-photos"),
        where("galleryId", "==", gallery.id),
        where("name", "==", photoToDelete.name)
      );
      
      const querySnapshot = await getDocs(galleryPhotosQuery);
      if (!querySnapshot.empty) {
        // Elimina tutti i documenti trovati (dovrebbe essere solo uno)
        for (const docSnapshot of querySnapshot.docs) {
          await deleteDoc(docSnapshot.ref);
          console.log(`✓ Eliminato documento da gallery-photos: ${docSnapshot.id}`);
        }
      } else {
        console.warn(`⚠️ Nessun documento trovato in gallery-photos per ${photoToDelete.name}`);
      }
      
      // 3. Elimina il file da Firebase Storage
      try {
        // Percorso principale
        const storageRef = ref(storage, `gallery-photos/${gallery.id}/${photoToDelete.name}`);
        await deleteObject(storageRef);
        console.log(`✓ Eliminato file da Storage: gallery-photos/${gallery.id}/${photoToDelete.name}`);
      } catch (storageError) {
        console.warn(`⚠️ Errore nell'eliminazione del file da Storage:`, storageError);
        // Proviamo con un percorso alternativo
        try {
          const altStorageRef = ref(storage, `galleries/${gallery.id}/photos/${photoToDelete.name}`);
          await deleteObject(altStorageRef);
          console.log(`✓ Eliminato file dal percorso alternativo: galleries/${gallery.id}/photos/${photoToDelete.name}`);
        } catch (altStorageError) {
          console.error(`❌ Impossibile eliminare il file dallo Storage:`, altStorageError);
        }
      }
      
      // 4. Aggiorna l'array locale delle foto
      setPhotos(photos.filter(photo => photo.id !== photoToDelete.id));
      
      toast({
        title: "Foto eliminata",
        description: "La foto è stata eliminata con successo dalla galleria."
      });
      
    } catch (error) {
      console.error("Errore durante l'eliminazione della foto:", error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'eliminazione della foto.",
        variant: "destructive"
      });
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
          console.log("Nuova immagine di copertina caricata:", newCoverImageUrl);
        } catch (error) {
          console.error("Errore nell'upload della copertina:", error);
          // Continuiamo comunque con l'aggiornamento della galleria
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
        hasChapters: false // Rimuoviamo la funzionalità dei capitoli
      });
      
      toast({
        title: "Galleria aggiornata",
        description: "Le modifiche alla galleria sono state salvate con successo"
      });
      
      onClose();
    } catch (error) {
      console.error("Error updating gallery:", error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante il salvataggio delle modifiche",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Rimuova la funzione saveChaptersAndPhotos poiché non abbiamo più capitoli
  const updatePhotosOrder = async () => {
    if (!gallery) return;
    
    setIsLoading(true);
    try {
      console.log("Aggiornamento ordine foto");
      
      // Aggiorna il lastUpdated della galleria
      const galleryRef = doc(db, "galleries", gallery.id);
      await updateDoc(galleryRef, {
        lastUpdated: serverTimestamp()
      });
      console.log("✓ Aggiornato timestamp della galleria");
      
      // Aggiorna le foto rimuovendo i riferimenti ai capitoli
      console.log(`Aggiornamento di ${photos.length} foto in ordine cronologico`);
      
      // Iterazione su tutte le foto
      for (const photo of photos) {
        try {
          console.log(`Elaborazione foto ${photo.name} (${photo.id})`);
          
          // Aggiorna nella sottocollezione galleries/{galleryId}/photos
          const photoRef = doc(db, "galleries", gallery.id, "photos", photo.id);
          await updateDoc(photoRef, {
            chapterId: null,
            position: 0,
            chapterPosition: 0 // Per compatibilità
          });
          
          // 2. Cerca il documento corrispondente in gallery-photos
          const galleryPhotosQuery = query(
            collection(db, "gallery-photos"),
            where("galleryId", "==", gallery.id),
            where("name", "==", photo.name)
          );
          
          const querySnapshot = await getDocs(galleryPhotosQuery);
          
          if (!querySnapshot.empty) {
            // Aggiorna il primo documento trovato
            const docRef = querySnapshot.docs[0].ref;
            await updateDoc(docRef, {
              chapterId: null,
              chapterPosition: 0
            });
            console.log(`✓ Rimosso chapterId per foto ${photo.name} in gallery-photos`);
          } else {
            // Prova a cercare per nome senza galleryId (per compatibilità con versioni precedenti)
            const q2 = query(
              collection(db, "gallery-photos"),
              where("name", "==", photo.name)
            );
            const snapshot2 = await getDocs(q2);
            
            if (!snapshot2.empty) {
              // Filtra solo quelli che corrispondono alla galleryId o non hanno galleryId
              const matchingDocs = snapshot2.docs.filter(doc => {
                const data = doc.data();
                return data.galleryId === gallery.id || !data.galleryId;
              });
              
              if (matchingDocs.length > 0) {
                const docRef = matchingDocs[0].ref;
                await updateDoc(docRef, {
                  galleryId: gallery.id, // Assicuriamoci che abbia galleryId
                  chapterId: null,
                  chapterPosition: 0
                });
                console.log(`✓ Aggiornato con fallback foto ${photo.name} in gallery-photos`);
              } else {
                console.warn(`⚠️ Nessun documento trovato in gallery-photos per la foto ${photo.name}`);
                
                // Tenta di creare un nuovo documento in gallery-photos se non esistente
                try {
                  const newPhotoData = {
                    name: photo.name,
                    url: photo.url, 
                    contentType: photo.contentType || 'image/jpeg',
                    size: photo.size || 0,
                    galleryId: gallery.id,
                    chapterId: null,
                    chapterPosition: 0,
                    createdAt: serverTimestamp()
                  };
                  
                  // Usa addDoc separatamente
                  await addDoc(collection(db, "gallery-photos"), newPhotoData);
                  console.log(`✓ Creato nuovo documento in gallery-photos per ${photo.name}`);
                } catch (createError) {
                  console.error(`❌ Errore nella creazione di nuovo documento:`, createError);
                }
              }
            } else {
              console.warn(`⚠️ Nessun documento trovato in gallery-photos per la foto ${photo.name}`);
            }
          }
        } catch (error) {
          console.error(`❌ Errore durante l'elaborazione della foto ${photo.name}:`, error);
        }
      }
      toast({
        title: "Galleria aggiornata",
        description: "Le informazioni delle foto sono state aggiornate con successo"
      });
    } catch (error) {
      console.error("Error updating chapters and photos:", error);
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
      
      // Carica le foto su Firebase Storage usando il nuovo percorso (gallery-photos)
      const uploadedPhotos = await uploadPhotos(
        gallery.id,
        filesToUpload,
        6, // concorrenza
        (progress) => setUploadProgress(progress),
        (summary) => setUploadSummary(summary)
      );
      
      console.log(`Caricate ${uploadedPhotos.length} nuove foto nella galleria ${gallery.id}`);
      
      // Salva i metadati delle foto in Firestore
      const photoPromises = uploadedPhotos.map(async (photo, index) => {
        try {
          // Impostiamo sempre chapterId e position a valori di default
          const chapterId = null;
          const chapterPosition = 0;
          
          console.log(`Foto ${photo.name} - senza capitolo (organizzazione cronologica)`);
          
          // Salva nella sottocollezione photos (lasciamo per compatibilità)
          await addDoc(collection(db, "galleries", gallery.id, "photos"), {
            name: photo.name,
            url: photo.url,
            size: photo.size,
            contentType: photo.contentType,
            createdAt: photo.createdAt || serverTimestamp(),
            chapterId: chapterId,
            position: chapterPosition,
            chapterPosition: chapterPosition
          });
          
          // Salva nella collezione gallery-photos (principale)
          await addDoc(collection(db, "gallery-photos"), {
            name: photo.name,
            url: photo.url,
            size: photo.size,
            contentType: photo.contentType,
            createdAt: photo.createdAt || serverTimestamp(),
            galleryId: gallery.id,
            chapterId: chapterId,
            chapterPosition: chapterPosition
          });
        } catch (err) {
          console.error("Errore nel salvataggio dei metadati:", err);
        }
      });
      
      await Promise.all(photoPromises);
      
      // Aggiorna il numero di foto nella galleria
      const galleryRef = doc(db, "galleries", gallery.id);
      await updateDoc(galleryRef, {
        photoCount: (photos.length + uploadedPhotos.length),
        lastUpdated: serverTimestamp()
      });
      
      toast({
        title: "Foto caricate con successo",
        description: `${uploadedPhotos.length} nuove foto sono state aggiunte alla galleria`
      });
      
      // Resetta lo stato
      setSelectedFiles([]);
      setUploadProgress({});
      setUploadSummary(null);
      if (filesInputRef.current) {
        filesInputRef.current.value = "";
      }
      
      // Ricarica le foto per mostrare le nuove aggiunte
      loadPhotos();
      
    } catch (error) {
      console.error("Errore durante il caricamento delle foto:", error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante il caricamento delle foto",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  if (!gallery) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-playfair">Modifica Galleria</DialogTitle>
          <DialogDescription>
            Modifica i dettagli, la password o l'organizzazione dei capitoli della galleria
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="details" value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="details" className="flex-1">Dettagli</TabsTrigger>
            <TabsTrigger value="chapters" className="flex-1">Capitoli e Foto</TabsTrigger>
            <TabsTrigger value="upload" className="flex-1">
              <UploadCloud className="h-4 w-4 mr-2" />
              Aggiungi Foto
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="space-y-4 min-h-[50vh]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome della galleria</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Es. Matrimonio Marco e Giulia"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Data evento</Label>
                <Input
                  id="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  placeholder="Es. 12 Giugno 2023"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="location">Luogo</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Es. Villa Reale, Monza"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Descrizione</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrizione opzionale dell'evento"
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="youtubeUrl">URL video YouTube</Label>
              <Input
                id="youtubeUrl"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
              <p className="mt-1 text-xs text-gray-500">
                Inserisci l'URL completo di un video YouTube da incorporare nella galleria (opzionale).
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="coverImage">Immagine di copertina</Label>
              <div className="mt-1">
                <Input
                  id="coverImage"
                  type="file"
                  accept="image/*"
                  ref={coverInputRef}
                  onChange={handleCoverImageChange}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Scegli un'immagine di copertina per la tua galleria. Dimensione consigliata: 1920x600px.
                </p>
                
                {coverPreview && (
                  <div className="mt-2 border rounded-md overflow-hidden">
                    <div className="relative">
                      <img 
                        src={coverPreview} 
                        alt="Anteprima copertina" 
                        className="w-full h-48 object-cover"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => {
                          setCoverImage(null);
                          setCoverPreview(null);
                          setCoverImageUrl("");
                        }}
                      >
                        Rimuovi
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="password">Password galleria</Label>
                <Button 
                  variant="outline" 
                  size="sm" 
                  type="button"
                  onClick={() => {
                    // Genera una password casuale (8 caratteri alfanumerici)
                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                    let newPassword = '';
                    for (let i = 0; i < 8; i++) {
                      newPassword += chars.charAt(Math.floor(Math.random() * chars.length));
                    }
                    setPassword(newPassword);
                  }}
                  className="text-xs"
                >
                  Genera password
                </Button>
              </div>
              <div className="relative flex items-center">
                <Input
                  id="password"
                  type="text" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password per l'accesso alla galleria"
                  className="pr-16"
                />
                {password && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 h-full px-2"
                    onClick={() => {
                      // Copia la password negli appunti
                      navigator.clipboard.writeText(password);
                      toast({
                        title: "Password copiata",
                        description: "La password è stata copiata negli appunti",
                      });
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002-2h2a2 2 0 002 2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  </Button>
                )}
              </div>
              <p className="text-sm text-gray-500">
                Questa password verrà utilizzata per proteggere l'accesso alla galleria. Puoi generare una password casuale o inserirne una personalizzata.
              </p>
            </div>
            
            <DialogFooter className="mt-6">
              <Button
                variant="outline"
                onClick={onClose}
                className="mr-2"
              >
                Annulla
              </Button>
              <Button
                onClick={saveGallery}
                disabled={isLoading}
              >
                {isLoading ? "Salvataggio in corso..." : "Salva modifiche"}
              </Button>
            </DialogFooter>
          </TabsContent>
          
          <TabsContent value="chapters" className="min-h-[50vh]">
            <div className="mb-4">
              <h3 className="text-lg font-medium">Organizzazione foto</h3>
              <p className="text-gray-500 mt-2">
                La funzionalità dei capitoli è stata rimossa. Le foto sono ora organizzate in ordine cronologico.
              </p>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-4">
              {photos.map((photo, index) => (
                <div key={photo.id || index} className="relative group">
                  <img 
                    src={photo.url} 
                    alt={photo.name} 
                    className="w-full h-32 object-cover rounded-md"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => {
                        if (window.confirm(`Sei sicuro di voler eliminare questa foto (${photo.name})? Questa azione è irreversibile.`)) {
                          deletePhoto(photo);
                        }
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {photos.length === 0 && (
              <p className="text-center py-10 text-gray-500">Nessuna foto in questa galleria</p>
            )}
                
            <DialogFooter className="mt-6">
              <Button
                variant="outline"
                onClick={onClose}
                className="mr-2"
              >
                Annulla
              </Button>
              <Button
                onClick={() => onClose()}
                disabled={isLoading}
              >
                {isLoading ? "Salvataggio in corso..." : "Chiudi"}
              </Button>
            </DialogFooter>
          </TabsContent>
          
          <TabsContent value="upload" className="min-h-[50vh]">
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="photos">Aggiungi nuove foto a questa galleria</Label>
                  <span className="text-sm text-muted-foreground">
                    {selectedFiles.length > 0 ? `${selectedFiles.length} foto selezionate` : "Nessuna foto selezionata"}
                  </span>
                </div>
                
                <div 
                  className={`border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-colors ${
                    selectedFiles.length > 0 ? 'border-sage bg-sage/5' : 'border-gray-300 hover:border-sage'
                  }`}
                  onClick={() => filesInputRef.current?.click()}
                >
                  <div className="flex flex-col items-center space-y-2">
                    <Image className="h-10 w-10 text-sage" />
                    <h3 className="font-medium text-lg">Seleziona foto da aggiungere</h3>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      Fai clic qui o trascina le tue foto in questa area per caricarle nella galleria
                    </p>
                    <div className="text-xs text-muted-foreground mt-2">
                      Supporta immagini JPG, PNG, HEIC, ecc.
                    </div>
                    {selectedFiles.length > 0 && (
                      <div className="bg-sage/10 text-sage px-3 py-1 rounded-full font-medium mt-2">
                        {selectedFiles.length} foto selezionate
                      </div>
                    )}
                  </div>
                  <input
                    ref={filesInputRef}
                    type="file"
                    id="photos"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        // Convertiamo i File in un formato utilizzabile
                        const filesArray = Array.from(e.target.files);
                        const uploadFiles = filesArray.map((file, index) => {
                          // Aggiungiamo le proprietà necessarie per la visualizzazione
                          Object.assign(file, {
                            id: `temp-${Date.now()}-${index}`,
                            url: URL.createObjectURL(file), // URL temporaneo per l'anteprima
                            position: index
                          });
                          return file;
                        });
                        setSelectedFiles(uploadFiles);
                      }
                    }}
                  />
                </div>
              </div>
              
              {selectedFiles.length > 0 && (
                <div className="space-y-4">
                  <div className="bg-muted p-4 rounded-md">
                    <h4 className="font-medium mb-2">Dettagli upload</h4>
                    <ul className="text-sm space-y-1">
                      <li>Numero totale di foto: <span className="font-medium">{selectedFiles.length}</span></li>
                      <li>Dimensione totale: <span className="font-medium">
                        {(selectedFiles.reduce((acc, file) => acc + file.size, 0) / (1024 * 1024)).toFixed(2)} MB
                      </span></li>
                    </ul>
                  </div>
                  
                  {uploadSummary && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm font-medium">
                          <div>Avanzamento</div>
                          <div>{Math.round(uploadSummary.avgProgress)}%</div>
                        </div>
                        <Progress value={uploadSummary.avgProgress} className="h-2" />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-muted p-2 rounded">
                          Completati: <span className="font-medium">{uploadSummary.completed}</span>
                        </div>
                        <div className="bg-muted p-2 rounded">
                          In corso: <span className="font-medium">{uploadSummary.inProgress}</span>
                        </div>
                        <div className="bg-muted p-2 rounded">
                          In attesa: <span className="font-medium">{uploadSummary.waiting}</span>
                        </div>
                        <div className="bg-muted p-2 rounded">
                          Falliti: <span className="font-medium text-red-500">{uploadSummary.failed}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <DialogFooter className="space-x-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    // Reset stato
                    setSelectedFiles([]);
                    setUploadProgress({});
                    setUploadSummary(null);
                    
                    // Reset input file
                    if (filesInputRef.current) {
                      filesInputRef.current.value = "";
                    }
                  }}
                  disabled={isUploading || selectedFiles.length === 0}
                >
                  Cancella selezione
                </Button>
                
                <Button
                  onClick={handleUploadPhotos}
                  disabled={isUploading || selectedFiles.length === 0}
                  className="flex items-center"
                >
                  {isUploading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Upload in corso...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="h-4 w-4 mr-2" />
                      Carica foto selezionate
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}