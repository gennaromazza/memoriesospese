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
import { RichTextEditor } from "@/components/ui/rich-text-editor";
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
import { Info } from "lucide-react";
import { createAbsoluteUrl } from "@/lib/basePath";

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
  const [selectionEnabled, setSelectionEnabled] = useState(false);
  const [requiredPhotoCount, setRequiredPhotoCount] = useState<number>(0);
  const [selectionDeadline, setSelectionDeadline] = useState<string>("");
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCustomProduct, setIsCustomProduct] = useState(false);

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
  useEffect(() => {
    setSelectedProductIndices([]);
    setIsCustomProduct(false);
    setSelectionEnabled(false);
    setRequiredPhotoCount(0);
    setProduct(null);
    console.log("🔄 Reset completo stato per nuovo booking");
  }, [prePopulate?.bookingId]);

  // Calculate total required photos from selected products
  const calculateTotalPhotos = () => {
    if (!prePopulate?.availableProducts || selectedProductIndices.length === 0)
      return 0;

    return selectedProductIndices.reduce((total, index) => {
      const product = prePopulate.availableProducts![index];
      return total + (product.prodottoNumeroFoto || 0);
    }, 0);
  };

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

        // CRITICAL: Gestisci esplicitamente sia numeroFoto > 0 che numeroFoto = 0
        if (numeroFoto > 0) {
          setSelectionEnabled(true);
          setRequiredPhotoCount(numeroFoto);
        } else {
          setSelectionEnabled(false);
          setRequiredPhotoCount(0);
        }
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
            // CRITICAL: Gestisci esplicitamente sia numeroFoto > 0 che numeroFoto = 0
            if (productData.numeroFoto > 0) {
              setSelectionEnabled(true);
              setRequiredPhotoCount(productData.numeroFoto);
            } else {
              setSelectionEnabled(false);
              setRequiredPhotoCount(0);
            }
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
    }
  }, [prePopulate]);

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

    setIsLoading(true);
    try {
      // CHECK PIN UNIVOCITÀ: Verifica che il PIN non sia già usato da altre gallerie
      if (specialTheme !== "none" && specialPin.trim()) {
        console.log("🔍 Verifica unicità PIN...");
        const checkResponse = await fetch("/api/email/check-pin-unique", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pin: specialPin.trim(),
            currentGalleryId: null, // Nuova galleria, nessun ID ancora
          }),
        });

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
        // Product-based selection (from availableProducts)
        if (
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

          // 🔥 FIX Task 5-6: Distingui single-product (1 prodotto) vs multi-product (2+ prodotti)
          const hasSingleProduct = productReqs.length === 1;
          const hasMultipleProducts = productReqs.length > 1;

          if (hasSingleProduct) {
            // Single-Product Mode: Save as requiredPhotoCount (compatible with Gallery.tsx refactor)
            galleryData.requiredPhotoCount = productReqs[0].prodottoNumeroFoto || 0;
            galleryData.selectionStatus = "pending";
            galleryData.selectedPhotoIds = [];
            // NON salvare productRequirements per single-product
            console.log(
              "💾 Salvando galleria single-product con requiredPhotoCount:",
              galleryData.requiredPhotoCount,
              "(da prodotto:",
              productReqs[0].prodottoNome,
              ")",
            );
          } else if (hasMultipleProducts) {
            // Multi-Product Mode: Save productRequirements array
            galleryData.productRequirements = productReqs;
            galleryData.photoAssignments = {}; // Empty initially - client will populate during selection
            galleryData.selectionStatus = "pending";
            galleryData.selectedPhotoIds = []; // Legacy field - mantieni per compatibility
            console.log(
              "💾 Salvando galleria multi-prodotto con productRequirements:",
              productReqs,
            );
          }
        }
        // Legacy Single-Product Mode: Save requiredPhotoCount (manual input)
        else if (requiredPhotoCount > 0) {
          galleryData.requiredPhotoCount = requiredPhotoCount;
          galleryData.selectionStatus = "pending";
          galleryData.selectedPhotoIds = [];
          console.log(
            "💾 Salvando galleria legacy single-product con requiredPhotoCount:",
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
        <form onSubmit={handleSubmit}>
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
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Luogo</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="es. Villa Rossi, Roma"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrizione</Label>
              <RichTextEditor
                value={description}
                onChange={setDescription}
                placeholder="Una breve descrizione dell'evento..."
              />
            </div>

            {/* Password Field - Hidden if special theme is selected */}
            {specialTheme === "none" && (
              <div className="space-y-2">
                <Label htmlFor="password">Password Accesso</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={handlePasswordChange}
                  placeholder="Password per accedere alla galleria"
                />
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
                      <Input
                        id="specialPin"
                        type="text"
                        value={specialPin}
                        onChange={(e) => setSpecialPin(e.target.value)}
                        placeholder="Es. 2024"
                        required={specialTheme !== "none"}
                        data-testid="input-special-pin"
                      />
                      <p className="text-sm text-muted-foreground">
                        PIN univoco per accedere a questa galleria speciale
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
                                : "📎 Nessuna foto richiesta"}
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
                        🎯 <strong>{product.numeroFoto} foto</strong> richieste
                        per questo prodotto
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
                  <div className="space-y-2">
                    <Label htmlFor="requiredPhotoCount">
                      Numero Foto da Selezionare *
                    </Label>
                    <Input
                      id="requiredPhotoCount"
                      type="number"
                      min="1"
                      value={requiredPhotoCount || ""}
                      onChange={(e) =>
                        setRequiredPhotoCount(parseInt(e.target.value) || 0)
                      }
                      placeholder="Es. 50"
                      required={selectionEnabled}
                      data-testid="input-required-photo-count"
                    />
                    <p className="text-sm text-muted-foreground">
                      {product
                        ? `Pre-compilato da prodotto: ${product.numeroFoto} foto (puoi modificarlo)`
                        : "Quante foto deve selezionare il cliente?"}
                    </p>
                  </div>

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
