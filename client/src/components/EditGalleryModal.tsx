import { useState, useEffect, useRef, useCallback, ChangeEvent } from "react";
import { doc, updateDoc, collection, getDocs, getDoc, addDoc, serverTimestamp, where, query, deleteDoc, Timestamp, setDoc, arrayRemove, arrayUnion, writeBatch } from "firebase/firestore";
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
import { uploadPhotos, computeFileHash, UploadSummary, UploadProgressInfo, UploadedPhoto } from "../lib/photoUploader";
import { generateGalleryThumbnails } from "../lib/thumbnails";
import { notifyNewPhotos } from "../lib/email";
import { UploadCloud, Image, Trash, Eye, EyeOff, Mail, Loader2, Link2, X as XIcon, Briefcase, RefreshCw, AlertTriangle, Zap, Monitor, Smartphone, Crosshair, Check, GalleryHorizontal, Palette } from "lucide-react";
import { GALLERY_HEADER_THEMES } from '@/lib/gallery-header-themes';
import GalleryHeaderOverlay from './gallery/GalleryHeaderOverlay';
import { getActiveJobTypes } from "@/lib/job-types";
import type { JobTypeFE } from "@shared/job-types";
import { getAllJobs } from "@/lib/jobs";
import type { Job } from "@shared/jobs-types";
import { PhotoUploadSuccessModal } from "./PhotoUploadSuccessModal";
import { getAllThemes } from "@shared/special-themes";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
import { Progress } from "./ui/progress";
import imageCompression from 'browser-image-compression';
import { queryClient } from "../lib/queryClient";
import { Info } from 'lucide-react';
import { createAbsoluteUrl } from "../lib/basePath";
import { PhotoService, type Photo } from "../lib/photos";
import { MultiClienteSelector } from "./MultiClienteSelector";

// Helper function to extract YouTube video ID from URL - supports multiple formats
function extractYouTubeVideoId(url: string): string | null {
  if (!url.trim()) return null;
  const trimmedUrl = url.trim();
  
  // Direct video ID (11 characters alphanumeric with - and _)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmedUrl)) return trimmedUrl;
  
  // Standard YouTube URL patterns - extract ID from various formats
  const regExp = /^.*(youtu.be\/|youtube.com\/watch\?v=|youtube.com\/embed\/|youtube.com\/v\/|youtube.com\/shorts\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([a-zA-Z0-9_-]{11}).*/;
  const match = trimmedUrl.match(regExp);
  if (match && match[2] && match[2].length === 11) return match[2];
  
  return null;
}

// Helper function to validate YouTube URLs - returns true if we can extract a valid ID
function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}

// Helper to check if a URL is already in the list (by video ID, not exact string)
function isYouTubeUrlDuplicate(url: string, existingUrls: string[]): boolean {
  const newId = extractYouTubeVideoId(url);
  if (!newId) return false;
  return existingUrls.some(existingUrl => extractYouTubeVideoId(existingUrl) === newId);
}

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
  contentHash?: string;
  thumbnailUrl?: string;
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
  jobType?: string;
  jobId?: string;
}

interface EditGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  gallery: GalleryType | null;
}

export default function EditGalleryModal({ isOpen, onClose, gallery }: EditGalleryModalProps) {
  const [name, setName] = useState("");
  const [galleryCode, setGalleryCode] = useState(""); // Codice galleria editabile per QR code
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [specialTheme, setSpecialTheme] = useState<string>("none");
  const [specialPin, setSpecialPin] = useState("");
  const [originalSpecialPin, setOriginalSpecialPin] = useState(""); // PIN originale per confronto
  const [showSpecialPin, setShowSpecialPin] = useState(false);
  const [clientEmail, setClientEmail] = useState(""); // Email cliente per invio PIN
  const [clientName, setClientName] = useState(""); // Nome cliente per personalizzazione email
  const [youtubeUrls, setYoutubeUrls] = useState<string[]>([]);
  const [originalYoutubeUrls, setOriginalYoutubeUrls] = useState<string[]>([]); // Video originali per confronto
  const [newYoutubeUrl, setNewYoutubeUrl] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverImageMobileUrl, setCoverImageMobileUrl] = useState("");
  const [coverImageDesktopUrl, setCoverImageDesktopUrl] = useState("");
  const [coverImageDesktopPosition, setCoverImageDesktopPosition] = useState<{x: number, y: number}>({ x: 50, y: 50 });
  const [coverImageMobilePosition, setCoverImageMobilePosition] = useState<{x: number, y: number}>({ x: 50, y: 50 });
  const [headerTheme, setHeaderTheme] = useState<string>('classico');
  const [showThemePickerDialog, setShowThemePickerDialog] = useState(false);
  const [showCoverPickerFor, setShowCoverPickerFor] = useState<'desktop' | 'mobile' | null>(null);
  const [showCoverPositionEditorFor, setShowCoverPositionEditorFor] = useState<'desktop' | 'mobile' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingPin, setIsCheckingPin] = useState(false); // Loading state per validazione PIN
  
  // Stati per Photo Selection Workflow (Task 2)
  const [selectionEnabled, setSelectionEnabled] = useState(false);
  const [unlimitedSelection, setUnlimitedSelection] = useState(false); // Selezione libera senza limite
  const [selectionMode, setSelectionMode] = useState<'like' | 'dislike'>('like'); // Modalità selezione inversa
  const [requiredPhotoCount, setRequiredPhotoCount] = useState<number>(50);
  const [selectionDeadline, setSelectionDeadline] = useState<string>("");
  const [selectionDeadlineEnforced, setSelectionDeadlineEnforced] = useState(true);
  const [selectionStatus, setSelectionStatus] = useState<'pending' | 'completed'>('pending');
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  
  // Stati per prodotti associati (da booking/ordine) - MULTI-PRODUCT SUPPORT
  const [associatedProducts, setAssociatedProducts] = useState<Array<{ prodottoId?: string; nome: string; numeroFoto: number; isCustom: boolean }>>([]);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  
  // 🔢 Logica priorità numero foto: campo manuale > somma prodotti
  // Calcola somma foto dai prodotti associati
  const productsSumPhotoCount = associatedProducts.reduce((sum, p) => sum + (p.numeroFoto || 0), 0);
  
  // Controlla se ci sono prodotti custom senza numero foto definito
  const hasProductsWithNoPhotoCount = associatedProducts.some(p => p.isCustom && (!p.numeroFoto || p.numeroFoto === 0));
  
  // Controlla se la selezione è già iniziata (blocca modifiche al campo manuale)
  const isSelectionStarted = selectedPhotoIds.length > 0;
  
  // Il campo manuale ha la priorità se è > 0 e diverso dalla somma prodotti
  // OPPURE se ci sono prodotti custom senza numero (obbliga manuale)
  const isManualOverrideActive = requiredPhotoCount > 0 && requiredPhotoCount !== productsSumPhotoCount;
  
  const availableThemes = getAllThemes();
  const [activeTab, setActiveTab] = useState<string>("details");
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedFileHashes, setSelectedFileHashes] = useState<Map<string, string>>(new Map()); // index-name → hash
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: any}>({});
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingThumbs, setIsGeneratingThumbs] = useState(false);
  const [thumbProgress, setThumbProgress] = useState<{ generated: number; remaining: number } | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<PhotoData | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
  const [photoFilter, setPhotoFilter] = useState<'all' | 'admin' | 'guest' | 'legacy'>('all');
  
  // Stati per modale successo upload
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [uploadStats, setUploadStats] = useState({ photosCount: 0, notifiedCount: 0 });
  
  // Stati per Unisci Gallerie
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [allGalleries, setAllGalleries] = useState<Array<{ id: string; name: string; code: string; photoCount: number }>>([]);
  const [targetGalleryId, setTargetGalleryId] = useState<string>("");
  const [isMerging, setIsMerging] = useState(false);
  
  // Stati per associazione cliente
  const [clientiIds, setClientiIds] = useState<string[]>([]);
  const [originalClientiIds, setOriginalClientiIds] = useState<string[]>([]);
  const [isSavingCliente, setIsSavingCliente] = useState(false);

  // Job Type e collegamento Job
  const [jobType, setJobType] = useState<string>('none');
  const [jobId, setJobId] = useState<string>('');
  const [originalJobId, setOriginalJobId] = useState<string>('');
  const [originalJobType, setOriginalJobType] = useState<string>('none');
  const [jobTypes, setJobTypes] = useState<JobTypeFE[]>([]);
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [jobSearch, setJobSearch] = useState<string>('');
  const [linkedJobName, setLinkedJobName] = useState<string>('');
  const [jobDropdownOpen, setJobDropdownOpen] = useState(false);
  const [isSavingJobLink, setIsSavingJobLink] = useState(false);

  // Stato per invio password via email
  const [isSendingPassword, setIsSendingPassword] = useState(false);
  
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

  // Funzione per inviare password via email
  const handleSendPassword = async () => {
    if (!gallery || !password.trim()) {
      toast({
        title: "Errore",
        description: "Nessuna password impostata per questa galleria",
        variant: "destructive"
      });
      return;
    }
    
    // Raccoglie destinatari da tutti i clienti associati + email manuale (dedup)
    const recipients: Array<{email: string; name?: string}> = [];
    const seen = new Set<string>();
    const addR = (email?: string | null, name?: string | null) => {
      const e = (email || '').trim().toLowerCase();
      if (!e || seen.has(e)) return;
      seen.add(e);
      recipients.push({ email: email!.trim(), name: name?.trim() || undefined });
    };
    for (const cId of clientiIds) {
      try {
        const cDoc = await getDoc(doc(db, 'clienti', cId));
        if (cDoc.exists()) {
          const cd = cDoc.data();
          if (cd.email) addR(cd.email, `${cd.nome || ''} ${cd.cognome || ''}`.trim());
        }
      } catch (error) {
        console.error(`Errore recupero cliente ${cId}:`, error);
      }
    }
    addR(clientEmail, clientName);

    if (recipients.length === 0) {
      toast({
        title: "Email non disponibile",
        description: "Associa almeno un cliente con email per inviare la password",
        variant: "destructive"
      });
      return;
    }

    setIsSendingPassword(true);

    try {
      const results = await Promise.all(recipients.map(async (r) => {
        try {
          const response = await fetch("/api/email/gallery-password-notification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              galleryId: gallery.id,
              clientEmail: r.email,
              clientName: r.name,
            }),
          });
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error(`❌ Errore invio password → ${r.email}:`, errorData);
            return false;
          }
          console.log(`✅ Password inviata a ${r.email}`);
          return true;
        } catch (err) {
          console.error(`❌ Eccezione invio password → ${r.email}:`, err);
          return false;
        }
      }));
      const ok = results.filter(Boolean).length;
      const total = results.length;
      if (ok === total) {
        toast({
          title: "Password inviata",
          description: total === 1
            ? `Email inviata con successo a ${recipients[0].email}`
            : `Email inviata a ${total} destinatari`,
        });
      } else {
        toast({
          title: ok > 0 ? "Invio parziale" : "Errore",
          description: `Email inviate: ${ok}/${total}`,
          variant: ok > 0 ? "default" : "destructive"
        });
      }
    } catch (error) {
      console.error('Errore invio password:', error);
      toast({
        title: "Errore",
        description: "Errore di connessione durante l'invio",
        variant: "destructive"
      });
    } finally {
      setIsSendingPassword(false);
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

  // Carica le foto dalla galleria usando PhotoService centralizzato
  const loadPhotos = useCallback(async () => {
    if (!gallery) {
      console.log('❌ loadPhotos: Gallery non definita');
      return;
    }

    console.log('🔄 [EditGalleryModal] Caricamento foto per galleria:', gallery.id);
    setIsLoading(true);
    try {
      // 🔧 COMPLETEZZA: usa getGalleryPhotosComplete() (query NON ordinata
      // `where('galleryId','==',id)`) anziché getGalleryPhotos() che usa
      // `orderBy('createdAt')`. Firestore esclude SILENZIOSAMENTE dai risultati
      // ordinati i documenti privi del campo `createdAt` (foto importate da
      // script esterni / upload ospiti legacy), quindi l'editor mostrava meno
      // foto del reale `photoCount`. La variante completa non ordina e non
      // dipende da un indice composito, quindi non scarta nulla. Vedi
      // .agents/memory/gallery-photo-completeness.md.
      const servicePhotos = await PhotoService.getGalleryPhotosComplete(gallery.id);

      // getGalleryPhotosComplete() non ordina: ordiniamo qui per data decrescente
      // (più recenti prima) per preservare l'ordine di visualizzazione che
      // getGalleryPhotos() forniva. Ordiniamo sul createdAt GREZZO (prima del
      // default sotto), così le foto prive di createdAt → 0 → finiscono in coda.
      const toMillis = (v: any): number => {
        if (!v) return 0;
        if (typeof v.seconds === 'number') return v.seconds * 1000;
        if (typeof v.toDate === 'function') return v.toDate().getTime();
        if (v instanceof Date) return v.getTime();
        const t = new Date(v).getTime();
        return Number.isNaN(t) ? 0 : t;
      };
      const sortedServicePhotos = [...servicePhotos].sort(
        (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)
      );

      // Converti da Photo a PhotoData per compatibilità con il resto del componente
      const loadedPhotos: PhotoData[] = sortedServicePhotos.map(photo => ({
        id: photo.id,
        name: photo.name || "",
        url: photo.url || "",
        contentType: photo.contentType || "image/jpeg",
        size: photo.size || 0,
        createdAt: photo.createdAt || new Date(),
        galleryId: photo.galleryId || gallery.id,
        uploaderEmail: photo.uploaderEmail,
        uploaderName: photo.uploaderName,
        uploaderRole: photo.uploadedBy === 'guest' ? 'guest' : 'admin',
        uploadedBy: photo.uploadedBy || 'legacy',
        contentHash: photo.contentHash,
      } as PhotoData));

      console.log('📸 [EditGalleryModal] Foto caricate via PhotoService:', loadedPhotos.length);
      console.log('📊 Breakdown:', {
        admin: loadedPhotos.filter(p => p.uploadedBy === 'admin').length,
        guest: loadedPhotos.filter(p => p.uploadedBy === 'guest').length,
        legacy: loadedPhotos.filter(p => p.uploadedBy === 'legacy').length
      });

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
  }, [gallery, toast]);

  // Carica i dati della galleria quando si apre il modal
  // Usiamo isOpen come trigger principale per garantire dati freschi dopo le modifiche
  useEffect(() => {
    if (isOpen && gallery && gallery.id) {
      console.log('🔄 Caricamento dati galleria nel modal:', gallery.id, 'clientiIds:', (gallery as any).clientiIds || (gallery as any).clienteId);
      currentGalleryId.current = gallery.id;

      setName(gallery.name || "");
      setGalleryCode(gallery.code || ""); // Codice per QR code
      setDate(gallery.date || "");
      setLocation(gallery.location || "");
      setDescription(gallery.description || "");
      setSpecialTheme(gallery.specialTheme || "none");
      setClientEmail((gallery as any).clientEmail || "");
      setClientName((gallery as any).clientName || "");
      const galleryAny = gallery as any;
      const loadedClientiIds: string[] = Array.isArray(galleryAny.clientiIds) && galleryAny.clientiIds.length > 0
        ? galleryAny.clientiIds
        : (galleryAny.clienteId ? [galleryAny.clienteId] : []);
      setClientiIds(loadedClientiIds);
      setOriginalClientiIds(loadedClientiIds);
      const loadedJobType = (gallery as any).jobType || 'none';
      const loadedJobId = (gallery as any).jobId || '';
      setJobType(loadedJobType);
      setJobId(loadedJobId);
      setOriginalJobId(loadedJobId);
      setOriginalJobType(loadedJobType);
      setJobSearch('');
      setLinkedJobName('');
      setJobDropdownOpen(false);
      
      // Gestione retrocompatibilità: se c'è youtubeUrl singolo, convertilo in array
      const urls: string[] = [];
      if (gallery.youtubeUrls && gallery.youtubeUrls.length > 0) {
        urls.push(...gallery.youtubeUrls);
      } else if (gallery.youtubeUrl) {
        urls.push(gallery.youtubeUrl);
      }
      setYoutubeUrls(urls);
      setOriginalYoutubeUrls([...urls]); // Salva video originali per confronto
      setNewYoutubeUrl("");
      
      setCoverImageUrl(gallery.coverImageUrl || "");
      setCoverImageMobileUrl(gallery.coverImageMobile || "");
      setCoverImageDesktopUrl(gallery.coverImageDesktop || "");
      setCoverImageDesktopPosition((gallery as any).coverImageDesktopPosition || { x: 50, y: 50 });
      setCoverImageMobilePosition((gallery as any).coverImageMobilePosition || { x: 50, y: 50 });
      setHeaderTheme((gallery as any).headerTheme || 'classico');
      
      // Popola campi Photo Selection Workflow (Task 2)
      const hasProductRequirements = Array.isArray((gallery as any).productRequirements) && (gallery as any).productRequirements.length > 0;
      const gallerySelectionEnabled = (gallery as any).selectionEnabled || false;
      // ✅ VINCOLO AUTO: se ci sono prodotti associati → selezione DEVE essere attiva e NON libera
      const effectiveSelectionEnabled = hasProductRequirements ? true : gallerySelectionEnabled;
      setSelectionEnabled(effectiveSelectionEnabled);
      // Selezione libera: se unlimitedSelection è true OPPURE se selezione attiva e requiredPhotoCount <= 0 (legacy)
      const storedUnlimited = (gallery as any).unlimitedSelection === true;
      const storedCount = (gallery as any).requiredPhotoCount || 0;
      // Legacy fix: se selezione attiva ma count è 0 e non ci sono productRequirements, trattala come illimitata
      // ✅ VINCOLO AUTO: se ci sono prodotti → mai selezione libera
      const isUnlimited = hasProductRequirements ? false : (storedUnlimited || (gallerySelectionEnabled && storedCount <= 0 && !hasProductRequirements));
      setUnlimitedSelection(isUnlimited);
      // 🔥 FIX Task 8: NON usare default 50, lascia 0 se undefined (evita sovrascrittura dati)
      setRequiredPhotoCount(storedCount);
      setSelectionDeadlineEnforced((gallery as any).selectionDeadlineEnforced !== false); // default true
      setSelectionMode((gallery as any).selectionMode === 'dislike' ? 'dislike' : 'like');
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
            setOriginalSpecialPin(secrets.specialPin || ""); // Salva PIN originale per confronto
          } else {
            console.error('❌ Errore caricamento secrets:', response.status);
            // Fallback a valori vuoti
            setPassword("");
            setSpecialPin("");
            setOriginalSpecialPin("");
          }
        } catch (error) {
          console.error('❌ Eccezione caricamento secrets:', error);
          setPassword("");
          setSpecialPin("");
          setOriginalSpecialPin("");
        }
      };

      fetchSecrets();

      // Fetch prodotti associati da ordine se esiste bookingId (MULTI-PRODUCT)
      const fetchAssociatedProduct = async () => {
        // 🔥 FIX Task 7: PRIORITY 1 - Carica productRequirements se esiste nella galleria
        if ((gallery as any).productRequirements && (gallery as any).productRequirements.length > 0) {
          const productReqs = (gallery as any).productRequirements;

          // 🔥 AUTO-ESPANSIONE BUNDLE: se un prodotto è un bundle nel catalogo, espandilo
          let hasExpansions = false;
          const expandedReqs: any[] = [];

          for (const prod of productReqs) {
            const prodottoId = prod.prodottoId;
            if (prodottoId && prodottoId !== '') {
              try {
                const pSnap = await getDoc(doc(db, 'products', prodottoId));
                if (pSnap.exists()) {
                  const pData = pSnap.data();
                  if (pData.isBundle && pData.bundleItems && pData.bundleItems.length > 0) {
                    hasExpansions = true;
                    const parentName = prod.prodottoNome || pData.nome;
                    for (const bi of pData.bundleItems) {
                      const biQty = bi.quantita || 1;
                      for (let i = 0; i < biQty; i++) {
                        expandedReqs.push({
                          prodottoId: bi.prodottoId || null,
                          prodottoNome: biQty > 1
                            ? `${bi.prodottoNome} (${i + 1}/${biQty}) - ${parentName}`
                            : `${bi.prodottoNome} - ${parentName}`,
                          prodottoNumeroFoto: bi.numeroFoto || 0,
                        });
                      }
                    }
                    console.log(`📦 Bundle auto-espanso: ${parentName}`);
                    continue;
                  }
                }
              } catch (e) {
                console.warn('Errore fetch prodotto per espansione bundle:', prodottoId, e);
              }
            }
            expandedReqs.push({
              prodottoId: prod.prodottoId || null,
              prodottoNome: prod.prodottoNome || 'Prodotto Sconosciuto',
              prodottoNumeroFoto: prod.prodottoNumeroFoto || 0,
            });
          }

          const products = expandedReqs.map((prod: any) => ({
            prodottoId: prod.prodottoId || undefined,
            nome: prod.prodottoNome || 'Prodotto Sconosciuto',
            numeroFoto: prod.prodottoNumeroFoto || 0,
            isCustom: !prod.prodottoId || prod.prodottoId === ''
          }));
          setAssociatedProducts(products);
          console.log(`✅ ${products.length} prodotti caricati da gallery.productRequirements:`, products);

          // Se ci sono state espansioni bundle → aggiorna automaticamente Firestore
          if (hasExpansions) {
            const newRequiredCount = expandedReqs.reduce((s: number, p: any) => s + (p.prodottoNumeroFoto || 0), 0);
            updateDoc(doc(db, 'galleries', gallery.id), {
              productRequirements: expandedReqs,
              requiredPhotoCount: newRequiredCount,
              updatedAt: serverTimestamp(),
            }).catch(e => console.warn('Errore salvataggio espansione bundle in Firestore:', e));
            console.log(`✅ Bundle espansi auto-salvati in Firestore. Totale foto richieste: ${newRequiredCount}`);
          }

          return; // STOP qui se productRequirements esiste
        }
        
        // PRIORITY 2 - Se NO productRequirements, cerca da orders/bookings (legacy)
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
  }, [isOpen, gallery]);

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

  // Carica JobTypes e Jobs quando il modal si apre
  useEffect(() => {
    if (!isOpen) return;
    getActiveJobTypes().then(types => setJobTypes(types)).catch(console.error);
    getAllJobs().then(jobs => setAvailableJobs(jobs)).catch(console.error);
  }, [isOpen]);

  // Helper: ID clienti collegati a un job (clientiIds + fallback legacy clienteId)
  const getJobClientIds = (j: Job): string[] =>
    [...new Set([...(j.clientiIds || []), ...(j.clienteId ? [j.clienteId] : [])])];

  // Job suggeriti in base ai clienti associati alla galleria (ordinamento dropdown)
  const isClientJob = (j: Job): boolean =>
    clientiIds.length > 0 && getJobClientIds(j).some(id => clientiIds.includes(id));

  // Selezione job dal dropdown: auto-compila categoria e clienti mancanti
  const handleSelectJobInEdit = (j: Job) => {
    setJobId(j.id);
    setJobSearch('');
    setJobDropdownOpen(false);
    // Auto-imposta la categoria dal job se non ancora impostata
    if (jobType === 'none' && j.jobType) {
      setJobType(j.jobType);
    }
    // Aggiungi i clienti del job non ancora associati alla galleria
    const toAdd = getJobClientIds(j).filter(id => !clientiIds.includes(id));
    if (toAdd.length > 0) {
      setClientiIds(prev => [...prev, ...toAdd.filter(id => !prev.includes(id))]);
      toast({
        title: toAdd.length === 1
          ? "Cliente del lavoro aggiunto"
          : `${toAdd.length} clienti del lavoro aggiunti`,
        description: "Premi \"Aggiorna\" per salvare collegamento e clienti",
      });
    }
  };

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

      // 5. Forza il refresh della galleria principale e invalida cache
      window.dispatchEvent(new CustomEvent('galleryPhotosUpdated'));
      queryClient.invalidateQueries({ queryKey: ['gallery', gallery.id] });
      queryClient.invalidateQueries({ queryKey: ['gallery-photos', gallery.id] });

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

      // 5. Forza il refresh della galleria principale e invalida cache
      window.dispatchEvent(new CustomEvent('galleryPhotosUpdated'));
      queryClient.invalidateQueries({ queryKey: ['gallery', gallery.id] });
      queryClient.invalidateQueries({ queryKey: ['gallery-photos', gallery.id] });

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
      "Sei sicuro di voler sbloccare la selezione? Le foto già scelte verranno mantenute e il cliente potrà modificare la selezione."
    );
    
    if (!confirmed) return;
    
    try {
      setIsLoading(true);
      const galleryRef = doc(db, "galleries", gallery.id);
      
      await updateDoc(galleryRef, {
        selectionStatus: 'pending',
        updatedAt: serverTimestamp()
      });
      
      setSelectionStatus('pending');
      
      toast({
        title: "Selezione sbloccata",
        description: "Il cliente può ora modificare la selezione foto. Le foto già scelte sono state mantenute."
      });
      
      queryClient.invalidateQueries({ queryKey: ['gallery', gallery.id] });
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

  // ─── Ricarica prodotti dall'ordine/booking di origine ───────────────────────
  const handleRefetchProducts = useCallback(async () => {
    if (!gallery) return;
    setIsLoadingProduct(true);
    setAssociatedProducts([]);
    try {
      const bookingId = (gallery as any).bookingId;
      // Priority 1: ricarica da gallery.productRequirements (Firestore fresco)
      const freshSnap = await getDoc(doc(db, 'galleries', gallery.id));
      if (freshSnap.exists()) {
        const freshData = freshSnap.data();
        if (freshData.productRequirements?.length > 0) {
          const productReqs = freshData.productRequirements;
          // Auto-espansione bundle
          let hasExpansions = false;
          const expandedReqs: any[] = [];
          for (const prod of productReqs) {
            if (prod.prodottoId) {
              try {
                const pSnap = await getDoc(doc(db, 'products', prod.prodottoId));
                if (pSnap.exists()) {
                  const pData = pSnap.data();
                  if (pData.isBundle && pData.bundleItems?.length > 0) {
                    hasExpansions = true;
                    const parentName = prod.prodottoNome || pData.nome;
                    for (const bi of pData.bundleItems) {
                      const biQty = bi.quantita || 1;
                      for (let i = 0; i < biQty; i++) {
                        expandedReqs.push({
                          prodottoId: bi.prodottoId || null,
                          prodottoNome: biQty > 1 ? `${bi.prodottoNome} (${i + 1}/${biQty}) - ${parentName}` : `${bi.prodottoNome} - ${parentName}`,
                          prodottoNumeroFoto: bi.numeroFoto || 0,
                        });
                      }
                    }
                    continue;
                  }
                }
              } catch {}
            }
            expandedReqs.push({ prodottoId: prod.prodottoId || null, prodottoNome: prod.prodottoNome || 'Prodotto Sconosciuto', prodottoNumeroFoto: prod.prodottoNumeroFoto || 0 });
          }
          setAssociatedProducts(expandedReqs.map((p: any) => ({
            prodottoId: p.prodottoId || undefined,
            nome: p.prodottoNome || 'Prodotto Sconosciuto',
            numeroFoto: p.prodottoNumeroFoto || 0,
            isCustom: !p.prodottoId
          })));
          if (hasExpansions) {
            const newCount = expandedReqs.reduce((s: number, p: any) => s + (p.prodottoNumeroFoto || 0), 0);
            updateDoc(doc(db, 'galleries', gallery.id), { productRequirements: expandedReqs, requiredPhotoCount: newCount, updatedAt: serverTimestamp() }).catch(() => {});
          }
          toast({ title: '✅ Prodotti ricaricati', description: `${expandedReqs.length} prodotti caricati dalla galleria.` });
          return;
        }
      }
      // Priority 2: cerca dall'ordine via bookingId
      if (bookingId) {
        const { collection: col, query: q, where: w, getDocs: gd } = await import('firebase/firestore');
        const ordersSnap = await gd(q(col(db, 'orders'), w('bookingId', '==', bookingId)));
        if (!ordersSnap.empty) {
          const prodotti = ordersSnap.docs[0].data().prodotti || [];
          setAssociatedProducts(prodotti.map((p: any) => ({
            nome: p.prodottoNome || 'Prodotto Sconosciuto',
            numeroFoto: p.prodottoNumeroFoto || 0,
            isCustom: !p.prodottoId
          })));
          toast({ title: '✅ Prodotti ricaricati', description: `${prodotti.length} prodotti caricati dall'ordine collegato.` });
          return;
        }
      }
      toast({ title: 'Nessun prodotto trovato', description: 'Nessun prodotto trovato nella galleria o nell\'ordine collegato.', variant: 'destructive' });
    } catch (err) {
      console.error('Errore ricarica prodotti:', err);
      toast({ title: 'Errore', description: 'Errore durante il caricamento dei prodotti.', variant: 'destructive' });
    } finally {
      setIsLoadingProduct(false);
    }
  }, [gallery, db, toast]);

  // ─── Attiva selezione + salva subito in Firestore ────────────────────────────
  const handleRepairSelection = useCallback(async () => {
    if (!gallery) return;
    try {
      setIsLoading(true);
      await updateDoc(doc(db, 'galleries', gallery.id), {
        selectionEnabled: true,
        updatedAt: serverTimestamp()
      });
      setSelectionEnabled(true);
      toast({
        title: '✅ Selezione attivata',
        description: 'La selezione foto è ora attiva per questa galleria. I prodotti erano già configurati correttamente.'
      });
    } catch (err) {
      console.error('Errore attivazione selezione:', err);
      toast({ title: 'Errore', description: 'Impossibile attivare la selezione.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [gallery, db, toast]);

  // Carica tutte le gallerie per il dialog Unisci
  const loadAllGalleries = useCallback(async () => {
    try {
      const galleriesSnapshot = await getDocs(
        query(collection(db, 'galleries'), where('active', '==', true))
      );
      const galleries = galleriesSnapshot.docs
        .filter(d => d.id !== gallery?.id) // Escludi la galleria corrente
        .map(d => ({
          id: d.id,
          name: d.data().name || `Galleria ${d.id.substring(0, 8)}`,
          code: d.data().code || d.id.substring(0, 8),
          photoCount: d.data().photoCount || 0
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setAllGalleries(galleries);
    } catch (error) {
      console.error('Errore caricamento gallerie:', error);
    }
  }, [gallery?.id]);

  // Funzione per unire questa galleria in un'altra (sposta le foto)
  const mergeIntoGallery = useCallback(async () => {
    if (!gallery || !targetGalleryId) {
      toast({
        title: "Errore",
        description: "Seleziona una galleria di destinazione",
        variant: "destructive"
      });
      return;
    }
    
    const targetGallery = allGalleries.find(g => g.id === targetGalleryId);
    if (!targetGallery) return;
    
    setIsMerging(true);
    
    try {
      console.log(`🔄 Unione galleria ${gallery.id} -> ${targetGalleryId}`);
      
      // ====== FASE 1: Raccogli tutte le foto esistenti nella destinazione per deduplicazione ======
      const targetPhotosQuery = query(
        collection(db, 'photos'),
        where('galleryId', '==', targetGalleryId)
      );
      const targetPhotosSnapshot = await getDocs(targetPhotosQuery);
      const existingUrls = new Set(targetPhotosSnapshot.docs.map(d => d.data().url));
      
      // Aggiungi anche le foto legacy della destinazione al set di URL esistenti
      const targetLegacySnapshot = await getDocs(collection(db, 'galleries', targetGalleryId, 'photos'));
      targetLegacySnapshot.docs.forEach(d => {
        const url = d.data().url || d.data().photoUrl;
        if (url) existingUrls.add(url);
      });
      
      let movedCount = 0;
      let skippedCount = 0;
      let legacyMovedCount = 0;
      
      // ====== FASE 2: Sposta foto dalla collezione principale (photos) ======
      const photosQuery = query(
        collection(db, 'photos'),
        where('galleryId', '==', gallery.id)
      );
      const photosSnapshot = await getDocs(photosQuery);
      
      for (const photoDoc of photosSnapshot.docs) {
        const photoData = photoDoc.data();
        const photoUrl = photoData.url || photoData.photoUrl;
        
        // Salta se foto già esiste nella destinazione
        if (photoUrl && existingUrls.has(photoUrl)) {
          skippedCount++;
          console.log(`⏭️ Foto saltata (duplicato): ${photoData.name}`);
          continue;
        }
        
        // Aggiorna galleryId e galleryCode
        await updateDoc(doc(db, 'photos', photoDoc.id), {
          galleryId: targetGalleryId,
          galleryCode: targetGallery.code,
          updatedAt: serverTimestamp()
        });
        movedCount++;
        if (photoUrl) existingUrls.add(photoUrl); // Aggiungi per evitare duplicati successivi
      }
      
      // ====== FASE 3: Migra foto legacy dalla sottocollezione galleries/{id}/photos ======
      const legacyPhotosSnapshot = await getDocs(collection(db, 'galleries', gallery.id, 'photos'));
      console.log(`📸 Trovate ${legacyPhotosSnapshot.docs.length} foto legacy nella sottocollezione`);
      
      for (const legacyDoc of legacyPhotosSnapshot.docs) {
        const legacyData = legacyDoc.data();
        const legacyUrl = legacyData.url || legacyData.photoUrl;
        
        // Salta se foto già esiste nella destinazione
        if (legacyUrl && existingUrls.has(legacyUrl)) {
          skippedCount++;
          console.log(`⏭️ Foto legacy saltata (duplicato): ${legacyData.name || legacyDoc.id}`);
          continue;
        }
        
        // Crea nuovo documento nella collezione photos principale con i dati legacy
        const newPhotoData: Record<string, any> = {
          ...legacyData,
          galleryId: targetGalleryId,
          galleryCode: targetGallery.code,
          migratedFrom: gallery.id,
          migratedAt: serverTimestamp(),
          uploadedBy: legacyData.uploadedBy || 'legacy',
          // Garantisce sempre un createdAt: senza, la foto verrebbe scartata
          // dalle query paginate orderBy('createdAt') della galleria pubblica.
          createdAt: legacyData.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        
        // Rimuovi campi undefined
        Object.keys(newPhotoData).forEach(key => {
          if (newPhotoData[key] === undefined) delete newPhotoData[key];
        });
        
        await addDoc(collection(db, 'photos'), newPhotoData);
        legacyMovedCount++;
        if (legacyUrl) existingUrls.add(legacyUrl);
      }
      
      // ====== FASE 4: Ricalcola conteggio foto reale nella destinazione ======
      const finalTargetPhotosQuery = query(
        collection(db, 'photos'),
        where('galleryId', '==', targetGalleryId)
      );
      const finalTargetSnapshot = await getDocs(finalTargetPhotosQuery);
      const actualPhotoCount = finalTargetSnapshot.docs.length;
      
      await updateDoc(doc(db, 'galleries', targetGalleryId), {
        photoCount: actualPhotoCount,
        updatedAt: serverTimestamp()
      });
      
      // ====== FASE 5: Archivia la galleria sorgente (solo dopo migrazione completa) ======
      await updateDoc(doc(db, 'galleries', gallery.id), {
        active: false,
        mergedInto: targetGalleryId,
        mergedAt: serverTimestamp(),
        photoCount: 0,
        updatedAt: serverTimestamp()
      });
      
      // Invalida cache
      queryClient.invalidateQueries({ queryKey: ['galleries'] });
      queryClient.invalidateQueries({ queryKey: ['gallery-photos', targetGalleryId] });
      
      const totalMoved = movedCount + legacyMovedCount;
      toast({
        title: "Unione completata!",
        description: `${totalMoved} foto spostate in "${targetGallery.name}"${legacyMovedCount > 0 ? ` (${legacyMovedCount} legacy migrate)` : ''}. ${skippedCount > 0 ? `${skippedCount} duplicati saltati.` : ''} Galleria originale archiviata.`,
      });
      
      setShowMergeDialog(false);
      onClose(); // Chiudi il modal
      
    } catch (error) {
      console.error('Errore unione gallerie:', error);
      toast({
        title: "Errore",
        description: "Errore durante l'unione delle gallerie",
        variant: "destructive"
      });
    } finally {
      setIsMerging(false);
    }
  }, [gallery, targetGalleryId, allGalleries, toast, onClose]);

  // Salva le modifiche alla galleria (memoizzata per performance)
  const saveGallery = useCallback(async () => {
    if (!gallery) {
      console.error('❌ Galleria non trovata per salvare');
      return;
    }

    console.log('💾 Avvio salvataggio galleria:', gallery.id);
    setIsLoading(true);

    try {
      // VALIDAZIONE: Verifica unicità CODICE GALLERIA se modificato (case-insensitive)
      const newCode = galleryCode.trim();
      const codeChanged = newCode.toLowerCase() !== (gallery.code || '').toLowerCase();
      if (codeChanged && newCode) {
        console.log('🔍 Verifica unicità codice galleria (case-insensitive)...');
        
        // Recupera tutte le gallerie e verifica manualmente (Firestore non supporta query case-insensitive)
        const allGalleriesSnapshot = await getDocs(collection(db, 'galleries'));
        const newCodeLower = newCode.toLowerCase();
        
        // Controlla se esiste un'altra galleria con lo stesso codice (case-insensitive, esclusa quella corrente)
        const conflictingGallery = allGalleriesSnapshot.docs.find(d => {
          if (d.id === gallery.id) return false;
          const existingCode = d.data().code || '';
          return existingCode.toLowerCase() === newCodeLower;
        });
        
        if (conflictingGallery) {
          const conflictData = conflictingGallery.data();
          toast({
            title: "Codice già in uso",
            description: `Questo codice è già utilizzato dalla galleria "${conflictData.name || conflictingGallery.id}". Scegli un codice diverso.`,
            variant: "destructive",
            duration: 5000
          });
          setIsLoading(false);
          return;
        }
        
        console.log('✅ Codice galleria unico, procedo con il salvataggio');
      }
      
      // VALIDAZIONE: Verifica unicità PIN se impostato
      if (specialTheme !== 'none' && specialPin.trim()) {
        console.log('🔍 Verifica unicità PIN...');
        setIsCheckingPin(true); // Attiva loading indicator
        
        try {
          // Aggiungi timeout di 10 secondi per evitare blocchi
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          
          const checkResponse = await fetch('/api/email/check-pin-unique', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pin: specialPin.trim(),
              currentGalleryId: gallery.id
            }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);

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
        } catch (pinError: any) {
          setIsCheckingPin(false);
          if (pinError.name === 'AbortError') {
            console.warn('⚠️ Timeout verifica PIN, procedo comunque');
            // Procedi comunque in caso di timeout
          } else {
            console.error('❌ Errore verifica PIN:', pinError);
            toast({
              title: "Errore verifica PIN",
              description: "Impossibile verificare unicità PIN. Riprova.",
              variant: "destructive"
            });
            setIsLoading(false);
            return;
          }
        }
      }

      console.log('📝 Aggiornamento documento galleria...');
      const galleryRef = doc(db, "galleries", gallery.id);
      
      // Usa coverImageDesktop come fallback per vecchia coverImageUrl per retrocompatibilità
      const legacyCoverUrl = coverImageDesktopUrl || coverImageUrl;
      
      // Prepara i dati del tema (SENZA password e specialPin - ora in gallerySecrets)
      const updateData: any = {
        name,
        code: galleryCode.trim() || gallery.code, // Codice per QR code (mantiene case originale per compatibilità QR)
        date,
        location,
        description,
        hasPassword: !!password.trim(), // Solo flag boolean per sapere se c'è password
        coverImageUrl: legacyCoverUrl, // Retrocompatibilità
        coverImageMobile: coverImageMobileUrl || null,
        coverImageDesktop: coverImageDesktopUrl || null,
        coverImageMobilePosition: coverImageMobileUrl ? coverImageMobilePosition : null,
        coverImageDesktopPosition: coverImageDesktopUrl ? coverImageDesktopPosition : null,
        headerTheme: headerTheme || 'classico',
        youtubeUrls: youtubeUrls.length > 0 ? youtubeUrls : null,
        hasChapters: false,
        // Photo Selection Workflow fields (Task 2)
        // 🔢 Logica: selezione libera (unlimitedSelection) ha priorità, poi manuale, poi somma prodotti
        selectionEnabled,
        unlimitedSelection: selectionEnabled ? unlimitedSelection : false,
        requiredPhotoCount: selectionEnabled 
          ? (unlimitedSelection ? 0 : (requiredPhotoCount > 0 ? requiredPhotoCount : (productsSumPhotoCount > 0 ? productsSumPhotoCount : 0)))
          : null,
        selectionDeadline: selectionEnabled && selectionDeadline ? Timestamp.fromDate(new Date(selectionDeadline)) : null,
        selectionDeadlineEnforced,
        selectionMode: selectionEnabled ? selectionMode : 'like',
        // ✅ Reset reminder se la scadenza cambia (così il nuovo reminder può essere inviato)
        ...(() => {
          const origDeadline = (gallery as any)?.selectionDeadline;
          const origStr = origDeadline?.toDate?.()?.toISOString?.() || null;
          const newStr = selectionEnabled && selectionDeadline ? new Date(selectionDeadline).toISOString() : null;
          const deadlineChanged = origStr !== newStr;
          return deadlineChanged ? { selectionReminderSent: false, selectionReminderSentAt: null } : {};
        })(),
        // Client info per invio email PIN (opzionale)
        clientEmail: clientEmail.trim() || null,
        clientName: clientName.trim() || null,
        clienteId: clientiIds[0] || null,
        clientiIds: clientiIds.length > 0 ? clientiIds : null,
        jobType: jobType !== 'none' ? jobType : null,
        jobId: jobId || null,
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

      // Aggiorna productRequirements se ci sono prodotti associati modificati
      if (associatedProducts.length > 0) {
        updateData.productRequirements = associatedProducts.map((product) => ({
          prodottoId: product.prodottoId || null,
          prodottoNome: product.nome,
          prodottoNumeroFoto: product.numeroFoto
        }));
        
        const newSum = associatedProducts.reduce((sum, p) => sum + (p.numeroFoto || 0), 0);
        
        // ✅ VINCOLO AUTO: prodotti presenti → selezione SEMPRE attiva e NON libera
        updateData.selectionEnabled = true;
        updateData.unlimitedSelection = false;
        updateData.requiredPhotoCount = newSum;
        // Aggiorna anche lo stato locale per coerenza UI
        setSelectionEnabled(true);
        setUnlimitedSelection(false);
        
        console.log('📦 ProductRequirements aggiornati:', updateData.productRequirements, 'Totale foto:', newSum, '→ selectionEnabled forzato TRUE');
      }

      // AGGIORNA DOCUMENTO PUBBLICO (senza password/PIN)
      await updateDoc(galleryRef, updateData);

      // SINCRONIZZA clientiIds: aggiorna sourceRefs.galleryIds sui clienti aggiunti/rimossi
      const addedClienti = clientiIds.filter(id => !originalClientiIds.includes(id));
      const removedClienti = originalClientiIds.filter(id => !clientiIds.includes(id));
      if (addedClienti.length > 0 || removedClienti.length > 0) {
        const clientePromises: Promise<void>[] = [];
        for (const removedId of removedClienti) {
          clientePromises.push(
            updateDoc(doc(db, 'clienti', removedId), {
              'sourceRefs.galleryIds': arrayRemove(gallery.id)
            })
          );
        }
        for (const addedId of addedClienti) {
          clientePromises.push(
            updateDoc(doc(db, 'clienti', addedId), {
              'sourceRefs.galleryIds': arrayUnion(gallery.id)
            })
          );
        }
        if (clientePromises.length > 0) await Promise.all(clientePromises);
        setOriginalClientiIds([...clientiIds]);
        console.log(`🔗 clientiIds sync galleria: +${addedClienti.length} / -${removedClienti.length}`);
      }

      // SINCRONIZZA jobId: aggiorna galleryIds sui job collegati
      if (jobId !== originalJobId) {
        const syncPromises: Promise<void>[] = [];
        if (originalJobId) {
          syncPromises.push(
            updateDoc(doc(db, 'jobs', originalJobId), {
              galleryIds: arrayRemove(gallery.id),
              updatedAt: serverTimestamp()
            })
          );
        }
        if (jobId) {
          syncPromises.push(
            updateDoc(doc(db, 'jobs', jobId), {
              galleryIds: arrayUnion(gallery.id),
              updatedAt: serverTimestamp()
            })
          );
        }
        if (syncPromises.length > 0) {
          await Promise.all(syncPromises);
          console.log(`🔗 jobId sync: ${originalJobId || 'none'} → ${jobId || 'none'} per galleria ${gallery.id}`);
        }
        setOriginalJobId(jobId);
      }

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
      // Aggiungi timeout di 15 secondi per evitare blocchi
      try {
        const secretsPromise = setDoc(secretsRef, secretsData, { merge: true });
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout salvataggio secrets')), 15000)
        );
        await Promise.race([secretsPromise, timeoutPromise]);
        console.log('✅ Secrets salvati con successo');
      } catch (secretsError: any) {
        console.error('❌ Errore salvataggio secrets:', secretsError);
        // Se è un timeout, mostra messaggio ma non bloccare
        if (secretsError.message?.includes('Timeout')) {
          toast({
            title: "Attenzione",
            description: "Il salvataggio del PIN potrebbe non essere completato. Verifica e riprova se necessario.",
            variant: "destructive"
          });
        } else {
          throw secretsError; // Rilancia altri errori
        }
      }

      console.log('✅ Galleria salvata con successo');
      
      // SALVA clientEmail e clientName nella galleria per notifiche future
      if (specialTheme !== 'none' && (clientEmail.trim() || clientName.trim())) {
        await updateDoc(galleryRef, {
          clientEmail: clientEmail.trim() || null,
          clientName: clientName.trim() || null
        });
      }

      // INVIO EMAIL AUTOMATICO: Solo se il PIN è stato CAMBIATO (non ad ogni salvataggio)
      const pinIsChanged = specialPin.trim() !== originalSpecialPin.trim();
      const isNewPin = !originalSpecialPin.trim() && specialPin.trim(); // PIN nuovo (prima non c'era)
      
      // Costruisci lista destinatari (clienti associati + email manuale)
      const pinRecipients: Array<{email: string; name?: string}> = [];
      const pinSeenEmails = new Set<string>();
      const addPinRecipient = (email?: string | null, name?: string | null) => {
        const e = (email || '').trim().toLowerCase();
        if (!e || pinSeenEmails.has(e)) return;
        pinSeenEmails.add(e);
        pinRecipients.push({ email: email!.trim(), name: name?.trim() || undefined });
      };
      for (const cId of clientiIds) {
        try {
          const cDoc = await getDoc(doc(db, 'clienti', cId));
          if (cDoc.exists()) {
            const cd = cDoc.data();
            if (cd.email) addPinRecipient(cd.email, `${cd.nome || ''} ${cd.cognome || ''}`.trim());
          }
        } catch (err) { console.warn(`⚠️ Errore recupero cliente ${cId}:`, err); }
      }
      addPinRecipient(clientEmail, clientName);

      if (specialTheme !== 'none' && specialPin.trim() && pinRecipients.length > 0 && (pinIsChanged || isNewPin)) {
        console.log(`📧 Invio email PIN a ${pinRecipients.length} destinatario/i (PIN cambiato)...`);

        try {
          await new Promise(resolve => setTimeout(resolve, 500));

          const sendResults = await Promise.all(pinRecipients.map(async (r) => {
            try {
              const resp = await fetch('/api/email/special-gallery-pin-notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  galleryId: gallery.id,
                  clientEmail: r.email,
                  clientName: r.name,
                })
              });
              if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                console.error(`❌ Errore email PIN → ${r.email}:`, err);
                return false;
              }
              console.log(`✅ Email PIN inviata a ${r.email}`);
              return true;
            } catch (err) {
              console.error(`❌ Eccezione email PIN → ${r.email}:`, err);
              return false;
            }
          }));

          const ok = sendResults.filter(Boolean).length;
          const total = sendResults.length;
          if (ok === total) {
            toast({
              title: "Galleria aggiornata e email inviata",
              description: total === 1
                ? `Email con PIN inviata a ${pinRecipients[0].email}`
                : `Email con PIN inviata a ${total} destinatari`,
            });
          } else {
            toast({
              title: "Galleria aggiornata",
              description: `Email PIN inviate: ${ok}/${total}`,
              variant: ok > 0 ? "default" : "destructive"
            });
          }
        } catch (emailError) {
          console.error('❌ Eccezione invio email:', emailError);
          toast({
            title: "Galleria aggiornata",
            description: `Galleria salvata, ma l'invio email non è riuscito: ${emailError instanceof Error ? emailError.message : 'Errore sconosciuto'}`,
            variant: "destructive"
          });
        }
      } else {
        // NOTIFICA VIDEO YOUTUBE: Se ci sono nuovi video e c'è email cliente
        const newVideos = youtubeUrls.filter(url => !originalYoutubeUrls.includes(url));
        const hasNewVideos = newVideos.length > 0;
        
        // Recupera email cliente: prima da clientEmail, poi dal documento cliente associato
        let finalClientEmail = clientEmail.trim();
        let finalClientName = clientName.trim();
        
        if (!finalClientEmail && clientiIds.length > 0) {
          // Recupera email dal primo cliente associato (per retrocompat notifiche YouTube)
          try {
            const clienteDoc = await getDoc(doc(db, 'clienti', clientiIds[0]));
            if (clienteDoc.exists()) {
              const clienteData = clienteDoc.data();
              finalClientEmail = clienteData.email || '';
              if (!finalClientName) {
                finalClientName = `${clienteData.nome || ''} ${clienteData.cognome || ''}`.trim();
              }
              console.log('📧 Email recuperata dal cliente associato:', finalClientEmail);
            }
          } catch (clienteError) {
            console.error('❌ Errore recupero email cliente:', clienteError);
          }
        }
        
        const hasClientEmail = finalClientEmail !== '';

        if (hasNewVideos && hasClientEmail) {
          console.log('📹 Nuovi video rilevati, invio notifica email...');
          console.log('📹 Video nuovi:', newVideos.length);
          console.log('📹 Email destinatario:', finalClientEmail);
          
          try {
            const { auth } = await import("../lib/firebase");
            const currentUser = auth.currentUser;
            
            if (currentUser) {
              const idToken = await currentUser.getIdToken();
              
              const videoEmailResponse = await fetch('/api/email/notify-youtube-video', {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                  clientEmail: finalClientEmail,
                  clientName: finalClientName || undefined,
                  galleryName: name,
                  galleryCode: galleryCode || gallery.code,
                  videoCount: newVideos.length
                })
              });

              if (videoEmailResponse.ok) {
                console.log('✅ Email notifica video inviata con successo');
                toast({
                  title: "Galleria aggiornata e notifica inviata",
                  description: `Il cliente e stato avvisato dei nuovi video`,
                });
              } else {
                const errorData = await videoEmailResponse.json().catch(() => ({}));
                console.error('❌ Errore invio email video:', errorData);
                toast({
                  title: "Galleria aggiornata",
                  description: `Video aggiunti, ma la notifica email non e stata inviata`,
                  variant: "destructive"
                });
              }
            }
          } catch (videoEmailError) {
            console.error('❌ Eccezione invio email video:', videoEmailError);
            toast({
              title: "Galleria aggiornata",
              description: "Video aggiunti, notifica email non inviata",
              variant: "destructive"
            });
          }
        } else {
          toast({
            title: "Galleria aggiornata",
            description: "Le modifiche alla galleria sono state salvate con successo"
          });
        }
      }

      // Invalida cache React Query per aggiornare UI senza reload
      queryClient.invalidateQueries({ queryKey: ['galleries', 'admin'] });
      // Invalida anche la cache della singola galleria (per client che la stanno visualizzando)
      queryClient.invalidateQueries({ queryKey: ['gallery', gallery.id] });
      queryClient.invalidateQueries({ queryKey: ['gallery', gallery.code] });
      queryClient.invalidateQueries({ queryKey: ['gallery-photos', gallery.id] });
      
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
  }, [gallery, galleryCode, coverImageUrl, coverImageMobileUrl, coverImageDesktopUrl, coverImageDesktopPosition, coverImageMobilePosition, headerTheme, name, date, location, description, password, specialTheme, specialPin, clientEmail, clientName, clientiIds, originalClientiIds, youtubeUrls, originalYoutubeUrls, selectionEnabled, unlimitedSelection, selectionMode, requiredPhotoCount, selectionDeadline, selectionDeadlineEnforced, associatedProducts, onClose, toast]);

  // Controlla se un file è già stato caricato (per nome OPPURE per hash contenuto)
  const checkForDuplicates = (files: File[]): { uniqueFiles: File[], duplicates: string[] } => {
    const existingPhotoNames = new Set(photos.map(p => p.name));
    const existingPhotoHashes = new Set(photos.map(p => p.contentHash).filter(Boolean) as string[]);
    const uniqueFiles: File[] = [];
    const duplicates: string[] = [];

    files.forEach((file, idx) => {
      const key = `${idx}-${file.name}`;
      const hash = selectedFileHashes.get(key);
      const isDuplicateByName = existingPhotoNames.has(file.name);
      const isDuplicateByHash = hash ? existingPhotoHashes.has(hash) : false;

      if (isDuplicateByName || isDuplicateByHash) {
        duplicates.push(file.name);
      } else {
        uniqueFiles.push(file);
      }
    });

    return { uniqueFiles, duplicates };
  };

  // Carica nuove foto alla galleria
  const handleGenerateThumbnails = async () => {
    if (!gallery?.id) return;
    setIsGeneratingThumbs(true);
    setThumbProgress(null);
    try {
      const result = await generateGalleryThumbnails(gallery.id, (p) => {
        setThumbProgress({ generated: p.generated, remaining: p.remaining });
      });

      if (result.generated === 0 && result.remaining === 0) {
        toast({
          title: "Miniature già presenti",
          description: "Tutte le foto di questa galleria hanno già una miniatura.",
        });
      } else {
        const parts = [`${result.generated} miniature create`];
        if (result.failed) parts.push(`${result.failed} non riuscite`);
        if (result.remaining) parts.push(`${result.remaining} ancora da generare (riprova)`);
        toast({
          title: "Miniature generate",
          description: parts.join(", ") + ".",
        });
      }

      // Aggiorna la vista così le nuove miniature compaiono subito
      window.dispatchEvent(new CustomEvent('galleryPhotosUpdated'));
      queryClient.invalidateQueries({ queryKey: ['gallery', gallery.id] });
      queryClient.invalidateQueries({ queryKey: ['gallery-photos', gallery.id] });
      loadPhotos();
    } catch (error: any) {
      console.error('❌ Errore generazione miniature:', error);
      toast({
        title: "Errore",
        description: "Generazione miniature non riuscita. " + (error?.message || ''),
        variant: "destructive",
      });
    } finally {
      setIsGeneratingThumbs(false);
      setThumbProgress(null);
    }
  };

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
      const filesToUpload = uniqueFiles;
      const isBulk = filesToUpload.length > 50;

      // Salvataggio progressivo su Firestore: accumula foto completate e le salva in batch da 20
      // In questo modo Firestore non viene bombardato di 800 scritture simultanee alla fine
      const FIRESTORE_BATCH_SIZE = 20;
      let pendingBatch: UploadedPhoto[] = [];
      let totalSaved = 0;

      const flushToFirestore = async (forceAll = false) => {
        if (pendingBatch.length === 0) return;
        if (!forceAll && pendingBatch.length < FIRESTORE_BATCH_SIZE) return;
        const toSave = [...pendingBatch];
        pendingBatch = [];
        const batch = writeBatch(db);
        toSave.forEach(photo => {
          const docRef = doc(collection(db, "photos"));
          batch.set(docRef, {
            name: photo.name,
            url: photo.url,
            ...(photo.thumbnailUrl ? { thumbnailUrl: photo.thumbnailUrl } : {}),
            ...(photo.contentHash ? { contentHash: photo.contentHash } : {}),
            size: photo.size,
            contentType: photo.contentType,
            createdAt: photo.createdAt || serverTimestamp(),
            galleryId: gallery.id,
            uploadedBy: 'admin',
            uploaderEmail: 'admin@wedding-gallery.app',
            uploaderName: 'Fotografo',
            uploaderUid: 'admin',
            likeCount: 0,
            commentCount: 0,
            position: 0
          });
        });
        await batch.commit();
        totalSaved += toSave.length;
        console.log(`💾 Batch Firestore: ${totalSaved} foto salvate finora`);
      };

      // Throttle aggiornamenti UI progress (max ogni 400ms per non congelare React con 800 voci)
      let lastProgressSet = 0;
      const throttledSetProgress = (p: typeof uploadProgress) => {
        const now = Date.now();
        if (now - lastProgressSet >= 400) {
          lastProgressSet = now;
          setUploadProgress(p);
        }
      };

      // Carica le foto su Firebase Storage con concorrenza adattiva e salvataggio progressivo
      const uploadedPhotos = await uploadPhotos(
        gallery.id,
        filesToUpload,
        isBulk ? 4 : 2, // più slot per batch grandi
        throttledSetProgress,
        (summary) => setUploadSummary(summary),
        async (photo) => {
          // Chiamato appena ogni singola foto è caricata su Storage
          pendingBatch.push(photo);
          await flushToFirestore(); // salva se il buffer è pieno
        }
      );

      // Flush finale: salva le foto rimaste nel buffer
      await flushToFirestore(true);

      console.log(`✅ ${uploadedPhotos.length} foto caricate, ${totalSaved} salvate in Firestore`);

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

      // Forza il refresh della galleria principale e invalida cache
      window.dispatchEvent(new CustomEvent('galleryPhotosUpdated'));
      queryClient.invalidateQueries({ queryKey: ['gallery', gallery.id] });
      queryClient.invalidateQueries({ queryKey: ['gallery-photos', gallery.id] });

      // Genera le miniature per le nuove foto in background (best-effort, non blocca la UI).
      // Quando finisce, aggiorna la vista così le miniature compaiono automaticamente.
      generateGalleryThumbnails(gallery.id)
        .then((p) => {
          if (p.generated > 0) {
            window.dispatchEvent(new CustomEvent('galleryPhotosUpdated'));
            queryClient.invalidateQueries({ queryKey: ['gallery', gallery.id] });
            queryClient.invalidateQueries({ queryKey: ['gallery-photos', gallery.id] });
            loadPhotos();
          }
        })
        .catch((err) => console.warn('⚠️ Generazione miniature in background fallita (non blocca upload):', err));

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
    setSelectedFileHashes(new Map());

    // Calcola hash in background (non bloccante)
    (async () => {
      const hashMap = new Map<string, string>();
      await Promise.all(files.map(async (file, idx) => {
        try {
          const hash = await computeFileHash(file);
          hashMap.set(`${idx}-${file.name}`, hash);
        } catch {
          // fallback: il controllo sarà solo per nome
        }
      }));
      setSelectedFileHashes(new Map(hashMap));
    })();
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
                <Label htmlFor="galleryCode">Codice Galleria (QR code)</Label>
                <Input
                  id="galleryCode"
                  value={galleryCode}
                  onChange={(e) => setGalleryCode(e.target.value)}
                  placeholder="Es: ABC12345 o -dAIkIEK"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Inserisci esattamente come appare nel QR code (maiuscole/minuscole)
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
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
              <div>
                <Label htmlFor="location">Luogo</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Luogo dell'evento"
                />
              </div>
            </div>

            {/* Password Field - Hidden if special theme is selected */}
            {specialTheme === 'none' && (
              <div>
                <Label htmlFor="password">Password</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
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
                  {/* Pulsante Invia Password al Cliente */}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleSendPassword}
                    disabled={!password.trim() || isSendingPassword}
                    title="Invia password al cliente via email"
                    className="shrink-0"
                  >
                    {isSendingPassword ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                {password.trim() && (
                  <p className="text-xs text-muted-foreground mt-1">
                    📧 Clicca sull'icona email per inviare la password al cliente
                  </p>
                )}
              </div>
            )}

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

            {/* Clienti Associati - Multi-cliente */}
            <div className="space-y-2">
              <MultiClienteSelector
                values={clientiIds}
                onChange={setClientiIds}
                label="Clienti Associati"
                placeholder="Cerca e aggiungi cliente..."
                emptyHint="Nessun cliente associato — le email automatiche non verranno inviate"
                disabled={isSavingCliente}
              />
              {(() => {
                const added = clientiIds.filter(id => !originalClientiIds.includes(id));
                const removed = originalClientiIds.filter(id => !clientiIds.includes(id));
                const hasChanges = added.length > 0 || removed.length > 0;
                if (!hasChanges) return null;
                return (
                  <div className="flex items-center justify-between gap-2 px-1">
                    <p className="text-xs text-sage-dark">
                      Modifiche non salvate: {added.length > 0 && `+${added.length} aggiunto/i`}
                      {added.length > 0 && removed.length > 0 && ', '}
                      {removed.length > 0 && `-${removed.length} rimosso/i`}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-sage hover:bg-sage/90 text-white h-8"
                      disabled={isSavingCliente || !gallery}
                      data-testid="button-save-clienti"
                      onClick={async () => {
                        if (!gallery) return;
                        setIsSavingCliente(true);
                        try {
                          const galleryRef = doc(db, "galleries", gallery.id);
                          await updateDoc(galleryRef, {
                            clienteId: clientiIds[0] || null,
                            clientiIds: clientiIds.length > 0 ? clientiIds : null,
                            updatedAt: serverTimestamp()
                          });
                          const clientePromises: Promise<void>[] = [];
                          for (const removedId of removed) {
                            clientePromises.push(
                              updateDoc(doc(db, 'clienti', removedId), {
                                'sourceRefs.galleryIds': arrayRemove(gallery.id)
                              })
                            );
                          }
                          for (const addedId of added) {
                            clientePromises.push(
                              updateDoc(doc(db, 'clienti', addedId), {
                                'sourceRefs.galleryIds': arrayUnion(gallery.id)
                              })
                            );
                          }
                          if (clientePromises.length > 0) await Promise.all(clientePromises);
                          setOriginalClientiIds([...clientiIds]);
                          console.log(`🔗 clientiIds sync galleria: +${added.length} / -${removed.length}`);
                          toast({
                            title: clientiIds.length > 0 ? "Clienti aggiornati" : "Associazioni rimosse",
                            description: clientiIds.length > 0
                              ? `${clientiIds.length} cliente/i ora collegato/i alla galleria`
                              : "Tutte le associazioni cliente sono state rimosse",
                          });
                          queryClient.invalidateQueries({ queryKey: ['gallery', gallery.id] });
                          queryClient.invalidateQueries({ queryKey: ['galleries'] });
                        } catch (error) {
                          console.error('Errore associazione clienti:', error);
                          toast({
                            title: "Errore",
                            description: "Impossibile salvare l'associazione clienti",
                            variant: "destructive"
                          });
                        } finally {
                          setIsSavingCliente(false);
                        }
                      }}
                    >
                      {isSavingCliente ? "Salvo..." : "Salva associazioni"}
                    </Button>
                  </div>
                );
              })()}
            </div>

            {/* Tipo Evento e Collegamento Lavoro */}
            <div className="border-t pt-4 mt-2">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-sage" />
                  <h4 className="text-sm font-semibold text-sage-dark">Tipo Evento & Lavoro Collegato</h4>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isSavingJobLink || !gallery || (jobType === originalJobType && jobId === originalJobId)}
                  onClick={async () => {
                    if (!gallery) return;
                    setIsSavingJobLink(true);
                    try {
                      const addedClienti = clientiIds.filter(id => !originalClientiIds.includes(id));
                      const removedClienti = originalClientiIds.filter(id => !clientiIds.includes(id));
                      const clientiChanged = addedClienti.length > 0 || removedClienti.length > 0;
                      const galleryRef = doc(db, 'galleries', gallery.id);
                      await updateDoc(galleryRef, {
                        jobType: jobType !== 'none' ? jobType : null,
                        jobId: jobId || null,
                        ...(clientiChanged ? {
                          clienteId: clientiIds[0] || null,
                          clientiIds: clientiIds.length > 0 ? clientiIds : null,
                        } : {}),
                        updatedAt: serverTimestamp()
                      });
                      // Sync sourceRefs sui clienti (aggiunti automaticamente dal collegamento job)
                      if (clientiChanged) {
                        const clientePromises: Promise<void>[] = [];
                        for (const removedId of removedClienti) {
                          clientePromises.push(updateDoc(doc(db, 'clienti', removedId), { 'sourceRefs.galleryIds': arrayRemove(gallery.id) }));
                        }
                        for (const addedId of addedClienti) {
                          clientePromises.push(updateDoc(doc(db, 'clienti', addedId), { 'sourceRefs.galleryIds': arrayUnion(gallery.id) }));
                        }
                        if (clientePromises.length > 0) await Promise.all(clientePromises);
                        setOriginalClientiIds([...clientiIds]);
                      }
                      // Sync galleryIds sui job
                      if (jobId !== originalJobId) {
                        const syncPromises: Promise<void>[] = [];
                        if (originalJobId) {
                          syncPromises.push(updateDoc(doc(db, 'jobs', originalJobId), { galleryIds: arrayRemove(gallery.id), updatedAt: serverTimestamp() }));
                        }
                        if (jobId) {
                          syncPromises.push(updateDoc(doc(db, 'jobs', jobId), { galleryIds: arrayUnion(gallery.id), updatedAt: serverTimestamp() }));
                        }
                        if (syncPromises.length > 0) await Promise.all(syncPromises);
                        setOriginalJobId(jobId);
                      }
                      setOriginalJobType(jobType);
                      toast({ title: "Salvato", description: "Categoria e lavoro aggiornati con successo." });
                      queryClient.invalidateQueries({ queryKey: ['gallery', gallery.id] });
                      queryClient.invalidateQueries({ queryKey: ['galleries'] });
                    } catch (err) {
                      console.error('Errore salvataggio job link:', err);
                      toast({ title: "Errore", description: "Impossibile salvare. Riprova.", variant: "destructive" });
                    } finally {
                      setIsSavingJobLink(false);
                    }
                  }}
                  className="h-7 text-xs"
                >
                  {isSavingJobLink ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Aggiorna
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {/* Tipo Evento */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Categoria / Tipo Evento</Label>
                  <Select value={jobType} onValueChange={setJobType}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Seleziona categoria..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Nessuna categoria —</SelectItem>
                      {jobTypes.map(t => (
                        <SelectItem key={t.slug} value={t.slug}>{t.icona ? `${t.icona} ` : ''}{t.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Collega a Job */}
                <div className="space-y-1 relative">
                  <Label className="text-xs text-muted-foreground">Collega a Lavoro (Job)</Label>
                  {jobId ? (
                    <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-sage/5 text-sm">
                      <Link2 className="h-3.5 w-3.5 text-sage flex-shrink-0" />
                      <span className="truncate flex-1">
                        {availableJobs.find(j => j.id === jobId)?.nomeEvento || `Job ${jobId.slice(0, 8)}…`}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setJobId(''); setOriginalJobId(jobId); setJobSearch(''); }}
                        className="text-muted-foreground hover:text-destructive flex-shrink-0"
                        title="Rimuovi collegamento"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Cerca per nome evento…"
                        value={jobSearch}
                        onChange={e => { setJobSearch(e.target.value); setJobDropdownOpen(true); }}
                        onFocus={() => setJobDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setJobDropdownOpen(false), 200)}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      {jobDropdownOpen && (jobSearch.length > 0 || availableJobs.some(isClientJob)) && (() => {
                        const matchesSearch = (j: Job) =>
                          !jobSearch || j.nomeEvento?.toLowerCase().includes(jobSearch.toLowerCase());
                        const clientJobs = availableJobs.filter(j => isClientJob(j) && matchesSearch(j));
                        const otherJobs = jobSearch.length > 0
                          ? availableJobs.filter(j => !isClientJob(j) && matchesSearch(j))
                          : [];
                        const shown = [...clientJobs, ...otherJobs].slice(0, 8);
                        return (
                          <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-md border bg-white shadow-md">
                            {clientJobs.length > 0 && (
                              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-sage">
                                Lavori dei clienti associati
                              </p>
                            )}
                            {shown.map(j => (
                              <button
                                key={j.id}
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                                onMouseDown={() => handleSelectJobInEdit(j)}
                              >
                                <span className="font-medium truncate">{j.nomeEvento}</span>
                                {isClientJob(j) && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-sage/15 text-sage border border-sage/30 flex-shrink-0">
                                    Cliente
                                  </span>
                                )}
                                {j.jobType && <span className="ml-auto text-xs text-muted-foreground flex-shrink-0">({j.jobType})</span>}
                              </button>
                            ))}
                            {shown.length === 0 && (
                              <p className="px-3 py-2 text-xs text-muted-foreground">Nessun lavoro trovato</p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {!jobId && availableJobs.some(isClientJob) && (
                    <div className="space-y-1 pt-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-sage">Lavori dei clienti associati</p>
                      {availableJobs.filter(isClientJob).slice(0, 2).map(j => (
                        <button
                          key={j.id}
                          type="button"
                          onClick={() => handleSelectJobInEdit(j)}
                          className="flex w-full items-center gap-2 rounded-md border border-sage/30 bg-sage/5 px-2.5 py-1.5 text-left text-xs hover:bg-sage/15"
                          data-testid={`button-suggested-job-${j.id}`}
                        >
                          <Link2 className="h-3 w-3 text-sage flex-shrink-0" />
                          <span className="font-medium truncate">{j.nomeEvento}</span>
                          <span className="ml-auto text-sage font-semibold flex-shrink-0">Collega</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Il collegamento aggiorna automaticamente il job</p>
                </div>
              </div>
            </div>

            {/* Prodotti Associati Section - MULTI-PRODUCT SUPPORT */}
            {(associatedProducts.length > 0 || isLoadingProduct) && (
              <div className="border-t pt-4">
                {/* ⚠️ Banner: prodotti presenti ma selezione disattivata */}
                {associatedProducts.length > 0 && !selectionEnabled && (
                  <div className="mb-3 flex items-start gap-3 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-amber-800">Selezione non attiva</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Ci sono {associatedProducts.length} prodotti associati ma la selezione foto è disattivata. La cliente non può selezionare le foto.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleRepairSelection}
                      disabled={isLoading}
                      className="flex-shrink-0 bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                    >
                      {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                      Attiva Selezione
                    </Button>
                  </div>
                )}
                <div className="bg-sage/10 border border-sage/30 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <Info className="w-5 h-5 text-sage mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="font-semibold text-sage-dark">
                          📦 Prodotti Associati {associatedProducts.length > 0 && `(${associatedProducts.length})`}
                        </h4>
                        {isLoadingProduct ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                            Caricamento...
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-sage hover:bg-sage/20"
                            onClick={handleRefetchProducts}
                            title="Ricarica prodotti dall'ordine di origine"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
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
                                  <div className="flex items-center gap-2 mt-2">
                                    <span className="text-xs text-gray-600">🎯 Foto richieste:</span>
                                    <Input
                                      type="number"
                                      min="0"
                                      value={product.numeroFoto || 0}
                                      onChange={(e) => {
                                        const newValue = parseInt(e.target.value) || 0;
                                        setAssociatedProducts(prev => prev.map((p, i) => 
                                          i === idx ? { ...p, numeroFoto: newValue } : p
                                        ));
                                      }}
                                      className="w-20 h-7 text-sm text-center"
                                    />
                                    <span className="text-xs text-gray-500">
                                      {product.numeroFoto === 0 ? '(selezione libera)' : ''}
                                    </span>
                                  </div>
                                  {product.isCustom && (
                                    <p className="text-xs text-gray-500 mt-1 italic">
                                      ℹ️ Prodotto personalizzato creato per questo ordine
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                          <p className="text-xs text-amber-600 mt-2">
                            💡 Puoi modificare il numero di foto richieste per ogni prodotto
                          </p>
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
                  {/* Opzione Selezione Libera */}
                  <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg">
                    <input
                      type="checkbox"
                      id="unlimitedSelection"
                      checked={unlimitedSelection}
                      onChange={(e) => {
                        setUnlimitedSelection(e.target.checked);
                        if (e.target.checked) {
                          setRequiredPhotoCount(0);
                        }
                      }}
                      disabled={isSelectionStarted}
                      className="mt-1 w-5 h-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <div className="flex-1">
                      <Label htmlFor="unlimitedSelection" className="text-sm font-semibold cursor-pointer flex items-center gap-2">
                        Selezione Libera (senza limite)
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                          Nuovo
                        </span>
                      </Label>
                      <p className="text-xs text-gray-600 mt-1">
                        Il cliente può selezionare quante foto desidera senza limiti. Al termine, cliccherà "Ho finito" per confermare.
                      </p>
                    </div>
                  </div>

                  {/* Modalità selezione inversa (Non mi piace) */}
                  <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-lg">
                    <input
                      type="checkbox"
                      id="selectionModeDislike"
                      checked={selectionMode === 'dislike'}
                      onChange={(e) => setSelectionMode(e.target.checked ? 'dislike' : 'like')}
                      className="mt-1 h-4 w-4 text-orange-600 focus:ring-orange-500 border-orange-300 rounded"
                    />
                    <div className="flex-1">
                      <Label htmlFor="selectionModeDislike" className="text-sm font-semibold cursor-pointer flex items-center gap-2">
                        Modalità selezione inversa
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                          Non mi piace
                        </span>
                      </Label>
                      <p className="text-xs text-gray-600 mt-1">
                        Il cliente segna le foto da <strong>escludere</strong> — la selezione finale conterrà tutte le altre. Ideale quando quasi tutte le foto sono buone.
                      </p>
                    </div>
                  </div>

                  {/* Numero foto richieste - nascosto se selezione libera */}
                  {!unlimitedSelection && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="requiredPhotoCount" className="flex items-center gap-2">
                        Numero Foto Richieste
                        {associatedProducts.length > 0 && (
                          <span 
                            className="text-xs text-gray-500 cursor-help" 
                            title="Se impostato, questo valore ha la priorità sulla somma dei prodotti associati"
                          >
                            ⓘ
                          </span>
                        )}
                      </Label>
                      <Input
                        id="requiredPhotoCount"
                        type="number"
                        min="1"
                        max="500"
                        value={requiredPhotoCount}
                        onChange={(e) => setRequiredPhotoCount(parseInt(e.target.value) || 0)}
                        placeholder={associatedProducts.length > 0 ? `Auto: ${productsSumPhotoCount}` : "Es. 50"}
                        disabled={isSelectionStarted}
                        className={isSelectionStarted ? 'bg-gray-100 cursor-not-allowed' : ''}
                      />
                      
                      {/* Messaggi contestuali */}
                      {isSelectionStarted ? (
                        <p className="text-xs text-orange-600 flex items-center gap-1">
                          Selezione già iniziata ({selectedPhotoIds.length} foto). Non modificabile.
                        </p>
                      ) : hasProductsWithNoPhotoCount ? (
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                          Prodotto custom senza numero foto. Imposta manualmente.
                        </p>
                      ) : associatedProducts.length > 0 && requiredPhotoCount === 0 ? (
                        <p className="text-xs text-sage flex items-center gap-1">
                          Usa somma prodotti: <strong>{productsSumPhotoCount} foto</strong>
                        </p>
                      ) : isManualOverrideActive ? (
                        <p className="text-xs text-blue-600 flex items-center gap-1">
                          Valore manuale attivo (ignora somma prodotti: {productsSumPhotoCount})
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Quante foto deve selezionare il cliente
                        </p>
                      )}
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
                  )}
                  
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
                    <div key={index} className="flex items-center gap-2 p-2 bg-green-50 rounded border border-green-200">
                      <span className="text-green-600 mr-1">✓</span>
                      <span className="text-sm flex-1 truncate text-green-800">{url}</span>
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
              
              {/* Input per nuovo URL con feedback visivo migliorato */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      value={newYoutubeUrl}
                      onChange={(e) => setNewYoutubeUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className={`${newYoutubeUrl.trim() ? (isValidYouTubeUrl(newYoutubeUrl) ? 'border-green-400 bg-green-50 pr-20' : 'border-red-400 bg-red-50 pr-20') : ''}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newYoutubeUrl.trim()) {
                          e.preventDefault();
                          if (!isValidYouTubeUrl(newYoutubeUrl)) {
                            toast({ title: "URL non valido", description: "Inserisci un URL YouTube valido", variant: "destructive" });
                            return;
                          }
                          if (isYouTubeUrlDuplicate(newYoutubeUrl, youtubeUrls)) {
                            toast({ title: "Duplicato", description: "Questo video è già nella lista", variant: "destructive" });
                            return;
                          }
                          setYoutubeUrls([...youtubeUrls, newYoutubeUrl.trim()]);
                          setNewYoutubeUrl("");
                          toast({ title: "✓ Video aggiunto!", description: "Ricorda di salvare le modifiche" });
                        }
                      }}
                    />
                    {newYoutubeUrl.trim() && (
                      <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium ${isValidYouTubeUrl(newYoutubeUrl) ? 'text-green-600' : 'text-red-600'}`}>
                        {isValidYouTubeUrl(newYoutubeUrl) ? '✓ Valido' : '✗ Non valido'}
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant={newYoutubeUrl.trim() && isValidYouTubeUrl(newYoutubeUrl) ? "default" : "outline"}
                    onClick={() => {
                      if (newYoutubeUrl.trim()) {
                        if (!isValidYouTubeUrl(newYoutubeUrl)) {
                          toast({ title: "URL non valido", description: "Inserisci un URL YouTube valido", variant: "destructive" });
                          return;
                        }
                        if (isYouTubeUrlDuplicate(newYoutubeUrl, youtubeUrls)) {
                          toast({ title: "Duplicato", description: "Questo video è già nella lista", variant: "destructive" });
                          return;
                        }
                        setYoutubeUrls([...youtubeUrls, newYoutubeUrl.trim()]);
                        setNewYoutubeUrl("");
                        toast({ title: "✓ Video aggiunto!", description: "Ricorda di salvare le modifiche" });
                      }
                    }}
                    disabled={!newYoutubeUrl.trim() || !isValidYouTubeUrl(newYoutubeUrl)}
                    className={newYoutubeUrl.trim() && isValidYouTubeUrl(newYoutubeUrl) ? "bg-green-600 hover:bg-green-700 animate-pulse" : ""}
                  >
                    {newYoutubeUrl.trim() && isValidYouTubeUrl(newYoutubeUrl) ? "➕ Aggiungi" : "Aggiungi"}
                  </Button>
                </div>
                {newYoutubeUrl.trim() && !isValidYouTubeUrl(newYoutubeUrl) && (
                  <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                    ❌ URL non valido. Usa un formato come: youtube.com/watch?v=... o youtu.be/...
                  </p>
                )}
                {newYoutubeUrl.trim() && isValidYouTubeUrl(newYoutubeUrl) && (
                  <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                    ✓ URL valido! Clicca "Aggiungi" o premi Invio per confermare
                  </p>
                )}
              </div>
              <p className="text-xs text-gray-500">Aggiungi più video YouTube che saranno mostrati in uno slider nella galleria</p>
            </div>

            {/* ─── Stile Overlay Copertina — bottone compatto ─── */}
            {(() => {
              const currentTheme = GALLERY_HEADER_THEMES.find(t => t.id === headerTheme) || GALLERY_HEADER_THEMES[0];
              return (
                <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border bg-gray-50">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Palette className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Swatches mini */}
                      <div className="flex rounded overflow-hidden border border-white/50 shadow-sm flex-shrink-0" style={{ width: 36, height: 20 }}>
                        {currentTheme.previewColors.map((c, i) => (
                          <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{currentTheme.nome}</p>
                        <p className="text-xs text-gray-400 truncate hidden sm:block">{currentTheme.descrizione}</p>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowThemePickerDialog(true)}
                    className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-md border border-[#6b7f6b] text-[#6b7f6b] hover:bg-[#6b7f6b]/10 transition-colors whitespace-nowrap"
                  >
                    Cambia stile
                  </button>
                </div>
              );
            })()}

            {/* ─── Cover Desktop ─── */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-gray-500" />
                <Label className="font-medium">Copertina Desktop (16:9)</Label>
              </div>
              <div className="flex gap-3 items-start">
                {coverImageDesktopUrl ? (
                  <div className="relative flex-shrink-0">
                    <img
                      src={coverImageDesktopUrl}
                      alt="Anteprima desktop"
                      className="w-40 h-[90px] object-cover rounded-lg border"
                      style={{ objectPosition: `${coverImageDesktopPosition.x}% ${coverImageDesktopPosition.y}%` }}
                    />
                    <button
                      type="button"
                      onClick={() => setCoverImageDesktopUrl("")}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-40 h-[90px] bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center flex-shrink-0">
                    <Monitor className="h-6 w-6 text-gray-400" />
                  </div>
                )}
                <div className="flex flex-col gap-2 flex-1">
                  <div className="flex flex-wrap gap-2">
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={handleDesktopCoverChange} />
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-50 transition-colors">
                        <UploadCloud className="h-3.5 w-3.5" /> Carica file
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowCoverPickerFor('desktop')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
                    >
                      <GalleryHorizontal className="h-3.5 w-3.5" /> Dalla galleria
                    </button>
                    {coverImageDesktopUrl && (
                      <button
                        type="button"
                        onClick={() => setShowCoverPositionEditorFor('desktop')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#6b7f6b] text-[#6b7f6b] bg-white hover:bg-[#6b7f6b]/10 transition-colors"
                      >
                        <Crosshair className="h-3.5 w-3.5" /> Modifica posizione
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">Formato 16:9 — per desktop e tablet</p>
                </div>
              </div>
            </div>

            {/* ─── Cover Mobile ─── */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-gray-500" />
                <Label className="font-medium">Copertina Mobile (9:16)</Label>
              </div>
              <div className="flex gap-3 items-start">
                {coverImageMobileUrl ? (
                  <div className="relative flex-shrink-0">
                    <img
                      src={coverImageMobileUrl}
                      alt="Anteprima mobile"
                      className="w-16 h-[90px] object-cover rounded-lg border"
                      style={{ objectPosition: `${coverImageMobilePosition.x}% ${coverImageMobilePosition.y}%` }}
                    />
                    <button
                      type="button"
                      onClick={() => setCoverImageMobileUrl("")}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-[90px] bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center flex-shrink-0">
                    <Smartphone className="h-5 w-5 text-gray-400" />
                  </div>
                )}
                <div className="flex flex-col gap-2 flex-1">
                  <div className="flex flex-wrap gap-2">
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={handleMobileCoverChange} />
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-50 transition-colors">
                        <UploadCloud className="h-3.5 w-3.5" /> Carica file
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowCoverPickerFor('mobile')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
                    >
                      <GalleryHorizontal className="h-3.5 w-3.5" /> Dalla galleria
                    </button>
                    {coverImageMobileUrl && (
                      <button
                        type="button"
                        onClick={() => setShowCoverPositionEditorFor('mobile')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#6b7f6b] text-[#6b7f6b] bg-white hover:bg-[#6b7f6b]/10 transition-colors"
                      >
                        <Crosshair className="h-3.5 w-3.5" /> Modifica posizione
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">Formato 9:16 — per smartphone</p>
                </div>
              </div>
            </div>

            <DialogFooter className="flex justify-between items-center">
              <Button 
                variant="outline" 
                onClick={() => {
                  loadAllGalleries();
                  setShowMergeDialog(true);
                }}
                disabled={isLoading}
                className="text-orange-600 border-orange-300 hover:bg-orange-50"
              >
                🔀 Unisci con...
              </Button>
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
                    onClick={handleGenerateThumbnails}
                    disabled={isGeneratingThumbs || isLoading || photos.length === 0}
                    title="Crea anteprime leggere per velocizzare il caricamento della galleria. Non modifica le foto originali."
                  >
                    {isGeneratingThumbs ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        {thumbProgress ? `Genero… ${thumbProgress.generated}` : "Genero…"}
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-1" />
                        Genera miniature
                      </>
                    )}
                  </Button>
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
                      <AlertDialogContent className="z-[100]">
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
                    src={photo.thumbnailUrl || photo.url}
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
                    <AlertDialogContent className="z-[100]" aria-describedby="delete-photo-dialog-description">
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
    
    {/* Dialog Unisci Gallerie */}
    <AlertDialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
      <AlertDialogContent className="z-[100]">
        <AlertDialogHeader>
          <AlertDialogTitle>🔀 Unisci Galleria</AlertDialogTitle>
          <AlertDialogDescription>
            Sposta tutte le foto di <strong>"{gallery?.name}"</strong> in un'altra galleria.
            <br />
            <span className="text-orange-600 font-medium">
              ⚠️ La galleria corrente verrà archiviata dopo l'unione.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <Label>Seleziona galleria di destinazione</Label>
            <Select value={targetGalleryId} onValueChange={setTargetGalleryId}>
              <SelectTrigger className="w-full mt-2">
                <SelectValue placeholder="Scegli una galleria..." />
              </SelectTrigger>
              <SelectContent>
                {allGalleries.map(g => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name} ({g.photoCount} foto) - {g.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {targetGalleryId && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-blue-800">Riepilogo operazione:</p>
              <ul className="list-disc list-inside text-blue-700 mt-1">
                <li>Le foto verranno spostate (non copiate)</li>
                <li>I duplicati saranno automaticamente saltati</li>
                <li>La galleria "{gallery?.name}" sarà archiviata</li>
              </ul>
            </div>
          )}
        </div>
        
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isMerging}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            onClick={mergeIntoGallery}
            disabled={!targetGalleryId || isMerging}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {isMerging ? "Unione in corso..." : "Conferma Unione"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* ═══════════════════════════════════════════════
        DIALOG: SELETTORE STILE OVERLAY COPERTINA
        ═══════════════════════════════════════════════ */}
    <Dialog open={showThemePickerDialog} onOpenChange={setShowThemePickerDialog}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col z-[110]" aria-describedby="theme-picker-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-4 w-4" /> Scegli lo stile della copertina
          </DialogTitle>
          <DialogDescription id="theme-picker-desc">
            Seleziona un template visivo per l'overlay con nome e data. La preview mostra l'effetto con la tua foto di copertina.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Colonna sinistra: griglia temi */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Seleziona un tema</p>
              <div className="grid grid-cols-2 gap-2">
                {GALLERY_HEADER_THEMES.map(theme => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setHeaderTheme(theme.id)}
                    className={`relative overflow-hidden rounded-lg border-2 text-left transition-all h-24 ${
                      headerTheme === theme.id
                        ? 'border-[#6b7f6b] ring-2 ring-[#6b7f6b]/30'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {/* Swatches */}
                    <div className="absolute inset-0 flex">
                      {theme.previewColors.map((c, i) => (
                        <div key={i} className="flex-1 h-full" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.05) 100%)' }} />
                    <div className="absolute bottom-0 left-0 right-0 px-2 pb-2">
                      <p className="text-white text-xs font-semibold drop-shadow-md">{theme.nome}</p>
                      <p className="text-white/60 text-[10px] leading-tight mt-0.5 line-clamp-2">{theme.descrizione}</p>
                    </div>
                    {headerTheme === theme.id && (
                      <div className="absolute top-2 right-2 bg-[#6b7f6b] rounded-full p-0.5 shadow">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Colonna destra: preview con foto vera */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Anteprima effetto reale</p>
              {(() => {
                const previewImage = coverImageDesktopUrl || coverImageMobileUrl || coverImageUrl;
                const theme = GALLERY_HEADER_THEMES.find(t => t.id === headerTheme) || GALLERY_HEADER_THEMES[0];
                const previewDate = date
                  ? new Date(date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
                  : '15 giugno 2025';

                return (
                  <div className="sticky top-0 space-y-3">
                    {/* Preview principale */}
                    <div className="rounded-lg overflow-hidden border shadow-sm relative aspect-video bg-gray-900">
                      {previewImage ? (
                        <img
                          src={previewImage}
                          alt="Copertina"
                          className="absolute inset-0 w-full h-full object-cover"
                          style={{ objectPosition: `${coverImageDesktopPosition.x}% ${coverImageDesktopPosition.y}%` }}
                        />
                      ) : (
                        /* Placeholder se non c'è foto */
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
                          <div className="text-center text-gray-500">
                            <Monitor className="h-8 w-8 mx-auto mb-1 opacity-40" />
                            <p className="text-xs opacity-60">Nessuna copertina impostata</p>
                          </div>
                        </div>
                      )}
                      <GalleryHeaderOverlay
                        name={name || 'Sposi Esempio'}
                        date={previewDate}
                        location={location || ''}
                        themeId={theme.id}
                      />
                    </div>
                    {/* Badge tema attivo */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-50 border">
                      <div className="flex rounded overflow-hidden flex-shrink-0" style={{ width: 28, height: 16 }}>
                        {theme.previewColors.map((c, i) => (
                          <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-700">{theme.nome}</p>
                        <p className="text-[11px] text-gray-400">{theme.descrizione}</p>
                      </div>
                    </div>
                    {!previewImage && (
                      <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        Imposta una foto di copertina per vedere l'anteprima completa con la tua foto.
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowThemePickerDialog(false)}>Annulla</Button>
          <Button onClick={() => setShowThemePickerDialog(false)} className="bg-[#6b7f6b] hover:bg-[#5a6b5a]">
            <Check className="h-4 w-4 mr-1.5" /> Applica stile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ═══════════════════════════════════════════════
        DIALOG: SELEZIONA FOTO DALLA GALLERIA
        ═══════════════════════════════════════════════ */}
    <Dialog open={showCoverPickerFor !== null} onOpenChange={(open) => { if (!open) setShowCoverPickerFor(null); }}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col z-[110]" aria-describedby="cover-picker-desc">
        <DialogHeader>
          <DialogTitle>
            {showCoverPickerFor === 'desktop' ? (
              <span className="flex items-center gap-2"><Monitor className="h-4 w-4" /> Scegli foto copertina Desktop</span>
            ) : (
              <span className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> Scegli foto copertina Mobile</span>
            )}
          </DialogTitle>
          <DialogDescription id="cover-picker-desc">
            Scegli una foto dalla galleria da usare come copertina
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0">
          {photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
              <GalleryHorizontal className="h-10 w-10 opacity-40" />
              <p className="text-sm">Nessuna foto nella galleria</p>
              <p className="text-xs">Carica prima alcune foto nella galleria</p>
            </div>
          ) : (() => {
            const chapters: any[] = (gallery as any)?.chapters || [];
            const hasChapters = chapters.length > 0;

            if (hasChapters) {
              const grouped: { [chapterId: string]: typeof photos } = { __uncategorized: [] };
              chapters.forEach((ch: any) => { grouped[ch.id] = []; });

              photos.forEach(photo => {
                const photoAny = photo as any;
                const chId = photoAny.chapterId || '__uncategorized';
                if (grouped[chId]) {
                  grouped[chId].push(photo);
                } else {
                  grouped['__uncategorized'].push(photo);
                }
              });

              return (
                <div className="space-y-4 pr-1">
                  {chapters.map((ch: any) => {
                    const chPhotos = grouped[ch.id] || [];
                    if (chPhotos.length === 0) return null;
                    return (
                      <div key={ch.id}>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">{ch.titolo}</p>
                        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                          {chPhotos.map(photo => (
                            <button
                              key={photo.id}
                              type="button"
                              onClick={() => {
                                if (showCoverPickerFor === 'desktop') {
                                  setCoverImageDesktopUrl(photo.url);
                                  setCoverImageDesktopPosition({ x: 50, y: 50 });
                                } else {
                                  setCoverImageMobileUrl(photo.url);
                                  setCoverImageMobilePosition({ x: 50, y: 50 });
                                }
                                setShowCoverPickerFor(null);
                                setShowCoverPositionEditorFor(showCoverPickerFor);
                              }}
                              className="relative group aspect-square overflow-hidden rounded-md border-2 border-transparent hover:border-[#6b7f6b] transition-all"
                            >
                              <img src={photo.thumbnailUrl || photo.url} alt={photo.name} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                <Check className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {grouped['__uncategorized'].length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">Senza capitolo</p>
                      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                        {grouped['__uncategorized'].map(photo => (
                          <button
                            key={photo.id}
                            type="button"
                            onClick={() => {
                              if (showCoverPickerFor === 'desktop') {
                                setCoverImageDesktopUrl(photo.url);
                                setCoverImageDesktopPosition({ x: 50, y: 50 });
                              } else {
                                setCoverImageMobileUrl(photo.url);
                                setCoverImageMobilePosition({ x: 50, y: 50 });
                              }
                              setShowCoverPickerFor(null);
                              setShowCoverPositionEditorFor(showCoverPickerFor);
                            }}
                            className="relative group aspect-square overflow-hidden rounded-md border-2 border-transparent hover:border-[#6b7f6b] transition-all"
                          >
                            <img src={photo.thumbnailUrl || photo.url} alt={photo.name} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                              <Check className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2 pr-1">
                {photos.map(photo => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => {
                      if (showCoverPickerFor === 'desktop') {
                        setCoverImageDesktopUrl(photo.url);
                        setCoverImageDesktopPosition({ x: 50, y: 50 });
                      } else {
                        setCoverImageMobileUrl(photo.url);
                        setCoverImageMobilePosition({ x: 50, y: 50 });
                      }
                      setShowCoverPickerFor(null);
                      setShowCoverPositionEditorFor(showCoverPickerFor);
                    }}
                    className="relative group aspect-square overflow-hidden rounded-md border-2 border-transparent hover:border-[#6b7f6b] transition-all"
                  >
                    <img src={photo.thumbnailUrl || photo.url} alt={photo.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <Check className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                    </div>
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowCoverPickerFor(null)}>Annulla</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ═══════════════════════════════════════════════
        DIALOG: EDITOR POSIZIONE COPERTINA
        ═══════════════════════════════════════════════ */}
    {showCoverPositionEditorFor !== null && (() => {
      const isDesktop = showCoverPositionEditorFor === 'desktop';
      const imageUrl = isDesktop ? coverImageDesktopUrl : coverImageMobileUrl;
      const position = isDesktop ? coverImageDesktopPosition : coverImageMobilePosition;
      const setPosition = isDesktop ? setCoverImageDesktopPosition : setCoverImageMobilePosition;
      const previewAspectRatio = isDesktop ? '16/9' : '9/16';
      const previewLabel = isDesktop ? 'Anteprima desktop (16:9)' : 'Anteprima mobile (9:16)';
      const editorAspectClass = isDesktop ? 'aspect-video' : 'aspect-[9/16]';

      return (
        <Dialog open={true} onOpenChange={(open) => { if (!open) setShowCoverPositionEditorFor(null); }}>
          <DialogContent className="max-w-2xl z-[110]" aria-describedby="cover-pos-desc">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Crosshair className="h-4 w-4" />
                {isDesktop ? 'Posizione copertina Desktop' : 'Posizione copertina Mobile'}
              </DialogTitle>
              <DialogDescription id="cover-pos-desc">
                Clicca o trascina il mirino per scegliere il punto di fuoco dell'immagine
              </DialogDescription>
            </DialogHeader>
            {isDesktop ? (
              /* ── Desktop: layout 2 colonne affiancate ── */
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-600">Trascina il mirino per scegliere il fuoco</p>
                  <GalleryCoverFocalEditor
                    imageUrl={imageUrl}
                    position={position}
                    onPositionChange={setPosition}
                    aspectClass={editorAspectClass}
                  />
                  <p className="text-xs text-gray-400 text-center">{position.x.toFixed(0)}% × {position.y.toFixed(0)}%</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-600">{previewLabel}</p>
                  <div
                    className="w-full overflow-hidden rounded-lg border bg-gray-100"
                    style={{ aspectRatio: previewAspectRatio }}
                  >
                    <img
                      src={imageUrl}
                      alt="Anteprima posizione"
                      className="w-full h-full object-cover"
                      style={{ objectPosition: `${position.x}% ${position.y}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* ── Mobile: layout singola colonna, editor portrait centrato ── */
              <div className="flex flex-col items-center gap-4">
                <p className="text-xs font-medium text-gray-600 self-start">Trascina il mirino per scegliere il fuoco</p>
                <div className="flex gap-4 w-full justify-center">
                  {/* Editor portrait: larghezza limitata per non occupare tutta la colonna */}
                  <div className="space-y-1 flex flex-col items-center" style={{ width: '45%' }}>
                    <p className="text-xs text-gray-500 font-medium">Editor (9:16)</p>
                    <GalleryCoverFocalEditor
                      imageUrl={imageUrl}
                      position={position}
                      onPositionChange={setPosition}
                      aspectClass={editorAspectClass}
                    />
                    <p className="text-xs text-gray-400">{position.x.toFixed(0)}% × {position.y.toFixed(0)}%</p>
                  </div>
                  {/* Preview portrait */}
                  <div className="space-y-1 flex flex-col items-center" style={{ width: '45%' }}>
                    <p className="text-xs text-gray-500 font-medium">{previewLabel}</p>
                    <div
                      className="w-full overflow-hidden rounded-lg border bg-gray-100"
                      style={{ aspectRatio: previewAspectRatio }}
                    >
                      <img
                        src={imageUrl}
                        alt="Anteprima posizione"
                        className="w-full h-full object-cover"
                        style={{ objectPosition: `${position.x}% ${position.y}%` }}
                      />
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-400 text-center">
                  L'immagine viene ritagliata in verticale (9:16) per adattarsi agli schermi mobile
                </p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCoverPositionEditorFor(null)}>Annulla</Button>
              <Button onClick={() => setShowCoverPositionEditorFor(null)} className="bg-[#6b7f6b] hover:bg-[#5a6b5a]">
                <Check className="h-4 w-4 mr-1.5" /> Salva posizione
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    })()}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   SUB-COMPONENTE: Editor fuoco immagine copertina galleria
───────────────────────────────────────────────────────────────────── */
const GalleryCoverFocalEditor = ({ imageUrl, position, onPositionChange, aspectClass = 'aspect-video' }: {
  imageUrl: string;
  position: { x: number; y: number };
  onPositionChange: (pos: { x: number; y: number }) => void;
  aspectClass?: string;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const calcPosition = (e: React.MouseEvent | MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    onPositionChange({ x: Math.round(x), y: Math.round(y) });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    calcPosition(e);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    calcPosition(e);
  };

  const handleMouseUp = () => { isDragging.current = false; };

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${aspectClass} overflow-hidden rounded-lg border cursor-crosshair select-none bg-gray-100`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <img
        src={imageUrl}
        alt="Editor posizione"
        className="w-full h-full object-cover pointer-events-none"
      />
      {/* Mirino */}
      <div
        className="absolute w-8 h-8 pointer-events-none"
        style={{ left: `${position.x}%`, top: `${position.y}%`, transform: 'translate(-50%, -50%)' }}
      >
        <div className="absolute inset-0 rounded-full border-2 border-white shadow-lg bg-black/20" />
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white -translate-y-1/2 shadow-sm" />
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white -translate-x-1/2 shadow-sm" />
      </div>
    </div>
  );
};