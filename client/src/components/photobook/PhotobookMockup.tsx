import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/firebase';
import { createUrl } from '@/lib/config';
import { getPhotobookGalleryPhotosByToken, listPhotobookGalleryPhotos } from '@/lib/photobooks';
import { Button } from '@/components/ui/button';
import PhotobookPhotoPicker from './PhotobookPhotoPicker';
import { mockupConfigurationSchema, type MockupConfiguration, type MockupPayload, type MockupPhoto, type SavedMockup } from '@shared/mockup-types';
import { MOCKUP_STATUS_LABELS, optionFor, type MockupSelection } from '@shared/mockup-workflow';
import MockupOfferEditor from './MockupOfferEditor';
import { MOCKUP_RENDERERS } from '@shared/mockup-catalog';
import type { MockupOption } from '@shared/mockup-workflow';

interface Props { photobookId: string; version: number; token?: string; readOnly?: boolean; summary?: boolean }

export default function PhotobookMockup({ photobookId, version, token, readOnly = false, summary = false }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const [photoSide, setPhotoSide] = useState<'front' | 'back'>('front');
  const [busy, setBusy] = useState(false);
  const [renderBusy, setRenderBusy] = useState(true);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [configuration, setConfiguration] = useState<MockupConfiguration | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
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
  const editable = !readOnly && state.data?.editable === true && (!token || !['submitted', 'confirmed'].includes(state.data?.saved?.status || ''));
  const selectedOption = optionFor(state.data?.offer || null, selection);
  const saved = state.data?.saved;
  const renderer = MOCKUP_RENDERERS.find(r => r.id === (rendererOverride || saved?.configuration.modelId)) || MOCKUP_RENDERERS[0];
  const title = selectedOption?.name || saved?.option?.name || 'Custodia';
  const apply = (payload: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ channel: 'memorie-mockup-v1', type: 'apply', ...payload }, window.location.origin);
  const recordSaved = (value: SavedMockup) => {
    revision.current = value.revision;
    queryClient.setQueryData<MockupPayload>(stateKey, previous => previous ? { ...previous, saved: value } : previous);
  };

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
    const target = renderer.id === 'album-girevole' ? photoSide : 'front';
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
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function action(path: string, targetRevision?: number) {
    if (!saved || dirty) return;
    setBusy(true); setMessage('Operazione in corso…');
    try {
      const response = await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: targetRevision || saved.revision, note }) });
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
  if (token && (!state.data?.enabled || state.isError)) return null;
  return <section className="rounded-lg border bg-white p-4 space-y-3" data-testid="photobook-mockup">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="font-semibold">{title} · Anteprima album 3D</h2><p className="text-sm text-muted-foreground">Foto, rivestimento e scritte · versione {version}</p></div>
      {!open && <Button variant="outline" onClick={() => { setOpen(true); void state.refetch(); }}>Apri mockup {title}</Button>}
      {open && <Button variant="outline" disabled={busy} onClick={async () => {
        if (dirty && !window.confirm('Ricaricare la proposta e abbandonare le modifiche non salvate?')) return;
        const fresh = await state.refetch();
        if (!fresh.isError) { pendingOption.current = null; setRendererOverride(null); setDirty(false); setReady(false); setRenderBusy(true); setGeneration(g => g + 1); }
      }}>Ricarica proposta</Button>}
    </div>
    {saved && <div className="text-sm space-y-1"><p className="font-medium">{MOCKUP_STATUS_LABELS[saved.status || 'draft']} · revisione {saved.revision}</p><p>{saved.option?.labName} {saved.option && '·'} {saved.option?.name} {saved.option && '·'} {saved.option?.materials.find(m => m.id === saved.configuration.materialId)?.label}</p><p>Ultima modifica: {saved.updatedBy === 'client' ? 'Cliente tramite link' : saved.updatedBy === 'studio' ? 'Studio' : 'Non registrato'} · {new Date(saved.updatedAt).toLocaleString('it-IT')}</p>{saved.note && <p>Note: {saved.note}</p>}</div>}
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
        {!!state.data.offer && <label className="block text-sm">Laboratorio e modello scelto<select aria-label="Laboratorio e modello scelto" className="block border rounded p-2 w-full mt-1" disabled={!editable || busy || !ready || renderBusy} value={selection ? `${selection.labId}/${selection.modelId}` : ''} onChange={event => {
          const [labId, modelId] = event.target.value.split('/');
          const next = { labId, modelId }; const option = optionFor(state.data?.offer || null, next);
          setSelection(next); setDirty(true); setPhotoSide('front');
          if (option && option.rendererId !== renderer.id) {
            pendingOption.current = option; setRendererOverride(option.rendererId);
            setConfiguration(null); setReady(false); setRenderBusy(true); setGeneration(g => g + 1);
          } else if (option) apply({ option, readOnly: !editable });
        }}><option value="">Scegli un modello</option>{state.data.offer.options.map(o => <option key={`${o.labId}/${o.id}`} value={`${o.labId}/${o.id}`}>{o.labName} · {o.name}</option>)}</select></label>}
        <p className="text-xs text-muted-foreground">Anteprima indicativa di materiali e proporzioni. L’approvazione dell’impaginato resta nel percorso del fotolibro.</p>
        {!editable && <p role="status">Questa versione è in sola lettura: puoi esplorare l’album e scaricare le viste.</p>}
        {renderer.id === 'album-girevole' && <label className="block text-sm">Foto da personalizzare<select aria-label="Foto da personalizzare" className="block border rounded p-2 mt-1" value={photoSide} disabled={!editable || busy || picker || renderBusy} onChange={e => setPhotoSide(e.target.value === 'back' ? 'back' : 'front')}><option value="front">Copertina</option><option value="back">Retro in plexiglass</option></select></label>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!editable || busy || !ready || renderBusy} onClick={() => upload.current?.click()}>Carica una foto</Button>
          <Button variant="outline" disabled={!editable || busy || !ready || renderBusy} onClick={() => setPicker(true)}>Scegli dalla galleria</Button>
          <Button disabled={!editable || busy || renderBusy || !configuration || !dirty || (!!state.data.offer && !selectedOption)} onClick={save}>Salva mockup</Button>
          {dirty && <span className="self-center text-sm text-amber-800">Modifiche da salvare</span>}
        </div>
        {token && <Button disabled={!editable || busy || dirty || !saved || !state.data.offer} onClick={() => action('/submit')}>Invia allo studio per verifica</Button>}
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
        <input ref={upload} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (!file) return;
          if (file.size > 20 * 1024 * 1024) { setMessage('Scegli una foto entro 20 MB.'); return; }
          void selectPhoto(() => request(`/upload?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file }));
        }} />
        <p role="status" className="text-sm">{message}</p>
        {busy && <p className="text-sm">Attendi il completamento prima di cambiare configurazione.</p>}
        <iframe key={`${renderer.id}-${generation}`} ref={frame} title={`Configuratore 3D ${renderer.name}`} src={`${import.meta.env.BASE_URL}mockups/${renderer.path}`} sandbox="allow-scripts allow-same-origin allow-downloads" className={`w-full h-[1050px] md:h-[760px] rounded border ${busy ? 'pointer-events-none' : ''}`} />
      </>}
      {gallery.isLoading && picker && <p role="status">Caricamento foto della galleria…</p>}
      {gallery.isError && <p role="alert">Impossibile caricare la galleria. Riprova.</p>}
      <PhotobookPhotoPicker open={picker && !!gallery.data} onOpenChange={setPicker} photos={gallery.data?.photos || []} chapters={gallery.data?.chapters || []} title={photoSide === 'back' ? 'Scegli la foto del retro' : 'Scegli la foto di copertina'} onSelect={photo => {
        setPicker(false);
        void selectPhoto(() => request('/gallery-photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId: photo.id }) }));
      }} />
    </>}
  </section>;
}
