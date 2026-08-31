import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleUserRound,
  Clock3,
  Image as ImageIcon,
  Loader2,
  LockKeyhole,
  MapPin,
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { useStudio } from '@/context/StudioContext';
import { useSEO } from '@/hooks/useSEO';
import type {
  PrintShopDeliveryMethod,
  PrintShopPostalAddress,
  PrintShopQuote,
} from '@shared/print-shop-types';
import { isValidCodiceFiscale } from '@shared/fiscal-validation';
import { PhotoUploadQueue } from '@/features/print-shop/PhotoUploadQueue';
import { PayPalCheckout } from '@/features/print-shop/PayPalCheckout';
import { PrintShopAuthGate } from '@/features/print-shop/PrintShopAuthGate';
import { PrintGroupsEditor } from '@/features/print-shop/PrintGroupEditor';
import { inspectJpegFile } from '@/features/print-shop/print-shop-files';
import { PrintShopApiError, printShopApi } from '@/features/print-shop/print-shop-api';
import {
  hasSamePaypalQuoteGuard,
  PrintShopQuoteReviewRequiredError,
} from '@/features/print-shop/paypal-checkout-state';
import {
  PRINT_SHOP_MAX_PICKUP_DAYS,
  resolveStudioLegalDetails,
} from '@/features/print-shop/studio-legal-details';
import {
  buildPrintOrderItems,
  createLocalId,
  estimateOrderTotalCents,
  findPrintProduct,
  formatEuroCents,
  groupCopyCount,
  hasLowResolutionPhotos,
  quoteTotal,
  validatePrintGroups,
  type PrintGroupIssue,
} from '@/features/print-shop/print-shop-state';
import {
  isResumablePrintDraft,
  printShopDraftRequestStorageKey,
  printShopDraftStorageKey,
  restorePrintDraft,
  restorePrintDraftQuote,
} from '@/features/print-shop/resume-draft';
import { uploadPrintFileResumable } from '@/features/print-shop/print-shop-upload';
import type {
  LocalPrintPhoto,
  PaypalCaptureResult,
  PrintGroupDraft,
  PrintShopCatalogPayload,
  PrintShopContactDraft,
} from '@/features/print-shop/types';

type OrderStep = 'upload' | 'configure' | 'checkout';

const STEP_ORDER: OrderStep[] = ['upload', 'configure', 'checkout'];
const STEP_LABELS: Record<OrderStep, string> = {
  upload: 'Carica le foto',
  configure: 'Scegli le stampe',
  checkout: 'Controlla e paga',
};

function readableError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Qualcosa non ha funzionato. Riprova.';
}

function createInitialGroup(sku: string, photos: LocalPrintPhoto[]): PrintGroupDraft {
  return {
    id: createLocalId('group'),
    sku,
    finish: 'glossy',
    fitMode: 'border',
    assignments: photos.map((photo) => ({ localPhotoId: photo.localId, copies: 1 })),
  };
}

function blankPostalAddress(): PrintShopPostalAddress {
  return { street: '', houseNumber: '', postalCode: '', city: '', province: '', country: 'IT' };
}

function postalAddressComplete(address: PrintShopPostalAddress): boolean {
  return Boolean(
    address.street.trim() &&
    address.houseNumber.trim() &&
    /^\d{5}$/.test(address.postalCode.trim()) &&
    address.city.trim() &&
    /^[A-Za-z]{2}$/.test(address.province.trim()),
  );
}

function groupIssuesById(issues: PrintGroupIssue[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const issue of issues) {
    result.set(issue.groupId, [...(result.get(issue.groupId) ?? []), issue.message]);
  }
  return result;
}

function StepIndicator({ step }: { step: OrderStep }) {
  const activeIndex = STEP_ORDER.indexOf(step);
  return (
    <nav aria-label="Avanzamento ordine">
      <ol className="mx-auto grid max-w-3xl grid-cols-3 px-1">
        {STEP_ORDER.map((entry, index) => {
          const completed = index < activeIndex;
          const active = entry === step;
          return (
            <li
              key={entry}
              className="relative flex min-w-0 flex-col items-center text-center"
              aria-current={active ? 'step' : undefined}
            >
              <div className="relative z-10 flex min-w-0 flex-col items-center gap-1.5">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${completed ? 'bg-dark-sage text-white' : active ? 'bg-terracotta text-white' : 'bg-sage/15 text-blue-gray/60'}`}>
                  {completed ? <Check className="h-4 w-4" aria-hidden="true" /> : index + 1}
                </span>
                <span className={`max-w-full text-[11px] font-semibold leading-tight sm:text-xs ${active ? 'text-blue-gray' : 'text-blue-gray/60'}`}>
                  {STEP_LABELS[entry]}
                </span>
              </div>
              {index < STEP_ORDER.length - 1 && (
                <span
                  className={`absolute left-[calc(50%+1.25rem)] right-[calc(-50%+1.25rem)] top-4 h-px ${completed ? 'bg-dark-sage' : 'bg-sage/25'}`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ConsentRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-sage/15 bg-off-white/45 p-3 text-sm leading-relaxed text-blue-gray/70">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-5 w-5 flex-none rounded border-sage text-terracotta accent-[#b56b50]"
      />
      <span>{children}</span>
    </label>
  );
}

function AddressFields({
  address,
  onChange,
  prefix,
  readOnly,
}: {
  address: PrintShopPostalAddress;
  onChange: (address: PrintShopPostalAddress) => void;
  prefix: string;
  readOnly?: boolean;
}) {
  const patch = (value: Partial<PrintShopPostalAddress>) => onChange({ ...address, ...value });
  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <label className="text-sm font-semibold text-blue-gray sm:col-span-4">
        Via o piazza <span className="text-red-700">(obbligatoria)</span>
        <Input id={`${prefix}-street`} value={address.street} onChange={(event) => patch({ street: event.target.value })} autoComplete="address-line1" readOnly={readOnly} className="mt-2 h-12 rounded-xl font-normal" />
      </label>
      <label className="text-sm font-semibold text-blue-gray sm:col-span-2">
        Numero civico <span className="text-red-700">(obbligatorio)</span>
        <Input value={address.houseNumber} onChange={(event) => patch({ houseNumber: event.target.value })} autoComplete="address-line2" readOnly={readOnly} className="mt-2 h-12 rounded-xl font-normal" />
      </label>
      <label className="text-sm font-semibold text-blue-gray sm:col-span-2">
        CAP <span className="text-red-700">(obbligatorio)</span>
        <Input inputMode="numeric" maxLength={5} value={address.postalCode} onChange={(event) => patch({ postalCode: event.target.value.replace(/\D/g, '').slice(0, 5) })} autoComplete="postal-code" readOnly={readOnly} className="mt-2 h-12 rounded-xl font-normal" />
      </label>
      <label className="text-sm font-semibold text-blue-gray sm:col-span-3">
        Città <span className="text-red-700">(obbligatoria)</span>
        <Input value={address.city} onChange={(event) => patch({ city: event.target.value })} autoComplete="address-level2" readOnly={readOnly} className="mt-2 h-12 rounded-xl font-normal" />
      </label>
      <label className="text-sm font-semibold text-blue-gray sm:col-span-1">
        Provincia <span className="text-red-700">*</span>
        <Input maxLength={2} value={address.province} onChange={(event) => patch({ province: event.target.value.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() })} autoComplete="address-level1" readOnly={readOnly} placeholder="CE" className="mt-2 h-12 rounded-xl font-normal uppercase" />
      </label>
    </div>
  );
}

export default function PrintShopOrderPage() {
  useSEO({
    title: 'Ordina stampe fotografiche online | Image Studio',
    description: 'Carica le tue foto JPG, scegli formato e carta e paga online in sicurezza con PayPal.',
    canonical: '/stampa-foto-aversa/ordine',
    noindex: true,
  });

  const [, navigate] = useLocation();
  const { user, userProfile, isLoading: authLoading } = useFirebaseAuth();
  const { studioSettings, loading: studioLoading } = useStudio();
  const [step, setStep] = useState<OrderStep>('upload');
  const [catalog, setCatalog] = useState<PrintShopCatalogPayload | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [paymentAttempted, setPaymentAttempted] = useState(false);
  const [photos, setPhotos] = useState<LocalPrintPhoto[]>([]);
  const photosRef = useRef<LocalPrintPhoto[]>([]);
  const objectUrlsRef = useRef(new Set<string>());
  const uploadControllersRef = useRef(new Map<string, AbortController>());
  const mountedRef = useRef(true);
  const [groups, setGroups] = useState<PrintGroupDraft[]>([]);
  const [validationIssues, setValidationIssues] = useState<PrintGroupIssue[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [validatingFiles, setValidatingFiles] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const orderIdRef = useRef<string | null>(null);
  const draftPromiseRef = useRef<Promise<string> | null>(null);
  const resumedDraftForUserRef = useRef<string | null>(null);
  const [draftResumeLoading, setDraftResumeLoading] = useState(false);
  const [draftResumeNotice, setDraftResumeNotice] = useState<string | null>(null);
  const [resumedPendingPayment, setResumedPendingPayment] = useState(false);
  const [quote, setQuote] = useState<PrintShopQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [contact, setContact] = useState<PrintShopContactDraft>({
    displayName: '',
    email: '',
    phone: '',
    customerNotes: '',
  });
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [customProductAccepted, setCustomProductAccepted] = useState(false);
  const [lowResolutionAccepted, setLowResolutionAccepted] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<PrintShopDeliveryMethod>('studio_pickup');
  const [shippingAddress, setShippingAddress] = useState<PrintShopPostalAddress>(blankPostalAddress);
  const [fiscalCode, setFiscalCode] = useState('');
  const [residenceSameAsShipping, setResidenceSameAsShipping] = useState(true);
  const [residenceAddress, setResidenceAddress] = useState<PrintShopPostalAddress>(blankPostalAddress);

  const updatePhotos = useCallback((updater: (current: LocalPrintPhoto[]) => LocalPrintPhoto[]) => {
    setPhotos((current) => {
      const next = updater(current);
      photosRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15_000);
    setCatalogLoading(true);
    printShopApi.getCatalog(controller.signal)
      .then((payload) => {
        if (!active) return;
        setCatalog(payload);
        setCatalogError(payload.products.length > 0 ? null : 'Il listino non contiene ancora formati disponibili.');
      })
      .catch((error) => {
        if (!active) return;
        if (timedOut) {
          setCatalogError('Il listino sta impiegando troppo tempo a rispondere. Ricarica la pagina per riprovare.');
        } else if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setCatalogError(readableError(error));
        }
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setCatalogLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    setContact((current) => ({
      ...current,
      displayName: current.displayName || user.displayName || userProfile?.displayName || '',
      email: user.email || current.email,
    }));
  }, [user, userProfile]);

  useEffect(() => {
    if (!user) {
      resumedDraftForUserRef.current = null;
      setDraftResumeLoading(false);
      return;
    }
    if (resumedDraftForUserRef.current === user.uid) return;
    resumedDraftForUserRef.current = user.uid;

    const draftKey = printShopDraftStorageKey(user.uid);
    const requestKey = printShopDraftRequestStorageKey(user.uid);
    const savedOrderId = sessionStorage.getItem(draftKey);
    if (!savedOrderId) {
      setDraftResumeLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15_000);
    setDraftResumeLoading(true);
    setDraftResumeNotice(null);
    printShopApi.getOrder(savedOrderId, controller.signal)
      .then((savedOrder) => {
        if (!active) return;
        if (!isResumablePrintDraft(savedOrder)) {
          sessionStorage.removeItem(draftKey);
          sessionStorage.removeItem(requestKey);
          return;
        }
        const restored = restorePrintDraft(savedOrder);
        const restoredQuote = restorePrintDraftQuote(savedOrder);
        const pendingPayment = Boolean(
          restoredQuote
          && savedOrder.fulfillment.status === 'awaiting_payment'
          && savedOrder.payment.status === 'pending',
        );
        orderIdRef.current = savedOrder.id;
        setOrderId(savedOrder.id);
        updatePhotos(() => restored.photos);
        setGroups(restored.groups);
        setQuote(pendingPayment ? restoredQuote : null);
        setResumedPendingPayment(pendingPayment);
        setValidationIssues([]);
        setContact((current) => ({
          ...current,
          displayName: savedOrder.customer?.name || current.displayName,
          email: savedOrder.customer?.email || user.email || current.email,
          phone: savedOrder.customer?.phone || current.phone,
          customerNotes: savedOrder.printShop?.customerNotes || current.customerNotes,
        }));
        const restoredMethod = savedOrder.fulfillment?.method === 'shipping' ? 'shipping' : 'studio_pickup';
        setDeliveryMethod(restoredMethod);
        if (savedOrder.fulfillment?.shippingAddress) {
          setShippingAddress(savedOrder.fulfillment.shippingAddress);
        }
        if (savedOrder.billingDetails) {
          setFiscalCode(savedOrder.billingDetails.fiscalCode || '');
          setResidenceAddress(savedOrder.billingDetails.residenceAddress);
          setResidenceSameAsShipping(
            JSON.stringify(savedOrder.billingDetails.residenceAddress) ===
              JSON.stringify(savedOrder.fulfillment?.shippingAddress),
          );
        }
        setStep(pendingPayment ? 'checkout' : restored.groups.length > 0 && restored.photos.length > 0 ? 'configure' : 'upload');
        setDraftResumeNotice(
          pendingPayment
            ? 'Ordine ripreso: il riepilogo è già confermato e puoi completare il pagamento PayPal.'
            : restored.photos.length > 0
            ? `Bozza ripresa: ${restored.photos.length} ${restored.photos.length === 1 ? 'foto già caricata' : 'foto già caricate'}.`
            : 'Bozza ripresa. Puoi continuare a caricare le foto.',
        );
      })
      .catch((error) => {
        if (!active) return;
        if (timedOut) {
          setDraftResumeNotice('Il recupero della bozza sta impiegando troppo tempo. Puoi iniziare un nuovo ordine oppure ricaricare la pagina per riprovare.');
          return;
        }
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof PrintShopApiError && (error.status === 404 || error.code === 'order_not_found')) {
          sessionStorage.removeItem(draftKey);
          sessionStorage.removeItem(requestKey);
          return;
        }
        setPageError(readableError(error));
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setDraftResumeLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
      if (resumedDraftForUserRef.current === user.uid) {
        resumedDraftForUserRef.current = null;
      }
    };
  }, [updatePhotos, user]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const controller of uploadControllersRef.current.values()) controller.abort();
      uploadControllersRef.current.clear();
      for (const objectUrl of objectUrlsRef.current) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  const uploadedPhotos = useMemo(() => photos.filter((photo) => photo.status === 'uploaded'), [photos]);
  const uploadBusy = validatingFiles || photos.some((photo) => ['queued', 'preparing', 'uploading', 'finalizing'].includes(photo.status));
  const uploadHasErrors = photos.some((photo) => photo.status === 'error');
  const estimatedTotalCents = useMemo(
    () => estimateOrderTotalCents(groups, catalog?.products ?? []) +
      (deliveryMethod === 'shipping' && catalog?.shipping.enabled ? catalog.shipping.priceCents : 0),
    [groups, catalog, deliveryMethod],
  );
  const locallyLowResolution = useMemo(
    () => hasLowResolutionPhotos(groups, catalog?.products ?? [], uploadedPhotos),
    [groups, catalog, uploadedPhotos],
  );
  const lowResolution = quote
    ? (quote.qualityWarnings?.length ?? 0) > 0
    : locallyLowResolution;
  const issuesByGroup = useMemo(() => groupIssuesById(validationIssues), [validationIssues]);

  const ensureDraft = useCallback(async (): Promise<string> => {
    if (!user) throw new Error('Accedi per caricare le foto.');
    if (orderIdRef.current) return orderIdRef.current;
    if (draftPromiseRef.current) return draftPromiseRef.current;

    const requestKeyName = printShopDraftRequestStorageKey(user.uid);
    const existingRequestKey = sessionStorage.getItem(requestKeyName);
    const idempotencyKey = existingRequestKey || createLocalId('draft');
    sessionStorage.setItem(requestKeyName, idempotencyKey);

    draftPromiseRef.current = printShopApi.createDraft(idempotencyKey).then((draft) => {
      orderIdRef.current = draft.id;
      setOrderId(draft.id);
      sessionStorage.setItem(printShopDraftStorageKey(user.uid), draft.id);
      return draft.id;
    }).finally(() => {
      draftPromiseRef.current = null;
    });
    return draftPromiseRef.current;
  }, [user]);

  const patchPhoto = useCallback((localId: string, patch: Partial<LocalPrintPhoto>) => {
    if (!mountedRef.current) return;
    updatePhotos((current) => current.map((photo) => photo.localId === localId ? { ...photo, ...patch } : photo));
  }, [updatePhotos]);

  const uploadOne = useCallback(async (photo: LocalPrintPhoto) => {
    if (!user || !photo.file) return;
    const file = photo.file;
    uploadControllersRef.current.get(photo.localId)?.abort();
    const uploadController = new AbortController();
    uploadControllersRef.current.set(photo.localId, uploadController);
    try {
      patchPhoto(photo.localId, { status: 'preparing', error: undefined, progress: 0 });
      const draftId = await ensureDraft();
      const prepared = await printShopApi.prepareUpload(
        draftId,
        file,
        `prepare-${photo.localId}`,
      );
      patchPhoto(photo.localId, {
        status: 'uploading',
        assetId: prepared.assetId,
        storagePath: prepared.storagePath,
      });
      await uploadPrintFileResumable({
        file,
        uploadUrl: prepared.uploadUrl,
        storagePath: prepared.storagePath,
        orderId: draftId,
        assetId: prepared.assetId,
        ownerUid: user.uid,
        sha256: photo.sha256,
        requiredMetadata: prepared.requiredMetadata,
        signal: uploadController.signal,
        onProgress: (progress) => patchPhoto(photo.localId, { progress, status: 'uploading' }),
      });
      patchPhoto(photo.localId, { status: 'finalizing', progress: 100 });
      const finalized = await printShopApi.finalizeUpload(
        draftId,
        prepared,
        file,
        photo.widthPx,
        photo.heightPx,
      );
      patchPhoto(photo.localId, {
        status: 'uploaded',
        progress: 100,
        assetId: finalized.assetId,
        storagePath: finalized.storagePath,
        error: undefined,
      });
    } catch (error) {
      patchPhoto(photo.localId, {
        status: 'error',
        error: readableError(error),
        retryCount: photo.retryCount + 1,
      });
    } finally {
      if (uploadControllersRef.current.get(photo.localId) === uploadController) {
        uploadControllersRef.current.delete(photo.localId);
      }
    }
  }, [ensureDraft, patchPhoto, user]);

  const uploadWithConcurrency = useCallback(async (candidates: LocalPrintPhoto[]) => {
    const queue = [...candidates];
    const worker = async () => {
      while (queue.length > 0) {
        const candidate = queue.shift();
        if (candidate) await uploadOne(candidate);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
  }, [uploadOne]);

  const handleFilesSelected = useCallback(async (files: File[]) => {
    if (!user || files.length === 0) return;
    setValidatingFiles(true);
    setFileErrors([]);
    setPageError(null);
    const existingHashes = new Set(photosRef.current.map((photo) => photo.sha256));
    const candidates: LocalPrintPhoto[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const inspected = await inspectJpegFile(file);
        if (existingHashes.has(inspected.sha256)) {
          errors.push(`${file.name}: questa foto è già presente. Per più stampe usa il numero di copie.`);
          continue;
        }
        existingHashes.add(inspected.sha256);
        const previewUrl = URL.createObjectURL(file);
        objectUrlsRef.current.add(previewUrl);
        candidates.push({
          localId: createLocalId('photo'),
          file,
          fileName: file.name,
          sizeBytes: file.size,
          previewUrl,
          ...inspected,
          status: 'queued',
          progress: 0,
          retryCount: 0,
        });
      } catch (error) {
        errors.push(readableError(error));
      }
    }

    if (candidates.length > 0) updatePhotos((current) => [...current, ...candidates]);
    setFileErrors(errors);
    setValidatingFiles(false);
    if (candidates.length > 0) void uploadWithConcurrency(candidates);
  }, [updatePhotos, uploadWithConcurrency, user]);

  const retryPhoto = useCallback(async (localId: string) => {
    const photo = photosRef.current.find((candidate) => candidate.localId === localId);
    if (!photo || !photo.file) return;
    const file = photo.file;
    uploadControllersRef.current.get(localId)?.abort();
    // Se tutti i byte sono arrivati ma la risposta di finalizzazione si è
    // interrotta, non tentiamo di sovrascrivere l'oggetto (vietato dalle rules):
    // chiediamo semplicemente al backend di verificarlo di nuovo.
    if (orderIdRef.current && photo.assetId && photo.storagePath && photo.progress === 100) {
      try {
        patchPhoto(localId, { status: 'finalizing', error: undefined });
        const finalized = await printShopApi.finalizeUpload(
          orderIdRef.current,
          { assetId: photo.assetId, storagePath: photo.storagePath },
          file,
          photo.widthPx,
          photo.heightPx,
        );
        patchPhoto(localId, {
          status: 'uploaded',
          progress: 100,
          assetId: finalized.assetId,
          storagePath: finalized.storagePath,
          error: undefined,
        });
      } catch (error) {
        patchPhoto(localId, {
          status: 'error',
          error: readableError(error),
          retryCount: photo.retryCount + 1,
        });
      }
      return;
    }
    await uploadOne(photo);
  }, [patchPhoto, uploadOne]);

  const removePhoto = useCallback(async (localId: string) => {
    const photo = photosRef.current.find((candidate) => candidate.localId === localId);
    if (!photo) return;
    setPageError(null);
    try {
      if (orderIdRef.current && photo.assetId) {
        await printShopApi.deleteAsset(orderIdRef.current, photo.assetId);
      }
      if (photo.previewUrl) {
        objectUrlsRef.current.delete(photo.previewUrl);
        URL.revokeObjectURL(photo.previewUrl);
      }
      updatePhotos((current) => current.filter((candidate) => candidate.localId !== localId));
      setQuote(null);
      setGroups((current) => current.map((group) => ({
        ...group,
        assignments: group.assignments.filter((assignment) => assignment.localPhotoId !== localId),
      })));
    } catch (error) {
      setPageError(readableError(error));
    }
  }, [updatePhotos]);

  const continueToConfiguration = () => {
    setPageError(null);
    if (uploadedPhotos.length === 0) {
      setPageError('Carica almeno una fotografia JPG per continuare.');
      return;
    }
    if (uploadBusy || uploadHasErrors || uploadedPhotos.length !== photos.length) {
      setPageError('Attendi i caricamenti e riprova o rimuovi le foto con errore.');
      return;
    }
    if (!catalog?.products.length) {
      setPageError('Il listino non è disponibile. Riprova tra poco.');
      return;
    }
    if (groups.length === 0) setGroups([createInitialGroup(catalog.products[0].sku, uploadedPhotos)]);
    setValidationIssues([]);
    setStep('configure');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addGroup = () => {
    const sku = catalog?.products[0]?.sku ?? '';
    setGroups((current) => [...current, createInitialGroup(sku, [])]);
  };

  const continueToCheckout = async () => {
    if (!catalog) return;
    setPageError(null);
    const issues = validatePrintGroups(groups, catalog.products, uploadedPhotos);
    setValidationIssues(issues);
    if (issues.length > 0) {
      setPageError('Controlla i gruppi indicati prima di continuare.');
      return;
    }
    setQuoteLoading(true);
    try {
      const draftId = await ensureDraft();
      const serverQuote = await printShopApi.quoteOrder(
        draftId,
        buildPrintOrderItems(groups, uploadedPhotos),
        deliveryMethod,
      );
      setQuote(serverQuote);
      setLowResolutionAccepted(false);
      setStep('checkout');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setPageError(readableError(error));
    } finally {
      setQuoteLoading(false);
    }
  };

  const resetCheckoutAcceptances = useCallback(() => {
    setPrivacyAccepted(false);
    setTermsAccepted(false);
    setCustomProductAccepted(false);
    setLowResolutionAccepted(false);
  }, []);

  const refreshQuoteForReview = useCallback(async () => {
    if (!orderId) throw new Error('Ordine non pronto. Torna al passaggio precedente e riprova.');
    if (resumedPendingPayment) {
      const refreshedOrder = await printShopApi.getOrder(orderId);
      const refreshedQuote = restorePrintDraftQuote(refreshedOrder);
      if (!refreshedQuote) throw new Error('Non riesco a leggere il nuovo riepilogo. Ricarica la pagina.');
      const restored = restorePrintDraft(refreshedOrder);
      setGroups(restored.groups);
      setQuote(refreshedQuote);
      setResumedPendingPayment(false);
      resetCheckoutAcceptances();
      setPageError('Il listino è cambiato: controlla il nuovo totale e accetta nuovamente le condizioni prima di pagare.');
      setDraftResumeNotice(null);
      return;
    }
    const items = buildPrintOrderItems(groups, uploadedPhotos);
    const freshQuote = await printShopApi.quoteOrder(orderId, items, deliveryMethod);
    setQuote(freshQuote);
    resetCheckoutAcceptances();
  }, [deliveryMethod, groups, orderId, resetCheckoutAcceptances, resumedPendingPayment, uploadedPhotos]);

  const prepareOrderForPayment = useCallback(async (): Promise<PrintShopQuote> => {
    if (!orderId || !catalog || !quote) throw new Error('Ordine non pronto. Torna al passaggio precedente e riprova.');
    // Per un ordine PayPal già aperto la quote owner è uno snapshot server-side
    // firmato. PATCH/quote sono volutamente bloccati: si può solo riusare quel
    // pagamento oppure eliminare la bozza e ripartire.
    if (resumedPendingPayment) return quote;
    const issues = validatePrintGroups(groups, catalog.products, uploadedPhotos);
    if (issues.length > 0) throw new Error('Controlla i formati e le fotografie prima di pagare.');
    const items = buildPrintOrderItems(groups, uploadedPhotos);
    await printShopApi.updateDraft(orderId, {
      items,
      contact,
      lowResolutionAccepted: !lowResolution || lowResolutionAccepted,
      customerNotes: contact.customerNotes.trim() || undefined,
      fulfillment: deliveryMethod === 'shipping'
        ? { method: 'shipping', shippingAddress }
        : { method: 'studio_pickup' },
      ...(deliveryMethod === 'shipping' ? {
        billingDetails: {
          fiscalCode: fiscalCode.trim().toUpperCase(),
          residenceAddress: residenceSameAsShipping ? shippingAddress : residenceAddress,
        },
      } : {}),
    });
    const freshQuote = await printShopApi.quoteOrder(orderId, items, deliveryMethod);
    setQuote(freshQuote);
    if (!hasSamePaypalQuoteGuard(quote, freshQuote)) {
      resetCheckoutAcceptances();
      throw new PrintShopQuoteReviewRequiredError(true);
    }
    return freshQuote;
  }, [catalog, contact, deliveryMethod, fiscalCode, groups, lowResolution, lowResolutionAccepted, orderId, quote, resetCheckoutAcceptances, residenceAddress, residenceSameAsShipping, resumedPendingPayment, shippingAddress, uploadedPhotos]);

  const handleCaptured = (result: PaypalCaptureResult) => {
    if (user) {
      sessionStorage.removeItem(printShopDraftStorageKey(user.uid));
      sessionStorage.removeItem(printShopDraftRequestStorageKey(user.uid));
    }
    const params = new URLSearchParams({
      orderId: result.orderId,
    });
    navigate(`/stampa-foto-aversa/ordine/conferma?${params.toString()}`);
  };

  const sellerDetails = resolveStudioLegalDetails(studioSettings);
  const shippingSelected = deliveryMethod === 'shipping';
  const missingShippingAddress = shippingSelected && !postalAddressComplete(shippingAddress);
  const missingFiscalCode = shippingSelected && !isValidCodiceFiscale(fiscalCode);
  const missingResidenceAddress = shippingSelected && !residenceSameAsShipping && !postalAddressComplete(residenceAddress);
  const missingShippingDetails = missingShippingAddress || missingFiscalCode || missingResidenceAddress;
  const paymentRequirements = [
    ...(!contact.displayName.trim() ? ['Inserisci nome e cognome'] : []),
    ...(!contact.email.trim() ? ['Inserisci l’indirizzo email'] : []),
    ...(contact.phone.trim().length < 6 ? ['Inserisci un numero di telefono valido'] : []),
    ...(missingShippingAddress ? ['Completa l’indirizzo di spedizione'] : []),
    ...(missingFiscalCode ? ['Inserisci un codice fiscale italiano valido'] : []),
    ...(missingResidenceAddress ? ['Completa l’indirizzo di residenza'] : []),
    ...(!(privacyAccepted && termsAccepted && customProductAccepted)
      ? ['Seleziona tutti e tre i consensi obbligatori']
      : []),
    ...(lowResolution && !lowResolutionAccepted ? ['Conferma l’avviso sulla qualità delle foto'] : []),
    ...(!sellerDetails.complete || studioLoading ? ['Attendi la verifica dei dati dello studio'] : []),
  ];
  const canPay = paymentRequirements.length === 0;
  const missingContact = !contact.displayName.trim() || !contact.email.trim() || contact.phone.trim().length < 6;
  const missingConsents = !(privacyAccepted && termsAccepted && customProductAccepted);
  const showPaymentRequirements = () => {
    setPaymentAttempted(true);
    const targetId = missingContact
      ? 'print-shop-contact'
      : missingShippingDetails
        ? 'print-shop-shipping-details'
      : lowResolution && !lowResolutionAccepted
        ? 'print-shop-quality-warning'
        : missingConsents
          ? 'print-shop-payment-requirements'
          : 'print-shop-payment-requirements';
    window.setTimeout(() => {
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.querySelector<HTMLElement>('input:not([readonly])')?.focus({ preventScroll: true });
    }, 0);
  };

  const displayedTotal = quoteTotal(quote, estimatedTotalCents);
  const pickupAddress = sellerDetails.address;

  return (
    <div className="min-h-screen bg-off-white text-blue-gray">
      <Navigation />
      <main className="pb-20 pt-24 sm:pt-28">
        <header className="border-b border-sage/15 bg-white px-4 py-8 sm:py-10">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <Link href="/stampa-foto-aversa" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-gray/55 hover:text-terracotta">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Torna alla pagina delle stampe
                </Link>
                <h1 className="mt-3 text-3xl font-semibold text-blue-gray sm:text-5xl">Ordina le tue stampe</h1>
                <p className="mt-3 max-w-2xl text-blue-gray/60">Carica JPG, scegli il formato, paga online e decidi se ritirare in studio o ricevere le stampe a casa.</p>
              </div>
              {user && (
                <Link href="/stampa-foto-aversa/i-miei-ordini" className="inline-flex h-11 items-center gap-2 rounded-full border border-sage/30 bg-white px-5 text-sm font-semibold text-blue-gray hover:bg-sage/5">
                  <ShoppingBag className="h-4 w-4" aria-hidden="true" /> I miei ordini
                </Link>
              )}
            </div>
            <div className="mt-8"><StepIndicator step={step} /></div>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
          {(pageError || catalogError) && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" aria-hidden="true" />
              <span>{pageError || catalogError}</span>
            </div>
          )}

          {draftResumeNotice && !pageError && !catalogError && (
            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-sage/30 bg-sage/10 p-4 text-sm font-medium text-blue-gray" role="status">
              <Check className="h-5 w-5 flex-none text-dark-sage" aria-hidden="true" />
              <span>{draftResumeNotice}</span>
            </div>
          )}

          {catalogLoading || authLoading || (Boolean(user) && draftResumeLoading) ? (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3" role="status">
              <Loader2 className="h-8 w-8 animate-spin text-terracotta" aria-hidden="true" />
              <p className="text-sm text-blue-gray/55">Prepariamo il tuo ordine…</p>
            </div>
          ) : step === 'upload' ? (
            <div className="mx-auto max-w-4xl">
              {!user ? (
                <PrintShopAuthGate />
              ) : (
                <section className="rounded-[2rem] border border-sage/20 bg-off-white/40 p-1 sm:p-2" aria-labelledby="upload-title">
                  <div className="mb-6 flex items-start gap-3 px-3 pt-3 sm:px-5 sm:pt-5">
                    <ImageIcon className="mt-1 h-6 w-6 flex-none text-terracotta" aria-hidden="true" />
                    <div>
                      <h2 id="upload-title" className="text-2xl font-semibold text-blue-gray">Scegli le fotografie da stampare</h2>
                      <p className="mt-2 text-sm leading-relaxed text-blue-gray/60">I duplicati vengono riconosciuti: se vuoi più copie della stessa foto, lo indicherai nel passaggio successivo.</p>
                    </div>
                  </div>
                  <PhotoUploadQueue
                    photos={photos}
                    disabled={validatingFiles}
                    onFilesSelected={handleFilesSelected}
                    onRetry={retryPhoto}
                    onRemove={removePhoto}
                  />
                  {validatingFiles && (
                    <p className="mt-4 flex items-center justify-center gap-2 text-sm text-blue-gray/60" role="status">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Controllo formato e duplicati…
                    </p>
                  )}
                  {fileErrors.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
                      <p className="font-semibold">Alcuni file non sono stati aggiunti:</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5">{fileErrors.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}</ul>
                    </div>
                  )}
                  <div className="mt-6 flex justify-end px-1 pb-1">
                    <Button type="button" onClick={continueToConfiguration} disabled={uploadBusy || uploadedPhotos.length === 0} className="h-12 rounded-full bg-terracotta px-7 text-white hover:bg-terracotta/90">
                      Scegli formati e carta <ArrowRight aria-hidden="true" />
                    </Button>
                  </div>
                </section>
              )}
            </div>
          ) : step === 'configure' ? (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
              <div>
                <div className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-terracotta">Scelte semplici</p>
                  <h2 className="mt-2 text-3xl font-semibold text-blue-gray">Come vuoi stampare le foto?</h2>
                  <p className="mt-3 max-w-3xl leading-relaxed text-blue-gray/60">Crea un gruppo per ogni formato. Dentro ogni gruppo scegli carta e aspetto una sola volta, poi selezioni le fotografie.</p>
                </div>
                <PrintGroupsEditor
                  groups={groups}
                  products={catalog?.products ?? []}
                  photos={uploadedPhotos}
                  issuesByGroup={issuesByGroup}
                  onGroupsChange={(nextGroups) => { setGroups(nextGroups); setQuote(null); setValidationIssues([]); }}
                  onAddGroup={addGroup}
                />
                <section className="mt-8 rounded-[2rem] border border-sage/20 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="delivery-method-title">
                  <h2 id="delivery-method-title" className="text-2xl font-semibold text-blue-gray">Come vuoi ricevere le stampe?</h2>
                  <p className="mt-2 text-sm text-blue-gray/55">Scegli ora: il costo della spedizione sarà incluso nel totale prima del pagamento.</p>
                  <div className={`mt-5 grid gap-4 ${catalog?.shipping.enabled ? 'sm:grid-cols-2' : ''}`}>
                    <button
                      type="button"
                      onClick={() => { setDeliveryMethod('studio_pickup'); setQuote(null); }}
                      className={`rounded-2xl border-2 p-5 text-left transition ${deliveryMethod === 'studio_pickup' ? 'border-terracotta bg-terracotta/5' : 'border-sage/20 hover:border-sage/50'}`}
                      aria-pressed={deliveryMethod === 'studio_pickup'}
                    >
                      <span className="flex items-center gap-3 font-semibold text-blue-gray"><PackageCheck className="h-5 w-5 text-terracotta" /> Ritiro in sede</span>
                      <span className="mt-2 block text-sm text-blue-gray/55">Gratuito. Ti avvisiamo quando le stampe sono pronte.</span>
                    </button>
                    {catalog?.shipping.enabled && (
                      <button
                        type="button"
                        onClick={() => { setDeliveryMethod('shipping'); setQuote(null); }}
                        className={`rounded-2xl border-2 p-5 text-left transition ${deliveryMethod === 'shipping' ? 'border-terracotta bg-terracotta/5' : 'border-sage/20 hover:border-sage/50'}`}
                        aria-pressed={deliveryMethod === 'shipping'}
                      >
                        <span className="flex items-center gap-3 font-semibold text-blue-gray"><Truck className="h-5 w-5 text-terracotta" /> Spedizione a domicilio</span>
                        <span className="mt-2 block text-sm text-blue-gray/55">{formatEuroCents(catalog.shipping.priceCents)} · consegna stimata in {catalog.shipping.estimatedMinDays}–{catalog.shipping.estimatedMaxDays} giorni.</span>
                      </button>
                    )}
                  </div>
                </section>
                <div className="mt-8 flex flex-col-reverse justify-between gap-3 sm:flex-row">
                  <Button type="button" variant="outline" onClick={() => setStep('upload')} className="h-12 rounded-full border-sage/30 px-6">
                    <ArrowLeft aria-hidden="true" /> Torna alle foto
                  </Button>
                  <Button type="button" onClick={continueToCheckout} disabled={quoteLoading} className="h-12 rounded-full bg-terracotta px-7 text-white hover:bg-terracotta/90">
                    {quoteLoading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
                    Controlla l’ordine
                  </Button>
                </div>
              </div>

              <aside className="sticky top-24 rounded-[2rem] border border-sage/20 bg-white p-6 shadow-sm" aria-label="Riepilogo provvisorio">
                <h3 className="text-lg font-semibold text-blue-gray">Riepilogo</h3>
                <dl className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-blue-gray/55">Foto caricate</dt><dd className="font-semibold">{uploadedPhotos.length}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-blue-gray/55">Gruppi</dt><dd className="font-semibold">{groups.length}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-blue-gray/55">Stampe</dt><dd className="font-semibold">{groups.reduce((sum, group) => sum + groupCopyCount(group), 0)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-blue-gray/55">Consegna</dt><dd className="font-semibold">{deliveryMethod === 'shipping' ? 'Spedizione' : 'Ritiro'}</dd></div>
                </dl>
                <div className="mt-5 border-t border-sage/15 pt-5">
                  <div className="flex items-end justify-between gap-3"><span className="text-sm text-blue-gray/55">Totale stimato</span><strong className="text-2xl text-terracotta">{formatEuroCents(estimatedTotalCents)}</strong></div>
                  <p className="mt-2 text-xs leading-relaxed text-blue-gray/45">Il server controllerà prezzi e scaglioni prima del pagamento.</p>
                </div>
              </aside>
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
              <div className="space-y-6">
                <section id="print-shop-contact" className={`rounded-[2rem] border bg-white p-6 shadow-sm sm:p-8 ${paymentAttempted && missingContact ? 'border-2 border-red-400' : 'border-sage/20'}`} aria-labelledby="contact-title">
                  <div className="flex items-start gap-3">
                    <CircleUserRound className="mt-1 h-6 w-6 flex-none text-terracotta" aria-hidden="true" />
                    <div>
                      <h2 id="contact-title" className="text-2xl font-semibold text-blue-gray">I tuoi dati di contatto</h2>
                      <p className="mt-2 text-sm text-blue-gray/55">Ti contatteremo solo per aggiornamenti su questo ordine.</p>
                    </div>
                  </div>
                  {paymentAttempted && missingContact && (
                    <p className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">Per pagare completa tutti i dati contrassegnati come obbligatori.</p>
                  )}
                  {resumedPendingPayment && (
                    <p className="mt-5 rounded-xl border border-sage/25 bg-sage/10 p-4 text-sm leading-relaxed text-blue-gray/70">
                      Il riepilogo è già collegato a PayPal. Puoi completare il pagamento; per cambiare dati, formati o quantità elimina la bozza da <Link href="/stampa-foto-aversa/i-miei-ordini" className="font-semibold text-terracotta underline">I miei ordini</Link> e ricomincia.
                    </p>
                  )}
                  <div className="mt-6 grid gap-5 sm:grid-cols-2">
                    <label className="text-sm font-semibold text-blue-gray">
                      Nome e cognome <span className="text-red-700">(obbligatorio)</span>
                      <Input value={contact.displayName} onChange={(event) => setContact((current) => ({ ...current, displayName: event.target.value }))} autoComplete="name" required readOnly={resumedPendingPayment} className={`mt-2 h-12 rounded-xl font-normal ${resumedPendingPayment ? 'bg-off-white' : ''}`} />
                    </label>
                    <label className="text-sm font-semibold text-blue-gray">
                      Telefono <span className="text-red-700">(obbligatorio)</span>
                      <Input id="print-shop-phone" type="tel" inputMode="tel" value={contact.phone} onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))} autoComplete="tel" required readOnly={resumedPendingPayment} placeholder="Es. 333 123 4567" className={`mt-2 h-12 rounded-xl font-normal ${paymentAttempted && contact.phone.trim().length < 6 ? 'border-2 border-red-400' : ''} ${resumedPendingPayment ? 'bg-off-white' : ''}`} />
                    </label>
                    <label className="text-sm font-semibold text-blue-gray sm:col-span-2">
                      Email <span className="text-red-700">(obbligatoria)</span>
                      <Input type="email" value={contact.email} readOnly className="mt-2 h-12 rounded-xl bg-off-white font-normal text-blue-gray/65" />
                    </label>
                    <label className="text-sm font-semibold text-blue-gray sm:col-span-2">
                      Note per lo studio <span className="font-normal text-blue-gray/45">(facoltative)</span>
                      <Textarea value={contact.customerNotes} onChange={(event) => setContact((current) => ({ ...current, customerNotes: event.target.value }))} maxLength={1000} readOnly={resumedPendingPayment} placeholder="Scrivi qui solo indicazioni utili per la stampa o il ritiro" className={`mt-2 min-h-24 rounded-xl font-normal ${resumedPendingPayment ? 'bg-off-white' : ''}`} />
                    </label>
                  </div>
                </section>

                {shippingSelected && (
                  <section id="print-shop-shipping-details" className={`rounded-[2rem] border bg-white p-6 shadow-sm sm:p-8 ${paymentAttempted && missingShippingDetails ? 'border-2 border-red-400' : 'border-sage/20'}`} aria-labelledby="shipping-details-title">
                    <div className="flex items-start gap-3">
                      <Truck className="mt-1 h-6 w-6 flex-none text-terracotta" aria-hidden="true" />
                      <div>
                        <h2 id="shipping-details-title" className="text-2xl font-semibold text-blue-gray">Consegna e dati di fatturazione</h2>
                        <p className="mt-2 text-sm text-blue-gray/55">Servono per consegnare correttamente le stampe e registrare l’acquisto.</p>
                      </div>
                    </div>
                    {paymentAttempted && missingShippingDetails && (
                      <p className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">Completa i campi obbligatori evidenziati prima di pagare con PayPal.</p>
                    )}
                    <div className="mt-6">
                      <h3 className="mb-4 font-semibold text-blue-gray">Indirizzo di spedizione</h3>
                      <AddressFields address={shippingAddress} onChange={setShippingAddress} prefix="print-shipping" readOnly={resumedPendingPayment} />
                    </div>
                    <div className="mt-7 border-t border-sage/15 pt-6">
                      <h3 className="font-semibold text-blue-gray">Dati di fatturazione</h3>
                      <label className="mt-4 block max-w-sm text-sm font-semibold text-blue-gray">
                        Codice fiscale <span className="text-red-700">(obbligatorio)</span>
                        <Input id="print-fiscal-code" value={fiscalCode} onChange={(event) => setFiscalCode(event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 16).toUpperCase())} maxLength={16} autoComplete="off" readOnly={resumedPendingPayment} placeholder="RSSMRA85M01H501Q" className="mt-2 h-12 rounded-xl font-normal uppercase" />
                        <span className="mt-1 block font-normal text-blue-gray/45">16 lettere e numeri, senza spazi.</span>
                      </label>
                      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-sage/15 bg-off-white/45 p-4 text-sm font-medium text-blue-gray/75">
                        <input type="checkbox" checked={residenceSameAsShipping} onChange={(event) => setResidenceSameAsShipping(event.target.checked)} disabled={resumedPendingPayment} className="mt-0.5 h-5 w-5 accent-[#b56b50]" />
                        L’indirizzo di residenza coincide con quello di spedizione
                      </label>
                      {!residenceSameAsShipping && (
                        <div className="mt-5">
                          <h4 className="mb-4 font-semibold text-blue-gray">Indirizzo di residenza</h4>
                          <AddressFields address={residenceAddress} onChange={setResidenceAddress} prefix="print-residence" readOnly={resumedPendingPayment} />
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {lowResolution && (
                  <section id="print-shop-quality-warning" className={`rounded-[2rem] border bg-amber-50 p-6 ${paymentAttempted && !lowResolutionAccepted ? 'border-2 border-red-400' : 'border-amber-300'}`} aria-labelledby="quality-warning-title">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-1 h-6 w-6 flex-none text-amber-700" aria-hidden="true" />
                      <div>
                        <h2 id="quality-warning-title" className="font-semibold text-amber-950">Alcune foto potrebbero risultare meno nitide</h2>
                        <p className="mt-2 text-sm leading-relaxed text-amber-900/80">Succede quando una foto piccola viene scelta per un formato grande. Puoi tornare indietro e cambiare formato oppure continuare consapevolmente.</p>
                        <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm font-semibold text-amber-950">
                          <input type="checkbox" checked={lowResolutionAccepted} onChange={(event) => setLowResolutionAccepted(event.target.checked)} className="mt-0.5 h-5 w-5 accent-amber-700" />
                          Ho visto l’avviso e desidero continuare con questi file.
                        </label>
                      </div>
                    </div>
                  </section>
                )}

                <section id="print-shop-payment-requirements" className={`rounded-[2rem] border-2 bg-white p-6 shadow-sm sm:p-8 ${paymentAttempted && missingConsents ? 'border-red-400' : privacyAccepted && termsAccepted && customProductAccepted ? 'border-emerald-300' : 'border-amber-400'}`} aria-labelledby="consent-title">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id="consent-title" className="text-xl font-semibold text-blue-gray">Consensi obbligatori prima del pagamento</h2>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${privacyAccepted && termsAccepted && customProductAccepted ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                      {privacyAccepted && termsAccepted && customProductAccepted ? 'Completati' : 'Da completare'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-blue-gray/65">Per attivare PayPal devi selezionare tutte e tre le caselle qui sotto.</p>
                  {paymentAttempted && missingConsents && (
                    <p className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">Seleziona tutte e tre le caselle obbligatorie per continuare con PayPal.</p>
                  )}
                  <div className="mt-5 space-y-3">
                    <ConsentRow checked={privacyAccepted} onChange={setPrivacyAccepted}>
                      Ho letto l’<Link href="/privacy" target="_blank" className="font-semibold text-terracotta underline">informativa privacy</Link>, compreso l’uso delle foto per produrre l’ordine e la cancellazione degli originali dopo 90 giorni dalla consegna.
                    </ConsentRow>
                    <ConsentRow checked={termsAccepted} onChange={setTermsAccepted}>
                      Accetto le <Link href="/terms" target="_blank" className="font-semibold text-terracotta underline">condizioni di vendita</Link> e confermo formato, finitura, quantità e totale mostrati.
                    </ConsentRow>
                    <ConsentRow checked={customProductAccepted} onChange={setCustomProductAccepted}>
                      Chiedo l’avvio della produzione di stampe personalizzate sui miei file e comprendo che, dopo l’avvio, l’ordine non può essere annullato come un prodotto standard.
                    </ConsentRow>
                  </div>
                </section>

                {resumedPendingPayment ? (
                  <Link href="/stampa-foto-aversa/i-miei-ordini" className="inline-flex h-12 items-center gap-2 rounded-full border border-sage/30 bg-white px-6 text-sm font-semibold text-blue-gray hover:bg-sage/5">
                    <ArrowLeft aria-hidden="true" /> Gestisci o elimina la bozza
                  </Link>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setStep('configure')} className="h-12 rounded-full border-sage/30 px-6">
                    <ArrowLeft aria-hidden="true" /> Modifica formati e quantità
                  </Button>
                )}
              </div>

              <aside className="sticky top-24 space-y-5">
                <section className="rounded-[2rem] border border-sage/20 bg-white p-6 shadow-lg" aria-labelledby="final-summary-title">
                  <h2 id="final-summary-title" className="text-xl font-semibold text-blue-gray">Il tuo ordine</h2>
                  <div className="mt-5 space-y-4">
                    {groups.map((group) => {
                      const product = findPrintProduct(catalog?.products ?? [], group.sku);
                      return (
                        <div key={group.id} className="border-b border-sage/10 pb-4 last:border-0 last:pb-0">
                          <p className="font-semibold text-blue-gray">{product?.nome ?? group.sku}</p>
                          <p className="mt-1 text-xs leading-relaxed text-blue-gray/50">
                            {group.assignments.length} foto · {groupCopyCount(group)} stampe · {group.finish === 'glossy' ? 'lucida' : 'opaca'} · {group.fitMode === 'border' ? 'bordo bianco' : 'tutta pagina'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <dl className="mt-5 space-y-3 border-t border-sage/15 pt-5 text-sm">
                    <div className="flex justify-between"><dt className="text-blue-gray/55">Subtotale</dt><dd>{formatEuroCents(quote?.totals.subtotalCents ?? displayedTotal)}</dd></div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-blue-gray/55">{shippingSelected ? 'Spedizione' : 'Ritiro in sede'} <span className="block text-xs">{shippingSelected ? `Consegna stimata in ${catalog?.shipping.estimatedMinDays ?? 2}–${catalog?.shipping.estimatedMaxDays ?? 5} giorni` : 'Nessun costo di consegna'}</span></dt>
                      <dd className={`font-semibold ${shippingSelected ? 'text-blue-gray' : 'text-emerald-700'}`}>{formatEuroCents(quote?.totals.shippingCents ?? (shippingSelected ? catalog?.shipping.priceCents ?? 0 : 0))}</dd>
                    </div>
                    <div className="flex items-end justify-between border-t border-sage/15 pt-4"><dt className="font-semibold">Totale da pagare</dt><dd className="text-3xl font-semibold text-terracotta">{formatEuroCents(displayedTotal)}</dd></div>
                  </dl>
                  <p className="mt-3 text-right text-xs text-blue-gray/50">Prezzo finale, imposte incluse ove applicabili.</p>
                </section>

                <section className="rounded-2xl border border-sage/20 bg-sage/5 p-4 text-sm text-blue-gray/70" aria-labelledby="seller-details-title">
                  <h2 id="seller-details-title" className="font-semibold text-blue-gray">Professionista e contatti</h2>
                  {sellerDetails.complete ? (
                    <dl className="mt-3 space-y-2">
                      <div><dt className="sr-only">Professionista</dt><dd className="font-semibold text-blue-gray">{sellerDetails.name}</dd></div>
                      <div><dt className="inline font-medium">P. IVA: </dt><dd className="inline">{sellerDetails.partitaIVA}</dd></div>
                      <div><dt className="inline font-medium">Sede: </dt><dd className="inline">{sellerDetails.address}</dd></div>
                      <div><dt className="inline font-medium">Reclami e assistenza: </dt><dd className="inline"><a href={`tel:${sellerDetails.phone.replace(/[^\d+]/g, '')}`} className="underline">{sellerDetails.phone}</a> · <a href={`mailto:${sellerDetails.email}`} className="break-all underline">{sellerDetails.email}</a></dd></div>
                    </dl>
                  ) : (
                    <p className="mt-3 rounded-xl bg-amber-50 p-3 font-medium text-amber-950" role="alert">Il pagamento è temporaneamente disattivato perché i dati completi del professionista non sono disponibili.</p>
                  )}
                </section>

                <section className="rounded-2xl border border-sage/20 bg-sage/5 p-4 text-sm text-blue-gray/70">
                  {shippingSelected ? (
                    <>
                      <div className="flex items-start gap-2"><Truck className="mt-0.5 h-4 w-4 flex-none text-terracotta" aria-hidden="true" /><span><strong className="text-blue-gray">Spedizione a domicilio</strong><br />{postalAddressComplete(shippingAddress) ? `${shippingAddress.street} ${shippingAddress.houseNumber}, ${shippingAddress.postalCode} ${shippingAddress.city} (${shippingAddress.province})` : 'Completa l’indirizzo di consegna.'}</span></div>
                      <div className="mt-3 flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 flex-none text-terracotta" aria-hidden="true" /><span>Consegna stimata in {catalog?.shipping.estimatedMinDays ?? 2}–{catalog?.shipping.estimatedMaxDays ?? 5} giorni. Riceverai gli aggiornamenti ai recapiti indicati.</span></div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 flex-none text-terracotta" aria-hidden="true" /><span><strong className="text-blue-gray">Ritiro in sede</strong><br />{pickupAddress}</span></div>
                      <div className="mt-3 flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 flex-none text-terracotta" aria-hidden="true" /><span>Le stampe saranno rese disponibili per il ritiro entro e non oltre {PRINT_SHOP_MAX_PICKUP_DAYS} giorni dal pagamento. Riceverai un avviso quando sono pronte.</span></div>
                    </>
                  )}
                </section>

                {orderId && (
                  <section className="rounded-[2rem] border border-[#ffc439]/50 bg-white p-5 shadow-sm" aria-labelledby="payment-title">
                    <h2 id="payment-title" className="sr-only">Pagamento PayPal</h2>
                    <PayPalCheckout
                      orderId={orderId}
                      enabled={canPay}
                      legalConsents={{
                        privacyAccepted,
                        termsAccepted,
                        personalizedProductionAccepted: customProductAccepted,
                      }}
                      prepareOrder={prepareOrderForPayment}
                      onQuoteReviewRequired={refreshQuoteForReview}
                      onCaptured={handleCaptured}
                      disabledReasons={paymentRequirements}
                      onShowRequirements={showPaymentRequirements}
                    />
                  </section>
                )}

                <div className="grid grid-cols-3 gap-2 text-center text-[10px] text-blue-gray/50">
                  <span className="rounded-xl bg-white p-2"><LockKeyhole className="mx-auto mb-1 h-4 w-4 text-dark-sage" aria-hidden="true" />File privati</span>
                  <span className="rounded-xl bg-white p-2"><ShieldCheck className="mx-auto mb-1 h-4 w-4 text-dark-sage" aria-hidden="true" />Pagamento sicuro</span>
                  <span className="rounded-xl bg-white p-2">{shippingSelected ? <Truck className="mx-auto mb-1 h-4 w-4 text-dark-sage" aria-hidden="true" /> : <PackageCheck className="mx-auto mb-1 h-4 w-4 text-dark-sage" aria-hidden="true" />}{shippingSelected ? 'Spedizione' : 'Ritiro in studio'}</span>
                </div>
              </aside>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
