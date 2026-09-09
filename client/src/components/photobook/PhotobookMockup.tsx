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
import { mockupConfigurationSchema, type MockupConfiguration, type MockupPayload, type MockupPhoto, type SavedMockup } from '@shared/mockup-types';
import { MOCKUP_STATUS_LABELS, optionFor, type MockupSelection } from '@shared/mockup-workflow';
import MockupOfferEditor from './MockupOfferEditor';
import { MOCKUP_RENDERERS } from '@shared/mockup-catalog';
import type { MockupOption } from '@shared/mockup-workflow';
import MockupModelChooser from './MockupModelChooser';
import { ArrowLeft, ArrowRight, HelpCircle, Home, LogOut, Maximize, Minimize, Rotate3D, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';

interface Props { photobookId: string; version: number; token?: string; readOnly?: boolean; summary?: boolean; compact?: boolean; onOpenChange?: (open: boolean) => void }

export default function PhotobookMockup({ photobookId, version, token, readOnly = false, summary = false, compact = false, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [adminTab, setAdminTab] = useState<'review' | 'edit' | 'offer'>('review');
  const [adminSlot, setAdminSlot] = useState<HTMLDivElement | null>(null);
  const [askingChanges, setAskingChanges] = useState(false);
  const adminPanel = (content: ReactNode) => adminSlot ? createPortal(content, adminSlot) : null;
  useEffect(() => { onOpenChange?.(open); return () => onOpenChange?.(false); }, [open, onOpenChange]);
  const { isPhone, isPortrait } = usePhoneOrientation();
  const mobile = !!token && isPhone;
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
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [configuration, setConfiguration] = useState<MockupConfiguration | null>(null);
  const [draftCoverLayout, setDraftCoverLayout] = useState('');
  const [draftBackCover, setDraftBackCover] = useState('');
  const [frontPhotoPresent, setFrontPhotoPresent] = useState(false);
  const [backPhotoPresent, setBackPhotoPresent] = useState(false);
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
  const currentPhoto = useRef<{ id: string; name: string; source: string; blob: Blob }>();
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
  const title = selectedOption?.name || saved?.option?.name || 'Custodia';
  const apply = (payload: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ channel: 'memorie-mockup-v1', type: 'apply', ...payload }, window.location.origin);
  const recordSaved = (value: SavedMockup) => {
    revision.current = value.revision;
    queryClient.setQueryData<MockupPayload>(stateKey, previous => previous ? { ...previous, saved: value } : previous);
  };
  function closeConfigurator() {
    if (busy) return;
    if (dirty && !window.confirm('Chiudere il configuratore e abbandonare le modifiche non salvate?')) return;
    setOpen(false); setPicker(false); setReady(false); setRenderBusy(true);
    setDirty(false); setConfiguration(null); setRendererOverride(null); setSelection(undefined);
    setDraftCoverLayout(''); setDraftBackCover(''); setFrontPhotoPresent(false); setBackPhotoPresent(false);
    pendingOption.current = null; currentPhoto.current = undefined; initializing.current = true;
    setHistory(null); setNote(''); setMessage(''); setPhotoSide('front'); setAskingChanges(false); setViewerExpanded(false);
    setStep(1); setWizard(null); setChoosing(false); setViewerStarted(false); setHomeOpen(false); setGuideOpen(false); pendingLayout.current = null;
  }

  function openConfigurator() {
    setAdminTab('review');
    setChoosing(mobile && editable && !saved && !!state.data?.offer?.options.length);
    setViewerStarted(!mobile || !!saved || !state.data?.offer?.options.length);
    setStep(mobile ? 2 : 1); setOpen(true);
    let guideSeen = false;
    try { guideSeen = sessionStorage.getItem('mockup-touch-guide') === 'seen'; } catch { /* Guida disponibile anche senza storage locale. */ }
    setGuideOpen(mobile && !guideSeen);
    void state.refetch();
  }

  function chooseExample(option: MockupOption, layout: string) {
    if (!editable) return;
    if (viewerStarted && (!ready || renderBusy || busy)) return;
    if (viewerStarted && option.rendererId !== renderer.id && dirty && !window.confirm('Cambiando tipo di album, alcune personalizzazioni non sono compatibili. Vuoi proseguire? La revisione già salvata resta conservata.')) return;
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
    setSelection({ labId: option.labId, modelId: option.id }); setDirty(true); setPhotoSide('front');
    if (option.rendererId !== renderer.id) {
      pendingOption.current = option; setRendererOverride(option.rendererId); setWizard(null);
      setConfiguration(null); setReady(false); setRenderBusy(true); setGeneration(g => g + 1);
      setDraftCoverLayout(''); setDraftBackCover('');
    } else apply({ option, readOnly: !editable });
  }

  useEffect(() => {
    if (!token || !ready || !frame.current?.contentDocument) return;
    try { const layout = installMockupWizard(frame.current.contentDocument, mobile); layout.step(step); setWizard(layout); return () => layout.dispose(); }
    catch (error) { setMessage((error as Error).message); }
  }, [ready, token]);

  useEffect(() => { wizard?.step(step); }, [wizard, step]);
  // Solo presentazione amministrativa: renderer e relativi handler restano gli stessi.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (token || !ready || !doc) return;
    doc.body.dataset.adminMode = adminTab;
    const style = doc.createElement('style');
    style.textContent = `
      body[data-admin-mode]{height:100dvh;overflow:hidden}
      body[data-admin-mode] header{display:none!important}
      body[data-admin-mode=edit] header{display:flex!important;height:42px;padding:4px 12px;justify-content:flex-end}
      body[data-admin-mode=edit] header strong,body[data-admin-mode=edit] header span{display:none}
      body[data-admin-mode] main{height:100dvh!important;min-height:0!important;display:grid!important;grid-template-columns:minmax(0,1fr)!important}
      body[data-admin-mode] aside{display:none!important}
      body[data-admin-mode=edit] main{height:calc(100dvh - 42px)!important;grid-template-columns:minmax(215px,32%) minmax(0,1fr)!important}
      body[data-admin-mode=edit] aside{display:flex!important;min-height:0;overflow:hidden;padding:12px}
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
  useEffect(() => {
    if (!open || !token || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const resize = () => {
      const element = dialog.current; if (!element) return;
      if (!isPhone && window.innerWidth >= 768) { element.style.removeProperty('height'); element.style.removeProperty('top'); return; }
      element.style.setProperty('height', `${viewport.height}px`, 'important');
      element.style.top = `${viewport.offsetTop + viewport.height / 2}px`;
    };
    const initialResize = requestAnimationFrame(resize);
    resize(); viewport.addEventListener('resize', resize); viewport.addEventListener('scroll', resize);
    return () => { cancelAnimationFrame(initialResize); viewport.removeEventListener('resize', resize); viewport.removeEventListener('scroll', resize); };
  }, [open, token, isPhone]);
  useEffect(() => { wizard?.refresh(); }, [wizard, configuration, busy, renderBusy, editable]);
  useEffect(() => {
    if (!mobile && token && ready && !renderBusy && !busy && editable && !selection && !initializing.current && state.data?.offer?.options.length === 1) chooseOption(state.data.offer.options[0]);
  }, [token, ready, renderBusy, busy, editable, selection, state.data?.offer]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.channel !== 'memorie-mockup-v1') return;
      if (event.data.type === 'ready') setReady(true);
      if (event.data.type === 'busy') setRenderBusy(event.data.busy === true);
      const waiter = exportWaiter.current;
      if (event.data.type === 'exported' && waiter && event.data.requestId === waiter.id) { waiter.resolve({ previews: event.data.previews, configuration: event.data.configuration }); exportWaiter.current = null; }
      if (event.data.type === 'export-error' && waiter && event.data.requestId === waiter.id) { waiter.reject(new Error('Impossibile generare le viste')); exportWaiter.current = null; }
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
    pendingOption.current = null;
    if (!nextOption) setSelection(saved?.selection);
    revision.current = saved?.revision || 0;
    const restore = async () => {
      try {
        let photo = nextOption ? currentPhoto.current : undefined;
        if (!nextOption && saved?.configuration.photoAssetId) {
          const blob = await (await request(`/photos/${saved.configuration.photoAssetId}`)).blob();
          photo = { id: saved.configuration.photoAssetId, name: 'Foto salvata', source: 'saved', blob };
        }
        let backPhoto;
        if (!nextOption && saved && 'backPhotoAssetId' in saved.configuration && saved.configuration.backPhotoAssetId) {
          const id = saved.configuration.backPhotoAssetId;
          backPhoto = { id, name: 'Foto retro salvata', source: 'saved', blob: await (await request(`/photos/${id}`)).blob() };
        }
        if (!cancelled) {
          currentPhoto.current = photo;
          apply({ configuration: nextOption ? undefined : saved?.configuration, photo, backPhoto, option: nextOption || saved?.option, readOnly: !editable });
        }
      } catch (error) { if (!cancelled) setMessage((error as Error).message); }
    };
    void restore();
    return () => { cancelled = true; };
  }, [ready]);

  useEffect(() => {
    if (ready) frame.current?.contentWindow?.postMessage({ channel: 'memorie-mockup-v1', type: 'lock', readOnly: busy || !editable }, window.location.origin);
  }, [ready, busy, editable]);

  useEffect(() => {
    if (!ready || !readOnly) return;
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
  }, [readOnly]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function selectPhoto(operation: () => Promise<Response>) {
    const target = mobile ? (step === 5 ? 'back' : 'front') : renderer.id === 'album-girevole' ? photoSide : 'front';
    setBusy(true); setMessage('Preparazione foto…');
    try {
      const photo: MockupPhoto = await (await operation()).json();
      const blob = await (await request(`/photos/${photo.id}`)).blob();
      if (target === 'front') currentPhoto.current = { ...photo, blob };
      apply({ [target === 'back' ? 'backPhoto' : 'photo']: { ...photo, blob }, readOnly: !editable });
      setMessage('Foto pronta. Salva per conservarla nel fotolibro.');
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!configuration || !editable) return;
    setBusy(true); setMessage('Salvataggio…');
    try {
      const saved: SavedMockup = await (await request('', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: revision.current, configuration, ...(state.data?.offer ? { selection, offerRevision: state.data.offer.revision } : {}) }) })).json();
      recordSaved(saved); setDirty(false); await state.refetch({ throwOnError: true }); setMessage('Mockup salvato. Il salvataggio non equivale alla conferma dello studio.');
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
        exportWaiter.current = { id, resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } };
        frame.current?.contentWindow?.postMessage({ channel: 'memorie-mockup-v1', type: 'export', requestId: id }, window.location.origin);
      });
      const result = exported as { previews: unknown; configuration: unknown };
      const renderedConfiguration = mockupConfigurationSchema.parse(result.configuration);
      if (JSON.stringify(renderedConfiguration) !== JSON.stringify(saved.configuration)) throw new Error('Le viste non corrispondono al mockup salvato. Salva le modifiche prima di confermare.');
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
  async function submitWizard() {
    if (busy || renderBusy || !editable || !configuration || !selectedOption) return;
    const persisted = dirty ? await save() : saved;
    if (persisted) await action('/submit', undefined, persisted);
  }
  async function reloadWizard() {
    if (busy || (dirty && !window.confirm('Ricaricare la proposta e abbandonare le modifiche non salvate?'))) return;
    const fresh = await state.refetch();
    if (!fresh.isError) {
      pendingOption.current = null; setRendererOverride(null); setDirty(false); setReady(false);
      setRenderBusy(true); setWizard(null); setStep(mobile ? 2 : 1); setGeneration(g => g + 1); setMessage('');
      setHomeOpen(false); pendingLayout.current = null;
    }
  }
  const steps = mobile ? [2, ...(renderer.id === 'album-girevole' ? [3] : []), 4, ...(renderer.id === 'album-girevole' ? [5] : []), 6] : [1, 2, 3, 4];
  const stepNames = mobile ? ['Modello', 'Tessuto', 'Struttura', 'Copertina', 'Plexiglass del box', 'Riepilogo e invio'] : ['Modello', 'Rivestimento e copertina', 'Foto e scritte', 'Riepilogo e invio'];
  const lastStep = mobile ? 6 : 4;
  const photoStepValid = mobile ? (step === 4 ? draftCoverLayout === 'plaque' || frontPhotoPresent : step === 5 ? draftBackCover !== 'photo' || backPhotoPresent : true) : step !== 3 || !!configuration;
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
    else if (mobile && editable && state.data?.offer?.options.length) setChoosing(true);
  };
  const viewAction = (action: 'front' | 'back' | 'reset' | 'plus' | 'minus' | 'extract' | 'rotate') => {
    wizard?.view(action);
    const nativeRotation = frame.current?.contentDocument?.getElementById('rotate');
    setViewMessage({ front: 'Vista frontale', back: 'Vista posteriore', reset: 'Vista ripristinata', plus: 'Zoom avanti', minus: 'Zoom indietro', extract: 'Estrazione album', rotate: nativeRotation?.hasAttribute('disabled') ? 'Reinserisci l’album per ruotare lo scrigno' : nativeRotation?.getAttribute('aria-pressed') === 'true' ? 'Scrigno in rotazione' : 'Rotazione ferma' }[action]);
  };
  return <section className={compact ? 'inline-flex shrink-0' : 'rounded-lg border bg-white p-4 space-y-3'} data-testid="photobook-mockup">
    {compact ? <Button variant="outline" className="h-10 px-3 text-xs" onClick={openConfigurator}>{saved ? 'Apri il tuo album' : 'Personalizza album'}</Button> : <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="font-semibold">{title} · Anteprima album 3D</h2><p className="text-sm text-muted-foreground">Foto, rivestimento e scritte · versione {version}</p></div>
      <Button variant="outline" onClick={openConfigurator}>Apri mockup {title}</Button>
    </div>}
    {saved && !compact && <p className="text-sm text-muted-foreground">{MOCKUP_STATUS_LABELS[saved.status || 'draft']} · revisione {saved.revision} · versione fotolibro {version}</p>}
    <Dialog open={open} onOpenChange={next => { if (!next) closeConfigurator(); }}>
    <DialogContent ref={dialog} data-mobile-mockup={mobile ? 'true' : undefined} className="flex flex-col gap-0 p-0 sm:p-0 w-screen sm:w-[96vw] max-w-none sm:max-w-[1500px] h-[100dvh] sm:h-[94dvh] max-h-[100dvh] rounded-none sm:rounded-lg overflow-hidden [&>button]:hidden" onInteractOutside={event => event.preventDefault()}>
      {mobile && isPortrait && !picker && !choosing && <div className="mockup-rotate" role="alert" data-testid="mockup-rotate"><p>Ruota il telefono in orizzontale</p><p>Avrai più spazio per vedere l’album e personalizzarlo. Le tue scelte restano conservate.</p><Button disabled={busy} onClick={closeConfigurator}>Chiudi mockup</Button></div>}
      <div className="mockup-header flex shrink-0 items-center justify-between gap-3 border-b p-3 sm:p-4">
        <div className="min-w-0"><DialogTitle>{!token ? 'Verifica proposta album' : mobile ? choosing ? 'Scegli il tuo album' : title : 'Personalizza il tuo album'}</DialogTitle><DialogDescription className={mobile ? 'sr-only' : undefined}>{title} · versione fotolibro {version}{!token && saved ? ` · revisione mockup ${saved.revision}` : ''}</DialogDescription></div>
        {mobile && !choosing && <div className="mockup-header-links"><Button variant="ghost" disabled={!editable || busy || renderBusy || !ready || !state.data?.offer?.options.length} onClick={() => { setViewerExpanded(false); setChoosing(true); }}>Cambia</Button><Button variant="outline" aria-pressed={homeOpen} disabled={!ready || busy || renderBusy} onClick={() => { setViewerExpanded(false); setHomeOpen(!homeOpen); setGuideOpen(false); }}><Home size={15} />{homeOpen ? 'Solo album' : 'In casa'}</Button><Button variant="outline" aria-label={viewerExpanded ? 'Torna alle opzioni' : 'Espandi anteprima'} aria-pressed={viewerExpanded} disabled={!ready} onClick={() => { setViewerExpanded(!viewerExpanded); setGuideOpen(false); }}>{viewerExpanded ? <><Minimize size={15} /> Opzioni</> : <Maximize size={15} />}</Button></div>}
        <Button variant="outline" className={mobile ? 'mockup-close' : 'min-h-11'} aria-label={mobile ? 'Chiudi mockup' : undefined} disabled={busy} onClick={closeConfigurator}>{mobile ? <X size={18} /> : 'Chiudi'}</Button>
      </div>
      {token && !mobile && <div className="mockup-progress shrink-0 border-b px-3 py-2" aria-live="polite"><p className="text-sm font-medium">Passaggio {steps.indexOf(step) + 1} di {steps.length} · {stepNames[step - 1]}</p><div className="mt-2 flex gap-1" aria-hidden="true">{steps.map(value => <span key={value} className={`h-1 flex-1 rounded ${value <= step ? 'bg-primary' : 'bg-muted'}`} />)}</div></div>}
      {mobile && choosing && state.data?.offer && <MockupModelChooser options={state.data.offer.options} initialOption={selectedOption} onChoose={chooseExample} onCancel={viewerStarted ? () => setChoosing(false) : undefined} />}
      <div style={mobile && choosing ? { display: 'none' } : undefined} className={token ? 'min-h-0 flex-1 flex flex-col overflow-hidden' : 'mockup-admin-body'} data-testid="mockup-dialog-body">
      {!token && <div className="mockup-admin-panel" ref={setAdminSlot}>
        <nav className="sticky top-0 z-10 bg-background flex flex-wrap gap-1 border-b pb-3" aria-label="Gestione proposta album">
          {([['review', 'Verifica'], ['edit', 'Modifica'], ['offer', 'Modelli disponibili']] as const).map(([tab, label]) => <Button key={tab} size="sm" variant={adminTab === tab ? 'default' : 'outline'} aria-pressed={adminTab === tab} onClick={() => setAdminTab(tab)}>{label}</Button>)}
        </nav>
      </div>}
      {open && !token && adminPanel(<Button variant="ghost" size="sm" disabled={busy} onClick={async () => {
        if (dirty && !window.confirm('Ricaricare la proposta e abbandonare le modifiche non salvate?')) return;
        const fresh = await state.refetch();
        if (!fresh.isError) { pendingOption.current = null; setRendererOverride(null); setDirty(false); setReady(false); setRenderBusy(true); setGeneration(g => g + 1); }
      }}>Ricarica proposta</Button>)}
    {saved && !token && adminPanel(<div className="rounded-lg bg-muted/50 p-3 text-sm space-y-2"><p className="font-semibold">{MOCKUP_STATUS_LABELS[saved.status || 'draft']} · revisione {saved.revision}</p><p>{saved.option?.labName} {saved.option && '·'} {saved.option?.name} {saved.option && '·'} {saved.option?.materials.find(m => m.id === saved.configuration.materialId)?.label}</p><p>Ultima modifica: {saved.updatedBy === 'client' ? 'Cliente tramite link' : saved.updatedBy === 'studio' ? 'Studio' : 'Non registrato'} · {new Date(saved.updatedAt).toLocaleString('it-IT')}</p>{saved.note && <p>Note: {saved.note}</p>}</div>)}
    {open && <>
      {state.isLoading && <p role="status">Caricamento configurazione…</p>}
      {state.isError && <p role="alert">{(state.error as Error).message}</p>}
      {state.data && <>
        {!token && adminPanel(<div hidden={adminTab !== 'offer'}><p className="text-sm mb-3">Scegli quali modelli proporre nel link di questo cliente. Questa sezione non conferma il suo mockup.</p><MockupOfferEditor offer={state.data.offer} disabled={readOnly || busy || dirty} publish={async selections => {
          setBusy(true);
          try { await request('/offer', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: state.data?.offer?.revision || 0, savedRevision: saved?.revision || 0, selections }) }); await state.refetch({ throwOnError: true }); setReady(false); setGeneration(g => g + 1); setMessage('Proposta pubblicata nel link cliente.'); return true; }
          catch (error) { setMessage((error as Error).message); return false; }
          finally { setBusy(false); }
        }} /></div>)}
        {!token && !!state.data.offer && adminPanel(<div hidden={adminTab !== 'edit'}><label className="block text-sm">Laboratorio e modello scelto<select aria-label="Laboratorio e modello scelto" className="block border rounded p-2 w-full mt-1" disabled={!editable || busy || !ready || renderBusy} value={selection ? `${selection.labId}/${selection.modelId}` : ''} onChange={event => {
          const [labId, modelId] = event.target.value.split('/');
          const next = { labId, modelId }; const option = optionFor(state.data?.offer || null, next);
          if (option) chooseOption(option);
        }}><option value="">Scegli un modello</option>{state.data.offer.options.map(o => <option key={`${o.labId}/${o.id}`} value={`${o.labId}/${o.id}`}>{o.labName} · {o.name}</option>)}</select></label></div>)}
        {!token && adminPanel(<p className="text-xs text-muted-foreground">Qui verifichi copertina e box, non le pagine interne. La conferma non avvia la stampa.</p>)}
        {!editable && !mobile && (token ? <p role="status">Questa versione è in sola lettura: puoi esplorare l’album e scaricare le viste.</p> : adminPanel(<p role="status" className="text-sm">Versione in sola lettura: puoi esplorare l’album e consultare le conferme.</p>))}
        {!token && renderer.id === 'album-girevole' && adminPanel(<div hidden={adminTab !== 'edit'}><label className="block text-sm">Foto da personalizzare<select aria-label="Foto da personalizzare" className="block border rounded p-2 mt-1" value={photoSide} disabled={!editable || busy || picker || renderBusy} onChange={e => setPhotoSide(e.target.value === 'back' ? 'back' : 'front')}><option value="front">Copertina</option><option value="back">Plexiglass dello scrigno</option></select></label></div>)}
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
        {token && (!ready || !wizard) && !choosing && <p role="status" className="p-4 text-sm">Preparazione del tuo configuratore…</p>}
        {(!mobile || viewerStarted) && <iframe key={`${renderer.id}-${generation}`} ref={frame} title={`Configuratore 3D ${renderer.name}`} src={`${import.meta.env.BASE_URL}mockups/${renderer.path}`} sandbox="allow-scripts allow-same-origin allow-downloads" style={{ visibility: token && (!ready || !wizard) ? 'hidden' : undefined }} aria-hidden={token && (!ready || !wizard) ? true : undefined} className={`${token ? 'w-full min-h-0 flex-1 border-0' : 'mockup-admin-viewer'} ${busy ? 'pointer-events-none' : ''}`} />}
        {token && wizard && createPortal(<>
          {editable && ready && !renderBusy && configurationIssue && ((mobile && [4, 5, 6].includes(step)) || (!mobile && step >= 3)) && <p role="status" className="wizard-validation">{configurationIssue}</p>}
          {mobile && <div className="wizard-step-heading" aria-live="polite"><span>{steps.indexOf(step) + 1} / {steps.length}</span><strong>{stepNames[step - 1]}</strong></div>}
          {step === 1 && <><h3>Scegli il tuo modello</h3><p>Trovi qui i modelli proposti dallo studio.</p>{state.data.offer?.options.map(option => <button type="button" className="wizard-model" key={`${option.labId}/${option.id}`} aria-pressed={selectedOption?.id === option.id && selectedOption?.labId === option.labId} disabled={!editable || busy || !ready || renderBusy} onClick={() => chooseOption(option)}>{option.name}<small>{option.labName} · {MOCKUP_RENDERERS.find(r => r.id === option.rendererId)?.name}</small></button>)}{!state.data.offer && <p>{title}</p>}</>}
          {step === 2 && <>{!mobile && <h3>Rivestimento e copertina</h3>}<p>{mobile ? 'Apri una famiglia e tocca un campione.' : 'Tocca un campione per vederlo sull’album.'}</p></>}
          {mobile && step === 3 && <p>{renderer.id === 'album-girevole' ? 'Scegli la finitura dello scrigno.' : 'La custodia usa il tessuto scelto per l’album.'}</p>}
          {mobile && (step === 4 || step === 5) && <>{step === 5 && <p>La foto rimane sul plexiglass dello scrigno girevole, anche quando estrai l’album.</p>}{(step === 5 ? draftBackCover === 'photo' : draftCoverLayout !== 'plaque') ? <><div className="wizard-photo-actions"><button disabled={!editable || busy || !ready || renderBusy} onClick={() => { setPhotoSide(step === 5 ? 'back' : 'front'); setPicker(true); }}>Scegli dalla galleria</button></div>{!photoStepValid && editable && <p role="status">Scegli una foto per continuare.</p>}</> : step === 4 && <p>Le iniziali vengono create automaticamente dai nomi.</p>}</>}
          {!mobile && step === 3 && <><h3>Foto e scritte</h3><p>Personalizza la copertina, non le pagine interne del fotolibro.</p>{renderer.id === 'album-girevole' && <label>Foto da personalizzare<select aria-label="Foto da personalizzare" value={photoSide} disabled={!editable || busy || picker || renderBusy} onChange={e => setPhotoSide(e.target.value === 'back' ? 'back' : 'front')}><option value="front">Copertina</option><option value="back">Retro in plexiglass</option></select></label>}{(photoSide === 'front' ? draftCoverLayout !== 'plaque' : draftBackCover === 'photo') ? <div className="wizard-photo-actions"><button disabled={!editable || busy || !ready || renderBusy} onClick={() => upload.current?.click()}>Carica una foto</button><button disabled={!editable || busy || !ready || renderBusy} onClick={() => setPicker(true)}>Scegli dalla galleria</button></div> : <p>{photoSide === 'front' ? 'Per l’incisione non serve una foto: inserisci i nomi qui sotto.' : 'Per aggiungere una foto, scegli il retro su plexiglass nella sezione Finitura retro qui sotto.'}</p>}{!configuration && editable && <p role="status">Per proseguire, aggiungi le foto richieste dalla copertina e dall’eventuale retro in plexiglass.</p>}</>}
          {step === lastStep && <>{!mobile && <><h3>Controlla e invia allo studio</h3><p>{title} · versione fotolibro {version}</p></>}{saved && <p>{MOCKUP_STATUS_LABELS[saved.status || 'draft']} · revisione {saved.revision}{saved.note && ` · ${saved.note}`}</p>}<p>{mobile ? 'Controlla le scelte qui sotto. L’invio non avvia la stampa.' : 'L’invio chiede la verifica allo studio: non manda l’album in stampa. Puoi creare altre revisioni finché lo studio non avvia la stampa.'}</p>{!mobile && <p>Materiali e proporzioni dell’anteprima sono indicativi.</p>}<details><summary>Recupera la proposta dello studio</summary><button disabled={busy} onClick={reloadWizard}>Ricarica proposta</button></details></>}
        </>, wizard.slot)}
        {mobile && wizard && createPortal(<div className="wizard-mobile-actions">
          {message && <p role="status" className="wizard-message">{message}</p>}
          {!message && dirty && <span className="wizard-unsaved">Modifiche da salvare</span>}
          {!editable && <span className="wizard-unsaved">Sola lettura</span>}
          {homeOpen ? <button onClick={() => setHomeOpen(false)}><ArrowLeft size={15} /> Torna a personalizzare</button> : <>
          <div className="wizard-nav"><button aria-label={steps.indexOf(step) === 0 ? 'Torna alla scelta modello' : 'Indietro'} disabled={busy || (steps.indexOf(step) === 0 && (!editable || !state.data?.offer?.options.length))} onClick={previousStep}><ArrowLeft size={17} /><span>Indietro</span></button>{step < lastStep ? <button className="wizard-primary" disabled={!nextAllowed} onClick={() => setStep(steps[steps.indexOf(step) + 1])}>Avanti <ArrowRight size={16} /></button> : <button className="wizard-primary" disabled={!editable || busy || renderBusy || !configuration || !selectedOption || (!dirty && ['submitted', 'confirmed'].includes(saved?.status || ''))} onClick={submitWizard}>Invia allo studio</button>}</div>
          {step === lastStep && <button className="wizard-save" disabled={!editable || busy || renderBusy || !configuration || !dirty || (!!state.data?.offer && !selectedOption)} onClick={save}>Salva bozza</button>}
          </>}
        </div>, wizard.actionsSlot)}
        {mobile && wizard && createPortal(<>
          <div className="wizard-iconbar" aria-label="Comandi vista album">
            <button aria-label="Fronte" onClick={() => viewAction('front')}><b aria-hidden="true">F</b></button>
            <button aria-label="Retro" onClick={() => viewAction('back')}><b aria-hidden="true">R</b></button>
            <button aria-label="Estrai o reinserisci album" onClick={() => viewAction('extract')}><LogOut size={17} /><span>Estrai</span></button>
            {renderer.id === 'album-girevole' && <button aria-label="Avvia o ferma rotazione scrigno" onClick={() => viewAction('rotate')}><Rotate3D size={17} /></button>}
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
          {history && <div className="max-h-60 overflow-auto text-sm">
            {!history.length && <p>Nessuna revisione precedente.</p>}
            {history.map(item => <div className="border-t py-2" key={item.revision}>
              r{item.revision} · {MOCKUP_STATUS_LABELS[item.status || 'draft']} · {item.option?.name || 'Custodia'} · {item.updatedBy === 'client' ? 'Cliente' : 'Studio'} · {new Date(item.updatedAt).toLocaleString('it-IT')}
              {item.status === 'confirmed' && <><Button size="sm" variant="link" onClick={() => downloadReport(item.revision)}>Scarica conferma</Button><Button size="sm" variant="link" disabled={busy || dirty} onClick={() => action('/reconcile-attachment', item.revision)}>Verifica allegato Drive</Button></>}
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
      {!mobile && (token || adminTab === 'edit' || dirty) && <div className="mockup-actions shrink-0 border-t bg-background p-3 sm:px-4 space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {token && message && <p role="status" className="text-sm max-h-20 overflow-auto">{message}</p>}
        {dirty && <p className="text-sm text-amber-800" role="status">Modifiche da salvare</p>}
        {token ? <><div className="flex gap-2"><Button variant="outline" className="min-h-11" disabled={step === 1 || busy || renderBusy} onClick={() => setStep(steps[steps.indexOf(step) - 1])}>Indietro</Button>{step < lastStep ? <Button className="min-h-11 flex-1" disabled={!nextAllowed} onClick={() => setStep(steps[steps.indexOf(step) + 1])}>Avanti</Button> : <Button className="min-h-11 h-auto whitespace-normal flex-1" disabled={!editable || busy || renderBusy || !configuration || !selectedOption || (!dirty && ['submitted', 'confirmed'].includes(saved?.status || ''))} onClick={submitWizard}>Invia allo studio per verifica</Button>}</div>{step === lastStep && <Button variant="ghost" className="w-full min-h-11" disabled={!editable || busy || renderBusy || !configuration || !dirty || (!!state.data?.offer && !selectedOption)} onClick={save}>Salva bozza</Button>}</> : <div className="flex flex-wrap gap-2">
          <Button className="min-h-11 flex-1 sm:flex-none" disabled={!editable || busy || renderBusy || !configuration || !dirty || (!!state.data?.offer && !selectedOption)} onClick={save}>Salva mockup</Button>
          <p className="text-sm text-muted-foreground self-center">{dirty ? 'Salva le modifiche, poi torna in Verifica per confermarle.' : 'Nessuna modifica da salvare. Per approvare usa Conferma mockup nella scheda Verifica.'}</p>
        </div>}
      </div>}
    </DialogContent>
    </Dialog>
  </section>;
}
