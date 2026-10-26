import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { installMockupWizard } from './mockup-wizard-layout';
import { usePhoneOrientation } from '@/hooks/use-phone-orientation';
import './mockup-mobile.css';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/firebase';
import { createUrl } from '@/lib/config';
import { getPhotobookGalleryPhotosByToken, listPhotobookGalleryPhotos } from '@/lib/photobooks';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import PhotobookPhotoPicker from './PhotobookPhotoPicker';
import { mockupConfigurationSchema, mockupPhotoSchema, type MockupConfiguration, type MockupPayload, type MockupPhoto, type SavedMockup } from '@shared/mockup-types';
import { MOCKUP_STATUS_LABELS, optionFor, type MockupSelection } from '@shared/mockup-workflow';
import MockupOfferEditor from './MockupOfferEditor';
import { OPEN_MOCKUP_EVENT, type MockupAdminTab } from './MockupAdminFlow';
import { BOX_MOCKUP_MODEL, MOCKUP_RENDERERS } from '@shared/mockup-catalog';
import { hasUnsavedMockupChanges, stableSerialize } from './mockup-dirty-state';
import MockupClientApproval from './MockupClientApproval';
import type { MockupOption } from '@shared/mockup-workflow';
import MockupModelChooser from './MockupModelChooser';
import { initialMockupSelection, mockupPresentation, needsClientModelChoice } from './mockup-presentation';
import MockupRendererError from './MockupRendererError';
import SavedMockupPhotoRecoveryError from './SavedMockupPhotoRecoveryError';
import { beginMockupRendererRetry, configurationForRendererRestore, shouldSkipSavedMockupRestore } from './mockup-renderer-recovery';
import { hasSavedMockupPhotos, loadSavedMockupPhotos, loadSavedMockupPhotosPartial, mockupRequestErrorFromResponse, replaceMockupPhotoReference, savedMockupPhotoFailure, type RuntimeMockupPhoto, type SavedMockupPhotoFailure, type SavedMockupPhotoLabels, type SavedMockupPhotoSlot } from './mockup-photo-recovery';
import { useToast } from '@/hooks/use-toast';
import PhotobookInlineGallery from './PhotobookInlineGallery';
import { ArrowLeft, ArrowRight, HelpCircle, LogOut, Rotate3D, RotateCcw, Save, X, ZoomIn, ZoomOut } from 'lucide-react';

interface Props { photobookId: string; version: number; token?: string; readOnly?: boolean; autoOpen?: boolean; confirmedOnly?: boolean; summary?: boolean; compact?: boolean; /** Admin: solo la finestra, aperta dai passi della card Mockup. */ headless?: boolean; onOpenChange?: (open: boolean) => void }
type RuntimePhoto = RuntimeMockupPhoto | { id: string; name: string; source: string; blob: Blob };
type SavedPhotoRecoveryContext = {
  configuration: MockupConfiguration;
  option?: MockupOption;
  readOnly: boolean;
};

function exposeReadonlyDownload(doc: Document) {
  const button = doc.getElementById('downloadClient');
  if (!button || button.tagName !== 'BUTTON') return false;
  const bar = doc.createElement('div');
  bar.className = 'download-bar';
  bar.style.cssText = 'display:block!important;padding:12px 18px;background:#faf8f3;border-top:1px solid #d8ded7;';
  bar.append(button);
  const status = doc.getElementById('downloadStatus');
  if (status) bar.append(status);
  (doc.querySelector('aside') || doc.body).append(bar);
  doc.body.dataset.wizardReadonly = 'true';
  return true;
}

export default function PhotobookMockup({ photobookId, version, token, readOnly = false, autoOpen = false, confirmedOnly = false, summary = false, compact = false, headless = false, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const autoOpened = useRef(false);
  const [adminTab, setAdminTab] = useState<'review' | 'edit' | 'offer'>('review');
  const [adminSlot, setAdminSlot] = useState<HTMLDivElement | null>(null);
  const [askingChanges, setAskingChanges] = useState(false);
  const adminPanel = (content: ReactNode) => adminSlot ? createPortal(content, adminSlot) : null;
  useEffect(() => { onOpenChange?.(open); return () => onOpenChange?.(false); }, [open, onOpenChange]);
  const { isPhone } = usePhoneOrientation();
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const handle = () => setIsNarrow(window.innerWidth < 768);
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);
  const mobile = isPhone || isNarrow;
  const [choosing, setChoosing] = useState(false);
  const [viewerStarted, setViewerStarted] = useState(false);
  const [homeOpen, setHomeOpen] = useState(false);
  const [viewerExpanded, setViewerExpanded] = useState(false);
  const [configurationIssue, setConfigurationIssue] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);
  const [viewMessage, setViewMessage] = useState('');
  const pendingLayout = useRef<string | null>(null);
  const [step, setStep] = useState(1);
  const [wizard, setWizard] = useState<ReturnType<typeof installMockupWizard> | null>(null);
  const [picker, setPicker] = useState(false);
  const [photoSide, setPhotoSide] = useState<'front' | 'back'>('front');
  // Quadrobook: quale foto sta scegliendo il cliente (fondo, tappo o copertina dell'album).
  const [boxSlot, setBoxSlot] = useState<'base' | 'lid' | 'cover'>('base');
  const [phoneBox, setPhoneBox] = useState(false);
  // Telefono, altri modelli: 3D a schermo pieno solo su richiesta; ultime foto scelte dalla galleria nello slide.
  const [phone3d, setPhone3d] = useState(false);
  const [familyCount, setFamilyCount] = useState(0);
  const [pickedPhoto, setPickedPhoto] = useState<{ front?: string; back?: string }>({});
  const skipRestoreRevision = useRef<number | null>(null);
  const hostActions = useRef<{ close: () => void; submit: () => void; step: () => void; pickGallery: (slot: string, photoId: string) => void }>({ close: () => undefined, submit: () => undefined, step: () => undefined, pickGallery: () => undefined });
  const graphicBlob = useRef<Promise<Blob> | null>(null);
  const [busy, setBusy] = useState(false);
  const [renderBusy, setRenderBusy] = useState(true);
  const [ready, setReady] = useState(false);
  // Ogni avvio del visualizzatore (anche un ricaricamento) richiede di rimandargli le scelte.
  const [readyTick, setReadyTick] = useState(0);
  const [rendererError, setRendererError] = useState('');
  const [savedPhotoError, setSavedPhotoError] = useState<SavedMockupPhotoFailure | null>(null);
  const [savedPhotoSlot, setSavedPhotoSlot] = useState<SavedMockupPhotoSlot | null>(null);
  const [savedPhotoRetryBusy, setSavedPhotoRetryBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [configuration, setConfiguration] = useState<MockupConfiguration | null>(null);
  const [draftCoverLayout, setDraftCoverLayout] = useState('');
  const [draftBackCover, setDraftBackCover] = useState('');
  const [frontPhotoPresent, setFrontPhotoPresent] = useState(false);
  const [backPhotoPresent, setBackPhotoPresent] = useState(false);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);
  const frame = useRef<HTMLIFrameElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const initializing = useRef(true);
  const dirtyContext = useRef<{ saved: SavedMockup | null; selection?: MockupSelection; editable: boolean }>({ saved: null, editable: false });
  const revision = useRef(0);
  const [selection, setSelection] = useState<MockupSelection>();
  const [note, setNote] = useState('');
  const [history, setHistory] = useState<SavedMockup[] | null>(null);
  const [generation, setGeneration] = useState(0);
  const [rendererOverride, setRendererOverride] = useState<string | null>(null);
  const pendingOption = useRef<MockupOption | null>(null);
  const currentPhoto = useRef<RuntimePhoto | undefined>(undefined);
  const savedPhotoRecovery = useRef<SavedPhotoRecoveryContext | null>(null);
  const pendingPreview = useRef<{ configuration: MockupConfiguration; photo?: RuntimePhoto; backPhoto?: RuntimePhoto; option?: MockupOption } | null>(null);
  const exportWaiter = useRef<{ id: string; resolve: (previews: unknown) => void; reject: (error: Error) => void } | null>(null);
  const base = token ? `/api/photobooks/by-token/${encodeURIComponent(token)}/mockup` : `/api/photobooks/${encodeURIComponent(photobookId)}/mockup`;
  async function request(path = '', init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (!token) {
      await auth.authStateReady();
      if (!auth.currentUser) throw new Error('Accedi nuovamente per proseguire');
      headers.set('Authorization', `Bearer ${await auth.currentUser.getIdToken()}`);
    }
    const response = await fetch(createUrl(`${base}${path}${path.includes('?') ? '&' : '?'}version=${version}`), { ...init, headers });
    if (!response.ok) throw await mockupRequestErrorFromResponse(response);
    return response;
  }
  const stateKey = ['photobook-mockup', photobookId, version, token ? 'client' : 'admin'];
  const state = useQuery<MockupPayload>({
    queryKey: stateKey,
    queryFn: async () => (await request()).json(),
    enabled: !!token || open || summary || !compact,
    refetchOnWindowFocus: false,
  });
  // Keep the sharing action in step 4 current after saving or confirming in the modal.
  useEffect(() => {
    if (!token && state.data) queryClient.setQueryData(['photobook-mockup-flow', photobookId, version], state.data);
  }, [state.data, token, photobookId, version, queryClient]);
  const gallery = useQuery({
    queryKey: ['mockup-gallery', photobookId, token ? 'client' : 'admin'],
    enabled: picker || phoneBox || (!!token && mobile),
    queryFn: async () => token ? getPhotobookGalleryPhotosByToken(token) : { photos: await listPhotobookGalleryPhotos(photobookId), chapters: [] },
  });
  const editable = !readOnly && state.data?.editable === true;
  const selectedOption = optionFor(state.data?.offer || null, selection);
  const saved = state.data?.saved;
  dirtyContext.current = { saved: saved ?? null, selection, editable };
  const fixedModel = state.data?.modelMode === 'fixed';
  const shouldPromptForModel = !!token && editable && needsClientModelChoice(state.data) && !selectedOption;
  const presentation = mockupPresentation(state.data, selection, rendererOverride);
  const staleFixedSave = presentation.staleFixedSave;
  const renderer = MOCKUP_RENDERERS.find(r => r.id === presentation.rendererId) || MOCKUP_RENDERERS[0];
  const clientStatusMessage = state.data?.mockupPath === 'studio'
    ? saved?.status === 'confirmed' ? 'Lo studio ha confermato il mockup. Puoi consultarlo qui; per modifiche contatta lo studio.' : 'Lo studio prepara il mockup. Potrai consultarlo quando sarà confermato.'
    : !saved
    ? 'Personalizza copertina, rivestimento e scritte, poi invia la proposta allo studio.'
    : saved.status === 'submitted'
      ? 'La proposta è stata inviata allo studio per la verifica. Puoi ancora modificarla: ogni modifica richiederà una nuova verifica.'
      : saved.status === 'changes_requested'
        ? 'Lo studio ha richiesto delle modifiche. Riapri il mockup, aggiorna le scelte e invialo nuovamente.'
        : saved.status === 'confirmed'
          ? 'Lo studio ha confermato il mockup. Puoi ancora modificarlo fino alla stampa: una nuova modifica richiederà una nuova verifica.'
          : 'Bozza salvata: puoi riprenderla quando vuoi oppure inviarla allo studio per la verifica.';
  const title = presentation.title;
  const isBox = renderer.id === BOX_MOCKUP_MODEL.id;
  const noModelAssigned = !token && !!state.data && !state.data.offer?.options.length && !state.data.saved;
  const post = (payload: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ channel: 'memorie-mockup-v1', type: 'apply', ...payload }, window.location.origin);
  // La grafica di copertina del Quadrobook la carica lo studio: si scarica una volta e si passa al visualizzatore.
  const apply = (payload: Record<string, unknown>) => {
    const option = payload.option as MockupOption | undefined;
    const photos = payload.photos as Record<string, unknown> | undefined;
    if (option?.rendererId === BOX_MOCKUP_MODEL.id && option.setup?.cover.graphicAssetId && !photos?.graphic) {
      graphicBlob.current ??= request('/cover-graphic').then(response => response.blob());
      graphicBlob.current .then(blob => post({ ...payload, photos: { ...photos, graphic: { id: option.setup!.cover.graphicAssetId, name: 'grafica dello studio', blob } } }))
        .catch(() => { graphicBlob.current = null; post(payload); setMessage('Grafica di copertina non disponibile. Riprova più tardi.'); });
      return;
    }
    post(payload);
  };
  const loadSavedPhotos = (cfg: MockupConfiguration, labels?: SavedMockupPhotoLabels) => loadSavedMockupPhotos(
    cfg,
    async id => (await request(`/photos/${id}`)).blob(),
    labels,
  );
  const loadSavedPhotosPartial = (cfg: MockupConfiguration, labels?: SavedMockupPhotoLabels, skipSlot?: SavedMockupPhotoSlot) =>
    loadSavedMockupPhotosPartial(
      cfg,
      async id => (await request(`/photos/${id}`)).blob(),
      labels,
      skipSlot,
    );
  const savedBoxPhotos = async (cfg: MockupConfiguration, label = 'Foto salvata') =>
    cfg.modelId === BOX_MOCKUP_MODEL.id ? (await loadSavedPhotos(cfg, { boxPhoto: label })).boxPhotos : undefined;
  const recordSaved = (value: SavedMockup) => {
    revision.current = value.revision;
    dirtyContext.current.saved = value;
    queryClient.setQueryData<MockupPayload>(stateKey, previous => previous ? { ...previous, saved: value } : previous);
  };
  function closeConfigurator() {
    if (busy) return;
    if (dirty && !window.confirm('Chiudere il configuratore e abbandonare le modifiche non salvate?')) return;
    setOpen(false); setPicker(false); setReady(false); setRenderBusy(true); setRendererError('');
    setSavedPhotoError(null); setSavedPhotoSlot(null); setSavedPhotoRetryBusy(false); savedPhotoRecovery.current = null;
    setDirty(false); setConfiguration(null); setRendererOverride(null); setSelection(undefined);
    setDraftCoverLayout(''); setDraftBackCover(''); setFrontPhotoPresent(false); setBackPhotoPresent(false);
    pendingOption.current = null; pendingPreview.current = null; currentPhoto.current = undefined; initializing.current = true;
    setHistory(null); setNote(''); setMessage(''); setPhotoSide('front'); setAskingChanges(false); setViewerExpanded(false);
    setStep(1); setWizard(null); setChoosing(false); setViewerStarted(false); setHomeOpen(false); setGuideOpen(false); pendingLayout.current = null;
  }

  function openConfigurator() {
    setAdminTab('review');
    const hasOffer = !!state.data?.offer?.options.length;
    setChoosing(shouldPromptForModel);
    setViewerStarted(!mobile || !!saved || (!!state.data && !hasOffer));
    setStep(mobile && saved && (saved.status === 'draft' || !editable) ? lastStep : 2); setOpen(true);
    let guideSeen = false;
    try { guideSeen = sessionStorage.getItem('mockup-touch-guide') === 'seen'; } catch { /* Guida disponibile anche senza storage locale. */ }
    setGuideOpen(mobile && !guideSeen);
    void state.refetch();
  }

  useEffect(() => {
    if (!autoOpen || autoOpened.current || !state.data || saved?.status !== 'confirmed' || state.data.offerError) return;
    autoOpened.current = true;
    openConfigurator();
  }, [autoOpen, state.data, saved?.status]);

  // Dai passi della scheda admin: apre il configuratore direttamente sulla scheda richiesta.
  useEffect(() => {
    if (token || compact) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ photobookId: string; tab: MockupAdminTab }>).detail;
      if (detail?.photobookId !== photobookId) return;
      if (!open) openConfigurator();
      setAdminTab(detail.tab);
    };
    window.addEventListener(OPEN_MOCKUP_EVENT, handler);
    return () => window.removeEventListener(OPEN_MOCKUP_EVENT, handler);
  });

  useEffect(() => {
    if (!open || !state.data) return;
    if (shouldPromptForModel) {
      setChoosing(true);
    } else if (mobile && editable && !saved && !viewerStarted && !state.data.offer?.options.length) {
      setViewerStarted(true);
    } else if (mobile && !viewerStarted && (isBox || fixedModel)) {
      // Modello deciso dallo studio (Quadrobook, ma anche Custodia, Girevole, Plaza assegnati): si parte subito dal primo slide.
      setViewerStarted(true);
    }
  }, [open, mobile, isBox, fixedModel, editable, saved?.revision, saved?.updatedBy, viewerStarted, state.data?.offer?.revision, state.data?.offer?.options.length, state.data?.modelMode, selection?.labId, selection?.modelId, shouldPromptForModel]);

  function chooseExample(option: MockupOption, layout: string) {
    if (!editable) return;
    // When the chooser is open, selecting its model is what starts/restarts the renderer.
    // Do not require an already-ready renderer in that state.
    if (viewerStarted && !choosing && (!ready || renderBusy || busy)) return;
    if (viewerStarted && option.rendererId !== renderer.id && dirty && !window.confirm('Cambiando tipo di album, alcune personalizzazioni non sono compatibili. Vuoi proseguire? La revisione già salvata resta conservata.')) return;
    pendingPreview.current = null;
    pendingLayout.current = layout;
    // La scelta dei caroselli non contiene fotografie o nomi dimostrativi.
    if (!viewerStarted) {
      pendingOption.current = option;
      setSelection({ labId: option.labId, modelId: option.id }); setRendererOverride(option.rendererId);
      setDirty(true); setViewerStarted(true);
    } else chooseOption(option);
    setStep(2); setChoosing(false); setHomeOpen(false); setMessage(''); setViewMessage('');
  }

  function chooseOption(option: MockupOption) {
    pendingPreview.current = null;
    setSelection({ labId: option.labId, modelId: option.id }); setDirty(true); setPhotoSide('front');
    if (option.rendererId !== renderer.id) {
      pendingOption.current = option; setRendererOverride(option.rendererId); setWizard(null);
      setConfiguration(null); setReady(false); setRenderBusy(true); setGeneration(g => g + 1);
      setDraftCoverLayout(''); setDraftBackCover('');
    } else apply({ option, readOnly: !editable });
  }

  useEffect(() => {
    if (isBox) { setWizard(null); return undefined; }
    if (!token || !ready || !frame.current?.contentDocument) return undefined;
    try {
      const layout = installMockupWizard(frame.current.contentDocument, mobile);
      layout.step(step);
      layout.onFamilySelect((family) => {
        if (family === 'back-to-families') {
          setStep(2);
        } else {
          setStep(3);
        }
      });
      setWizard(layout);
      return () => layout.dispose();
    }
    catch (error) {
      if (!editable || readOnly) exposeReadonlyDownload(frame.current.contentDocument);
      setMessage((error as Error).message);
    }
    return undefined;
  }, [ready, token, mobile, editable, readOnly, isBox]);

  useEffect(() => { wizard?.step(step); }, [wizard, step]);
  useEffect(() => { wizard?.readonly(!editable); }, [wizard, editable]);
  // Solo presentazione amministrativa: renderer e relativi handler restano gli stessi.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (token || !ready || !doc) return;
    doc.body.dataset.adminMode = adminTab;
    const style = doc.createElement('style');
    style.textContent = `
      body[data-admin-mode]{height:100dvh;overflow:hidden;background:#faf8f3;font-family:system-ui,-apple-system,sans-serif}
      body[data-admin-mode] header{display:none!important}
      body[data-admin-mode=edit] header{display:flex!important;height:42px;padding:4px 12px;justify-content:flex-end}
      body[data-admin-mode=edit] header strong,body[data-admin-mode=edit] header span{display:none}
      body[data-admin-mode] main{height:100dvh!important;min-height:0!important;display:grid!important;grid-template-columns:minmax(0,1fr)!important}
      body[data-admin-mode] aside{display:none!important}
      body[data-admin-mode=edit] main{height:calc(100dvh - 42px)!important;display:flex!important;flex-direction:column!important}
      body[data-admin-mode=edit] .workspace{flex:0 0 45%!important;height:45%!important;min-height:160px!important}
      body[data-admin-mode=edit] aside{display:flex!important;flex:1 1 0%!important;min-height:0!important;overflow-y:auto!important;padding:10px!important}
      @media (min-width: 768px) {
        body[data-admin-mode=edit] main{flex-direction:row!important}
        body[data-admin-mode=edit] aside{flex:0 0 clamp(240px,30%,320px)!important}
        body[data-admin-mode=edit] .workspace{flex:1 1 0%!important;height:100%!important;max-height:none!important}
      }
      body[data-admin-mode] .panel-content{max-height:none;min-height:0}
      body[data-admin-mode] .workspace{display:grid!important;grid-template-rows:minmax(0,1fr) auto;min-height:0;overflow:hidden}
      body[data-admin-mode] .stage{height:100%!important;min-height:0!important;position:relative!important}
      body[data-admin-mode] .view-tools{padding:8px;gap:8px;grid-template-columns:1fr}
      body[data-admin-mode] .view-tools h2,body[data-admin-mode] .hint{display:none}
      body[data-admin-mode] .view-tools>div:first-child{display:flex;flex-wrap:wrap;gap:5px}
      body[data-admin-mode] .view-tools .row{flex:1;min-width:160px;margin:0}
      body[data-admin-mode] .view-tools button{font-size:12px;min-height:36px}
      body[data-admin-mode] .extraction{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      body[data-admin-mode] .extraction input[type=range]{flex:1;width:auto;min-width:80px}
      body[data-admin-mode] .tools{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px 12px;padding:8px 12px}
      body[data-admin-mode] .tools .row{max-width:none;min-width:0}
      body[data-admin-mode] .tools .row:first-child{grid-column:1;grid-row:1}
      body[data-admin-mode] .tools .row:last-child{grid-column:2;grid-row:1}
      body[data-admin-mode] .tools button{min-height:36px;padding:6px;font-size:11px}
      body[data-admin-mode] .tools label{margin:3px 0;font-size:12px}
      body[data-admin-mode] .tools label[for=rotation]{grid-column:1;grid-row:2}
      body[data-admin-mode] .tools label[for=extract]{grid-column:2;grid-row:2}
      body[data-admin-mode] .tools #rotation{grid-column:1;grid-row:3}
      body[data-admin-mode] .tools #extract{grid-column:2;grid-row:3}
      body[data-admin-mode] .tools .note{grid-column:1 / -1;grid-row:4;font-size:10px;margin:0}
    `;
    doc.head.append(style);
    return () => { style.remove(); delete doc.body.dataset.adminMode; };
  }, [token, ready, adminTab]);
  useEffect(() => { wizard?.home(homeOpen); }, [wizard, homeOpen]);
  useEffect(() => { wizard?.expanded(viewerExpanded); }, [wizard, viewerExpanded]);
  useEffect(() => {
    if (!ready || renderBusy || !wizard || initializing.current || !pendingLayout.current) return;
    const select = frame.current?.contentDocument?.querySelector<HTMLSelectElement>('#coverLayout, #coverOptions select');
    const layout = pendingLayout.current;
    if (!select || !Array.from(select.options).some(option => option.value === layout)) return;
    pendingLayout.current = null;
    if (select.value !== layout) { select.value = layout; select.dispatchEvent(new Event('change', { bubbles: true })); }
    setDirty(true);
  }, [ready, renderBusy, wizard, configuration, draftCoverLayout]);
  useEffect(() => {
    if (!viewMessage) return;
    const timer = window.setTimeout(() => setViewMessage(''), 2500);
    return () => window.clearTimeout(timer);
  }, [viewMessage]);
  useEffect(() => { wizard?.refresh(); setFamilyCount(wizard?.familyCount() ?? 0); }, [wizard, configuration, busy, renderBusy, editable]);
  // Con una sola collezione di tessuto non c'è niente da scegliere: si passa direttamente ai colori.
  const skipFamilyStep = familyCount === 1 && renderer.id !== 'plaza-led';
  useEffect(() => { if (skipFamilyStep && step === 2) setStep(3); }, [skipFamilyStep, step]);
  useEffect(() => {
    if (!mobile && token && ready && !renderBusy && !busy && editable && !selection && !initializing.current && state.data?.offer?.options.length === 1) chooseOption(state.data.offer.options[0]);
  }, [token, ready, renderBusy, busy, editable, selection, configuration, state.data?.offer]);

  // Telefono + Quadrobook: si sceglie a schermo pieno dentro il visualizzatore, il 3D è una miniatura.
  useEffect(() => { setPhoneBox(!!token && mobile && isBox); }, [token, mobile, isBox]);
  // Telefono, Custodia / Album girevole / Plaza: stesso standard del Quadrobook (public/mockups/phone-ui.css).
  const phoneWizard = !!token && mobile && !isBox && !!wizard;
  useEffect(() => { wizard?.phone3d(phone3d); }, [wizard, phone3d]);
  useEffect(() => { setPhone3d(false); }, [step, wizard, choosing]);
  const postToViewer = (payload: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ channel: 'memorie-mockup-v1', ...payload }, window.location.origin);
  useEffect(() => { if (ready && isBox) postToViewer({ type: 'layout', phone: phoneBox }); }, [ready, readyTick, isBox, phoneBox]);
  useEffect(() => {
    if (ready && phoneBox && gallery.data) postToViewer({ type: 'gallery', photos: gallery.data.photos.map(p => ({ id: p.id, name: p.name, url: p.url, thumbnailUrl: p.thumbnailUrl, chapterId: p.chapterId })), chapters: gallery.data.chapters || [] });
  }, [ready, readyTick, phoneBox, gallery.data]);
  const submittedNow = !dirty && ['submitted', 'confirmed'].includes(saved?.status || '');
  const phoneStatus = !editable ? 'Sola lettura: stai vedendo la configurazione salvata.'
    : busy ? 'Salvataggio…'
    : configurationIssue ? configurationIssue
    : submittedNow ? (saved?.status === 'confirmed' ? 'Confermato dallo studio ✓' : 'Inviato allo studio ✓')
    : !dirty && saved ? 'Salvato automaticamente ✓' : '';
  const phoneCanSubmit = editable && !busy && !renderBusy && !!configuration && !!selectedOption && !submittedNow;
  useEffect(() => {
    if (ready && phoneBox) postToViewer({ type: 'status', text: phoneStatus, canSubmit: phoneCanSubmit, submitLabel: submittedNow ? 'Inviato' : 'Invia allo studio' });
  }, [ready, readyTick, phoneBox, phoneStatus, phoneCanSubmit, submittedNow]);
  hostActions.current = {
    close: () => closeConfigurator(),
    submit: () => { void submitWizard(); },
    // Salvataggio automatico al cambio di passo, solo se c'è qualcosa di nuovo e la configurazione è completa.
    step: () => { if (phoneBox && editable && dirty && configuration && !busy && !renderBusy) void save(true); },
    pickGallery: (slot, photoId) => {
      const target = slot === 'album' ? 'cover' : slot as 'base' | 'lid';
      setBoxSlot(target);
      void selectPhoto(() => request('/gallery-photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId }) }), target);
    },
  };

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.channel !== 'memorie-mockup-v1') return;
      if (event.data.type === 'ready') { setReady(true); setReadyTick(tick => tick + 1); }
      if (event.data.type === 'busy') setRenderBusy(event.data.busy === true);
      const waiter = exportWaiter.current;
      if (event.data.type === 'exported' && waiter && event.data.requestId === waiter.id) { waiter.resolve({ previews: event.data.previews, configuration: event.data.configuration }); exportWaiter.current = null; }
      if (event.data.type === 'export-error' && waiter && event.data.requestId === waiter.id) { waiter.reject(new Error('Impossibile generare le viste')); exportWaiter.current = null; }
      if (event.data.type === 'fatal-error') {
        const fatalWaiter = exportWaiter.current;
        if (fatalWaiter) {
          fatalWaiter.reject(new Error('L’anteprima 3D si è interrotta. Riprova a caricarla.'));
          exportWaiter.current = null;
        }
        setRenderBusy(false);
        setRendererError('L’anteprima 3D si è interrotta. Riprova a caricarla.');
        setWizard(null);
      }
      if (event.data.type === 'close') hostActions.current.close();
      if (event.data.type === 'submit') hostActions.current.submit();
      if (event.data.type === 'step') hostActions.current.step();
      if (event.data.type === 'pick-gallery' && ['base', 'lid', 'album'].includes(event.data.slot) && typeof event.data.photoId === 'string') hostActions.current.pickGallery(event.data.slot, event.data.photoId);
      if (event.data.type === 'pick-photo' && ['base', 'lid', 'album'].includes(event.data.slot)) {
        setBoxSlot(event.data.slot === 'album' ? 'cover' : event.data.slot);
        if (event.data.source === 'upload') upload.current?.click(); else setPicker(true);
      }
      if (event.data.type === 'error') { setMessage(String(event.data.message)); setRenderBusy(true); }
      if (event.data.type === 'change') {
        setDraftCoverLayout(String(event.data.configuration?.coverLayout || ''));
        setDraftBackCover(String(event.data.configuration?.backCover || ''));
        setFrontPhotoPresent(!!event.data.configuration?.photoAssetId);
        setBackPhotoPresent(!!event.data.configuration?.backPhotoAssetId);
        const parsed = mockupConfigurationSchema.safeParse(event.data.configuration);
        setConfiguration(parsed.success ? parsed.data : null);
        const context = dirtyContext.current;
        setDirty(context.editable && (parsed.success
          ? hasUnsavedMockupChanges(parsed.data, context.saved, context.selection, initializing.current)
          : !initializing.current));
        const draft = event.data.configuration;
        if (draft?.modelId === BOX_MOCKUP_MODEL.id) {
          setConfigurationIssue(parsed.success ? '' : !draft.photoAssetId ? 'Scegli la foto del quadro da parete.' : !draft.lidPhotoAssetId ? 'Scegli la foto della cornice da tavolo.' : draft.coverLayout === 'photo' && !draft.coverPhotoAssetId ? 'Scegli la foto della copertina.' : 'Controlla le scelte: tessuto non disponibile per questo modello.');
          initializing.current = false;
          return;
        }
        setConfigurationIssue(parsed.success ? '' : draft?.coverLayout !== 'plaque' && !draft?.photoAssetId
          ? 'Manca la foto di copertina. Sceglila dalla galleria nella sezione Copertina.'
          : draft?.backCover === 'photo' && !draft?.backPhotoAssetId
            ? 'Manca la foto sul plexiglass. Sceglila dalla galleria oppure seleziona Senza stampa.'
            : 'Controlla i testi (massimo 50 caratteri ciascuno) e scegli un rivestimento disponibile per questo modello.');
        initializing.current = false;
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);

  useEffect(() => {
    if (!ready || !state.data) return;
    const savedRevision = state.data.saved?.revision;
    if (shouldSkipSavedMockupRestore(
      savedRevision,
      skipRestoreRevision.current,
      !!pendingOption.current || !!pendingPreview.current,
    )) {
      revision.current = savedRevision ?? 0;
      return;
    }
    let cancelled = false;
    initializing.current = true;
    const saved = state.data.saved;
    const nextOption = pendingOption.current;
    const pending = pendingPreview.current;
    pendingOption.current = null;
    pendingPreview.current = null;
    if (!nextOption && !pending) setSelection(initialMockupSelection(state.data));
    revision.current = saved?.revision || 0;
    const restore = async () => {
      try {
        let photo = pending?.photo || (nextOption ? currentPhoto.current : undefined);
        let backPhoto = pending?.backPhoto;
        let boxPhotos: Awaited<ReturnType<typeof loadSavedPhotos>>['boxPhotos'];
        const restoredConfiguration = configurationForRendererRestore(
          saved?.configuration,
          pending?.configuration,
          !!nextOption,
          staleFixedSave,
        );
        const restoredOption = pending?.option || nextOption || (fixedModel ? state.data?.offer?.options[0] : saved?.option);
        const shouldLoadSavedPhotos = !nextOption && !pending && !staleFixedSave
          && !!saved && !!restoredConfiguration && hasSavedMockupPhotos(saved.configuration);
        if (shouldLoadSavedPhotos && saved && restoredConfiguration) {
          const recoveryContext = { configuration: restoredConfiguration, option: restoredOption, readOnly: !editable };
          savedPhotoRecovery.current = recoveryContext;
          setSavedPhotoError(null);
          setSavedPhotoSlot(null);
          let assets: Awaited<ReturnType<typeof loadSavedPhotos>>;
          if (!token) {
            const partial = await loadSavedPhotosPartial(saved.configuration);
            if (cancelled) return;
            assets = partial.assets;
            const failedPhoto = partial.failures[0];
            if (failedPhoto) {
              setSavedPhotoError(savedMockupPhotoFailure(failedPhoto.error));
              setSavedPhotoSlot(failedPhoto.slot);
            }
          } else {
            try {
              assets = await loadSavedPhotos(saved.configuration);
            } catch (error) {
              if (!cancelled) setSavedPhotoError(savedMockupPhotoFailure(error));
              return;
            }
          }
          photo = assets.photo;
          backPhoto = assets.backPhoto;
          boxPhotos = assets.boxPhotos;
        } else {
          savedPhotoRecovery.current = null;
          setSavedPhotoError(null);
        }
        if (!cancelled) {
          currentPhoto.current = photo;
          apply({
            configuration: restoredConfiguration,
            photo,
            backPhoto,
            ...(boxPhotos ? { photos: boxPhotos } : {}),
            option: restoredOption,
            readOnly: !editable,
          });
        }
      } catch (error) { if (!cancelled) setMessage((error as Error).message); }
    };
    void restore();
    return () => { cancelled = true; };
  }, [ready, readyTick, state.data?.saved?.revision, state.data?.offer?.revision, editable, staleFixedSave, fixedModel]);

  useEffect(() => {
    if (ready) frame.current?.contentWindow?.postMessage({ channel: 'memorie-mockup-v1', type: 'lock', readOnly: busy || !editable }, window.location.origin);
  }, [ready, readyTick, busy, editable]);

  useEffect(() => {
    if (!ready || !readOnly || !state.data) return;
    let cancelled = false;
    savedPhotoRecovery.current = null;
    setSavedPhotoError(null);
    setSavedPhotoSlot(null);
    apply({ readOnly: true });
    const freezeSaved = async () => {
      try {
        const fresh: MockupPayload = await (await request()).json();
        const saved = fresh.saved;
        if (!saved) {
          savedPhotoRecovery.current = null;
          return;
        }
        const option = saved.option;
        let assets: Awaited<ReturnType<typeof loadSavedPhotos>> = {};
        if (hasSavedMockupPhotos(saved.configuration)) {
          savedPhotoRecovery.current = { configuration: saved.configuration, option, readOnly: true };
          setSavedPhotoError(null);
          try {
            assets = await loadSavedPhotos(saved.configuration);
          } catch (error) {
            if (!cancelled) setSavedPhotoError(savedMockupPhotoFailure(error));
            return;
          }
        } else {
          savedPhotoRecovery.current = null;
          setSavedPhotoError(null);
        }
        if (cancelled) return;
        initializing.current = true;
        currentPhoto.current = assets.photo;
        apply({
          configuration: saved.configuration,
          photo: assets.photo,
          backPhoto: assets.backPhoto,
          ...(assets.boxPhotos ? { photos: assets.boxPhotos } : {}),
          option,
          readOnly: true,
        });
        setDirty(false);
        setMessage('Versione in sola lettura: è mostrata la configurazione salvata.');
      } catch (error) { if (!cancelled) setMessage((error as Error).message); }
    };
    void freezeSaved();
    return () => { cancelled = true; };
  }, [ready, readOnly, state.data?.saved?.revision]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function selectPhoto(operation: () => Promise<Response>, slotOverride?: 'base' | 'lid' | 'cover') {
    const target = mobile ? (step === 7 ? 'back' : 'front') : renderer.id === 'album-girevole' || renderer.id === 'plaza-led' ? photoSide : 'front';
    setBusy(true); setMessage('Preparazione foto…');
    try {
      const photo: MockupPhoto = mockupPhotoSchema.parse(await (await operation()).json());
      const blob = await (await request(`/photos/${photo.id}`)).blob();
      if (isBox) {
        apply({ photos: { [slotOverride || boxSlot]: { ...photo, blob } }, readOnly: !editable });
        setMessage(phoneBox ? '' : 'Foto pronta. Salva per conservarla nel fotolibro.');
        return;
      }
      if (target === 'front') currentPhoto.current = { ...photo, blob };
      apply({ [target === 'back' ? 'backPhoto' : 'photo']: { ...photo, blob }, readOnly: !editable });
      setMessage('Foto pronta. Salva per conservarla nel fotolibro.');
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  function missingPhotoSlotLabel(slot: SavedMockupPhotoSlot) {
    return ({
      front: 'di copertina',
      back: 'del plexiglass posteriore',
      base: 'del fondo del quadro',
      lid: 'del tappo del quadro',
      cover: 'della copertina del quadro',
    } as const)[slot];
  }
  function openMissingPhotoPicker() {
    if (!savedPhotoSlot) return;
    if (savedPhotoSlot === 'base' || savedPhotoSlot === 'lid' || savedPhotoSlot === 'cover') {
      setBoxSlot(savedPhotoSlot);
    } else {
      setPhotoSide(savedPhotoSlot);
    }
    setPicker(true);
  }
  async function replaceUnavailablePhoto(operation: () => Promise<Response>) {
    const context = savedPhotoRecovery.current;
    const slot = savedPhotoSlot;
    if (!context || !slot || !editable || context.readOnly || busy) return;
    setBusy(true);
    setMessage('Preparazione della foto sostitutiva…');
    try {
      const photo = mockupPhotoSchema.parse(await (await operation()).json());
      const blob = await (await request(`/photos/${photo.id}`)).blob();
      const configuration = replaceMockupPhotoReference(context.configuration, slot, photo.id);
      const partial = await loadSavedPhotosPartial(context.configuration, undefined, slot);
      const replacement: RuntimeMockupPhoto = { id: photo.id, name: photo.name, source: 'saved', blob };
      let boxPhotos = partial.assets.boxPhotos;
      let frontPhoto = partial.assets.photo;
      let backPhoto = partial.assets.backPhoto;
      if (slot === 'base' || slot === 'lid' || slot === 'cover') {
        boxPhotos = { ...boxPhotos, [slot]: replacement };
      } else if (slot === 'front') {
        frontPhoto = replacement;
      } else {
        backPhoto = replacement;
      }

      if (slot === 'front') currentPhoto.current = frontPhoto;
      else if (frontPhoto) currentPhoto.current = frontPhoto;
      initializing.current = false;
      setConfiguration(configuration);
      setDirty(true);
      setFrontPhotoPresent(!!configuration.photoAssetId);
      setBackPhotoPresent(!!('backPhotoAssetId' in configuration && configuration.backPhotoAssetId));
      apply({
        configuration,
        photo: frontPhoto,
        backPhoto: backPhoto,
        ...(boxPhotos ? { photos: boxPhotos } : {}),
        option: context.option,
        readOnly: false,
      });

      const nextFailure = partial.failures[0];
      setSavedPhotoError(nextFailure ? savedMockupPhotoFailure(nextFailure.error) : null);
      setSavedPhotoSlot(nextFailure?.slot || null);
      savedPhotoRecovery.current = { ...context, configuration };
      setMessage(nextFailure
        ? 'Foto sostituita. È presente un’altra foto non disponibile: puoi sostituirla oppure riprovare a caricarla.'
        : 'Foto sostituita. Le altre scelte sono state conservate: salva la bozza per creare una nuova revisione.');
    } catch (error) {
      setMessage(`Sostituzione non completata: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  async function save(quiet = false): Promise<SavedMockup | undefined> {
    if (!configuration || !editable) return;
    setBusy(true); setMessage(quiet ? '' : 'Salvataggio…');
    try {
      const saved: SavedMockup = await (await request('', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: revision.current, configuration, ...(state.data?.offer ? { selection, offerRevision: state.data.offer.revision } : {}) }) })).json();
      recordSaved(saved); setDirty(false);
      // La configurazione è già nel visualizzatore: non serve riapplicarla dopo il salvataggio.
      skipRestoreRevision.current = saved.revision;
      await state.refetch({ throwOnError: true });
      if (!quiet) {
        setMessage('Bozza salvata con successo.');
        toast({ title: 'Bozza salvata', description: 'Le tue modifiche sono state salvate e conservate.' });
      }
      return saved;
    } catch (error) {
      setMessage(`Salvataggio non completato: ${(error as Error).message}`);
      return undefined;
    }
    finally { setBusy(false); }
  }
  /** Telefono: salva da solo quando si cambia passo, se c'è qualcosa di nuovo e la configurazione è completa. */
  function autoSave() {
    if (phoneWizard && editable && dirty && configuration && !configurationIssue && !busy && !renderBusy) void save(true);
  }
  async function action(path: string, targetRevision?: number, persisted?: SavedMockup) {
    const current = persisted || saved;
    if (!current || (dirty && !persisted)) return;
    setBusy(true); setMessage('Operazione in corso…');
    try {
      const response = await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: targetRevision || current.revision, note }) });
      let notificationWarning = '';
      if (path === '/submit' || path === '/request-changes') {
        const result: SavedMockup & { notificationWarning?: string } = await response.json();
        notificationWarning = result.notificationWarning || '';
        recordSaved(result);
        if (path === '/request-changes') setAskingChanges(false);
      }
      const fresh = await state.refetch({ throwOnError: true }); revision.current = fresh.data?.saved?.revision || revision.current;
      setMessage(notificationWarning || (path === '/attach' || path === '/reconcile-attachment' ? 'Mockup registrato nella cartella Drive. Nessuna email inviata.' : path === '/submit' ? 'Proposta inviata allo studio per la verifica.' : 'Proposta restituita al cliente per le modifiche.'));
    } catch (error) { setMessage(path === '/submit' ? `Invio non confermato. La bozza è salvata: ${(error as Error).message}` : (error as Error).message); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!saved || dirty || !ready) return;
    setBusy(true); setMessage('Preparazione delle otto viste e conferma…');
    try {
      const exported = await new Promise<unknown>((resolve, reject) => {
        const id = crypto.randomUUID();
        const timeout = window.setTimeout(() => { exportWaiter.current = null; reject(new Error('Generazione delle viste scaduta. Riprova.')); }, 45_000);
        const target = frame.current?.contentWindow;
        if (!target) { clearTimeout(timeout); reject(new Error('Anteprima non disponibile. Riprova a caricare il mockup.')); return; }
        exportWaiter.current = { id, resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } };
        target.postMessage({ channel: 'memorie-mockup-v1', type: 'export', requestId: id }, window.location.origin);
      });
      const result = exported as { previews: unknown; configuration: unknown };
      const renderedConfiguration = mockupConfigurationSchema.parse(result.configuration);
      if (stableSerialize(renderedConfiguration) !== stableSerialize(saved.configuration)) throw new Error('Le viste non corrispondono al mockup salvato. Salva le modifiche prima di confermare.');
      const response = await request('/confirm', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: JSON.stringify({ revision: saved.revision, previews: result.previews, configuration: renderedConfiguration }) });
      const confirmed: SavedMockup & { notificationWarning?: string; notificationState?: string } = await response.json();
      recordSaved(confirmed);
      await queryClient.invalidateQueries({ queryKey: ['/api/photobooks', photobookId] });
      const fresh = await state.refetch({ throwOnError: true }); revision.current = fresh.data?.saved?.revision || revision.current;
      setMessage(confirmed.notificationWarning || 'Mockup confermato. Le viste e la configurazione sono conservate in questa revisione e puoi condividere il link anche prima dell’approvazione delle pagine.');
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function downloadReport(rev: number) {
    try {
      const blob = await (await request(`/report/${rev}`)).blob();
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `mockup-v${version}-r${rev}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) { setMessage((error as Error).message); }
  }
  async function previewRevision(item: SavedMockup) {
    if (!ready || !frame.current?.contentWindow) return;
    setBusy(true);
    setMessage(`Caricamento revisione r${item.revision}…`);
    try {
      const cfg = item.configuration;
      const boxPhotos = await savedBoxPhotos(cfg, `Foto r${item.revision}`);
      let photo;
      if (!boxPhotos && cfg.photoAssetId) {
        try {
          const blob = await (await request(`/photos/${cfg.photoAssetId}`)).blob();
          photo = { id: cfg.photoAssetId, name: `Foto r${item.revision}`, source: 'saved' as const, blob };
        } catch {}
      }
      let backPhoto;
      if ('backPhotoAssetId' in cfg && cfg.backPhotoAssetId) {
        try {
          const blob = await (await request(`/photos/${cfg.backPhotoAssetId}`)).blob();
          backPhoto = { id: cfg.backPhotoAssetId, name: `Foto retro r${item.revision}`, source: 'saved' as const, blob };
        } catch {}
      }
      if (item.selection) setSelection(item.selection);
      if (item.option && item.option.rendererId !== renderer.id) {
        pendingPreview.current = { configuration: cfg, photo, backPhoto, option: item.option || saved?.option };
        setRendererOverride(item.option.rendererId);
        setWizard(null);
        setConfiguration(null);
        setReady(false);
        setRenderBusy(true);
        setGeneration(g => g + 1);
      } else {
        pendingPreview.current = null;
        apply({ configuration: cfg, photo, backPhoto, ...(boxPhotos ? { photos: boxPhotos } : {}), option: item.option || saved?.option, readOnly: !editable });
      }
      setMessage(`Visualizzazione revisione r${item.revision} (${MOCKUP_STATUS_LABELS[item.status || 'draft']}).`);
    } catch (error) {
      setMessage(`Impossibile caricare la revisione: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  async function restoreRevisionAsActive(item: SavedMockup) {
    if (!editable) return;
    if (!window.confirm(`Vuoi impostare la revisione r${item.revision} come configurazione attiva da modificare e salvare?`)) return;
    await previewRevision(item);
    setConfiguration(item.configuration);
    if (item.selection) setSelection(item.selection);
    setDirty(true);
    setMessage(`Revisione r${item.revision} caricata come bozza attiva. Premi Salva bozza per tenerla.`);
  }
  async function submitWizard() {
    if (busy || renderBusy || !editable || !configuration || !selectedOption) return;
    const persisted = dirty ? await save() : saved;
    if (persisted) await action('/submit', undefined, persisted);
  }
  async function reloadWizard() {
    if (busy || (dirty && !window.confirm('Ricaricare la proposta e abbandonare le modifiche non salvate?'))) return;
    const fresh = await state.refetch();
    if (!fresh.isError) {
      pendingOption.current = null; pendingPreview.current = null; setRendererOverride(null); setDirty(false); setReady(false);
      setRenderBusy(true); setWizard(null); setStep(mobile ? 2 : 1); setGeneration(g => g + 1); setMessage('');
      setHomeOpen(false); pendingLayout.current = null;
    }
  }
  function retryRenderer() {
    if (busy) return;
    const retry = beginMockupRendererRetry(generation);
    skipRestoreRevision.current = retry.skipRestoreRevision;
    setRendererError('');
    setSavedPhotoError(null);
    setReady(false);
    setRenderBusy(true);
    setWizard(null);
    setGeneration(retry.generation);
    setHomeOpen(false);
    setGuideOpen(false);
    setMessage('');
    pendingPreview.current = null;
    pendingLayout.current = null;
  }
  async function retrySavedPhotoLoad() {
    const context = savedPhotoRecovery.current;
    if (!context || busy || renderBusy || !ready || savedPhotoRetryBusy || rendererError) return;
    setSavedPhotoRetryBusy(true);
    try {
      if (!token && !context.readOnly) {
        const partial = await loadSavedPhotosPartial(context.configuration);
        const assets = partial.assets;
        initializing.current = false;
        currentPhoto.current = assets.photo;
        apply({
          configuration: context.configuration,
          photo: assets.photo,
          backPhoto: assets.backPhoto,
          ...(assets.boxPhotos ? { photos: assets.boxPhotos } : {}),
          option: context.option,
          readOnly: false,
        });
        const nextFailure = partial.failures[0];
        setSavedPhotoError(nextFailure ? savedMockupPhotoFailure(nextFailure.error) : null);
        setSavedPhotoSlot(nextFailure?.slot || null);
        setMessage(nextFailure ? 'Alcune foto non sono ancora disponibili.' : 'Tutte le foto salvate sono state caricate.');
        return;
      }
      const assets = await loadSavedPhotos(context.configuration);
      if (context.readOnly) initializing.current = true;
      currentPhoto.current = assets.photo;
      apply({
        configuration: context.configuration,
        photo: assets.photo,
        backPhoto: assets.backPhoto,
        ...(assets.boxPhotos ? { photos: assets.boxPhotos } : {}),
        option: context.option,
        readOnly: context.readOnly,
      });
      setSavedPhotoError(null);
      setSavedPhotoSlot(null);
    } catch (error) {
      setSavedPhotoError(savedMockupPhotoFailure(error));
      const slot = error && typeof error === 'object' && 'photoSlot' in error
        ? (error as { photoSlot?: SavedMockupPhotoSlot }).photoSlot
        : undefined;
      setSavedPhotoSlot(slot || null);
    } finally {
      setSavedPhotoRetryBusy(false);
    }
  }
  const allSteps = renderer.id === 'album-girevole' || renderer.id === 'plaza-led' ? [2, 3, 4, 5, 6, 7, 9] : [2, 3, 5, 6, 9];
  const steps = skipFamilyStep ? allSteps.filter(value => value !== 2) : allSteps;
  const stepNames: Record<number, string> = {
    1: 'Modello',
    2: 'Il tessuto',
    3: 'Il colore',
    4: 'Struttura dello scrigno',
    5: 'Disposizione copertina',
    6: 'Personalizzazione copertina',
    7: 'Retro dello scrigno',
    8: 'Vedi l’album in casa',
    9: 'Riepilogo e invio',
  };
  const lastStep = 9;
  const photoStepValid =
    step === 6
      ? draftCoverLayout === 'plaque' || frontPhotoPresent
      : step === 7
        ? draftBackCover !== 'photo' || backPhotoPresent
        : true;
  const nextAllowed = ready && !renderBusy && !busy && (step === 1 ? (!state.data?.offer || !!selectedOption || !editable) : photoStepValid || !editable);
  const confirmBlock = !editable ? 'Versione in sola lettura: la conferma non è disponibile.'
    : !saved ? 'Non c’è ancora una proposta salvata. Attendi il cliente oppure preparala dalla scheda Bozza.'
    : dirty ? 'Ci sono modifiche non salvate: salva la revisione prima di confermarla.'
    : !saved.selection ? 'Associa un modello dalla scheda Bozza e salva prima di confermare.'
    : saved.status === 'confirmed' ? 'Questa revisione è già confermata. Puoi scaricare la conferma qui sotto.'
    : !ready || renderBusy ? 'Attendi il caricamento dell’anteprima prima di confermare.' : '';
  if (token && state.isError) return (
    <section className={compact ? 'inline-flex items-center gap-2' : 'rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2'} data-testid="photobook-mockup-load-error">
      <p role="alert" className="text-sm text-destructive">
        Impossibile caricare il mockup. {(state.error as Error)?.message || 'Riprova tra poco.'}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={() => void state.refetch()} disabled={state.isFetching}>
        Riprova
      </Button>
    </section>
  );
  if (token && state.isLoading && !state.data) return compact
    ? <span role="status" className="text-xs text-muted-foreground">Caricamento mockup…</span>
    : <p role="status" className="rounded-lg border bg-white p-3 text-sm text-muted-foreground">Caricamento mockup…</p>;
  if (token && !state.data) return (
    <section className={compact ? 'inline-flex items-center gap-2' : 'rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2'} data-testid="photobook-mockup-load-error">
      <p role="alert" className="text-sm text-destructive">Il mockup non è disponibile.</p>
      <Button type="button" variant="outline" size="sm" onClick={() => void state.refetch()} disabled={state.isFetching}>
        Riprova
      </Button>
    </section>
  );
  if (token && state.data?.offerError && !confirmedOnly) return (
    <section className={compact ? 'inline-flex items-center gap-2' : 'rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2'} data-testid="mockup-model-unavailable">
      <p role="alert" className="text-sm text-amber-900">{state.data.offerError}</p>
      <Button type="button" variant="outline" size="sm" onClick={() => void state.refetch()} disabled={state.isFetching}>
        {state.isFetching ? 'Aggiornamento…' : 'Aggiorna proposta'}
      </Button>
    </section>
  );
  if (confirmedOnly && state.data && saved?.status !== 'confirmed') return (
    <section role="status" className="rounded-lg border border-[#e6ddc9] bg-[#fbf8f0] p-4 space-y-3" data-testid="mockup-preview-not-ready">
      <div>
        <p className="font-medium text-[#354d47]">Il mockup non è ancora pronto</p>
        <p className="mt-1 text-sm text-[#68756c]">Lo studio deve completare e confermare questa anteprima. Non dovete ripetere i passaggi già completati.</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void state.refetch()} disabled={state.isFetching} data-testid="button-retry-mockup-preview">
        {state.isFetching ? 'Controllo in corso…' : 'Controlla di nuovo'}
      </Button>
    </section>
  );
  if (token && state.data && !state.data.enabled) return (
    <section className={compact ? 'inline-flex items-center gap-2' : 'rounded-lg border bg-white p-3 space-y-2'} data-testid="mockup-not-enabled">
      <p role="status" className="text-sm text-muted-foreground">La proposta non è ancora pronta. La scelta assegnata sarà disponibile qui quando lo studio l’avrà attivata.</p>
      <Button type="button" variant="outline" size="sm" onClick={() => void state.refetch()} disabled={state.isFetching}>
        {state.isFetching ? 'Aggiornamento…' : 'Aggiorna stato'}
      </Button>
    </section>
  );
  if (token && !editable && !saved) return <span className="text-xs text-muted-foreground">Nessun mockup salvato da consultare</span>;
  const previousStep = () => {
    if (homeOpen) { setHomeOpen(false); return; }
    const index = steps.indexOf(step);
    if (index > 0) setStep(steps[index - 1]);
    else if (editable && (state.data?.offer?.options.length || 0) > 1) setChoosing(true);
  };
  const viewAction = (action: 'front' | 'back' | 'reset' | 'plus' | 'minus' | 'extract' | 'rotate') => {
    wizard?.view(action);
    const nativeRotation = frame.current?.contentDocument?.getElementById('rotate');
    setViewMessage({ front: 'Vista frontale', back: 'Vista posteriore', reset: 'Vista ripristinata', plus: 'Zoom avanti', minus: 'Zoom indietro', extract: 'Estrazione album', rotate: nativeRotation?.hasAttribute('disabled') ? 'Reinserisci l’album per ruotare lo scrigno' : nativeRotation?.getAttribute('aria-pressed') === 'true' ? 'Scrigno in rotazione' : 'Rotazione ferma' }[action]);
  };
  const clientApprovalAction = token && confirmedOnly && saved?.status === 'confirmed' ? (
    <MockupClientApproval
      key={`${version}-${saved.revision}`}
      approvedAt={saved.clientApproval?.revision === saved.revision ? saved.clientApproval.approvedAt : undefined}
      disabled={!state.data?.clientApprovalAllowed}
      loading={open && (!ready || renderBusy || !!rendererError)}
      onApprove={async () => {
        setBusy(true);
        try {
          const approved: SavedMockup = await (await request('/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: saved.revision }) })).json();
          recordSaved(approved);
        } finally { setBusy(false); }
      }}
    />
  ) : null;
  return <section className={compact ? 'inline-flex shrink-0' : headless ? 'contents' : 'rounded-lg border bg-white p-4 space-y-3'} data-testid="photobook-mockup">
    {!open && saved?.clientApproval?.revision === saved?.revision && clientApprovalAction}
    {headless ? null : compact ? <Button variant="outline" className="h-10 px-3 text-xs" onClick={openConfigurator} disabled={!!token && !!state.data?.offerError}>{!token ? 'Mockup album' : (saved ? 'Apri il tuo album' : 'Personalizza album')}</Button> : <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="font-semibold">{noModelAssigned ? 'Anteprima album 3D' : `${title} · Anteprima album 3D`}</h2><p className="text-sm text-muted-foreground">{noModelAssigned ? 'Nessun modello assegnato: scegli prima i modelli nel passo 2.' : `Foto, rivestimento e scritte · versione ${version}`}</p></div>
      <Button variant="outline" className="min-h-11" onClick={openConfigurator} disabled={!!token && !!state.data?.offerError}>{token ? readOnly ? 'Apri mockup' : 'Personalizza il tuo album' : noModelAssigned ? 'Apri anteprima' : `Apri anteprima ${title}`}</Button>
     </div>}
     {saved && !compact && !token && !headless && <p className="text-sm text-muted-foreground">{MOCKUP_STATUS_LABELS[saved.status || 'draft']} · revisione {saved.revision} · versione fotolibro {version}</p>}
     {!compact && token && <div className="mockup-status-card" role="status" data-status={saved?.status || 'draft'}>
       <div className="mockup-status-card-heading">
         <strong>{saved ? MOCKUP_STATUS_LABELS[saved.status || 'draft'] : fixedModel ? 'Modello scelto dallo studio' : 'Personalizzazione pronta'}</strong>
         {saved && <span>{` · revisione ${saved.revision}`}</span>}
       </div>
       <p>{clientStatusMessage}</p>
       {fixedModel && !saved && <small>Il modello dell’album è già definito; puoi scegliere soltanto le sue personalizzazioni.</small>}
     </div>}
    <Dialog open={open} onOpenChange={next => { if (!next) closeConfigurator(); }}>
    <DialogContent ref={dialog} data-mobile-mockup={mobile ? 'true' : undefined} className="flex flex-col gap-0 p-0 sm:p-0 w-screen sm:w-[96vw] max-w-none sm:max-w-[1500px] h-[100dvh] sm:h-[94dvh] max-h-[100dvh] rounded-none sm:rounded-lg overflow-hidden [&>button]:hidden" onInteractOutside={event => event.preventDefault()}>
      <div className="mockup-header flex shrink-0 items-center justify-between gap-2 border-b px-3 sm:px-4" style={(phoneBox || phoneWizard) && !choosing ? { display: 'none' } : undefined}>
         <div className="mockup-header-title-box">
          <DialogTitle className="text-sm sm:text-base font-semibold truncate">
            {!token ? ({ offer: 'Assegna modello', edit: 'Prepara la bozza', review: 'Verifica e conferma' } as const)[adminTab] : choosing ? 'Scegli il tuo album' : title}
          </DialogTitle>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
            <span>{title}</span>
            {wizard && !isBox && !choosing && (
              <span className="mockup-header-step-badge">
                · Passo {steps.indexOf(step) + 1}/{steps.length}
              </span>
            )}
           </div>
          <DialogDescription className="sr-only">
            {title} · versione fotolibro {version}{!token && saved ? ` · revisione mockup ${saved.revision}` : ''}
          </DialogDescription>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!choosing && (
            <div className="mockup-header-links">
              {token && mobile && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2 text-xs text-stone-600 hover:text-stone-900"
                  disabled={!editable || busy || renderBusy || !ready || !(state.data?.offer?.options.length)}
                  onClick={() => { setViewerExpanded(false); setChoosing(true); }}
                >
                  {fixedModel ? 'Vedi modello' : 'Cambia'}
                </Button>
              )}
              {!mobile && editable && !busy && !renderBusy && ready && (state.data?.offer?.options.length || 0) > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2 text-xs text-stone-600 hover:text-stone-900"
                  onClick={() => { setViewerExpanded(false); setChoosing(true); }}
                >
                  Cambia modello
                </Button>
              )}
            </div>
          )}
          <Button
            variant="outline"
            className="mockup-close"
            aria-label="Chiudi mockup"
            disabled={busy}
            onClick={closeConfigurator}
          >
            <X size={18} />
          </Button>
        </div>
      </div>
      {token && !mobile && !choosing && !isBox && <div className="mockup-progress shrink-0 border-b px-3 py-2" aria-live="polite"><p className="text-sm font-medium">Passaggio {steps.indexOf(step) + 1} di {steps.length} · {stepNames[step]}</p><div className="mt-2 flex gap-1" aria-hidden="true">{steps.map(value => <span key={value} className={`h-1 flex-1 rounded ${value <= step ? 'bg-primary' : 'bg-muted'}`} />)}</div></div>}
      {choosing && state.data?.offer && <MockupModelChooser options={state.data.offer.options} initialOption={selectedOption} fixed={fixedModel} onChoose={chooseExample} onRetry={() => void state.refetch()} onCancel={!token || selectedOption || !needsClientModelChoice(state.data) ? () => setChoosing(false) : undefined} />}
      <div style={choosing ? { display: 'none' } : undefined} className={token ? 'min-h-0 flex-1 flex flex-col overflow-hidden' : 'mockup-admin-body'} data-testid="mockup-dialog-body">
      {!token && <div className="mockup-admin-panel" ref={setAdminSlot}>
        <nav className="sticky top-0 z-10 bg-background flex flex-wrap gap-1 border-b pb-3" aria-label="Gestione proposta album">
          {([['offer', '1 · Modello'], ['edit', '2 · Bozza'], ['review', '3 · Verifica e conferma']] as const).map(([tab, label]) => <Button key={tab} size="sm" variant={adminTab === tab ? 'default' : 'outline'} aria-pressed={adminTab === tab} onClick={() => setAdminTab(tab)}>{label}</Button>)}
         </nav>
       </div>}
      {open && !token && adminPanel(<Button hidden={adminTab !== 'edit'} variant="ghost" size="sm" className="self-start" disabled={busy} onClick={async () => {
        if (dirty && !window.confirm('Ricaricare la proposta e abbandonare le modifiche non salvate?')) return;
        const fresh = await state.refetch();
        if (!fresh.isError) { pendingOption.current = null; pendingPreview.current = null; setRendererOverride(null); setDirty(false); setReady(false); setRenderBusy(true); setGeneration(g => g + 1); }
      }}>Ricarica proposta</Button>)}
    {saved && !token && adminPanel(<div className="rounded-lg bg-muted/50 p-3 text-sm space-y-2"><p className="font-semibold">{MOCKUP_STATUS_LABELS[saved.status || 'draft']} · revisione {saved.revision}</p><p>{saved.option?.labName} {saved.option && '·'} {saved.option?.name} {saved.option && '·'} {saved.option?.materials.find(m => m.id === saved.configuration.materialId)?.label}</p><p>Ultima modifica: {saved.updatedBy === 'client' ? 'Cliente tramite link' : saved.updatedBy === 'studio' ? 'Studio' : 'Non registrato'} · {new Date(saved.updatedAt).toLocaleString('it-IT')}</p>{saved.note && <p>Note: {saved.note}</p>}</div>)}
    {open && <>
      {state.isLoading && <p role="status">Caricamento configurazione…</p>}
      {state.isError && <p role="alert">{(state.error as Error).message}</p>}
      {state.data?.offerError && <p role="alert" className="text-destructive">{state.data.offerError}</p>}
      {staleFixedSave && <p role="alert" className="text-amber-700">La bozza precedente usa un modello non più proposto. Scegli il modello aggiornato e salva una nuova revisione.</p>}
      {state.data && <>
        {!token && adminPanel(<div hidden={adminTab !== 'offer'}><p className="text-sm mb-3">Scegli il modello dell’album, oppure più modelli tra cui sceglierà il cliente. Qui non prepari la bozza: le foto necessarie si associano nel passaggio successivo.</p><MockupOfferEditor alwaysOpen offer={state.data.offer} modelMode={state.data.modelMode} modelSelection={state.data.modelSelection} hasSavedMockup={!!saved} disabled={readOnly || busy || dirty} uploadGraphic={async file => (await (await request(`/upload?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file })).json() as { id: string }).id} publish={async (mode, selections) => {
          setBusy(true);
          try {
            await request('/offer', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: state.data?.offer?.revision || 0, savedRevision: saved?.revision || 0, mode, selections }) });
            const fresh = await state.refetch({ throwOnError: true });
            setReady(false); setGeneration(g => g + 1);
            setMessage(fresh.data?.mockupPath === 'studio'
              ? 'Modello assegnato. Ora prepara la bozza e associa le foto necessarie.'
              : 'Modello assegnato nel link cliente.');
            if (fresh.data?.mockupPath === 'studio') setAdminTab('edit');
            return true;
          }
          catch (error) { setMessage((error as Error).message); return false; }
          finally { setBusy(false); }
        }} /></div>)}
        {!token && !!state.data.offer && adminPanel(<div hidden={adminTab !== 'edit'}><label className="block text-sm">Laboratorio e modello scelto<select aria-label="Laboratorio e modello scelto" className="block border rounded p-2 w-full mt-1" disabled={!editable || busy || !ready || renderBusy} value={selection ? `${selection.labId}/${selection.modelId}` : ''} onChange={event => {
          const [labId, modelId] = event.target.value.split('/');
          const next = { labId, modelId }; const option = optionFor(state.data?.offer || null, next);
          if (option) chooseOption(option);
        }}><option value="">Scegli un modello</option>{state.data.offer.options.map(o => <option key={`${o.labId}/${o.id}`} value={`${o.labId}/${o.id}`}>{o.labName} · {o.name}</option>)}</select></label></div>)}
        {!token && adminPanel(<p className="text-xs text-muted-foreground">Qui verifichi copertina e box, non le pagine interne. La conferma non avvia la stampa.</p>)}
         {!editable && token && <p role="status">Questa versione è in sola lettura: puoi esplorare l’album e scaricare le viste.</p>}
         {!editable && !token && !mobile && adminPanel(<p role="status" className="text-sm">Versione in sola lettura: puoi esplorare l’album e consultare le conferme.</p>)}
        {!token && (renderer.id === 'album-girevole' || renderer.id === 'plaza-led') && adminPanel(<div hidden={adminTab !== 'edit'}><label className="block text-sm">Foto da personalizzare<select aria-label="Foto da personalizzare" className="block border rounded p-2 mt-1" value={photoSide} disabled={!editable || busy || picker || renderBusy} onChange={e => setPhotoSide(e.target.value === 'back' ? 'back' : 'front')}><option value="front">Copertina album</option><option value="back">Plexiglass posteriore dello scrigno</option></select></label></div>)}
        {!token && isBox && adminPanel(<div hidden={adminTab !== 'edit'}><p className="text-sm">Scegli tessuti e foto direttamente nell’anteprima, uno slide alla volta: le foto arrivano dalla galleria del fotolibro. Poi salva e passa a “Verifica e conferma”.</p></div>)}
        {!token && !isBox && adminPanel(<div hidden={adminTab !== 'edit'}><p className="text-sm mb-3">Modifica i dettagli nell’anteprima, poi salva la nuova revisione e passa a “Verifica e conferma”.</p><div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!editable || busy || !ready || renderBusy} onClick={() => upload.current?.click()}>Carica una foto</Button>
          <Button variant="outline" disabled={!editable || busy || !ready || renderBusy} onClick={() => setPicker(true)}>Scegli dalla galleria</Button>
        </div></div>)}
        {(!mobile || isBox || !token) && <input ref={upload} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (!file) return;
          if (file.size > 20 * 1024 * 1024) { setMessage('Scegli una foto entro 20 MB.'); return; }
          const operation = () => request(`/upload?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
          if (!token && savedPhotoError?.kind === 'unavailable' && savedPhotoSlot) void replaceUnavailablePhoto(operation);
          else void selectPhoto(operation);
        }} />}
        {!token && message && adminPanel(<p role="status" className="rounded border p-3 text-sm">{message}</p>)}
          {savedPhotoError && <SavedMockupPhotoRecoveryError
            failure={savedPhotoError}
            retryBusy={savedPhotoRetryBusy || !ready || renderBusy || !!rendererError}
            onRetry={() => void retrySavedPhotoLoad()}
            studioRepair={!token && editable && savedPhotoError.kind === 'unavailable' && savedPhotoSlot ? {
              slotLabel: missingPhotoSlotLabel(savedPhotoSlot),
              disabled: busy || !ready || renderBusy,
              onChooseFromGallery: openMissingPhotoPicker,
              onUpload: () => upload.current?.click(),
            } : undefined}
          />}
          {token && rendererError && !choosing && <MockupRendererError message={rendererError} onRetry={retryRenderer} />}
         {token && !rendererError && (!ready || (!wizard && !isBox)) && !choosing && <p role="status" className="p-4 text-sm">Preparazione del tuo configuratore…</p>}
          {(!mobile || viewerStarted) && !!state.data && <iframe key={`${renderer.id}-${generation}`} ref={frame} title={`Configuratore 3D ${renderer.name}`} src={`${import.meta.env.BASE_URL}mockups/${renderer.path}`} sandbox="allow-scripts allow-same-origin allow-downloads" style={{ visibility: token && (!ready || (!wizard && !isBox) || !!rendererError || !!savedPhotoError) ? 'hidden' : undefined }} aria-hidden={token && (!ready || (!wizard && !isBox) || !!rendererError || !!savedPhotoError) ? true : undefined} className={`${token ? 'w-full min-h-0 flex-1 border-0' : 'mockup-admin-viewer'} ${busy ? 'pointer-events-none' : ''}`} />}
        {phoneWizard && wizard.topSlot && createPortal(<>
          <div className="mq-top">
            <p className="mq-step-count">Passo {steps.indexOf(step) + 1} di {steps.length}</p>
            <div className="mq-top-actions">
              {editable && ready && !busy && !renderBusy && !!state.data?.offer?.options.length && (!fixedModel || (state.data.offer.options.length || 0) > 1) && <button type="button" className="mq-text-btn" onClick={() => setChoosing(true)}>{fixedModel ? 'Vedi modello' : 'Cambia modello'}</button>}
              <button type="button" className="mq-round" aria-label="Chiudi mockup" disabled={busy} onClick={closeConfigurator}>✕</button>
            </div>
          </div>
          <div className="mq-progress" aria-hidden="true">{steps.map(value => <i key={value} className={value <= step ? 'done' : ''} />)}</div>
          <h1 className="mq-title">{step === lastStep ? 'Ecco il tuo album' : stepNames[step]}</h1>
        </>, wizard.topSlot)}
        {token && wizard && createPortal(<>
          {editable && ready && !renderBusy && configurationIssue && ((mobile && (step === 7 || (step === 6 && !(draftCoverLayout !== 'plaque' && !frontPhotoPresent)))) || (!mobile && step >= 5)) && <p role="status" className="wizard-validation">{configurationIssue}</p>}
          <div className="wizard-step-heading" aria-live="polite"><span>Passo {steps.indexOf(step) + 1} di {steps.length}</span><strong>{stepNames[step] || 'Configurazione'}</strong></div>
         {step === 1 && <><h3>Scegli il tuo modello</h3><p>Trovi qui i modelli proposti dallo studio.</p>{state.data?.offer?.options.map(option => <button type="button" className="wizard-model" key={`${option.labId}/${option.id}`} aria-pressed={selectedOption?.id === option.id && selectedOption?.labId === option.labId} disabled={!editable || busy || !ready || renderBusy} onClick={() => chooseOption(option)}>{option.name}<small>{option.labName} · {MOCKUP_RENDERERS.find(r => r.id === option.rendererId)?.name}</small></button>)}{!state.data?.offer && <p>{title}</p>}</>}
          {step === 2 && <><h3>Il tessuto</h3><p>{renderer.id === 'plaza-led' ? 'Scegli telaio esterno e album oppure telaio interno, poi la collezione. Il colore lo scegli subito dopo.' : 'Scegli la collezione di tessuti per il tuo album. Il colore lo scegli subito dopo.'}</p></>}
          {step === 3 && <><h3>Il colore</h3><p>Tocca un colore: lo vedi subito sull’album nell’anteprima 3D.</p></>}
          {step === 4 && <><h3>Struttura dello scrigno</h3><p>Scegli la finitura della cornice che racchiude l'album.</p></>}
          {step === 5 && <><h3>Disposizione della copertina</h3><p>Scegli lo stile e la disposizione della copertina: placchetta con incisione, foto grande a tutta copertina oppure foto formato placchetta.</p></>}
          {step === 6 && <>
            {draftCoverLayout === 'plaque' ? (
              <><h3>Incisione con i vostri nomi</h3><p>Inserite i nomi da incidere sulla placchetta in legno per generare il monogramma botanico.</p></>
            ) : (
              <>
                <h3>Foto di copertina</h3>
                <p>Personalizza la fotografia per la copertina del tuo album.</p>
                {phoneWizard && <PhotobookInlineGallery photos={gallery.data?.photos || []} chapters={gallery.data?.chapters || []} disabled={!editable || busy || !ready || renderBusy} selectedId={pickedPhoto.front} onPick={photo => { setPickedPhoto(prev => ({ ...prev, front: photo.id })); void selectPhoto(() => request('/gallery-photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId: photo.id }) })); }} />}
                {phoneWizard && frontPhotoPresent && <p className="mq-status" role="status">Foto scelta ✓</p>}
                {!phoneWizard && <div className="wizard-photo-actions">
                  <button type="button" disabled={!editable || busy || !ready || renderBusy} onClick={() => { setPhotoSide('front'); setPicker(true); }}>
                    Scegli dalla galleria
                  </button>
                  {!mobile && <button type="button" disabled={!editable || busy || !ready || renderBusy} onClick={() => upload.current?.click()}>Carica una foto</button>}
                </div>}
                {!photoStepValid && editable && <p role="status" className="wizard-validation">Scegli una foto per continuare.</p>}
              </>
            )}
          </>}
          {step === 7 && <>
            <h3>Plexiglass posteriore dello scrigno</h3>
            <p>Scegli l'effetto del retro dello scrigno: lastra trasparente senza stampa, oppure stampa fotografica su plexiglass.</p>
            {draftBackCover === 'photo' && phoneWizard && <>
              <PhotobookInlineGallery photos={gallery.data?.photos || []} chapters={gallery.data?.chapters || []} disabled={!editable || busy || !ready || renderBusy} selectedId={pickedPhoto.back} onPick={photo => { setPickedPhoto(prev => ({ ...prev, back: photo.id })); void selectPhoto(() => request('/gallery-photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId: photo.id }) })); }} />
              {backPhotoPresent && <p className="mq-status" role="status">Foto scelta ✓</p>}
            </>}
            {draftBackCover === 'photo' && !phoneWizard && (
              <div className="wizard-photo-actions">
                <button type="button" disabled={!editable || busy || !ready || renderBusy} onClick={() => { setPhotoSide('back'); setPicker(true); }}>
                  Scegli foto per il retro
                </button>
              </div>
            )}
            {!photoStepValid && editable && <p role="status" className="wizard-validation">Scegli una foto per il retro in plexiglass per continuare.</p>}
          </>}
          {step === 8 && <>
            <h3>Vedi l’album nella tua casa</h3>
            <p>Visualizza in tempo reale come si presenta il tuo album appoggiato su un mobile o nella zona living. Questo passaggio è facoltativo: puoi lasciare “Solo album” o scegliere un’ambientazione.</p>
          </>}
          {step === lastStep && phoneWizard && <>
            {message ? <p className="mq-status" role="status">{message}</p> : phoneStatus ? <p className="mq-status" role="status">{phoneStatus}</p> : null}
          </>}
          {step === lastStep && !phoneWizard && <>
            <h3>Riepilogo e conferma</h3>
            {saved && <p>{MOCKUP_STATUS_LABELS[saved.status || 'draft']} · revisione {saved.revision}{saved.note && ` · ${saved.note}`}</p>}
            <p>Controlla le scelte riassunte qui sotto. Puoi esplorare l'album a 360° con i comandi sullo stage 3D.</p>
            <p className="text-xs text-stone-500">L’invio chiede la verifica allo studio: non manda l’album in stampa. Puoi creare altre revisioni finché lo studio non avvia la stampa.</p>
            <details className="mt-2 text-xs"><summary className="cursor-pointer font-medium py-1">Recupera la proposta iniziale dello studio</summary><button type="button" className="mt-1 underline" disabled={busy} onClick={reloadWizard}>Ricarica proposta</button></details>
          </>}
        </>, wizard.slot)}
        {token && wizard && createPortal(<div className="wizard-mobile-actions">
          {!editable && <span className="wizard-unsaved">Sola lettura</span>}
          {homeOpen ? <button type="button" onClick={() => setHomeOpen(false)}><ArrowLeft size={15} /> Torna alla configurazione</button> : <>
          <div className={`wizard-nav${phoneWizard ? ' mq-nav' : ''}`}>
            <button type="button" className="mq-prev" aria-label={steps.indexOf(step) === 0 ? 'Torna alla scelta modello' : 'Indietro'} disabled={busy || (steps.indexOf(step) === 0 && (!editable || (state.data?.offer?.options.length || 0) <= 1))} onClick={previousStep}>
              <ArrowLeft size={17} /><span>Indietro</span>
            </button>
            {step < lastStep ? (
              <button type="button" className="wizard-primary mq-primary" disabled={!nextAllowed} onClick={() => { autoSave(); setStep(steps[steps.indexOf(step) + 1]); }}>
                Avanti <ArrowRight size={16} />
              </button>
            ) : editable ? (
              <button type="button" className="wizard-primary mq-primary" disabled={!editable || busy || renderBusy || !configuration || !selectedOption || (!dirty && ['submitted', 'confirmed'].includes(saved?.status || ''))} onClick={submitWizard}>
                {phoneWizard ? (submittedNow ? 'Inviato allo studio' : 'Invia allo studio') : 'Invia allo studio per verifica'}
              </button>
             ) : <span className="wizard-unsaved">Sola lettura</span>}
          </div>
          {editable && configuration && !phoneWizard && (
            <button
              type="button"
              className="w-full mt-1.5 py-2 px-3 rounded-lg border border-[#335e56] text-[#335e56] bg-white font-medium text-xs flex items-center justify-center gap-1.5 hover:bg-[#eaf1ef] transition-colors disabled:opacity-40 shadow-sm"
              disabled={busy || renderBusy}
              onClick={() => void save()}
            >
              <Save size={14} />
              Salva bozza (per recuperarla in seguito)
            </button>
          )}
          </>}
        </div>, wizard.actionsSlot)}
        {mobile && wizard && createPortal(<>
          {phoneWizard && !phone3d && step !== lastStep && <button type="button" className="mq-pip-open" onClick={() => setPhone3d(true)}>Vedi in 3D ›</button>}
          {phoneWizard && <button type="button" className="mq-pip-close" onClick={() => setPhone3d(false)}>‹ Torna alle scelte</button>}
          <div className="wizard-iconbar mq-only-3d" aria-label="Comandi vista album">
            <button aria-label="Fronte" onClick={() => viewAction('front')}><b aria-hidden="true">F</b></button>
            <button aria-label="Retro" onClick={() => viewAction('back')}><b aria-hidden="true">R</b></button>
            <button aria-label="Estrai o reinserisci album" onClick={() => viewAction('extract')}><LogOut size={17} /><span>Estrai</span></button>
            {(renderer.id === 'album-girevole' || renderer.id === 'plaza-led') && <button aria-label="Avvia o ferma rotazione scrigno" onClick={() => viewAction('rotate')}><Rotate3D size={17} /></button>}
            <button aria-label="Ingrandisci album" onClick={() => viewAction('plus')}><ZoomIn size={17} /><span>Zoom +</span></button>
            <button aria-label="Riduci album" onClick={() => viewAction('minus')}><ZoomOut size={17} /><span>Zoom −</span></button>
            <button aria-label="Reimposta vista" onClick={() => viewAction('reset')}><RotateCcw size={17} /><span>Reimposta</span></button>
          </div>
          <button className="wizard-help mq-only-3d" aria-label="Guida ai gesti" onClick={() => setGuideOpen(!guideOpen)}><HelpCircle size={18} /></button>
          {viewMessage && <span className="wizard-view-message mq-only-3d" role="status">{viewMessage}</span>}
          {guideOpen && <div className="wizard-gesture-guide mq-only-3d" role="region" aria-label="Guida ai gesti"><strong>Guarda l’album da vicino</strong><p>Trascina con un dito per girare la vista.<br />Allarga due dita per vedere la trama.<br />Le icone mostrano fronte, retro ed estrazione.</p><button onClick={() => { setGuideOpen(false); try { sessionStorage.setItem('mockup-touch-guide', 'seen'); } catch { /* Non impedire la personalizzazione se lo storage è disabilitato. */ } }}>Ho capito</button></div>}
        </>, wizard.controlsSlot)}
        {!token && adminPanel(<div hidden={adminTab !== 'review'} className="space-y-3">
          <h3 className="font-semibold">Controlla la proposta e scegli come proseguire</h3>
          {confirmBlock && <p className="text-sm" role="status">{confirmBlock}</p>}
          <div className="flex flex-wrap gap-2">
            <Button className="w-full" disabled={busy || !!confirmBlock} onClick={confirm}>Conferma mockup</Button>
            {state.data?.mockupPath !== 'studio' && <Button className="w-full" variant="outline" disabled={!editable || busy || dirty || !saved} onClick={() => setAskingChanges(!askingChanges)}>Richiedi modifiche al cliente</Button>}
          </div>
          {askingChanges && state.data?.mockupPath !== 'studio' && <div className="rounded border p-3 space-y-3"><label className="block text-sm">Cosa deve correggere il cliente?<textarea className="block border rounded p-2 w-full mt-2" rows={3} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label><p className="text-xs text-muted-foreground">Il messaggio sarà visibile nel suo link e inviato via email.</p><Button disabled={!editable || busy || dirty || !saved || !note.trim()} onClick={() => action('/request-changes')}>Invia richiesta di modifiche</Button></div>}
          {saved?.status === 'confirmed' && <div className="rounded border p-3 space-y-2"><p className="text-sm font-medium">Mockup confermato: prepara l’invio</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => downloadReport(saved.revision)}>Scarica conferma</Button><Button disabled={readOnly || busy || dirty} onClick={() => action('/attach')}>Allega all’invio fotolibro su Drive</Button></div></div>}
          <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium py-2">Storico revisioni e verifiche</summary><div className="flex flex-wrap gap-2 py-2">
            <Button variant="outline" disabled={busy} onClick={async () => { try { setHistory(await (await request('/history')).json()); } catch (error) { setMessage((error as Error).message); } }}>Storico revisioni</Button>
            {saved?.status === 'confirmed' && <Button variant="outline" disabled={busy || dirty} onClick={() => action('/reconcile-attachment')}>Verifica allegato Drive dopo un errore</Button>}
          </div>
          {history && <div className="max-h-60 overflow-auto text-sm space-y-1">
            {!history.length && <p>Nessuna revisione precedente.</p>}
            {history.map(item => <div
              className="border rounded p-2 bg-stone-50 hover:bg-stone-100 cursor-pointer transition-colors space-y-1"
              key={item.revision}
              onClick={() => void previewRevision(item)}
              title="Clicca per esaminare questa revisione in 3D"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-stone-900">
                  r{item.revision} · {MOCKUP_STATUS_LABELS[item.status || 'draft']}
                </span>
                <span className="text-[11px] text-stone-500">
                  {item.updatedBy === 'client' ? 'Cliente' : 'Studio'} · {new Date(item.updatedAt).toLocaleString('it-IT')}
                </span>
              </div>
              <p className="text-xs text-stone-600 truncate">
                {item.option?.labName} {item.option && '·'} {item.option?.name || 'Custodia'} {item.note ? `· ${item.note}` : ''}
              </p>
              <div className="flex items-center gap-1.5 pt-1" onClick={e => e.stopPropagation()}>
                <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => void previewRevision(item)}>
                  Esamina in 3D
                </Button>
                {editable && (
                  <Button size="sm" variant="outline" className="h-7 text-xs px-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50" onClick={() => void restoreRevisionAsActive(item)}>
                    Ripristina come attiva
                  </Button>
                )}
                {item.status === 'confirmed' && (
                  <Button size="sm" variant="link" className="h-7 text-xs p-0 text-blue-700" onClick={() => downloadReport(item.revision)}>
                    Scarica conferma
                  </Button>
                )}
              </div>
            </div>)}
          </div>}
          </details>
        </div>)}
      </>}
      {gallery.isLoading && picker && <p role="status">Caricamento foto della galleria…</p>}
      {gallery.isError && picker && <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <p role="alert" className="text-sm text-destructive">Foto non caricate. Le tue scelte restano salvate; puoi riprovare.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void gallery.refetch()} disabled={gallery.isFetching} data-testid="button-retry-mockup-gallery">
          {gallery.isFetching ? 'Caricamento…' : 'Riprova'}
        </Button>
      </div>}
      <PhotobookPhotoPicker open={picker && !!gallery.data} onOpenChange={setPicker} photos={gallery.data?.photos || []} chapters={gallery.data?.chapters || []} title={isBox ? ({ base: 'Scegli la foto del quadro da parete', lid: 'Scegli la foto della cornice da tavolo', cover: 'Scegli la foto della copertina' }[boxSlot]) : photoSide === 'back' ? 'Scegli la foto del retro' : 'Scegli la foto di copertina'} onSelect={photo => {
        setPicker(false);
        const operation = () => request('/gallery-photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId: photo.id }) });
        if (!token && savedPhotoError?.kind === 'unavailable' && savedPhotoSlot) void replaceUnavailablePhoto(operation);
        else void selectPhoto(operation);
      }} />
    </>}
      </div>
      {clientApprovalAction && <div className="shrink-0 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{clientApprovalAction}</div>}
      {token && isBox && !choosing && !phoneBox && !confirmedOnly && <div className="mockup-actions shrink-0 border-t bg-background p-3 sm:px-4 space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-testid="quadrobook-actions">
        {!editable && <p className="text-sm" role="status">Sola lettura: stai vedendo la configurazione salvata.</p>}
        {editable && configurationIssue && <p className="text-sm text-amber-800" role="status">{configurationIssue}</p>}
        {message && <p className="text-sm" role="status">{message}</p>}
        {editable && <div className="flex gap-2">
          <Button variant="outline" className="min-h-11 flex-1" disabled={busy || renderBusy || !ready || !configuration || !dirty || !selectedOption} onClick={() => void save()}>Salva bozza</Button>
          <Button className="min-h-11 flex-1" disabled={busy || renderBusy || !ready || !configuration || !selectedOption || (!dirty && ['submitted', 'confirmed'].includes(saved?.status || ''))} onClick={() => void submitWizard()}>Invia allo studio</Button>
        </div>}
        <p className="hidden sm:block text-xs text-muted-foreground">L’invio chiede la verifica allo studio: non manda l’album in stampa. Puoi creare altre revisioni finché lo studio non avvia la stampa.</p>
      </div>}
      {!mobile && !token && (adminTab === 'edit' || dirty) && <div className="mockup-actions shrink-0 border-t bg-background p-3 sm:px-4 space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {dirty && <p className="text-sm text-amber-800" role="status">Modifiche da salvare</p>}
         <div className="flex flex-wrap gap-2">
          <Button className="min-h-11 flex-1 sm:flex-none" disabled={!editable || busy || renderBusy || !configuration || !dirty || (!!state.data?.offer && !selectedOption)} onClick={() => void save()}>Salva bozza</Button>
           <p className="text-sm text-muted-foreground self-center">{dirty ? 'Salva le modifiche, poi passa a “Verifica e conferma”.' : 'Nessuna modifica da salvare. Per approvare usa “Conferma mockup” nella scheda Verifica e conferma.'}</p>
         </div>
      </div>}
    </DialogContent>
    </Dialog>
  </section>;
}
