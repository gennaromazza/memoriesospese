import { useEffect, useRef, useState } from 'react';
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

interface Props { photobookId: string; version: number; token?: string; readOnly?: boolean; summary?: boolean; onOpenChange?: (open: boolean) => void }

export default function PhotobookMockup({ photobookId, version, token, readOnly = false, summary = false, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  useEffect(() => { onOpenChange?.(open); return () => onOpenChange?.(false); }, [open, onOpenChange]);
  const { isPhone, isPortrait } = usePhoneOrientation();
  const mobile = !!token && isPhone;
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
    pendingOption.current = null; currentPhoto.current = undefined; initializing.current = true;
    setHistory(null); setNote(''); setMessage(''); setPhotoSide('front');
    setStep(1); setWizard(null);
  }

  function chooseOption(option: MockupOption) {
    setSelection({ labId: option.labId, modelId: option.id }); setDirty(true); setPhotoSide('front');
    if (option.rendererId !== renderer.id) {
      pendingOption.current = option; setRendererOverride(option.rendererId); setWizard(null);
      setConfiguration(null); setReady(false); setRenderBusy(true); setGeneration(g => g + 1);
    } else apply({ option, readOnly: !editable });
  }

  useEffect(() => {
    if (!token || !ready || !frame.current?.contentDocument) return;
    try { const layout = installMockupWizard(frame.current.contentDocument, mobile); layout.step(step); setWizard(layout); return () => layout.dispose(); }
    catch (error) { setMessage((error as Error).message); }
  }, [ready, token]);

  useEffect(() => { wizard?.step(step); }, [wizard, step]);
  useEffect(() => {
    if (!open || !token || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const resize = () => {
      const element = dialog.current; if (!element) return;
      if (!isPhone && window.innerWidth >= 768) { element.style.removeProperty('height'); element.style.removeProperty('top'); return; }
      element.style.height = `${viewport.height}px`;
      element.style.top = `${viewport.offsetTop + viewport.height / 2}px`;
    };
    resize(); viewport.addEventListener('resize', resize); viewport.addEventListener('scroll', resize);
    return () => { viewport.removeEventListener('resize', resize); viewport.removeEventListener('scroll', resize); };
  }, [open, token, isPhone]);
  useEffect(() => { wizard?.refresh(); }, [wizard, configuration, busy, renderBusy, editable]);
  useEffect(() => {
    if (token && ready && !renderBusy && !busy && editable && !selection && !initializing.current && state.data?.offer?.options.length === 1) chooseOption(state.data.offer.options[0]);
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
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function action(path: string, targetRevision?: number, persisted?: SavedMockup) {
    const current = persisted || saved;
    if (!current || (dirty && !persisted)) return;
    setBusy(true); setMessage('Operazione in corso…');
    try {
      const response = await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: targetRevision || current.revision, note }) });
      if (path === '/submit' || path === '/request-changes') recordSaved(await response.json());
      const fresh = await state.refetch({ throwOnError: true }); revision.current = fresh.data?.saved?.revision || revision.current;
      setMessage(path === '/attach' || path === '/reconcile-attachment' ? 'Mockup registrato nella cartella Drive. Nessuna email inviata.' : path === '/submit' ? 'Proposta inviata allo studio per la verifica.' : 'Proposta restituita al cliente per le modifiche.');
    } catch (error) { setMessage((error as Error).message); }
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
      setRenderBusy(true); setWizard(null); setStep(1); setGeneration(g => g + 1); setMessage('');
    }
  }
  const steps = mobile ? [1, 2, 3, 4, ...(renderer.id === 'album-girevole' ? [5] : []), 6] : [1, 2, 3, 4];
  const stepNames = mobile ? ['Modello', 'Tessuto', 'Finiture e copertina', 'Foto o nomi in copertina', 'Retro album', 'Riepilogo e invio'] : ['Modello', 'Rivestimento e copertina', 'Foto e scritte', 'Riepilogo e invio'];
  const lastStep = mobile ? 6 : 4;
  const photoStepValid = mobile ? (step === 4 ? draftCoverLayout === 'plaque' || frontPhotoPresent : step === 5 ? draftBackCover !== 'photo' || backPhotoPresent : true) : step !== 3 || !!configuration;
  const nextAllowed = ready && !renderBusy && !busy && (step === 1 ? (!state.data?.offer || !!selectedOption || !editable) : photoStepValid || !editable);
  if (token && (!state.data?.enabled || state.isError)) return null;
  return <section className="rounded-lg border bg-white p-4 space-y-3" data-testid="photobook-mockup">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="font-semibold">{title} · Anteprima album 3D</h2><p className="text-sm text-muted-foreground">Foto, rivestimento e scritte · versione {version}</p></div>
      <Button variant="outline" onClick={() => { setOpen(true); void state.refetch(); }}>Apri mockup {title}</Button>
    </div>
    {saved && <p className="text-sm text-muted-foreground">{MOCKUP_STATUS_LABELS[saved.status || 'draft']} · revisione {saved.revision} · versione fotolibro {version}</p>}
    <Dialog open={open} onOpenChange={next => { if (!next) closeConfigurator(); }}>
    <DialogContent ref={dialog} data-mobile-mockup={mobile ? 'true' : undefined} className="flex flex-col gap-0 p-0 sm:p-0 w-screen sm:w-[96vw] max-w-none sm:max-w-[1500px] h-[100dvh] sm:h-[94dvh] max-h-[100dvh] rounded-none sm:rounded-lg overflow-hidden [&>button]:hidden" onInteractOutside={event => event.preventDefault()}>
      {mobile && isPortrait && !picker && <div className="mockup-rotate" role="alert" data-testid="mockup-rotate"><p>Ruota il telefono in orizzontale</p><p>Avrai più spazio per vedere l’album e personalizzarlo. Le tue scelte restano conservate.</p><Button disabled={busy} onClick={closeConfigurator}>Chiudi mockup</Button></div>}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b p-3 sm:p-4">
        <div className="min-w-0"><DialogTitle>Personalizza il tuo album</DialogTitle><DialogDescription>{title} · versione {version}</DialogDescription></div>
        <Button variant="outline" className="min-h-11" disabled={busy} onClick={closeConfigurator}>Chiudi</Button>
      </div>
      {token && <div className="mockup-progress shrink-0 border-b px-3 py-2" aria-live="polite"><p className="text-sm font-medium">Passaggio {steps.indexOf(step) + 1} di {steps.length} · {stepNames[step - 1]}</p><div className="mt-2 flex gap-1" aria-hidden="true">{steps.map(value => <span key={value} className={`h-1 flex-1 rounded ${value <= step ? 'bg-primary' : 'bg-muted'}`} />)}</div></div>}
      <div className={token ? 'min-h-0 flex-1 flex flex-col overflow-hidden' : 'min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 space-y-3'} data-testid="mockup-dialog-body">
      {open && !token && <Button variant="outline" disabled={busy} onClick={async () => {
        if (dirty && !window.confirm('Ricaricare la proposta e abbandonare le modifiche non salvate?')) return;
        const fresh = await state.refetch();
        if (!fresh.isError) { pendingOption.current = null; setRendererOverride(null); setDirty(false); setReady(false); setRenderBusy(true); setGeneration(g => g + 1); }
      }}>Ricarica proposta</Button>}
    {saved && !token && <div className="text-sm space-y-1"><p className="font-medium">{MOCKUP_STATUS_LABELS[saved.status || 'draft']} · revisione {saved.revision}</p><p>{saved.option?.labName} {saved.option && '·'} {saved.option?.name} {saved.option && '·'} {saved.option?.materials.find(m => m.id === saved.configuration.materialId)?.label}</p><p>Ultima modifica: {saved.updatedBy === 'client' ? 'Cliente tramite link' : saved.updatedBy === 'studio' ? 'Studio' : 'Non registrato'} · {new Date(saved.updatedAt).toLocaleString('it-IT')}</p>{saved.note && <p>Note: {saved.note}</p>}</div>}
    {open && <>
      {state.isLoading && <p role="status">Caricamento configurazione…</p>}
      {state.isError && <p role="alert">{(state.error as Error).message}</p>}
      {state.data && <>
        {!token && <MockupOfferEditor offer={state.data.offer} disabled={readOnly || busy || dirty} publish={async selections => {
          setBusy(true);
          try { await request('/offer', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: state.data?.offer?.revision || 0, savedRevision: saved?.revision || 0, selections }) }); await state.refetch({ throwOnError: true }); setReady(false); setGeneration(g => g + 1); setMessage('Proposta pubblicata nel link cliente.'); return true; }
          catch (error) { setMessage((error as Error).message); return false; }
          finally { setBusy(false); }
        }} />}
        {!token && !!state.data.offer && <label className="block text-sm">Laboratorio e modello scelto<select aria-label="Laboratorio e modello scelto" className="block border rounded p-2 w-full mt-1" disabled={!editable || busy || !ready || renderBusy} value={selection ? `${selection.labId}/${selection.modelId}` : ''} onChange={event => {
          const [labId, modelId] = event.target.value.split('/');
          const next = { labId, modelId }; const option = optionFor(state.data?.offer || null, next);
          if (option) chooseOption(option);
        }}><option value="">Scegli un modello</option>{state.data.offer.options.map(o => <option key={`${o.labId}/${o.id}`} value={`${o.labId}/${o.id}`}>{o.labName} · {o.name}</option>)}</select></label>}
        {!token && <p className="text-xs text-muted-foreground">Anteprima indicativa di materiali e proporzioni. L’approvazione dell’impaginato resta nel percorso del fotolibro.</p>}
        {!editable && <p role="status">Questa versione è in sola lettura: puoi esplorare l’album e scaricare le viste.</p>}
        {!token && renderer.id === 'album-girevole' && <label className="block text-sm">Foto da personalizzare<select aria-label="Foto da personalizzare" className="block border rounded p-2 mt-1" value={photoSide} disabled={!editable || busy || picker || renderBusy} onChange={e => setPhotoSide(e.target.value === 'back' ? 'back' : 'front')}><option value="front">Copertina</option><option value="back">Retro in plexiglass</option></select></label>}
        {!token && <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!editable || busy || !ready || renderBusy} onClick={() => upload.current?.click()}>Carica una foto</Button>
          <Button variant="outline" disabled={!editable || busy || !ready || renderBusy} onClick={() => setPicker(true)}>Scegli dalla galleria</Button>
        </div>}
        {!mobile && <input ref={upload} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (!file) return;
          if (file.size > 20 * 1024 * 1024) { setMessage('Scegli una foto entro 20 MB.'); return; }
          void selectPhoto(() => request(`/upload?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file }));
        }} />}
        {!token && <p role="status" className="text-sm">{message}</p>}
        {token && (!ready || !wizard) && <p role="status" className="p-4 text-sm">Preparazione del tuo configuratore…</p>}
        <iframe key={`${renderer.id}-${generation}`} ref={frame} title={`Configuratore 3D ${renderer.name}`} src={`${import.meta.env.BASE_URL}mockups/${renderer.path}`} sandbox="allow-scripts allow-same-origin allow-downloads" style={{ visibility: token && (!ready || !wizard) ? 'hidden' : undefined }} aria-hidden={token && (!ready || !wizard) ? true : undefined} className={`${token ? 'w-full min-h-0 flex-1 border-0' : 'w-full h-[1050px] md:h-[760px] rounded border'} ${busy ? 'pointer-events-none' : ''}`} />
        {token && wizard && createPortal(<>
          {step === 1 && <><h3>Scegli il tuo modello</h3><p>Trovi qui i modelli proposti dallo studio.</p>{state.data.offer?.options.map(option => <button type="button" className="wizard-model" key={`${option.labId}/${option.id}`} aria-pressed={selectedOption?.id === option.id && selectedOption?.labId === option.labId} disabled={!editable || busy || !ready || renderBusy} onClick={() => chooseOption(option)}>{option.name}<small>{option.labName} · {MOCKUP_RENDERERS.find(r => r.id === option.rendererId)?.name}</small></button>)}{!state.data.offer && <p>{title}</p>}</>}
          {step === 2 && <><h3>{mobile ? 'Scegli il tessuto' : 'Rivestimento e copertina'}</h3><p>{mobile ? 'Apri una famiglia e tocca un campione.' : 'Tocca un campione per vederlo sull’album.'}</p></>}
          {mobile && step === 3 && <><h3>Finiture e copertina</h3><p>Scegli lo stile. La foto o i nomi si aggiungono nel prossimo passaggio.</p></>}
          {mobile && (step === 4 || step === 5) && <><h3>{step === 5 ? 'Personalizza il retro' : draftCoverLayout === 'plaque' ? 'I nomi da incidere' : 'La foto di copertina'}</h3>{(step === 5 ? draftBackCover === 'photo' : draftCoverLayout !== 'plaque') ? <><p>Scegli una foto dalla galleria del tuo servizio.</p><div className="wizard-photo-actions"><button disabled={!editable || busy || !ready || renderBusy} onClick={() => { setPhotoSide(step === 5 ? 'back' : 'front'); setPicker(true); }}>Scegli dalla galleria</button></div>{!photoStepValid && editable && <p role="status">Scegli una foto per continuare.</p>}</> : <p>{step === 5 ? 'Puoi mantenere il tessuto oppure scegliere una foto su plexiglass qui sotto.' : 'Le iniziali vengono create automaticamente dai nomi.'}</p>}</>}
          {!mobile && step === 3 && <><h3>Foto e scritte</h3><p>Personalizza la copertina, non le pagine interne del fotolibro.</p>{renderer.id === 'album-girevole' && <label>Foto da personalizzare<select aria-label="Foto da personalizzare" value={photoSide} disabled={!editable || busy || picker || renderBusy} onChange={e => setPhotoSide(e.target.value === 'back' ? 'back' : 'front')}><option value="front">Copertina</option><option value="back">Retro in plexiglass</option></select></label>}{(photoSide === 'front' ? draftCoverLayout !== 'plaque' : draftBackCover === 'photo') ? <div className="wizard-photo-actions"><button disabled={!editable || busy || !ready || renderBusy} onClick={() => upload.current?.click()}>Carica una foto</button><button disabled={!editable || busy || !ready || renderBusy} onClick={() => setPicker(true)}>Scegli dalla galleria</button></div> : <p>{photoSide === 'front' ? 'Per l’incisione non serve una foto: inserisci i nomi qui sotto.' : 'Per aggiungere una foto, scegli il retro su plexiglass nella sezione Finitura retro qui sotto.'}</p>}{!configuration && editable && <p role="status">Per proseguire, aggiungi le foto richieste dalla copertina e dall’eventuale retro in plexiglass.</p>}</>}
          {step === lastStep && <><h3>Controlla e invia allo studio</h3><p>{title} · versione fotolibro {version}</p>{saved && <p>{MOCKUP_STATUS_LABELS[saved.status || 'draft']} · revisione {saved.revision}{saved.note && ` · ${saved.note}`}</p>}<p>L’invio chiede la verifica allo studio: non manda l’album in stampa. Puoi creare altre revisioni finché lo studio non avvia la stampa.</p><p>Materiali e proporzioni dell’anteprima sono indicativi.</p><details><summary>Recupera la proposta dello studio</summary><button disabled={busy} onClick={reloadWizard}>Ricarica proposta</button></details></>}
        </>, wizard.slot)}
        {!token && <div className="border rounded p-3 space-y-3">
          <p className="text-sm">La conferma riguarda il mockup salvato, non l’impaginato. Se lo modifichi dopo la conferma, salva e conferma una nuova revisione.</p>
          <label className="block text-sm">Messaggio per il cliente<textarea className="block border rounded p-2 w-full" maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={readOnly || busy || dirty || !saved} onClick={() => action('/request-changes')}>Richiedi modifiche al cliente</Button>
            <Button disabled={readOnly || busy || dirty || renderBusy || !ready || !saved?.selection || saved.status === 'confirmed'} onClick={confirm}>Conferma mockup</Button>
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
        </div>}
      </>}
      {gallery.isLoading && picker && <p role="status">Caricamento foto della galleria…</p>}
      {gallery.isError && <p role="alert">Impossibile caricare la galleria. Riprova.</p>}
      <PhotobookPhotoPicker open={picker && !!gallery.data} onOpenChange={setPicker} photos={gallery.data?.photos || []} chapters={gallery.data?.chapters || []} title={photoSide === 'back' ? 'Scegli la foto del retro' : 'Scegli la foto di copertina'} onSelect={photo => {
        setPicker(false);
        void selectPhoto(() => request('/gallery-photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId: photo.id }) }));
      }} />
    </>}
      </div>
      <div className="mockup-actions shrink-0 border-t bg-background p-3 sm:px-4 space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {token && message && <p role="status" className="text-sm max-h-20 overflow-auto">{message}</p>}
        {dirty && <p className="text-sm text-amber-800" role="status">Modifiche da salvare</p>}
        {token ? <><div className="flex gap-2"><Button variant="outline" className="min-h-11" disabled={step === 1 || busy || renderBusy} onClick={() => setStep(steps[steps.indexOf(step) - 1])}>Indietro</Button>{step < lastStep ? <Button className="min-h-11 flex-1" disabled={!nextAllowed} onClick={() => setStep(steps[steps.indexOf(step) + 1])}>Avanti</Button> : <Button className="min-h-11 h-auto whitespace-normal flex-1" disabled={!editable || busy || renderBusy || !configuration || !selectedOption || (!dirty && ['submitted', 'confirmed'].includes(saved?.status || ''))} onClick={submitWizard}>Invia allo studio per verifica</Button>}</div>{step === lastStep && <Button variant="ghost" className="w-full min-h-11" disabled={!editable || busy || renderBusy || !configuration || !dirty || (!!state.data?.offer && !selectedOption)} onClick={save}>Salva bozza</Button>}</> : <div className="flex flex-wrap gap-2">
          <Button className="min-h-11 flex-1 sm:flex-none" disabled={!editable || busy || renderBusy || !configuration || !dirty || (!!state.data?.offer && !selectedOption)} onClick={save}>Salva mockup</Button>
        </div>}
      </div>
    </DialogContent>
    </Dialog>
  </section>;
}
