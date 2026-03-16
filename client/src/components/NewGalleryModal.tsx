import React, { useState, useEffect } from "react";
import { nanoid } from "nanoid";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { getAllThemes } from "@shared/special-themes";
import { getProductById } from "@/lib/products";
import type { Product } from "@shared/booking-types";
import { Info, Eye, EyeOff, Trash, RefreshCw, Copy, Check } from "lucide-react";
import { ClienteSelector } from "./ClienteSelector";
import { createAbsoluteUrl } from "@/lib/basePath";
import { getClienteByEmail } from "@/lib/clienti";

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

// Helper: Genera PIN casuale sicuro (4-6 cifre numeriche)
function generateSecurePin(length: number = 4): string {
  const digits = '0123456789';
  let pin = '';
  for (let i = 0; i < length; i++) {
    pin += digits.charAt(Math.floor(Math.random() * digits.length));
  }
  return pin;
}

// Helper: Valida formato PIN (minimo 4 caratteri alfanumerici - compatibile con PIN esistenti)
function isValidPinFormat(pin: string): { valid: boolean; error?: string } {
  if (!pin || pin.trim().length < 4) {
    return { valid: false, error: 'Il PIN deve essere di almeno 4 caratteri' };
  }
  if (pin.trim().length > 20) {
    return { valid: false, error: 'Il PIN non può superare 20 caratteri' };
  }
  // Accetta alfanumerici per compatibilità con PIN esistenti
  if (!/^[a-zA-Z0-9]+$/.test(pin.trim())) {
    return { valid: false, error: 'Il PIN può contenere solo lettere e numeri' };
  }
  return { valid: true };
}

interface NewGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGalleryCreated?: (galleryId: string, galleryCode: string) => void;

  // Pre-population fields (optional)
  prePopulate?: {
    name?: string;
    date?: string;
    location?: string;
    description?: string;
    specialTheme?: string; // Auto-populated from campaign.temaStagionale
    specialPin?: string;
    bookingId?: string; // Link to booking (for integration)
    clienteId?: string; // Client ID for direct association and notifications
    prodottoId?: string; // Product ID to fetch data and auto-populate selection settings (legacy single product)
    prodottoNome?: string; // Custom product name (se prodotto non in catalogo)
    prodottoNumeroFoto?: number; // Custom product photo count (se prodotto non in catalogo)
    clienteEmail?: string; // Client email for sending gallery ready notification
    clienteNome?: string; // Client nome per email personalizzata
    availableProducts?: Array<{
      // Multiple products available for selection (from order)
      prodottoId?: string;
      prodottoNome: string;
      prodottoNumeroFoto?: number;
      isFromBundle?: boolean; // Flag to indicate product came from bundle expansion
      bundleParentName?: string; // Original bundle name for reference
    }>;
  };
}

export default function NewGalleryModal({
  isOpen,
  onClose,
  onGalleryCreated,
  prePopulate,
}: NewGalleryModalProps) {
  const { user } = useFirebaseAuth();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [password, setPassword] = useState("");
  const [specialTheme, setSpecialTheme] = useState<string>("none");
  const [specialPin, setSpecialPin] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientName, setClientName] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [importedClienteInfo, setImportedClienteInfo] = useState<{nome: string, cognome: string} | null>(null); // Info cliente importato
  const [clienteIdInitialized, setClienteIdInitialized] = useState<string | null>(null); // Track which booking initialized clienteId
  const [selectionEnabled, setSelectionEnabled] = useState(false);
  const [unlimitedSelection, setUnlimitedSelection] = useState(false); // Selezione libera senza limite
  const [requiredPhotoCount, setRequiredPhotoCount] = useState<number>(0);
  const [selectionDeadline, setSelectionDeadline] = useState<string>("");
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCustomProduct, setIsCustomProduct] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pinCopied, setPinCopied] = useState(false);
  
  // YouTube URLs support
  const [youtubeUrls, setYoutubeUrls] = useState<string[]>([]);
  const [newYoutubeUrl, setNewYoutubeUrl] = useState("");

  // Multi-product selection support (NEW: array for multiple products)
  const [selectedProductIndices, setSelectedProductIndices] = useState<
    number[]
  >([]);
  const hasMultipleProducts =
    (prePopulate?.availableProducts &&
      prePopulate.availableProducts.length > 1) ||
    false;
  const hasSingleProduct =
    (prePopulate?.availableProducts &&
      prePopulate.availableProducts.length === 1) ||
    false;

  const availableThemes = getAllThemes();

  // CRITICAL: Reset selectedProductIndices AND selection state when booking changes
  // NOTE: youtubeUrls is NOT reset here as it's independent of booking context
  useEffect(() => {
    // Check if any products come from a bundle
    const hasProductsFromBundle = prePopulate?.availableProducts?.some(p => p.isFromBundle) || false;
    
    if (hasProductsFromBundle && prePopulate?.availableProducts && prePopulate.availableProducts.length > 0) {
      // AUTO-SELECT all products when they come from a bundle
      const allIndices = prePopulate.availableProducts.map((_, idx) => idx);
      setSelectedProductIndices(allIndices);
      // AUTO-ENABLE selection mode for bundles
      setSelectionEnabled(true);
      setUnlimitedSelection(false);
      console.log("📦 Bundle rilevato: auto-selezionati tutti i", allIndices.length, "prodotti e abilitata selezione");
    } else {
      setSelectedProductIndices([]);
      setSelectionEnabled(false);
    }
    
    setIsCustomProduct(false);
    setUnlimitedSelection(false);
    setRequiredPhotoCount(0);
    setProduct(null);
    console.log("🔄 Reset completo stato per nuovo booking");
  }, [prePopulate?.bookingId, prePopulate?.availableProducts]);

  // Calculate total required photos from selected products
  const calculateTotalPhotos = () => {
    if (!prePopulate?.availableProducts || selectedProductIndices.length === 0)
      return 0;

    return selectedProductIndices.reduce((total, index) => {
      const product = prePopulate.availableProducts![index];
      return total + (product.prodottoNumeroFoto || 0);
    }, 0);
  };
  
  // 🔥 FIX: Update requiredPhotoCount and selectionEnabled when selectedProductIndices changes
  // This ensures proper photo count is set for both bundle and non-bundle multi-product flows
  useEffect(() => {
    if (prePopulate?.availableProducts && selectedProductIndices.length > 0) {
      const totalPhotos = calculateTotalPhotos();
      setRequiredPhotoCount(totalPhotos);
      
      // Auto-enable selection if products are selected
      if (totalPhotos > 0) {
        // ✅ VINCOLO AUTO: prodotti presenti → selezione attiva e NON libera
        if (!selectionEnabled) setSelectionEnabled(true);
        setUnlimitedSelection(false);
        console.log("📊 Auto-abilitata selezione con", totalPhotos, "foto richieste da", selectedProductIndices.length, "prodotti (unlimitedSelection=false)");
      }
    }
  }, [selectedProductIndices, prePopulate?.availableProducts]);

  // Fetch product data when prodottoId is provided OR use custom product data (LEGACY - single product)
  useEffect(() => {
    const fetchProduct = async () => {
      // NEW: Skip legacy single-product fetch if using multi-product mode
      if (
        prePopulate?.availableProducts &&
        prePopulate.availableProducts.length > 0
      ) {
        // Multi-product mode: don't fetch single product, just return
        return;
      }

      // Caso 1: Prodotto custom (senza ID catalogo ma con dati diretti) - legacy
      if (!prePopulate?.prodottoId && prePopulate?.prodottoNome) {
        console.log("📦 Prodotto custom rilevato:", prePopulate.prodottoNome);
        setIsCustomProduct(true);

        // Validazione numero foto: deve essere valido (> 0) o fallback a 0
        const numeroFoto =
          prePopulate.prodottoNumeroFoto && prePopulate.prodottoNumeroFoto > 0
            ? prePopulate.prodottoNumeroFoto
            : 0;

        setProduct({
          id: "custom",
          nome: prePopulate.prodottoNome,
          numeroFoto,
        } as Product);

        // CRITICAL: numeroFoto = 0 significa "selezione libera/illimitata" - abilitiamo comunque
        // Solo se non c'è proprio prodotto disabilitiamo la selezione
        setSelectionEnabled(true); // Sempre abilitata se c'è un prodotto
        setRequiredPhotoCount(numeroFoto); // 0 = illimitato, >0 = numero specifico
        return;
      }

      // Caso 2: Prodotto dal catalogo (con ID) - legacy
      if (prePopulate?.prodottoId) {
        setIsLoadingProduct(true);
        setIsCustomProduct(false);
        try {
          const productData = await getProductById(prePopulate.prodottoId);
          if (productData) {
            setProduct(productData);
            // CRITICAL: numeroFoto = 0 significa "selezione libera/illimitata"
            setSelectionEnabled(true); // Sempre abilitata se c'è un prodotto
            setRequiredPhotoCount(productData.numeroFoto); // 0 = illimitato
          } else {
            // CRITICAL: Product lookup returned undefined - pulisci stato selection
            setProduct(null);
            setSelectionEnabled(false);
            setRequiredPhotoCount(0);
          }
        } catch (error) {
          console.error("Errore fetch prodotto:", error);
          // CRITICAL: Fetch failed - pulisci stato selection per evitare stale data
          setProduct(null);
          setSelectionEnabled(false);
          setRequiredPhotoCount(0);
        } finally {
          setIsLoadingProduct(false);
        }
      }
    };

    fetchProduct();
  }, [
    prePopulate?.prodottoId,
    prePopulate?.prodottoNome,
    prePopulate?.prodottoNumeroFoto,
    prePopulate?.availableProducts,
    selectedProductIndices,
  ]);

  // Initialize form with pre-populated values
  useEffect(() => {
    if (prePopulate) {
      setName(prePopulate.name || "");
      setDate(prePopulate.date || "");
      setLocation(prePopulate.location || "");
      setDescription(prePopulate.description || "");
      setSpecialTheme(prePopulate.specialTheme || "none");
      setSpecialPin(prePopulate.specialPin || "");
      setClientEmail(prePopulate.clienteEmail || "");
      setClientName(prePopulate.clienteNome || "");
      // Only initialize clienteId if this is a NEW booking (avoid resetting user selections)
      const currentBookingId = prePopulate.bookingId || null;
      if (clienteIdInitialized !== currentBookingId) {
        setClienteId(prePopulate.clienteId || "");
        setImportedClienteInfo(null); // Clear imported info when booking changes
        setClienteIdInitialized(currentBookingId);
        console.log("🔄 ClienteId inizializzato per booking:", currentBookingId, "valore:", prePopulate.clienteId || "(vuoto)");
      }
    }
  }, [prePopulate, clienteIdInitialized]);

  // MUTUA ESCLUSIVITÀ: Password e PIN non possono coesistere
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value;
    setPassword(newPassword);

    // Se viene impostata una password, rimuovi tema e PIN
    if (newPassword.trim()) {
      if (specialTheme !== "none") {
        console.log("🔄 Password impostata - rimozione tema e PIN");
        setSpecialTheme("none");
        setSpecialPin("");
        toast.info(
          "Modalità cambiata: galleria con password. Tema speciale e PIN rimossi.",
        );
      }
    }
  };

  const handleSpecialThemeChange = (newTheme: string) => {
    setSpecialTheme(newTheme);

    // Se viene selezionato un tema (diverso da 'none'), rimuovi la password
    if (newTheme !== "none" && password.trim()) {
      console.log("🔄 Tema speciale selezionato - rimozione password");
      setPassword("");
      toast.info(
        "Modalità cambiata: galleria speciale con PIN. Password rimossa.",
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error("Devi essere autenticato per creare una galleria");
      return;
    }

    if (!name.trim()) {
      toast.error("Il nome della galleria è obbligatorio");
      return;
    }

    // Validate PIN for special themes
    if (specialTheme !== "none" && !specialPin.trim()) {
      toast.error("Il PIN è obbligatorio per le gallerie con tema stagionale");
      return;
    }

    // Validate PIN format (minimo 4 caratteri alfanumerici)
    if (specialTheme !== "none" && specialPin.trim()) {
      const pinValidation = isValidPinFormat(specialPin);
      if (!pinValidation.valid) {
        toast.error(pinValidation.error || "Formato PIN non valido");
        return;
      }
    }

    setIsLoading(true);
    try {
      // CHECK PIN UNIVOCITÀ: Verifica che il PIN non sia già usato da altre gallerie
      if (specialTheme !== "none" && specialPin.trim()) {
        console.log("🔍 Verifica unicità PIN...");

        const checkResponse = await fetch(
          `${window.location.origin}/api/email/check-pin-unique`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pin: specialPin.trim(),
              currentGalleryId: null,
            }),
          },
        );

        if (!checkResponse.ok) {
          throw new Error("Errore verifica unicità PIN");
        }

        const checkResult = await checkResponse.json();

        if (!checkResult.unique) {
          toast.error(
            `PIN già in uso dalla galleria "${checkResult.usedByGalleryName}". Scegli un PIN diverso.`,
            {
              duration: 5000,
            },
          );
          setIsLoading(false);
          return;
        }

        console.log("✅ PIN unico, procedo con la creazione");
      }
      // Check gallery limit
      const galleriesQuery = query(
        collection(db, "galleries"),
        where("userId", "==", user.uid),
      );
      const galleriesSnapshot = await getDocs(galleriesQuery);
      const currentGalleryCount = galleriesSnapshot.size;

      // Generate unique code
      const code = nanoid(8);

      // Create gallery (SENZA password e specialPin - ora in gallerySecrets)
      const galleryData: any = {
        name: name.trim(),
        code,
        date,
        location: location.trim(),
        description: description.trim(),
        hasPassword: !!password.trim(), // Solo flag boolean
        userId: user.uid,
        photoCount: 0,
        active: true,
        selectionEnabled, // Modalità selezione foto
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      
      // Add YouTube URLs if any
      if (youtubeUrls.length > 0) {
        galleryData.youtubeUrls = youtubeUrls;
      }

      // Add special theme fields if theme is selected (solo ID tema, NO PIN)
      if (specialTheme !== "none") {
        galleryData.specialTheme = specialTheme;
      }

      // Aggiungi client info per invio email PIN (opzionale)
      if (clientEmail.trim()) {
        galleryData.clientEmail = clientEmail.trim();
      }
      if (clientName.trim()) {
        galleryData.clientName = clientName.trim();
      }

      // Add photo selection fields if selection is enabled
      if (selectionEnabled) {
        // 🆕 Selezione Libera (senza limite) - ha priorità su tutto
        if (unlimitedSelection) {
          galleryData.unlimitedSelection = true;
          galleryData.requiredPhotoCount = 0;
          galleryData.selectionStatus = "pending";
          galleryData.selectedPhotoIds = [];
          console.log("💾 Salvando galleria con SELEZIONE LIBERA (illimitata)");
        }
        // Product-based selection (from availableProducts)
        else if (
          prePopulate?.availableProducts &&
          selectedProductIndices.length > 0
        ) {
          const productReqs = selectedProductIndices.map((index) => {
            const prod = prePopulate.availableProducts![index];
            const req: any = {
              prodottoNome: prod.prodottoNome,
              prodottoNumeroFoto: prod.prodottoNumeroFoto || 0,
            };
            // Solo aggiungi prodottoId se esiste (Firestore non accetta undefined)
            if (prod.prodottoId) {
              req.prodottoId = prod.prodottoId;
            }
            return req;
          });

          galleryData.productRequirements = productReqs;
          galleryData.requiredPhotoCount = productReqs.reduce((sum, p) => sum + (p.prodottoNumeroFoto || 0), 0);
          galleryData.selectionStatus = "pending";
          galleryData.selectedPhotoIds = [];
          if (productReqs.length > 1) {
            galleryData.photoAssignments = {};
          }
          console.log(
            `💾 Salvando galleria con ${productReqs.length} prodotto/i, productRequirements:`,
            productReqs,
            "Totale foto richieste:",
            galleryData.requiredPhotoCount,
          );
        }
        // Legacy Single-Product Mode: Save requiredPhotoCount (manual input)
        else if (requiredPhotoCount > 0) {
          galleryData.requiredPhotoCount = requiredPhotoCount;
          galleryData.selectionStatus = "pending";
          galleryData.selectedPhotoIds = [];
          console.log(
            "💾 Salvando galleria legacy single-prodotto con requiredPhotoCount:",
            requiredPhotoCount,
          );
        }

        // Deadline applies to both modes
        if (selectionDeadline) {
          const { Timestamp } = await import("firebase/firestore");
          galleryData.selectionDeadline = Timestamp.fromDate(
            new Date(selectionDeadline),
          );
          galleryData.selectionDeadlineEnforced = true;
        }
      }

      // Add booking link if gallery created from BookingsManager
      if (prePopulate?.bookingId) {
        galleryData.bookingId = prePopulate.bookingId;
      }
      
      // Add client association for notifications (from state, not just prePopulate)
      if (clienteId) {
        galleryData.clienteId = clienteId;
      }

      // Use GalleryService instead of direct Firestore write
      const { GalleryService } = await import("@/lib/galleries");
      const newGalleryId = await GalleryService.createGallery(galleryData);

      // SALVA PASSWORD E SPECIAL PIN in collection protetta `gallerySecrets`
      // IMPORTANTE: Password e PIN sono MUTUAMENTE ESCLUSIVI
      const { doc: firestoreDoc, setDoc } = await import("firebase/firestore");
      const secretsRef = firestoreDoc(db, "gallerySecrets", newGalleryId);
      const secretsData: any = {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (specialTheme !== "none") {
        // GALLERIA SPECIALE: Solo PIN, NO password
        secretsData.specialPin = specialPin.trim() || null;
        secretsData.password = null;
        console.log("🔒 Salvando galleria speciale con PIN in gallerySecrets");
      } else {
        // GALLERIA NORMALE: Solo password, NO PIN
        secretsData.password = password.trim() || null;
        secretsData.specialPin = null;
        console.log(
          "🔒 Salvando galleria normale con password in gallerySecrets",
        );
      }

      await setDoc(secretsRef, secretsData);
      console.log("✅ Secrets salvati in gallerySecrets collection");

      // Auto-Link Ordine: Se esiste un ordine per il booking, aggiornalo con il galleryId
      if (prePopulate?.bookingId) {
        try {
          const {
            collection: firestoreCollection,
            query: firestoreQuery,
            where: firestoreWhere,
            getDocs: firestoreGetDocs,
            updateDoc: firestoreUpdateDoc,
            doc: firestoreDoc,
          } = await import("firebase/firestore");

          const ordersQuery = firestoreQuery(
            firestoreCollection(db, "orders"),
            firestoreWhere("bookingId", "==", prePopulate.bookingId),
          );
          const ordersSnapshot = await firestoreGetDocs(ordersQuery);

          if (!ordersSnapshot.empty) {
            // Aggiorna l'ordine esistente con il galleryId appena creato
            const orderDoc = ordersSnapshot.docs[0];
            await firestoreUpdateDoc(firestoreDoc(db, "orders", orderDoc.id), {
              galleryId: newGalleryId,
              updatedAt: serverTimestamp(),
            });
            console.log(
              `🔗 Auto-linked ordine ${orderDoc.id} alla nuova galleria ${newGalleryId}`,
            );
          }
        } catch (linkError) {
          console.error("⚠️ Errore auto-linking ordine:", linkError);
          // Non bloccare il flusso se linking fallisce
        }
      }

      // INVIO EMAIL AUTOMATICO: Se galleria speciale con PIN e email cliente fornita
      if (specialTheme !== "none" && specialPin.trim() && clientEmail.trim()) {
        console.log("📧 Invio email PIN al cliente...");

        try {
          const emailResponse = await fetch(
            "/api/email/special-gallery-pin-notification",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                galleryId: newGalleryId,
                clientEmail: clientEmail.trim(),
                clientName: clientName.trim() || undefined,
              }),
            },
          );

          if (emailResponse.ok) {
            console.log("✅ Email PIN inviata con successo");
            toast.success(
              `Galleria creata e email PIN inviata a ${clientEmail}`,
            );
          } else {
            const errorData = await emailResponse.json().catch(() => ({}));
            console.error("❌ Errore invio email PIN", errorData);
            toast.success("Galleria creata, ma invio email PIN non riuscito");
          }
        } catch (emailError) {
          console.error("❌ Eccezione invio email PIN:", emailError);
          toast.success("Galleria creata, ma invio email PIN non riuscito");
        }
      }
      // Send email notification if selection enabled
      else if (selectionEnabled && prePopulate?.clienteEmail) {
        try {
          const galleryUrl = `${window.location.origin}/gallery/${code}`;
          const deadlineFormatted = selectionDeadline
            ? new Date(selectionDeadline).toLocaleDateString("it-IT", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : undefined;

          // Build product requirements for email if multi-product mode
          const productReqs =
            prePopulate.availableProducts && selectedProductIndices.length > 0
              ? selectedProductIndices.map((index) => {
                  const prod = prePopulate.availableProducts![index];
                  return {
                    prodottoNome: prod.prodottoNome,
                    prodottoNumeroFoto: prod.prodottoNumeroFoto || 0,
                  };
                })
              : undefined;

          const emailResponse = await fetch("/api/email/gallery-ready", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipientEmail: prePopulate.clienteEmail,
              clienteNome: prePopulate.clienteNome || "Cliente",
              galleryName: name.trim(),
              galleryUrl,
              requiredPhotoCount: requiredPhotoCount || 0,
              selectionDeadline: deadlineFormatted,
              photoCount: 0, // Always 0 on creation
              productRequirements: productReqs, // NEW: multi-product support
            }),
          });

          if (emailResponse.ok) {
            console.log('✅ Email "Galleria Pronta" inviata al cliente');
            toast.success("Galleria creata con successo!");
          } else {
            console.error("⚠️ Email non inviata:", await emailResponse.text());
            toast.success("Galleria creata, ma invio email non riuscito");
          }
        } catch (emailError) {
          console.error("⚠️ Errore invio email galleria:", emailError);
          toast.success("Galleria creata, ma invio email non riuscito");
        }
      } 
      // INVIO AUTOMATICO PASSWORD: Galleria normale con password e cliente con email
      else if (specialTheme === "none" && password.trim() && (clientEmail.trim() || prePopulate?.clienteEmail)) {
        const recipientEmail = clientEmail.trim() || prePopulate?.clienteEmail;
        const recipientName = clientName.trim() || prePopulate?.clienteNome;
        
        console.log("📧 Invio automatico password galleria a:", recipientEmail);
        
        try {
          const emailResponse = await fetch("/api/email/gallery-password-notification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              galleryId: newGalleryId,
              clientEmail: recipientEmail,
              clientName: recipientName,
            }),
          });

          if (emailResponse.ok) {
            console.log("✅ Email password inviata con successo");
            toast.success(`Galleria creata e password inviata a ${recipientEmail}`);
          } else {
            console.error("⚠️ Errore invio email password:", await emailResponse.text());
            toast.success("Galleria creata, ma invio email password non riuscito");
          }
        } catch (emailError) {
          console.error("⚠️ Eccezione invio email password:", emailError);
          toast.success("Galleria creata, ma invio email password non riuscito");
        }
      } else {
        toast.success("Galleria creata con successo!");
      }

      // Reset form
      setName("");
      setDate("");
      setLocation("");
      setDescription("");
      setPassword("");
      setSpecialTheme("none");
      setSpecialPin("");
      setSelectionEnabled(false);
      setRequiredPhotoCount(0);
      setSelectionDeadline("");
      setProduct(null);

      onGalleryCreated?.(newGalleryId, code);
      onClose();
    } catch (error) {
      console.error("Errore creazione galleria:", error);
      toast.error("Errore durante la creazione della galleria");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} autoComplete="off">
          <DialogHeader>
            <DialogTitle>Crea Nuova Galleria Evento</DialogTitle>
            <DialogDescription>
              Inserisci i dettagli per creare una nuova galleria di evento
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome dell'Evento *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome dell'Evento"
                required
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Data dell'Evento</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="Data dell'Evento"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Luogo</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="es. Villa Rossi, Roma"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrizione</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Una breve descrizione dell'evento..."
                rows={3}
                autoComplete="off"
              />
            </div>

            {/* Cliente Selector - permette di associare un cliente alla galleria */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Cliente Associato</Label>
                {prePopulate?.clienteEmail && !clienteId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={async () => {
                      console.log("🔄 Importa da Prenotazione clicked, email:", prePopulate.clienteEmail);
                      try {
                        const cliente = await getClienteByEmail(prePopulate.clienteEmail!);
                        console.log("🔍 Risultato ricerca:", cliente);
                        if (cliente) {
                          setClienteId(cliente.id);
                          setImportedClienteInfo({ nome: cliente.nome, cognome: cliente.cognome });
                          console.log("✅ ClienteId settato:", cliente.id);
                          toast.success(`Cliente ${cliente.nome} ${cliente.cognome} associato`);
                        } else {
                          console.log("❌ Cliente non trovato");
                          toast.error("Cliente non trovato nel database");
                        }
                      } catch (error) {
                        console.error("❌ Errore ricerca:", error);
                        toast.error("Errore nella ricerca del cliente");
                      }
                    }}
                  >
                    <RefreshCw className="w-3 h-3" />
                    Importa da Prenotazione
                  </Button>
                )}
              </div>
              
              {/* Mostra cliente importato se presente */}
              {clienteId && importedClienteInfo && (
                <div className="p-3 bg-white rounded-lg border border-sage/20 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-sage text-white flex items-center justify-center font-semibold text-sm">
                      {`${importedClienteInfo.nome[0] || ''}${importedClienteInfo.cognome[0] || ''}`.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {importedClienteInfo.nome} {importedClienteInfo.cognome}
                      </p>
                      <p className="text-sm text-gray-500">
                        {prePopulate?.clienteEmail || 'Email non disponibile'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-sage/10 text-sage-dark">
                      Selezionato
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-gray-500 hover:text-gray-700"
                      onClick={() => {
                        setClienteId("");
                        setImportedClienteInfo(null);
                      }}
                    >
                      Cambia
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Mostra ClienteSelector solo se non c'è un cliente importato */}
              {!importedClienteInfo && (
                <ClienteSelector
                  value={clienteId}
                  onChange={(id) => {
                    setClienteId(id);
                    setImportedClienteInfo(null); // Clear imported info when manually selecting
                  }}
                  placeholder="Cerca e seleziona cliente..."
                  showCurrentClient={true}
                />
              )}
            </div>

            {/* Password Field - Hidden if special theme is selected */}
            {specialTheme === "none" && (
              <div className="space-y-2">
                <Label htmlFor="password">Password Accesso</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={handlePasswordChange}
                    placeholder="Password per accedere alla galleria"
                    className="pr-10"
                    autoComplete="new-password"
                  />
                  {password && (
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-3 flex items-center text-gray-500 hover:text-gray-700 transition-colors"
                      aria-label={
                        showPassword ? "Nascondi password" : "Mostra password"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Lascia vuoto per accesso libero
                </p>
              </div>
            )}

            {/* Special Theme Section - Hidden if password is set */}
            {!password.trim() && (
              <div className="border-t pt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="specialTheme">Tema Stagionale</Label>
                  <Select
                    value={specialTheme}
                    onValueChange={handleSpecialThemeChange}
                  >
                    <SelectTrigger data-testid="select-special-theme">
                      <SelectValue placeholder="Seleziona tema (opzionale)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        Nessun tema (galleria normale)
                      </SelectItem>
                      {availableThemes.map((theme) => (
                        <SelectItem key={theme.id} value={theme.id}>
                          {theme.icon} {theme.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Applica un tema stagionale speciale alla galleria
                  </p>
                </div>

                {specialTheme !== "none" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="specialPin">
                        PIN Galleria Speciale *
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="specialPin"
                          name="gallery-special-pin"
                          type="text"
                          value={specialPin}
                          onChange={(e) => {
                            setSpecialPin(e.target.value);
                            setPinCopied(false);
                          }}
                          placeholder="Es. 2024 (min. 4 caratteri)"
                          required={specialTheme !== "none"}
                          autoComplete="new-password"
                          data-testid="input-special-pin"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            const newPin = generateSecurePin(4);
                            setSpecialPin(newPin);
                            setPinCopied(false);
                            toast.success(`PIN generato: ${newPin}`);
                          }}
                          title="Genera PIN casuale"
                          data-testid="button-generate-pin"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={!specialPin.trim()}
                          onClick={() => {
                            navigator.clipboard.writeText(specialPin.trim());
                            setPinCopied(true);
                            toast.success("PIN copiato negli appunti");
                            setTimeout(() => setPinCopied(false), 2000);
                          }}
                          title="Copia PIN"
                          data-testid="button-copy-pin"
                        >
                          {pinCopied ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        PIN univoco (min. 4 caratteri alfanumerici) per accedere a questa galleria speciale
                      </p>
                    </div>

                    {/* Client Contact Info for PIN Notification */}
                    <div className="space-y-2">
                      <Label htmlFor="clientEmail">
                        Email Cliente (per invio PIN)
                      </Label>
                      <Input
                        id="clientEmail"
                        type="email"
                        value={clientEmail}
                        onChange={(e) => setClientEmail(e.target.value)}
                        placeholder="cliente@esempio.it"
                        autoComplete="off"
                      />
                      <p className="text-sm text-muted-foreground">
                        Opzionale: se fornita, il cliente riceverà
                        automaticamente una email con il PIN di accesso
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="clientName">Nome Cliente</Label>
                      <Input
                        id="clientName"
                        type="text"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        placeholder="Mario Rossi"
                        autoComplete="off"
                      />
                      <p className="text-sm text-muted-foreground">
                        Opzionale: per personalizzare l'email
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Product Multi-Selection (when multiple products available) */}
            {(hasMultipleProducts || hasSingleProduct) &&
              prePopulate?.availableProducts && (
                <div className="border-t pt-4 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-base font-semibold">
                      📦 Prodotti Ordine
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {hasMultipleProducts
                        ? `Questo ordine contiene ${prePopulate.availableProducts.length} prodotti. Seleziona quali includere nella galleria.`
                        : "Prodotto associato a questo ordine:"}
                    </p>
                  </div>

                  <div className="space-y-2 bg-sage/5 border border-sage/20 rounded-lg p-4">
                    {prePopulate.availableProducts.map((prod, index) => {
                      const isSelected = selectedProductIndices.includes(index);
                      const toggleProduct = () => {
                        if (isSelected) {
                          setSelectedProductIndices((prev) =>
                            prev.filter((i) => i !== index),
                          );
                        } else {
                          setSelectedProductIndices((prev) => [...prev, index]);
                        }
                      };

                      return (
                        <div
                          key={index}
                          className="flex items-start space-x-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-sage transition-colors"
                        >
                          <Checkbox
                            id={`product-${index}`}
                            checked={isSelected}
                            onCheckedChange={toggleProduct}
                            data-testid={`checkbox-product-${index}`}
                          />
                          <div
                            className="flex-1 cursor-pointer"
                            onClick={toggleProduct}
                          >
                            <div className="flex items-center gap-2">
                              <Label
                                htmlFor={`product-${index}`}
                                className="font-medium cursor-pointer"
                              >
                                {prod.prodottoNome}
                              </Label>
                              {!prod.prodottoId && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                                  Custom
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600">
                              {prod.prodottoNumeroFoto &&
                              prod.prodottoNumeroFoto > 0
                                ? `🎯 ${prod.prodottoNumeroFoto} foto richieste`
                                : "∞ Selezione libera"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Total Photo Count Summary */}
                  {selectedProductIndices.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm font-semibold text-blue-900">
                        📊 Totale foto richieste:{" "}
                        <span className="text-lg">
                          {calculateTotalPhotos()}
                        </span>
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        {selectedProductIndices.length}{" "}
                        {selectedProductIndices.length === 1
                          ? "prodotto selezionato"
                          : "prodotti selezionati"}
                      </p>
                    </div>
                  )}
                </div>
              )}

            {/* Product Snapshot & Photo Selection Section (LEGACY - only for single product mode) */}
            {product && !prePopulate?.availableProducts && (
              <div className="border-t pt-4 space-y-3">
                <div className="bg-sage/10 border border-sage/30 rounded-lg p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="w-5 h-5 text-sage mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-sage-dark">
                          📦 Prodotto Selezionato
                        </h4>
                        {isCustomProduct ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                            Custom
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                            Catalogo
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 mt-1">
                        <strong>{product.nome}</strong>
                      </p>
                      <p className="text-sm text-gray-600">
                        {product.numeroFoto > 0 
                          ? <>🎯 <strong>{product.numeroFoto} foto</strong> richieste per questo prodotto</>
                          : <>∞ <strong>Selezione libera</strong> per questo prodotto</>
                        }
                      </p>
                      {prePopulate?.specialTheme && (
                        <p className="text-sm text-gray-600">
                          🎨 Tema:{" "}
                          {availableThemes.find(
                            (t) => t.id === prePopulate.specialTheme,
                          )?.name || "Standard"}
                        </p>
                      )}
                      {isCustomProduct && (
                        <p className="text-xs text-gray-500 mt-2 italic">
                          ℹ️ Prodotto personalizzato creato per questo ordine
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Photo Selection Settings */}
            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="selectionEnabled"
                  checked={selectionEnabled}
                  onCheckedChange={(checked) =>
                    setSelectionEnabled(checked as boolean)
                  }
                  data-testid="checkbox-selection-enabled"
                />
                <Label
                  htmlFor="selectionEnabled"
                  className="font-medium cursor-pointer"
                >
                  Abilita Selezione Foto
                  {selectedProductIndices.length > 0 &&
                    ` (${calculateTotalPhotos()} foto totali)`}
                  {product &&
                    !prePopulate?.availableProducts &&
                    ` (${product.numeroFoto} foto)`}
                </Label>
              </div>
              <p className="text-sm text-muted-foreground ml-6">
                Permetti al cliente di selezionare le foto preferite dalla
                galleria
                {selectedProductIndices.length > 0 &&
                  " e assegnarle ai prodotti"}
              </p>

              {selectionEnabled && (
                <div className="ml-6 space-y-4 border-l-2 border-sage/30 pl-4">
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
                      className="mt-1 h-4 w-4 text-purple-600 focus:ring-purple-500 border-purple-300 rounded"
                      data-testid="checkbox-unlimited-selection"
                    />
                    <div className="flex-1">
                      <Label htmlFor="unlimitedSelection" className="text-sm font-semibold cursor-pointer flex items-center gap-2">
                        Selezione Libera (senza limite)
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                          Nuovo
                        </span>
                      </Label>
                      <p className="text-xs text-gray-600 mt-1">
                        Il cliente può selezionare quante foto desidera, senza un numero fisso. Perfetto per gallerie di consultazione o selezioni flessibili.
                      </p>
                    </div>
                  </div>

                  {/* Numero foto richieste - nascosto se selezione libera */}
                  {!unlimitedSelection && (
                  <div className="space-y-2">
                    <Label htmlFor="requiredPhotoCount" className="flex items-center gap-2">
                      Numero Foto da Selezionare
                      {(selectedProductIndices.length > 0 || product) && (
                        <span 
                          className="text-xs text-gray-500 cursor-help" 
                          title="Se impostato, questo valore ha la priorità sulla somma dei prodotti"
                        >
                          ⓘ
                        </span>
                      )}
                    </Label>
                    <Input
                      id="requiredPhotoCount"
                      type="number"
                      min="0"
                      value={requiredPhotoCount || ""}
                      onChange={(e) =>
                        setRequiredPhotoCount(parseInt(e.target.value) || 0)
                      }
                      placeholder={selectedProductIndices.length > 0 
                        ? `Auto: ${calculateTotalPhotos()}` 
                        : product 
                          ? `Auto: ${product.numeroFoto}` 
                          : "Es. 50"}
                      data-testid="input-required-photo-count"
                      autoComplete="off"
                    />
                    
                    {/* Messaggi contestuali */}
                    {selectedProductIndices.length > 0 && requiredPhotoCount === 0 ? (
                      <p className="text-xs text-sage flex items-center gap-1">
                        ✓ Usa somma prodotti: <strong>{calculateTotalPhotos()} foto</strong>
                      </p>
                    ) : selectedProductIndices.length > 0 && requiredPhotoCount > 0 && requiredPhotoCount !== calculateTotalPhotos() ? (
                      <p className="text-xs text-blue-600 flex items-center gap-1">
                        ℹ️ Valore manuale attivo (ignora somma prodotti: {calculateTotalPhotos()})
                      </p>
                    ) : product && requiredPhotoCount === 0 ? (
                      <p className="text-xs text-sage flex items-center gap-1">
                        ✓ Usa numero prodotto: <strong>{product.numeroFoto} foto</strong>
                      </p>
                    ) : product && requiredPhotoCount > 0 ? (
                      <p className="text-xs text-blue-600 flex items-center gap-1">
                        ℹ️ Valore manuale (prodotto suggeriva: {product.numeroFoto})
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Quante foto deve selezionare il cliente?
                      </p>
                    )}
                  </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="selectionDeadline">
                      Scadenza Selezione (Opzionale)
                    </Label>
                    <Input
                      id="selectionDeadline"
                      type="date"
                      value={selectionDeadline}
                      onChange={(e) => setSelectionDeadline(e.target.value)}
                      min={new Date().toISOString().split("T")[0]}
                      data-testid="input-selection-deadline"
                      autoComplete="off"
                    />
                    <p className="text-sm text-muted-foreground">
                      Se impostata, il cliente riceverà email reminder 1 giorno
                      prima e selezione bloccata dopo deadline (puoi sbloccare
                      manualmente)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* YouTube Videos Section */}
            <div className="border-t pt-4 space-y-3">
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
                      autoComplete="off"
                      className={`${newYoutubeUrl.trim() ? (isValidYouTubeUrl(newYoutubeUrl) ? 'border-green-400 bg-green-50 pr-20' : 'border-red-400 bg-red-50 pr-20') : ''}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newYoutubeUrl.trim()) {
                          e.preventDefault();
                          if (!isValidYouTubeUrl(newYoutubeUrl)) {
                            toast.error("URL non valido. Inserisci un URL YouTube valido.");
                            return;
                          }
                          if (isYouTubeUrlDuplicate(newYoutubeUrl, youtubeUrls)) {
                            toast.error("Questo video è già nella lista.");
                            return;
                          }
                          setYoutubeUrls([...youtubeUrls, newYoutubeUrl.trim()]);
                          setNewYoutubeUrl("");
                          toast.success("Video aggiunto!");
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
                          toast.error("URL non valido. Inserisci un URL YouTube valido.");
                          return;
                        }
                        if (isYouTubeUrlDuplicate(newYoutubeUrl, youtubeUrls)) {
                          toast.error("Questo video è già nella lista.");
                          return;
                        }
                        setYoutubeUrls([...youtubeUrls, newYoutubeUrl.trim()]);
                        setNewYoutubeUrl("");
                        toast.success("Video aggiunto!");
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
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creazione..." : "Crea Galleria"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
