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
import { MOCKUP_RENDERERS } from '@shared/mockup-catalog';
import type { MockupOption } from '@shared/mockup-workflow';
import MockupModelChooser from './MockupModelChooser';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, ArrowRight, HelpCircle, LogOut, Rotate3D, RotateCcw, Save, X, ZoomIn, ZoomOut } from 'lucide-react';

interface Props { photobookId: string; version: number; token?: string; readOnly?: boolean; summary?: boolean; compact?: boolean; onOpenChange?: (open: boolean) => void }
type RuntimePhoto = { id: string; name: string; source: string; blob: Blob };

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

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

export default function PhotobookMockup({ photobookId, version, token, readOnly = false, summary = false, compact = false, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
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
  const [busy, setBusy] = useState(false);
  const [renderBusy, setRenderBusy] = useState(true);
  const [ready, setReady] = useState(false);
  const [rendererError, setRendererError] = useState('');
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
  const revision = useRef(0);
  const [selection, setSelection] = useState<MockupSelection>();
  const [note, setNote] = useState('');
  const [history, setHistory] = useState<SavedMockup[] | null>(null);
  const [generation, setGeneration] = useState(0);
  const [rendererOverride, setRendererOverride] = useState<string | null>(null);
  const pendingOption = useRef<MockupOption | null>(null);
  const currentPhoto = useRef<RuntimePhoto>();
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
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || 'Operazione non riuscita');
    }
    return response;
  }
  const stateKey = ['photobook-mockup', photobookId, version, token ? 'client' : 'admin'];
  const state = useQuery<MockupPayload>({
    queryKey: stateKey,
    queryFn: async () => (await request()).json(),
    enabled: !!token || open || summary,
    refetchOnWindowFocus: false,
  });
  const gallery = useQuery({
    queryKey: ['mockup-gallery', photobookId, token ? 'client' : 'admin'],
    enabled: picker,
    queryFn: async () => token ? getPhotobookGalleryPhotosByToken(token) : { photos: await listPhotobookGalleryPhotos(photobookId), chapters: [] },
  });
  const editable = !readOnly && state.data?.editable === true;
  const selectedOption = optionFor(state.data?.offer || null, selection);
  const saved = state.data?.saved;
  const renderer = MOCKUP_RENDERERS.find(r => r.id === (rendererOverride || saved?.configuration.modelId)) || MOCKUP_RENDERERS[0];
  const fixedModel = state.data?.modelMode === 'fixed';
  const clientStatusMessage = !saved
    ? 'Personalizza copertina, rivestimento e scritte, poi invia la proposta allo studio.'
    : saved.status === 'submitted'
      ? 'La proposta è stata inviata allo studio per la verifica. Puoi ancora modificarla: ogni modifica richiederà una nuova verifica.'
      : saved.status === 'changes_requested'
        ? 'Lo studio ha richiesto delle modifiche. Riapri il mockup, aggiorna le scelte e invialo nuovamente.'
        : saved.status === 'confirmed'
          ? 'Lo studio ha confermato il mockup. Puoi ancora modificarlo fino alla stampa: una nuova modifica richiederà una nuova verifica.'
          : 'Bozza salvata: puoi riprenderla quando vuoi oppure inviarla allo studio per la verifica.';
  const title = selectedOption?.name || saved?.option?.name || 'Custodia';
  const apply = (payload: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ channel: 'memorie-mockup-v1', type: 'apply', ...payload }, window.location.origin);
  const recordSaved = (value: SavedMockup) => {
    revision.current = value.revision;
    queryClient.setQueryData<MockupPayload>(stateKey, previous => previous ? { ...previous, saved: value } : previous);
  };
  function closeConfigurator() {
    if (busy) return;
    if (dirty && !window.confirm('Chiudere il configuratore e abbandonare le modifiche non salvate?')) return;
    setOpen(false); setPicker(false); setReady(false); setRenderBusy(true); setRendererError('');
    setDirty(false); setConfiguration(null); setRendererOverride(null); setSelection(undefined);
    setDraftCoverLayout(''); setDraftBackCover(''); setFrontPhotoPresent(false); setBackPhotoPresent(false);
    pendingOption.current = null; pendingPreview.current = null; currentPhoto.current = undefined; initializing.current = true;
    setHistory(null); setNote(''); setMessage(''); setPhotoSide('front'); setAskingChanges(false); setViewerExpanded(false);
    setStep(1); setWizard(null); setChoosing(false); setViewerStarted(false); setHomeOpen(false); setGuideOpen(false); pendingLayout.current = null;
  }

  function openConfigurator() {
    setAdminTab('review');
    const hasOffer = !!state.data?.offer?.options.length;
    setChoosing(mobile && editable && !saved && hasOffer);
    setViewerStarted(!mobile || !!saved || (!!state.data && !hasOffer));
    setStep(mobile && saved && (saved.status === 'draft' || !editable) ? lastStep : 2); setOpen(true);
    let guideSeen = false;
    try { guideSeen = sessionStorage.getItem('mockup-touch-guide') === 'seen'; } catch { /* Guida disponibile anche senza storage locale. */ }
    setGuideOpen(mobile && !guideSeen);
    void state.refetch();
  }

  useEffect(() => {
    if (!open || !mobile || saved || viewerStarted || !state.data) return;
    if (state.data.offer?.options.length) {
      if (editable) setChoosing(true);
    } else {
      setViewerStarted(true);
    }
  }, [open, mobile, editable, saved?.revision, viewerStarted, state.data?.offer?.revision]);

  function chooseExample(option: MockupOption, layout: string) {
    if (!editable) return;
    if (viewerStarted && (!ready || renderBusy || busy)) return;
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
    if (!token || !ready || !frame.current?.contentDocument) return;
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
  }, [ready, token, mobile, editable, readOnly]);

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
  useEffect(() => { wizard?.refresh(); }, [wizard, configuration, busy, renderBusy, editable]);
  useEffect(() => {
    if (!mobile && token && ready && !renderBusy && !busy && editable && !selection && !initializing.current && state.data?.offer?.options.length === 1) chooseOption(state.data.offer.options[0]);
  }, [token, ready, renderBusy, busy, editable, selection, configuration, state.data?.offer]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.channel !== 'memorie-mockup-v1') return;
      if (event.data.type === 'ready') setReady(true);
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
      if (event.data.type === 'error') { setMessage(String(event.data.message)); setRenderBusy(true); }
      if (event.data.type === 'change') {
        setDraftCoverLayout(String(event.data.configuration?.coverLayout || ''));
        setDraftBackCover(String(event.data.configuration?.backCover || ''));
        setFrontPhotoPresent(!!event.data.configuration?.photoAssetId);
        setBackPhotoPresent(!!event.data.configuration?.backPhotoAssetId);
        const parsed = mockupConfigurationSchema.safeParse(event.data.configuration);
        setConfiguration(parsed.success ? parsed.data : null);
        const draft = event.data.configuration;
        setConfigurationIssue(parsed.success ? '' : draft?.coverLayout !== 'plaque' && !draft?.photoAssetId
          ? 'Manca la foto di copertina. Sceglila dalla galleria nella sezione Copertina.'
          : draft?.backCover === 'photo' && !draft?.backPhotoAssetId
            ? 'Manca la foto sul plexiglass. Sceglila dalla galleria oppure seleziona Senza stampa.'
            : 'Controlla i testi (massimo 50 caratteri ciascuno) e scegli un rivestimento disponibile per questo modello.');
        if (!initializing.current) setDirty(true);
        initializing.current = false;
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);

  useEffect(() => {
    if (!ready || !state.data) return;
    let cancelled = false;
    initializing.current = true;
    const saved = state.data.saved;
    const nextOption = pendingOption.current;
    const pending = pendingPreview.current;
    pendingOption.current = null;
    pendingPreview.current = null;
    if (!nextOption && !pending) setSelection(saved?.selection);
    revision.current = saved?.revision || 0;
    const restore = async () => {
      try {
        let photo = pending?.photo || (nextOption ? currentPhoto.current : undefined);
        if (!nextOption && !pending && saved?.configuration.photoAssetId) {
          const blob = await (await request(`/photos/${saved.configuration.photoAssetId}`)).blob();
          photo = { id: saved.configuration.photoAssetId, name: 'Foto salvata', source: 'saved', blob };
        }
        let backPhoto = pending?.backPhoto;
        if (!nextOption && !pending && saved && 'backPhotoAssetId' in saved.configuration && saved.configuration.backPhotoAssetId) {
          const id = saved.configuration.backPhotoAssetId;
          backPhoto = { id, name: 'Foto retro salvata', source: 'saved', blob: await (await request(`/photos/${id}`)).blob() };
        }
        if (!cancelled) {
          currentPhoto.current = photo;
          apply({
            configuration: pending?.configuration || (nextOption ? undefined : saved?.configuration),
            photo,
            backPhoto,
            option: pending?.option || nextOption || saved?.option,
            readOnly: !editable,
          });
        }
      } catch (error) { if (!cancelled) setMessage((error as Error).message); }
    };
    void restore();
    return () => { cancelled = true; };
  }, [ready, state.data?.saved?.revision, state.data?.offer?.revision, editable]);

  useEffect(() => {
    if (ready) frame.current?.contentWindow?.postMessage({ channel: 'memorie-mockup-v1', type: 'lock', readOnly: busy || !editable }, window.location.origin);
  }, [ready, busy, editable]);

  useEffect(() => {
    if (!ready || !readOnly || !state.data) return;
    let cancelled = false;
    apply({ readOnly: true });
    const freezeSaved = async () => {
      try {
        const fresh: MockupPayload = await (await request()).json();
        const saved = fresh.saved;
        if (!saved) return;
        const blob = saved.configuration.photoAssetId ? await (await request(`/photos/${saved.configuration.photoAssetId}`)).blob() : undefined;
        const backId = 'backPhotoAssetId' in saved.configuration ? saved.configuration.backPhotoAssetId : null;
        const backPhoto = backId ? { id: backId, name: 'Foto retro salvata', source: 'saved', blob: await (await request(`/photos/${backId}`)).blob() } : undefined;
        if (cancelled) return;
        initializing.current = true;
        apply({ configuration: saved.configuration, photo: blob ? { id: saved.configuration.photoAssetId, name: 'Foto salvata', source: 'saved', blob } : undefined, backPhoto, readOnly: true });
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

  async function selectPhoto(operation: () => Promise<Response>) {
    const target = mobile ? (step === 7 ? 'back' : 'front') : renderer.id === 'album-girevole' || renderer.id === 'plaza-led' ? photoSide : 'front';
    setBusy(true); setMessage('Preparazione foto…');
    try {
      const photo: MockupPhoto = mockupPhotoSchema.parse(await (await operation()).json());
      const blob = await (await request(`/photos/${photo.id}`)).blob();
      if (target === 'front') currentPhoto.current = { ...photo, blob };
      apply({ [target === 'back' ? 'backPhoto' : 'photo']: { ...photo, blob }, readOnly: !editable });
      setMessage('Foto pronta. Salva per conservarla nel fotolibro.');
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function save(): Promise<SavedMockup | undefined> {
    if (!configuration || !editable) return;
    setBusy(true); setMessage('Salvataggio…');
    try {
      const saved: SavedMockup = await (await request('', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: revision.current, configuration, ...(state.data?.offer ? { selection, offerRevision: state.data.offer.revision } : {}) }) })).json();
      recordSaved(saved); setDirty(false); await state.refetch({ throwOnError: true });
      setMessage('Bozza salvata con successo.');
      toast({ title: 'Bozza salvata', description: 'Le tue modifiche sono state salvate e conservate.' });
      return saved;
    } catch (error) { setMessage(`Salvataggio non completato: ${(error as Error).message}`); }
    finally { setBusy(false); }
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
      recordSaved(await response.json());
      const fresh = await state.refetch({ throwOnError: true }); revision.current = fresh.data?.saved?.revision || revision.current;
      setMessage('Mockup confermato. Le viste e la configurazione sono conservate in questa revisione.');
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
      let photo;
      if (cfg.photoAssetId) {
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
        apply({ configuration: cfg, photo, backPhoto, option: item.option || saved?.option, readOnly: !editable });
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
    setMessage(`Revisione r${item.revision} caricata come bozza attiva. Premi Salva mockup per confermare.`);
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
    setRendererError('');
    setReady(false);
    setRenderBusy(true);
    setWizard(null);
    setGeneration(g => g + 1);
    setHomeOpen(false);
    setGuideOpen(false);
    setMessage('');
    pendingPreview.current = null;
    pendingLayout.current = null;
  }
  const steps = renderer.id === 'album-girevole' || renderer.id === 'plaza-led' ? [2, 3, 4, 5, 6, 7, 9] : [2, 3, 5, 6, 9];
  const stepNames: Record<number, string> = {
    1: 'Modello',
    2: 'Collezione tessuto',
    3: 'Colore rivestimento',
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
    : !saved ? 'Non c’è ancora una proposta salvata. Attendi il cliente oppure preparala dalla scheda Modifica.'
    : dirty ? 'Ci sono modifiche non salvate: salva la revisione prima di confermarla.'
    : !saved.selection ? 'Associa un modello dalla scheda Modifica e salva prima di confermare.'
    : saved.status === 'confirmed' ? 'Questa revisione è già confermata. Puoi scaricare la conferma qui sotto.'
    : !ready || renderBusy ? 'Attendi il caricamento dell’anteprima prima di confermare.' : '';
  if (token && state.isError) return compact ? <button className="text-xs underline" onClick={() => void state.refetch()}>Riprova a caricare l’album</button> : null;
  if (token && !state.data?.enabled) return compact && !state.isLoading ? <span className="text-xs text-muted-foreground">Personalizzazione in preparazione</span> : null;
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
  return <section className={compact ? 'inline-flex shrink-0' : 'rounded-lg border bg-white p-4 space-y-3'} data-testid="photobook-mockup">
    {compact ? <Button variant="outline" className="h-10 px-3 text-xs" onClick={openConfigurator}>{!token ? (saved ? 'Mockup 3D' : 'Configura 3D') : (saved ? 'Apri il tuo album' : 'Personalizza album')}</Button> : <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="font-semibold">{title} · Anteprima album 3D</h2><p className="text-sm text-muted-foreground">Foto, rivestimento e scritte · versione {version}</p></div>
       <Button variant="outline" onClick={openConfigurator}>Apri mockup {title}</Button>
     </div>}
     {saved && !compact && !token && <p className="text-sm text-muted-foreground">{MOCKUP_STATUS_LABELS[saved.status || 'draft']} · revisione {saved.revision} · versione fotolibro {version}</p>}
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
      <div className="mockup-header flex shrink-0 items-center justify-between gap-2 border-b px-3 sm:px-4">
         <div className="mockup-header-title-box">
          <DialogTitle className="text-sm sm:text-base font-semibold truncate">
            {!token ? 'Verifica proposta album' : choosing ? 'Scegli il tuo album' : title}
          </DialogTitle>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
            <span>{title}</span>
            {wizard && !choosing && (
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
      {token && !mobile && !choosing && <div className="mockup-progress shrink-0 border-b px-3 py-2" aria-live="polite"><p className="text-sm font-medium">Passaggio {steps.indexOf(step) + 1} di {steps.length} · {stepNames[step]}</p><div className="mt-2 flex gap-1" aria-hidden="true">{steps.map(value => <span key={value} className={`h-1 flex-1 rounded ${value <= step ? 'bg-primary' : 'bg-muted'}`} />)}</div></div>}
      {choosing && state.data?.offer && <MockupModelChooser options={state.data.offer.options} initialOption={selectedOption} fixed={fixedModel} onChoose={chooseExample} onCancel={viewerStarted ? () => setChoosing(false) : undefined} />}
      <div style={choosing ? { display: 'none' } : undefined} className={token ? 'min-h-0 flex-1 flex flex-col overflow-hidden' : 'mockup-admin-body'} data-testid="mockup-dialog-body">
      {!token && <div className="mockup-admin-panel" ref={setAdminSlot}>
        <nav className="sticky top-0 z-10 bg-background flex flex-wrap gap-1 border-b pb-3" aria-label="Gestione proposta album">
          {([['review', 'Verifica'], ['edit', 'Modifica'], ['offer', 'Modelli disponibili']] as const).map(([tab, label]) => <Button key={tab} size="sm" variant={adminTab === tab ? 'default' : 'outline'} aria-pressed={adminTab === tab} onClick={() => setAdminTab(tab)}>{label}</Button>)}
         </nav>
       </div>}
      {open && !token && adminPanel(<Button variant="ghost" size="sm" disabled={busy} onClick={async () => {
        if (dirty && !window.confirm('Ricaricare la proposta e abbandonare le modifiche non salvate?')) return;
        const fresh = await state.refetch();
        if (!fresh.isError) { pendingOption.current = null; pendingPreview.current = null; setRendererOverride(null); setDirty(false); setReady(false); setRenderBusy(true); setGeneration(g => g + 1); }
      }}>Ricarica proposta</Button>)}
    {saved && !token && adminPanel(<div className="rounded-lg bg-muted/50 p-3 text-sm space-y-2"><p className="font-semibold">{MOCKUP_STATUS_LABELS[saved.status || 'draft']} · revisione {saved.revision}</p><p>{saved.option?.labName} {saved.option && '·'} {saved.option?.name} {saved.option && '·'} {saved.option?.materials.find(m => m.id === saved.configuration.materialId)?.label}</p><p>Ultima modifica: {saved.updatedBy === 'client' ? 'Cliente tramite link' : saved.updatedBy === 'studio' ? 'Studio' : 'Non registrato'} · {new Date(saved.updatedAt).toLocaleString('it-IT')}</p>{saved.note && <p>Note: {saved.note}</p>}</div>)}
    {open && <>
      {state.isLoading && <p role="status">Caricamento configurazione…</p>}
      {state.isError && <p role="alert">{(state.error as Error).message}</p>}
      {state.data && <>
        {!token && adminPanel(<div hidden={adminTab !== 'offer'}><p className="text-sm mb-3">Scegli quali modelli proporre nel link di questo cliente. Questa sezione non conferma il suo mockup.</p><MockupOfferEditor offer={state.data.offer} modelMode={state.data.modelMode} modelSelection={state.data.modelSelection} disabled={readOnly || busy || dirty} publish={async (mode, selections) => {
          setBusy(true);
          try { await request('/offer', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: state.data?.offer?.revision || 0, savedRevision: saved?.revision || 0, mode, selections }) }); await state.refetch({ throwOnError: true }); setReady(false); setGeneration(g => g + 1); setMessage('Proposta pubblicata nel link cliente.'); return true; }
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
        {!token && (renderer.id === 'album-girevole' || renderer.id === 'plaza-led') && adminPanel(<div hidden={adminTab !== 'edit'}><label className="block text-sm">Foto da personalizzare<select aria-label="Foto da personalizzare" className="block border rounded p-2 mt-1" value={photoSide} disabled={!editable || busy || picker || renderBusy} onChange={e => setPhotoSide(e.target.value === 'back' ? 'back' : 'front')}><option value="front">Copertina album</option><option value="back">Telaio fisso posteriore</option></select></label></div>)}
        {!token && adminPanel(<div hidden={adminTab !== 'edit'}><p className="text-sm mb-3">Modifica i dettagli nell’anteprima, poi salva la nuova revisione. Per approvarla torna in Verifica.</p><div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!editable || busy || !ready || renderBusy} onClick={() => upload.current?.click()}>Carica una foto</Button>
          <Button variant="outline" disabled={!editable || busy || !ready || renderBusy} onClick={() => setPicker(true)}>Scegli dalla galleria</Button>
        </div></div>)}
        {!mobile && <input ref={upload} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (!file) return;
          if (file.size > 20 * 1024 * 1024) { setMessage('Scegli una foto entro 20 MB.'); return; }
          void selectPhoto(() => request(`/upload?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file }));
        }} />}
        {!token && message && adminPanel(<p role="status" className="rounded border p-3 text-sm">{message}</p>)}
         {token && rendererError && !choosing && <section className="mockup-renderer-error" data-testid="mockup-renderer-error" role="alert">
           <span className="mockup-card-kicker">ANTEPRIMA TEMPORANEAMENTE OFFLINE</span>
           <h2>Anteprima non disponibile</h2>
           <p>{rendererError} Le tue scelte salvate sono al sicuro.</p>
           <Button variant="outline" onClick={retryRenderer}>Riprova a caricare l’anteprima</Button>
         </section>}
         {token && !rendererError && (!ready || !wizard) && !choosing && <p role="status" className="p-4 text-sm">Preparazione del tuo configuratore…</p>}
         {(!mobile || viewerStarted) && <iframe key={`${renderer.id}-${generation}`} ref={frame} title={`Configuratore 3D ${renderer.name}`} src={`${import.meta.env.BASE_URL}mockups/${renderer.path}`} sandbox="allow-scripts allow-same-origin allow-downloads" style={{ visibility: token && (!ready || !wizard || !!rendererError) ? 'hidden' : undefined }} aria-hidden={token && (!ready || !wizard || !!rendererError) ? true : undefined} className={`${token ? 'w-full min-h-0 flex-1 border-0' : 'mockup-admin-viewer'} ${busy ? 'pointer-events-none' : ''}`} />}
        {token && wizard && createPortal(<>
          {editable && ready && !renderBusy && configurationIssue && ((mobile && [5, 6, 7].includes(step)) || (!mobile && step >= 5)) && <p role="status" className="wizard-validation">{configurationIssue}</p>}
          <div className="wizard-step-heading" aria-live="polite"><span>Passo {steps.indexOf(step) + 1} di {steps.length}</span><strong>{stepNames[step] || 'Configurazione'}</strong></div>
         {step === 1 && <><h3>Scegli il tuo modello</h3><p>Trovi qui i modelli proposti dallo studio.</p>{state.data?.offer?.options.map(option => <button type="button" className="wizard-model" key={`${option.labId}/${option.id}`} aria-pressed={selectedOption?.id === option.id && selectedOption?.labId === option.labId} disabled={!editable || busy || !ready || renderBusy} onClick={() => chooseOption(option)}>{option.name}<small>{option.labName} · {MOCKUP_RENDERERS.find(r => r.id === option.rendererId)?.name}</small></button>)}{!state.data?.offer && <p>{title}</p>}</>}
          {step === 2 && <><h3>Collezione tessuto</h3><p>Tocca la collezione di tessuti che preferisci per il tuo album. I colori disponibili appariranno nella schermata successiva.</p></>}
          {step === 3 && <><h3>Colore del rivestimento</h3><p>Tocca un colore per applicarlo istantaneamente all’anteprima 3D sopra la scheda.</p></>}
          {step === 4 && <><h3>Struttura dello scrigno</h3><p>Scegli la finitura della cornice che racchiude l'album.</p></>}
          {step === 5 && <><h3>Disposizione della copertina</h3><p>Scegli lo stile e la disposizione della copertina: placchetta con incisione, foto grande a tutta copertina oppure foto formato placchetta.</p></>}
          {step === 6 && <>
            {draftCoverLayout === 'plaque' ? (
              <><h3>Incisione con i vostri nomi</h3><p>Inserite i nomi da incidere sulla placchetta in legno per generare il monogramma botanico.</p></>
            ) : (
              <>
                <h3>Foto di copertina</h3>
                <p>Personalizza la fotografia per la copertina del tuo album.</p>
                <div className="wizard-photo-actions">
                  <button type="button" disabled={!editable || busy || !ready || renderBusy} onClick={() => { setPhotoSide('front'); setPicker(true); }}>
                    Scegli dalla galleria
                  </button>
                  {!mobile && <button type="button" disabled={!editable || busy || !ready || renderBusy} onClick={() => upload.current?.click()}>Carica una foto</button>}
                </div>
                {!photoStepValid && editable && <p role="status" className="wizard-validation">Scegli una foto per continuare.</p>}
              </>
            )}
          </>}
          {step === 7 && <>
            <h3>Plexiglass posteriore dello scrigno</h3>
            <p>Scegli l'effetto del retro dello scrigno: lastra trasparente senza stampa, oppure stampa fotografica su plexiglass.</p>
            {draftBackCover === 'photo' && (
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
          {step === lastStep && <>
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
          <div className="wizard-nav">
            <button type="button" aria-label={steps.indexOf(step) === 0 ? 'Torna alla scelta modello' : 'Indietro'} disabled={busy || (steps.indexOf(step) === 0 && (!editable || (state.data?.offer?.options.length || 0) <= 1))} onClick={previousStep}>
              <ArrowLeft size={17} /><span>Indietro</span>
            </button>
            {step < lastStep ? (
              <button type="button" className="wizard-primary" disabled={!nextAllowed} onClick={() => setStep(steps[steps.indexOf(step) + 1])}>
                Avanti <ArrowRight size={16} />
              </button>
            ) : editable ? (
              <button type="button" className="wizard-primary" disabled={!editable || busy || renderBusy || !configuration || !selectedOption || (!dirty && ['submitted', 'confirmed'].includes(saved?.status || ''))} onClick={submitWizard}>
                Invia allo studio per verifica
              </button>
             ) : <span className="wizard-unsaved">Sola lettura</span>}
          </div>
          {editable && configuration && (
            <button
              type="button"
              className="w-full mt-1.5 py-2 px-3 rounded-lg border border-[#335e56] text-[#335e56] bg-white font-medium text-xs flex items-center justify-center gap-1.5 hover:bg-[#eaf1ef] transition-colors disabled:opacity-40 shadow-sm"
              disabled={busy || renderBusy}
              onClick={save}
            >
              <Save size={14} />
              Salva bozza (per recuperarla in seguito)
            </button>
          )}
          </>}
        </div>, wizard.actionsSlot)}
        {mobile && wizard && createPortal(<>
          <div className="wizard-iconbar" aria-label="Comandi vista album">
            <button aria-label="Fronte" onClick={() => viewAction('front')}><b aria-hidden="true">F</b></button>
            <button aria-label="Retro" onClick={() => viewAction('back')}><b aria-hidden="true">R</b></button>
            <button aria-label="Estrai o reinserisci album" onClick={() => viewAction('extract')}><LogOut size={17} /><span>Estrai</span></button>
            {(renderer.id === 'album-girevole' || renderer.id === 'plaza-led') && <button aria-label="Avvia o ferma rotazione scrigno" onClick={() => viewAction('rotate')}><Rotate3D size={17} /></button>}
            <button aria-label="Ingrandisci album" onClick={() => viewAction('plus')}><ZoomIn size={17} /><span>Zoom +</span></button>
            <button aria-label="Riduci album" onClick={() => viewAction('minus')}><ZoomOut size={17} /><span>Zoom −</span></button>
            <button aria-label="Reimposta vista" onClick={() => viewAction('reset')}><RotateCcw size={17} /><span>Reimposta</span></button>
          </div>
          <button className="wizard-help" aria-label="Guida ai gesti" onClick={() => setGuideOpen(!guideOpen)}><HelpCircle size={18} /></button>
          {viewMessage && <span className="wizard-view-message" role="status">{viewMessage}</span>}
          {guideOpen && <div className="wizard-gesture-guide" role="region" aria-label="Guida ai gesti"><strong>Guarda l’album da vicino</strong><p>Trascina con un dito per girare la vista.<br />Allarga due dita per vedere la trama.<br />Le icone mostrano fronte, retro ed estrazione.</p><button onClick={() => { setGuideOpen(false); try { sessionStorage.setItem('mockup-touch-guide', 'seen'); } catch { /* Non impedire la personalizzazione se lo storage è disabilitato. */ } }}>Ho capito</button></div>}
        </>, wizard.controlsSlot)}
        {!token && adminPanel(<div hidden={adminTab !== 'review'} className="space-y-3">
          <h3 className="font-semibold">Controlla la proposta e scegli come proseguire</h3>
          {confirmBlock && <p className="text-sm" role="status">{confirmBlock}</p>}
          <div className="flex flex-wrap gap-2">
            <Button className="w-full" disabled={busy || !!confirmBlock} onClick={confirm}>Conferma mockup</Button>
            <Button className="w-full" variant="outline" disabled={!editable || busy || dirty || !saved} onClick={() => setAskingChanges(!askingChanges)}>Richiedi modifiche al cliente</Button>
          </div>
          {askingChanges && <div className="rounded border p-3 space-y-3"><label className="block text-sm">Cosa deve correggere il cliente?<textarea className="block border rounded p-2 w-full mt-2" rows={3} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label><p className="text-xs text-muted-foreground">Il messaggio sarà visibile nel suo link. Non viene inviata un’email automatica.</p><Button disabled={!editable || busy || dirty || !saved || !note.trim()} onClick={() => action('/request-changes')}>Invia richiesta di modifiche</Button></div>}
          <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium py-2">Revisioni, documenti e invio al laboratorio</summary><div className="flex flex-wrap gap-2 py-2">
            {saved?.status === 'confirmed' && <><Button variant="outline" onClick={() => downloadReport(saved.revision)}>Scarica conferma</Button><Button disabled={readOnly || busy || dirty} onClick={() => action('/attach')}>Allega all’invio fotolibro su Drive</Button></>}
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
      {gallery.isError && <p role="alert">Impossibile caricare la galleria. Riprova.</p>}
      <PhotobookPhotoPicker open={picker && !!gallery.data} onOpenChange={setPicker} photos={gallery.data?.photos || []} chapters={gallery.data?.chapters || []} title={photoSide === 'back' ? 'Scegli la foto del retro' : 'Scegli la foto di copertina'} onSelect={photo => {
        setPicker(false);
        void selectPhoto(() => request('/gallery-photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId: photo.id }) }));
      }} />
    </>}
      </div>
      {!mobile && !token && (adminTab === 'edit' || dirty) && <div className="mockup-actions shrink-0 border-t bg-background p-3 sm:px-4 space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {dirty && <p className="text-sm text-amber-800" role="status">Modifiche da salvare</p>}
         <div className="flex flex-wrap gap-2">
          <Button className="min-h-11 flex-1 sm:flex-none" disabled={!editable || busy || renderBusy || !configuration || !dirty || (!!state.data?.offer && !selectedOption)} onClick={save}>Salva mockup</Button>
           <p className="text-sm text-muted-foreground self-center">{dirty ? 'Salva le modifiche, poi torna in Verifica per confermarle.' : 'Nessuna modifica da salvare. Per approvare usa Conferma mockup nella scheda Verifica.'}</p>
         </div>
      </div>}
    </DialogContent>
    </Dialog>
  </section>;
}
