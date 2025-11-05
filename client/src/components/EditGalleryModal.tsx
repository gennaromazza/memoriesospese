import { useState, useEffect, useRef, useCallback, ChangeEvent } from "react";
import { doc, updateDoc, collection, getDocs, addDoc, serverTimestamp, where, query, deleteDoc, Timestamp, setDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, getMetadata, listAll } from "firebase/storage";
import { db, storage } from "../lib/firebase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useToast } from "../hooks/use-toast";
import { uploadPhotos, UploadSummary, UploadProgressInfo } from "../lib/photoUploader";
import { notifyNewPhotos } from "../lib/email";
import { UploadCloud, Image, Trash, Eye, EyeOff } from "lucide-react";
import { PhotoUploadSuccessModal } from "./PhotoUploadSuccessModal";
import { getAllThemes } from "@shared/special-themes";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
import { Progress } from "./ui/progress";
import imageCompression from 'browser-image-compression';
import { queryClient } from "../lib/queryClient";
import { Info } from 'lucide-react';
import { createAbsoluteUrl } from "../lib/basePath";

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
  coverImageMobile?: string;
  coverImageDesktop?: string;
  youtubeUrl?: string;
  youtubeUrls?: string[];
  photoCount?: number;
  specialTheme?: string;
  specialPin?: string;
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
  const [showPassword, setShowPassword] = useState(false);
  const [specialTheme, setSpecialTheme] = useState<string>("none");
  const [specialPin, setSpecialPin] = useState("");
  const [showSpecialPin, setShowSpecialPin] = useState(false);
  const [clientEmail, setClientEmail] = useState(""); // Email cliente per invio PIN
  const [clientName, setClientName] = useState(""); // Nome cliente per personalizzazione email
  const [youtubeUrls, setYoutubeUrls] = useState<string[]>([]);
  const [newYoutubeUrl, setNewYoutubeUrl] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverImageMobileUrl, setCoverImageMobileUrl] = useState("");
  const [coverImageDesktopUrl, setCoverImageDesktopUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingPin, setIsCheckingPin] = useState(false); // Loading state per validazione PIN
  
  // Stati per Photo Selection Workflow (Task 2)
  const [selectionEnabled, setSelectionEnabled] = useState(false);
  const [requiredPhotoCount, setRequiredPhotoCount] = useState<number>(50);
  const [selectionDeadline, setSelectionDeadline] = useState<string>("");
  const [selectionDeadlineEnforced, setSelectionDeadlineEnforced] = useState(true);
  const [selectionStatus, setSelectionStatus] = useState<'pending' | 'completed'>('pending');
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  
  // Stati per prodotti associati (da booking/ordine) - MULTI-PRODUCT SUPPORT
  const [associatedProducts, setAssociatedProducts] = useState<Array<{ nome: string; numeroFoto: number; isCustom: boolean }>>([]);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  
  const availableThemes = getAllThemes();
  const [activeTab, setActiveTab] = useState<string>("details");
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: any}>({});
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<PhotoData | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
  const [photoFilter, setPhotoFilter] = useState<'all' | 'admin' | 'guest' | 'legacy'>('all');
  
  // Stati per modale successo upload
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [uploadStats, setUploadStats] = useState({ photosCount: 0, notifiedCount: 0 });
  
  const filesInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Traccia l'ID della galleria per evitare loop infiniti
  const currentGalleryId = useRef<string | null>(null);

  // MUTUA ESCLUSIVITÀ: Password e PIN non possono coesistere
  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value;
    setPassword(newPassword);
    
    // Se viene impostata una password, rimuovi tema e PIN
    if (newPassword.trim()) {
      if (specialTheme !== 'none') {
        console.log('🔄 Password impostata - rimozione tema e PIN');
        setSpecialTheme('none');
        setSpecialPin('');
        toast({
          title: "Modalità cambiata",
          description: "Passato a galleria con password. Il tema speciale e il PIN sono stati rimossi.",
        });
      }
    }
  };

  const handleSpecialThemeChange = (newTheme: string) => {
    setSpecialTheme(newTheme);
    
    // Se viene selezionato un tema (diverso da 'none'), rimuovi la password
    if (newTheme !== 'none' && password.trim()) {
      console.log('🔄 Tema speciale selezionato - rimozione password');
      setPassword('');
      toast({
        title: "Modalità cambiata",
        description: "Passato a galleria speciale con PIN. La password è stata rimossa.",
      });
    }
  };

  // Carica le foto dalla galleria (memoizzata per performance)
  const loadPhotos = useCallback(async () => {
    if (!gallery) {
      console.log('❌ loadPhotos: Gallery non definita');
      return;
    }

    console.log('🔄 Inizio caricamento foto per galleria:', gallery.id);
    console.log('🔄 Stato photos prima del caricamento:', photos.length);
    setIsLoading(true);
    try {
      // 1. Carica foto dal nuovo sistema (collezione photos con uploadedBy)
      const photosQuery = query(
        collection(db, "photos"),
        where("galleryId", "==", gallery.id)
      );

      const photosSnapshot = await getDocs(photosQuery);
      console.log('📷 Foto nuove trovate:', photosSnapshot.docs.length);

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
              uploadedBy: 'legacy'
            } as PhotoData;

            loadedPhotos.push(oldPhoto);
            existingPhotoNames.add(photoName);
          }
        });

        console.log('📸 Foto ospiti legacy caricate:', oldGuestPhotosSnapshot.docs.length);
      } catch (error) {
        console.log('⚠️ Errore caricamento foto ospiti legacy (normale se non esistono):', error);
      }

      // 3. COMPATIBILITÀ: Carica foto da Firebase Storage se non in Firestore
      try {
        const storageRef = ref(storage, `galleries/${gallery.id}/photos/`);
        const storageList = await listAll(storageRef);

        const existingPhotoNames = new Set(loadedPhotos.map(p => p.name));

        for (const item of storageList.items) {
          const fileName = item.name;

          // Evita duplicati basandoci sul nome del file
          if (!existingPhotoNames.has(fileName)) {
            try {
              const url = await getDownloadURL(item);
              const metadata = await getMetadata(item);

              const storagePhoto: PhotoData = {
                id: `storage-${fileName}`,
                name: item.name,
                url: url,
                contentType: metadata.contentType || 'image/jpeg',
                size: metadata.size || 0,
                createdAt: Timestamp.fromDate(metadata.timeCreated ? new Date(metadata.timeCreated) : new Date()),
                galleryId: gallery.id,
                uploaderEmail: 'legacy@storage',
                uploaderName: 'Sistema Legacy',
                uploaderRole: 'admin',
                uploadedBy: 'legacy'
              } as PhotoData;

              loadedPhotos.push(storagePhoto);
              existingPhotoNames.add(fileName);
            } catch (error) {
              console.log(`⚠️ Errore caricamento foto storage ${fileName}:`, error);
            }
          }
        }

        console.log('📸 Foto da Firebase Storage caricate:', storageList.items.length);
      } catch (error) {
        console.log('⚠️ Errore caricamento foto da Storage (normale se non esistono):', error);
      }

      // Ordina le foto per data (più recenti prima)
      loadedPhotos.sort((a, b) => {
        let aTime: number;
        let bTime: number;

        if (a.createdAt && typeof a.createdAt === 'object' && 'seconds' in a.createdAt) {
          aTime = (a.createdAt as Timestamp).seconds * 1000;
        } else {
          aTime = a.createdAt ? new Date(a.createdAt as any).getTime() : 0;
        }

        if (b.createdAt && typeof b.createdAt === 'object' && 'seconds' in b.createdAt) {
          bTime = (b.createdAt as Timestamp).seconds * 1000;
        } else {
          bTime = b.createdAt ? new Date(b.createdAt as any).getTime() : 0;
        }

        return bTime - aTime;
      });

      // Foto caricate con successo, incluse quelle legacy compatibili
      console.log('📸 Totale foto caricate:', loadedPhotos.length);
      console.log('📊 Breakdown foto:', {
        nuove: loadedPhotos.filter(p => !p.id.startsWith('old-guest-') && !p.id.startsWith('storage-')).length,
        legacy: loadedPhotos.filter(p => p.id.startsWith('old-guest-')).length,
        storage: loadedPhotos.filter(p => p.id.startsWith('storage-')).length
      });

      setPhotos(loadedPhotos);
      console.log('✅ Foto settate nello stato, lunghezza:', loadedPhotos.length);

      // Verifica immediata che le foto siano state settate
      setTimeout(() => {
        console.log('🔍 Verifica stato photos dopo setPhotos:', photos.length);
      }, 100);

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
  }, [gallery, toast]);

  // Carica i dati della galleria quando cambia l'ID
  useEffect(() => {
    if (gallery && gallery.id && currentGalleryId.current !== gallery.id) {
      console.log('🔄 Caricamento dati galleria nel modal:', gallery.id);
      currentGalleryId.current = gallery.id;

      setName(gallery.name || "");
      setDate(gallery.date || "");
      setLocation(gallery.location || "");
      setDescription(gallery.description || "");
      setSpecialTheme(gallery.specialTheme || "none");
      setClientEmail((gallery as any).clientEmail || "");
      setClientName((gallery as any).clientName || "");
      
      // Gestione retrocompatibilità: se c'è youtubeUrl singolo, convertilo in array
      const urls: string[] = [];
      if (gallery.youtubeUrls && gallery.youtubeUrls.length > 0) {
        urls.push(...gallery.youtubeUrls);
      } else if (gallery.youtubeUrl) {
        urls.push(gallery.youtubeUrl);
      }
      setYoutubeUrls(urls);
      setNewYoutubeUrl("");
      
      setCoverImageUrl(gallery.coverImageUrl || "");
      setCoverImageMobileUrl(gallery.coverImageMobile || "");
      setCoverImageDesktopUrl(gallery.coverImageDesktop || "");
      
      // Popola campi Photo Selection Workflow (Task 2)
      setSelectionEnabled((gallery as any).selectionEnabled || false);
      setRequiredPhotoCount((gallery as any).requiredPhotoCount || 50);
      setSelectionDeadlineEnforced((gallery as any).selectionDeadlineEnforced !== false); // default true
      setSelectionStatus((gallery as any).selectionStatus || 'pending');
      setSelectedPhotoIds((gallery as any).selectedPhotoIds || []);
      
      // Convert Firebase Timestamp to date string for input[type="date"]
      if ((gallery as any).selectionDeadline) {
        const deadline = (gallery as any).selectionDeadline;
        const deadlineDate = deadline.toDate ? deadline.toDate() : new Date(deadline);
        setSelectionDeadline(deadlineDate.toISOString().split('T')[0]);
      } else {
        setSelectionDeadline("");
      }

      // FETCH PASSWORD E PIN DA GALLERYSECRETS (server-side sicuro con autenticazione)
      // Non li leggiamo più da gallery.password/gallery.specialPin perché non esistono nel doc pubblico
      const fetchSecrets = async () => {
        try {
          console.log('🔐 Caricamento secrets da server per galleria:', gallery.id);
          
          // Ottieni Firebase ID token per autenticazione
          const { auth } = await import("../lib/firebase");
          const currentUser = auth.currentUser;

          if (!currentUser) {
            console.error('❌ Utente non autenticato');
            setPassword("");
            setSpecialPin("");
            return;
          }

          const idToken = await currentUser.getIdToken();

          const response = await fetch(`/api/email/get-gallery-secrets/${gallery.id}`, {
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          });
          
          if (response.ok) {
            const secrets = await response.json();
            console.log('✅ Secrets caricati:', { hasPassword: !!secrets.password, hasPin: !!secrets.specialPin });
            setPassword(secrets.password || "");
            setSpecialPin(secrets.specialPin || "");
          } else {
            console.error('❌ Errore caricamento secrets:', response.status);
            // Fallback a valori vuoti
            setPassword("");
            setSpecialPin("");
          }
        } catch (error) {
          console.error('❌ Eccezione caricamento secrets:', error);
          setPassword("");
          setSpecialPin("");
        }
      };

      fetchSecrets();

      // Fetch prodotti associati da ordine se esiste bookingId (MULTI-PRODUCT)
      const fetchAssociatedProduct = async () => {
        const bookingId = (gallery as any).bookingId;
        if (!bookingId) {
          setAssociatedProducts([]);
          return;
        }

        setIsLoadingProduct(true);
        try {
          console.log('📦 Caricamento prodotti associati per booking:', bookingId);
          
          // Cerca ordine per bookingId
          const { collection: firestoreCollection, query: firestoreQuery, where: firestoreWhere, getDocs: firestoreGetDocs } = await import('firebase/firestore');
          const ordersQuery = firestoreQuery(
            firestoreCollection(db, 'orders'),
            firestoreWhere('bookingId', '==', bookingId)
          );
          const ordersSnapshot = await firestoreGetDocs(ordersQuery);
          
          if (!ordersSnapshot.empty) {
            const orderData = ordersSnapshot.docs[0].data();
            const prodotti = orderData.prodotti || [];
            
            if (prodotti.length > 0) {
              // CARICA TUTTI I PRODOTTI (non solo il primo)
              const allProducts = prodotti.map((prod: any) => ({
                nome: prod.prodottoNome || 'Prodotto Sconosciuto',
                numeroFoto: prod.prodottoNumeroFoto || 0,
                isCustom: !prod.prodottoId || prod.prodottoId === ''
              }));
              setAssociatedProducts(allProducts);
              console.log(`✅ ${allProducts.length} prodotti associati caricati dall'ordine`);
            } else {
              setAssociatedProducts([]);
            }
          } else {
            // Nessun ordine trovato, prova a prendere dal booking (legacy single product)
            const bookingsQuery = firestoreQuery(
              firestoreCollection(db, 'bookings'),
              firestoreWhere('__name__', '==', bookingId)
            );
            const bookingsSnapshot = await firestoreGetDocs(bookingsQuery);
            
            if (!bookingsSnapshot.empty) {
              const bookingData = bookingsSnapshot.docs[0].data();
              if (bookingData.prodottoId) {
                // Fetch prodotto dal catalogo
                const { getProductById } = await import('@/lib/products');
                const product = await getProductById(bookingData.prodottoId);
                if (product) {
                  setAssociatedProducts([{
                    nome: product.nome,
                    numeroFoto: product.numeroFoto,
                    isCustom: false
                  }]);
                  console.log('✅ Prodotto catalogo caricato da booking (legacy)');
                }
              }
            }
          }
        } catch (error) {
          console.error('❌ Errore caricamento prodotti associati:', error);
          setAssociatedProducts([]);
        } finally {
          setIsLoadingProduct(false);
        }
      };

      fetchAssociatedProduct();

      // Reset loading state quando cambia la galleria
      setIsLoading(false);
    }
  }, [gallery]);

  // Carica foto ogni volta che il modal si apre
  useEffect(() => {
    if (isOpen && gallery && gallery.id) {
      console.log('🔄 Modal aperto - caricamento foto per galleria:', gallery.id);
      loadPhotos();
    }
  }, [isOpen, gallery?.id]);

  // Reset currentGalleryId quando il modal si chiude
  useEffect(() => {
    if (!isOpen) {
      currentGalleryId.current = null;
    }
  }, [isOpen]);

  // Funzione helper per comprimere immagini
  const compressImage = async (file: File): Promise<File> => {
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true
    };
    
    try {
      return await imageCompression(file, options);
    } catch (error) {
      console.error('Errore compressione:', error);
      return file; // Ritorna file originale se la compressione fallisce
    }
  };

  // Gestisce il caricamento dell'immagine di copertina Desktop
  const handleDesktopCoverChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    if (!gallery) return;

    const file = e.target.files[0];
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Tipo di file non supportato",
        description: "L'immagine deve essere un file immagine (JPEG, PNG, ecc.)",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsLoading(true);
      
      // Comprimi l'immagine
      const compressedFile = await compressImage(file);
      
      // Carica su Firebase Storage
      const storageRef = ref(storage, `galleries/${gallery.id}/covers/desktop_${Date.now()}.jpg`);
      await uploadBytesResumable(storageRef, compressedFile);
      const downloadUrl = await getDownloadURL(storageRef);
      
      // Aggiorna lo stato
      setCoverImageDesktopUrl(downloadUrl);
      
      toast({
        title: "Immagine caricata",
        description: "Immagine desktop caricata con successo"
      });
    } catch (error) {
      console.error('Errore caricamento immagine desktop:', error);
      toast({
        title: "Errore",
        description: "Errore durante il caricamento dell'immagine desktop",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Gestisce il caricamento dell'immagine di copertina Mobile
  const handleMobileCoverChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    if (!gallery) return;

    const file = e.target.files[0];
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Tipo di file non supportato",
        description: "L'immagine deve essere un file immagine (JPEG, PNG, ecc.)",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsLoading(true);
      
      // Comprimi l'immagine
      const compressedFile = await compressImage(file);
      
      // Carica su Firebase Storage
      const storageRef = ref(storage, `galleries/${gallery.id}/covers/mobile_${Date.now()}.jpg`);
      await uploadBytesResumable(storageRef, compressedFile);
      const downloadUrl = await getDownloadURL(storageRef);
      
      // Aggiorna lo stato
      setCoverImageMobileUrl(downloadUrl);
      
      toast({
        title: "Immagine caricata",
        description: "Immagine mobile caricata con successo"
      });
    } catch (error) {
      console.error('Errore caricamento immagine mobile:', error);
      toast({
        title: "Errore",
        description: "Errore durante il caricamento dell'immagine mobile",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Funzione per eliminare una foto sia da Firestore che da Storage (memoizzata)
  const deletePhoto = useCallback(async (photoToDelete: PhotoData) => {
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
  }, [gallery, photos, toast]);

  // Funzione per eliminare tutte le foto da Firestore e Storage
  const deleteAllPhotos = useCallback(async () => {
    if (!gallery) return;

    try {
      setIsDeletingPhoto(true);
      console.log(`🗑️ Inizio eliminazione di tutte le ${photos.length} foto per la galleria: ${gallery.id}`);

      const deletePromises = photos.map(async (photo) => {
        try {
          // 1. Elimina il documento da Firestore (nuovo sistema o vecchia collezione ospiti)
          if (photo.id.startsWith('old-guest-')) {
            const oldGuestPhotoId = photo.id.replace('old-guest-', '');
            console.log(`🗑️ Eliminando foto ospite legacy: ${oldGuestPhotoId}`);
            const oldGuestPhotoRef = doc(db, "galleries", gallery.id, "photos", oldGuestPhotoId);
            await deleteDoc(oldGuestPhotoRef);
          } else if (!photo.id.startsWith('storage-')) {
            console.log(`🗑️ Eliminando documento Firestore: ${photo.id}`);
            const photoRef = doc(db, "photos", photo.id);
            await deleteDoc(photoRef);
          }

          // 2. Elimina il file da Firebase Storage
          try {
            const url = new URL(photo.url);
            const pathMatch = url.pathname.match(/\/o\/(.+?)(\?|$)/);

            if (pathMatch) {
              const fullPath = decodeURIComponent(pathMatch[1]);
              console.log(`🗑️ Eliminando foto da Storage: ${fullPath}`);
              const storageRef = ref(storage, fullPath);
              await deleteObject(storageRef);
            } else {
              console.warn(`⚠️ Impossibile estrarre path da URL per eliminazione storage: ${photo.url}`);
            }
          } catch (storageError) {
            console.warn(`⚠️ Errore eliminazione Storage per foto ${photo.id}:`, storageError);
          }
        } catch (error) {
          console.error(`❌ Errore durante l'eliminazione della foto ${photo.id}:`, error);
          // Continua con le altre foto anche se una fallisce
        }
      });

      await Promise.all(deletePromises);

      console.log(`✅ Tutte le ${photos.length} foto sono state processate per l'eliminazione.`);

      // 3. Aggiorna conteggio foto nella galleria a 0
      try {
        const galleryRef = doc(db, "galleries", gallery.id);
        await updateDoc(galleryRef, { 
          photoCount: 0,
          updatedAt: serverTimestamp()
        });
        console.log('✅ Conteggio foto galleria aggiornato a 0');
      } catch (countError) {
        console.warn('⚠️ Errore aggiornamento conteggio foto a 0:', countError);
      }

      // 4. Aggiorna l'array locale delle foto a vuoto
      setPhotos([]);
      toast({
        title: "Tutte le foto eliminate",
        description: `Tutte le ${photos.length} foto sono state rimosse dalla galleria con successo.`
      });

      // 5. Forza il refresh della galleria principale
      window.dispatchEvent(new CustomEvent('galleryPhotosUpdated'));

    } catch (error) {
      console.error('❌ Errore durante l\'eliminazione di tutte le foto:', error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'eliminazione di tutte le foto.",
        variant: "destructive"
      });
    } finally {
      setIsDeletingPhoto(false);
      setIsDeleteDialogOpen(false); // Assicurati che venga chiuso anche questo
    }
  }, [gallery, photos, toast]);

  // Funzione per sbloccare/reset selezione (Admin only)
  const handleUnlockSelection = useCallback(async () => {
    if (!gallery) return;
    
    const confirmed = window.confirm(
      "Sei sicuro di voler sbloccare la selezione? Questo resetterà lo stato a 'pending' e permetterà al cliente di modificare la selezione."
    );
    
    if (!confirmed) return;
    
    try {
      setIsLoading(true);
      const galleryRef = doc(db, "galleries", gallery.id);
      
      await updateDoc(galleryRef, {
        selectionStatus: 'pending',
        selectedPhotoIds: [],
        updatedAt: serverTimestamp()
      });
      
      setSelectionStatus('pending');
      setSelectedPhotoIds([]);
      
      toast({
        title: "Selezione sbloccata",
        description: "Il cliente può ora modificare la selezione foto"
      });
    } catch (error) {
      console.error('Errore sblocco selezione:', error);
      toast({
        title: "Errore",
        description: "Errore durante lo sblocco della selezione",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [gallery, toast]);

  // Salva le modifiche alla galleria (memoizzata per performance)
  const saveGallery = useCallback(async () => {
    if (!gallery) {
      console.error('❌ Galleria non trovata per salvare');
      return;
    }

    console.log('💾 Avvio salvataggio galleria:', gallery.id);
    setIsLoading(true);

    try {
      // VALIDAZIONE: Verifica unicità PIN se impostato
      if (specialTheme !== 'none' && specialPin.trim()) {
        console.log('🔍 Verifica unicità PIN...');
        setIsCheckingPin(true); // Attiva loading indicator
        
        const checkResponse = await fetch('/api/email/check-pin-unique', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pin: specialPin.trim(),
            currentGalleryId: gallery.id
          })
        });

        const checkResult = await checkResponse.json();
        setIsCheckingPin(false); // Disattiva loading indicator
        
        if (!checkResult.unique) {
          toast({
            title: "PIN già in uso",
            description: `Questo PIN è già utilizzato dalla galleria "${checkResult.usedByGalleryName}". Scegli un PIN diverso.`,
            variant: "destructive",
            duration: 5000
          });
          setIsLoading(false);
          return;
        }
        
        console.log('✅ PIN unico, procedo con il salvataggio');
      }

      console.log('📝 Aggiornamento documento galleria...');
      const galleryRef = doc(db, "galleries", gallery.id);
      
      // Usa coverImageDesktop come fallback per vecchia coverImageUrl per retrocompatibilità
      const legacyCoverUrl = coverImageDesktopUrl || coverImageUrl;
      
      // Prepara i dati del tema (SENZA password e specialPin - ora in gallerySecrets)
      const updateData: any = {
        name,
        date,
        location,
        description,
        hasPassword: !!password.trim(), // Solo flag boolean per sapere se c'è password
        coverImageUrl: legacyCoverUrl, // Retrocompatibilità
        coverImageMobile: coverImageMobileUrl || null,
        coverImageDesktop: coverImageDesktopUrl || null,
        youtubeUrls: youtubeUrls.length > 0 ? youtubeUrls : null,
        hasChapters: false,
        // Photo Selection Workflow fields (Task 2)
        selectionEnabled,
        requiredPhotoCount: selectionEnabled ? requiredPhotoCount : null,
        selectionDeadline: selectionEnabled && selectionDeadline ? Timestamp.fromDate(new Date(selectionDeadline)) : null,
        selectionDeadlineEnforced,
        // Client info per invio email PIN (opzionale)
        clientEmail: clientEmail.trim() || null,
        clientName: clientName.trim() || null,
        updatedAt: serverTimestamp()
      };
      
      // Se disattivo la selezione, reset completo dello stato
      if (!selectionEnabled) {
        updateData.selectionStatus = 'pending';
        updateData.selectedPhotoIds = [];
      }

      // Gestisci tema (solo ID tema, NO PIN qui)
      if (specialTheme !== 'none') {
        updateData.specialTheme = specialTheme;
      } else {
        updateData.specialTheme = null;
      }

      // AGGIORNA DOCUMENTO PUBBLICO (senza password/PIN)
      await updateDoc(galleryRef, updateData);

      // SALVA PASSWORD E SPECIAL PIN in collection protetta `gallerySecrets`
      // IMPORTANTE: Password e PIN sono MUTUAMENTE ESCLUSIVI
      const secretsRef = doc(db, "gallerySecrets", gallery.id);
      const secretsData: any = {
        updatedAt: serverTimestamp()
      };
      
      if (specialTheme !== 'none') {
        // GALLERIA SPECIALE: Solo PIN, NO password
        secretsData.specialPin = specialPin.trim() || null;
        secretsData.password = null; // Rimuovi password esplicitamente
        console.log('🔒 Salvando galleria speciale con PIN, password rimossa');
      } else {
        // GALLERIA NORMALE: Solo password, NO PIN
        secretsData.password = password.trim() || null;
        secretsData.specialPin = null; // Rimuovi PIN esplicitamente
        console.log('🔒 Salvando galleria normale con password, PIN rimosso');
      }
      
      // Usa setDoc con merge per creare/aggiornare il documento secrets
      await setDoc(secretsRef, secretsData, { merge: true });

      console.log('✅ Galleria salvata con successo');
      
      // INVIO EMAIL AUTOMATICO: Se galleria speciale con PIN e email cliente fornita
      if (specialTheme !== 'none' && specialPin.trim() && clientEmail.trim()) {
        console.log('📧 Invio email PIN al cliente...');
        
        try {
          // Costruisce URL completo galleria speciale
          const galleryUrl = createAbsoluteUrl("/special-gallery");
          
          const emailResponse = await fetch('/api/email/special-gallery-pin-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              galleryId: gallery.id,
              clientEmail: clientEmail.trim(),
              clientName: clientName.trim() || undefined,
              galleryUrl: galleryUrl
            })
          });

          if (emailResponse.ok) {
            console.log('✅ Email PIN inviata con successo');
            toast({
              title: "Galleria aggiornata e email inviata",
              description: `Email con PIN inviata a ${clientEmail}`,
            });
          } else {
            const errorData = await emailResponse.json().catch(() => ({}));
            console.error('❌ Errore invio email PIN', {
              status: emailResponse.status,
              statusText: emailResponse.statusText,
              error: errorData
            });
            toast({
              title: "Galleria aggiornata",
              description: "Galleria salvata, ma l'invio email ha avuto problemi",
              variant: "destructive"
            });
          }
        } catch (emailError) {
          console.error('❌ Eccezione invio email:', emailError);
          toast({
            title: "Galleria aggiornata",
            description: "Galleria salvata, ma l'invio email non è riuscito",
            variant: "destructive"
          });
        }
      } else {
        toast({
          title: "Galleria aggiornata",
          description: "Le modifiche alla galleria sono state salvate con successo"
        });
      }

      // Invalida cache React Query per aggiornare UI senza reload
      queryClient.invalidateQueries({ queryKey: ['galleries', 'admin'] });
      
      onClose();
    } catch (error) {
      console.error('❌ Errore salvataggio galleria:', error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante il salvataggio delle modifiche",
        variant: "destructive"
      });
    } finally {
      console.log('🔄 Concluso salvataggio galleria, reset loading...');
      setIsLoading(false);
    }
  }, [gallery, coverImageUrl, coverImageMobileUrl, coverImageDesktopUrl, name, date, location, description, password, specialTheme, specialPin, clientEmail, clientName, youtubeUrls, selectionEnabled, requiredPhotoCount, selectionDeadline, selectionDeadlineEnforced, onClose, toast]);

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

      // Invia notifiche ai subscribers
      let notifiedCount = 0;
      try {
        const result = await notifyNewPhotos(
          gallery.id,
          gallery.name,
          'Admin',
          uploadedPhotos.length
        );
        notifiedCount = result.notified || 0;
      } catch (notificationError) {
        console.warn('⚠️ Errore invio notifiche (non blocca upload):', notificationError);
        // Non bloccare l'upload per errori di notifica
      }

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

      // Mostra modale di conferma con statistiche
      setUploadStats({
        photosCount: uploadedPhotos.length,
        notifiedCount: notifiedCount
      });
      setShowSuccessModal(true);

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
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="sm:max-w-4xl max-h-[95vh] flex flex-col gap-4" 
        aria-describedby="edit-gallery-dialog-description"
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Modifica Galleria: {gallery.name}</DialogTitle>
          <DialogDescription id="edit-gallery-dialog-description">
            Modifica i dettagli della galleria e gestisci le foto
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2 flex-shrink-0">
            <TabsTrigger value="details">Dettagli</TabsTrigger>
            <TabsTrigger value="photos">Foto ({photos.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 overflow-y-auto flex-1 pr-2 min-h-0">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Nome Evento</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome dell'Evento"
                />
              </div>
              <div>
                <Label htmlFor="date">Data dell'Evento</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  placeholder="Data dell'Evento"
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
              {/* Password Field - Hidden if special theme is selected */}
              {specialTheme === 'none' && (
                <div>
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={handlePasswordChange}
                      placeholder="Password di accesso"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}
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

            {/* Prodotti Associati Section - MULTI-PRODUCT SUPPORT */}
            {(associatedProducts.length > 0 || isLoadingProduct) && (
              <div className="border-t pt-4">
                <div className="bg-sage/10 border border-sage/30 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <Info className="w-5 h-5 text-sage mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="font-semibold text-sage-dark">
                          📦 Prodotti Associati {associatedProducts.length > 0 && `(${associatedProducts.length})`}
                        </h4>
                        {isLoadingProduct && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                            Caricamento...
                          </span>
                        )}
                      </div>
                      
                      {associatedProducts.length > 0 ? (
                        <div className="space-y-2">
                          {associatedProducts.map((product, idx) => (
                            <div key={idx} className="bg-white border border-sage/20 rounded-lg p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="text-sm font-semibold text-gray-800">
                                      {product.nome}
                                    </p>
                                    {product.isCustom ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                                        Custom
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                                        Catalogo
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-600">
                                    🎯 <strong>{product.numeroFoto} foto</strong> richieste per questo prodotto
                                  </p>
                                  {product.isCustom && (
                                    <p className="text-xs text-gray-500 mt-1 italic">
                                      ℹ️ Prodotto personalizzato creato per questo ordine
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        !isLoadingProduct && (
                          <p className="text-sm text-gray-600">Nessun prodotto associato</p>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Special Theme Section - Hidden if password is set */}
            {!password.trim() && (
              <div className="border-t pt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="specialTheme">Tema Stagionale</Label>
                  <Select value={specialTheme} onValueChange={handleSpecialThemeChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona tema (opzionale)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessun tema (galleria normale)</SelectItem>
                    {availableThemes.map((theme) => (
                      <SelectItem key={theme.id} value={theme.id}>
                        {theme.icon} {theme.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {password.trim() ? '🔒 Rimuovi la password per abilitare i temi speciali' : `Tema corrente: ${specialTheme !== 'none' ? availableThemes.find(t => t.id === specialTheme)?.name : 'Nessuno'}`}
                </p>
              </div>

              {specialTheme !== 'none' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="specialPin">PIN Galleria Speciale</Label>
                    <div className="relative">
                      <Input
                        id="specialPin"
                        type={showSpecialPin ? "text" : "password"}
                        value={specialPin}
                        onChange={(e) => setSpecialPin(e.target.value)}
                        placeholder="Es. 2024"
                        className="pr-10"
                        disabled={isCheckingPin}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSpecialPin(!showSpecialPin)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                        disabled={isCheckingPin}
                      >
                        {showSpecialPin ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {isCheckingPin && (
                      <p className="text-sm text-blue-600 flex items-center gap-2">
                        <span className="animate-spin">⏳</span>
                        Verifica unicità PIN in corso...
                      </p>
                    )}
                    {!isCheckingPin && (
                      <p className="text-sm text-muted-foreground">
                        PIN univoco per accedere a questa galleria speciale
                      </p>
                    )}
                  </div>

                  <div className="space-y-4 border-t pt-4">
                    <p className="text-sm font-medium text-muted-foreground">📧 Notifica Email Cliente (opzionale)</p>
                    
                    <div className="space-y-2">
                      <Label htmlFor="clientName">Nome Cliente</Label>
                      <Input
                        id="clientName"
                        type="text"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        placeholder="Es. Mario Rossi"
                      />
                      <p className="text-sm text-muted-foreground">
                        Nome per personalizzare l'email
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="clientEmail">Email Cliente</Label>
                      <Input
                        id="clientEmail"
                        type="email"
                        value={clientEmail}
                        onChange={(e) => setClientEmail(e.target.value)}
                        placeholder="Es. cliente@example.com"
                      />
                      <p className="text-sm text-muted-foreground">
                        Se inserita, verrà inviata automaticamente una email con il PIN al salvataggio
                      </p>
                    </div>
                  </div>
                </>
              )}
              </div>
            )}

            {/* Booking Link Info (Read-only) */}
            {(gallery as any)?.bookingId && (
              <div className="border-t pt-4">
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <span className="text-green-700 font-semibold">📋 Galleria creata da Prenotazione</span>
                  <span className="text-sm text-green-600">ID: {(gallery as any).bookingId}</span>
                </div>
              </div>
            )}

            {/* Photo Selection Workflow Section (Task 2) */}
            <div className="border-t pt-4 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="selectionEnabled" className="text-base font-semibold">
                    📸 Modalità Selezione Foto
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="selectionEnabled"
                      checked={selectionEnabled}
                      onChange={(e) => setSelectionEnabled(e.target.checked)}
                      className="w-4 h-4 text-sage border-gray-300 rounded focus:ring-sage"
                    />
                    <span className="text-sm text-muted-foreground">
                      {selectionEnabled ? 'Attiva' : 'Disattivata'}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Abilita la selezione foto per album personalizzati. I clienti potranno scegliere le foto preferite direttamente dalla galleria.
                </p>
              </div>
              
              {/* Stato Selezione (visibile solo se abilitata) */}
              {selectionEnabled && (
                <div className="p-4 border rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-gray-800">📊 Stato Selezione</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        {selectionStatus === 'completed' ? (
                          <span className="text-green-600 font-medium">
                            ✅ Selezione completata - {selectedPhotoIds.length}/{requiredPhotoCount} foto selezionate
                          </span>
                        ) : (
                          <span className="text-orange-600 font-medium">
                            ⏳ In attesa - {selectedPhotoIds.length}/{requiredPhotoCount} foto selezionate
                          </span>
                        )}
                      </p>
                    </div>
                    
                    {selectionStatus === 'completed' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleUnlockSelection}
                        disabled={isLoading}
                        className="bg-white hover:bg-red-50 text-red-600 border-red-300"
                      >
                        🔓 Sblocca Selezione
                      </Button>
                    )}
                  </div>
                  
                  {selectedPhotoIds.length > 0 && (
                    <div className="text-xs text-gray-600 bg-white/60 rounded p-2">
                      <strong>Foto selezionate ({selectedPhotoIds.length}):</strong>
                      <div className="mt-1 max-h-20 overflow-y-auto">
                        {selectedPhotoIds.slice(0, 10).map((id, idx) => (
                          <span key={id} className="inline-block bg-sage/20 text-sage px-2 py-0.5 rounded mr-1 mb-1 text-xs">
                            #{idx + 1}
                          </span>
                        ))}
                        {selectedPhotoIds.length > 10 && (
                          <span className="text-gray-500">... +{selectedPhotoIds.length - 10} altre</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectionEnabled && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="requiredPhotoCount">Numero Foto Richieste</Label>
                      <Input
                        id="requiredPhotoCount"
                        type="number"
                        min="1"
                        max="500"
                        value={requiredPhotoCount}
                        onChange={(e) => setRequiredPhotoCount(parseInt(e.target.value) || 50)}
                        placeholder="Es. 50"
                      />
                      <p className="text-xs text-muted-foreground">
                        Quante foto deve selezionare il cliente
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="selectionDeadline">Scadenza Selezione</Label>
                      <Input
                        id="selectionDeadline"
                        type="date"
                        value={selectionDeadline}
                        onChange={(e) => setSelectionDeadline(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Data limite per completare la selezione
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <input
                      type="checkbox"
                      id="selectionDeadlineEnforced"
                      checked={selectionDeadlineEnforced}
                      onChange={(e) => setSelectionDeadlineEnforced(e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <Label htmlFor="selectionDeadlineEnforced" className="text-sm font-medium cursor-pointer">
                        Blocca selezione dopo scadenza
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Se disattivato, il cliente può ancora selezionare dopo la deadline (soft deadline)
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-3">
              <Label>Video YouTube (opzionale)</Label>
              
              {/* Lista URL esistenti */}
              {youtubeUrls.length > 0 && (
                <div className="space-y-2">
                  {youtubeUrls.map((url, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-200">
                      <span className="text-sm flex-1 truncate">{url}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setYoutubeUrls(urls => urls.filter((_, i) => i !== index))}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Input per nuovo URL */}
              <div className="flex gap-2">
                <Input
                  value={newYoutubeUrl}
                  onChange={(e) => setNewYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (newYoutubeUrl.trim()) {
                      setYoutubeUrls([...youtubeUrls, newYoutubeUrl.trim()]);
                      setNewYoutubeUrl("");
                    }
                  }}
                  disabled={!newYoutubeUrl.trim()}
                >
                  Aggiungi
                </Button>
              </div>
              <p className="text-xs text-gray-500">Aggiungi più video YouTube che saranno mostrati in uno slider nella galleria</p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="coverImageDesktop">Immagine Copertina Desktop (16:9)</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="coverImageDesktop"
                    type="file"
                    accept="image/*"
                    onChange={handleDesktopCoverChange}
                  />
                  {coverImageDesktopUrl && (
                    <img 
                      src={coverImageDesktopUrl} 
                      alt="Anteprima desktop" 
                      className="h-16 w-28 object-cover rounded"
                    />
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">Per dispositivi desktop e tablet</p>
              </div>

              <div>
                <Label htmlFor="coverImageMobile">Immagine Copertina Mobile (9:16)</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="coverImageMobile"
                    type="file"
                    accept="image/*"
                    onChange={handleMobileCoverChange}
                  />
                  {coverImageMobileUrl && (
                    <img 
                      src={coverImageMobileUrl} 
                      alt="Anteprima mobile" 
                      className="h-16 w-9 object-cover rounded"
                    />
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">Per dispositivi mobili</p>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={saveGallery} disabled={isLoading}>
                {isLoading ? "Salvando..." : "Salva Modifiche"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="photos" className="space-y-4 overflow-y-auto flex-1 pr-2 min-h-0">
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
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={loadPhotos}
                    disabled={isLoading}
                  >
                    {isLoading ? "Caricamento..." : "Ricarica"}
                  </Button>
                  {photos.length > 0 && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          disabled={isLoading}
                        >
                          <Trash className="h-4 w-4 mr-1" />
                          Elimina Tutte
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Elimina Tutte le Foto</AlertDialogTitle>
                          <AlertDialogDescription>
                            Sei sicuro di voler eliminare tutte le {photos.length} foto dalla galleria? 
                            Questa azione eliminerà definitivamente tutte le foto sia da Firestore che da Storage e non può essere annullata.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={deleteAllPhotos}
                            disabled={isDeletingPhoto}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            {isDeletingPhoto ? "Eliminando..." : "Elimina Tutte"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
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

    {/* Modale conferma upload con statistiche */}
    <PhotoUploadSuccessModal
      open={showSuccessModal}
      onOpenChange={setShowSuccessModal}
      photosCount={uploadStats.photosCount}
      notifiedCount={uploadStats.notifiedCount}
    />
    </>
  );
}