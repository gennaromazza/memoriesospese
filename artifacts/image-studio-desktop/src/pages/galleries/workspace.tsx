import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useGallery, useUpdateGallery, useDeleteGallery, useCustomerSelection, useConfigureSelection, useUnlockSelection, useResetSelection, useClients, useJobs, useProducts, useSelectionResults, useSelectionHistory, useUpdateGallerySecrets, useJobTypes, useNotifyPhotosReady } from '../../lib/api-hooks';
import { SelectionResultsPanel } from './selection-results';
import { CoverControls, PhotosTab } from './organization';
import { useUploadQueue } from '../../lib/uploadQueue';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { UploadCloud, Trash2, ArrowLeft, Loader2, CheckCircle2, AlertCircle, Play, Pause, RefreshCw, Copy, Check, LockKeyhole } from 'lucide-react';
import { selectFolderNative } from '../../lib/native';
import { browserFolderChapter, supportedUploadImage } from '../../lib/folderChapter';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { GalleryAssociationFields } from './association-fields';
import { clientLabel, jobLabel } from '../../lib/gallery-associations';
import { ShareGalleryForm } from './share-gallery-form';
import { CoverStylePicker } from './cover-style-picker';
import { SpecialThemePicker } from './special-theme-picker';

export default function GalleryWorkspace({ id }: { id: string }) {
  const [, setLocation] = useLocation();
  const { data: gallery, isLoading, error } = useGallery(id);
  const updateGallery = useUpdateGallery(id);
  const deleteGallery = useDeleteGallery();
  
  if (isLoading) return <div className="p-8 flex justify-center text-muted-foreground"><Loader2 className="animate-spin" /></div>;
  if (error || !gallery) return <div className="p-8 text-destructive">Impossibile caricare la galleria. Riprova aggiornando la pagina.</div>;

  const handleDelete = () => {
    deleteGallery.mutate(id, {
      onSuccess: () => setLocation('/'),
      onError: e => window.alert(`Eliminazione non riuscita: ${e.message}`)
    });
  };

  return (
    <div className="flex flex-col h-full bg-off-white">
      <div className="flex-none p-6 border-b border-border bg-card">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setLocation('/')} className="text-muted-foreground hover:text-foreground flex items-center text-sm font-medium transition-colors">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Torna alle Gallerie
          </button>
          <div className="flex items-center gap-3">
            <Badge variant={gallery.status === 'published' ? 'default' : 'secondary'} className="capitalize">{gallery.status === 'draft' ? 'Bozza' : gallery.status === 'published' ? 'Pubblicata' : 'Archiviata'}</Badge>
            {(gallery.publicUrl || gallery.code) && (
              <ShareGalleryForm key={gallery.id} gallery={gallery} />
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Elimina
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Questa azione non può essere annullata. Eliminerà definitivamente la galleria e tutte le sue foto.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Elimina</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        <h1 className="text-2xl font-serif font-bold text-foreground">{gallery.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">{gallery.photoCount} foto &bull; {gallery.chapterCount} capitoli</p>
      </div>

      <div className="flex-1 overflow-hidden p-6">
        <Tabs defaultValue="overview" className="h-full flex flex-col">
          <TabsList className="bg-muted w-max mb-6">
            <TabsTrigger value="overview">Panoramica</TabsTrigger>
            <TabsTrigger value="settings">Impostazioni</TabsTrigger>
            <TabsTrigger value="upload">Carica</TabsTrigger>
            <TabsTrigger value="selection">Selezione</TabsTrigger>
            <TabsTrigger value="photos">Foto</TabsTrigger>
          </TabsList>
          
          <div className="flex-1 overflow-y-auto">
            <TabsContent value="overview" className="mt-0 h-full">
              <OverviewTab gallery={gallery} updateGallery={updateGallery} />
            </TabsContent>
            <TabsContent value="settings" className="mt-0 h-full">
              <SettingsTab gallery={gallery} updateGallery={updateGallery} />
            </TabsContent>
            <TabsContent value="upload" className="mt-0 h-full">
              <UploadTab galleryId={gallery.id} />
            </TabsContent>
            <TabsContent value="selection" className="mt-0 h-full">
              <SelectionTab gallery={gallery} />
            </TabsContent>
            <TabsContent value="photos" className="mt-0 h-full">
              <PhotosTab galleryId={gallery.id} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
function OverviewTab({ gallery, updateGallery }: { gallery: any, updateGallery: any }) {
  const { data: clients = [] } = useClients();
  const { data: jobs = [] } = useJobs();
  const { data: jobTypes = [] } = useJobTypes();
  const linkedClients = (gallery.clientIds || gallery.clientiIds || []).map((id: string) => {
    const client = clients.find(item => item.id === id);
    return client ? clientLabel(client) : id;
  });
  const job = jobs.find(item => item.id === gallery.jobId);
  const handleStatusToggle = () => {
    updateGallery.mutate({ status: gallery.status === 'published' ? 'draft' : 'published' }, { onError: (e: Error) => window.alert(`Operazione non riuscita: ${e.message}`) });
  };

  return (
    <div className="max-w-4xl space-y-6 pb-20">
      <div className="bg-card border border-border p-6 rounded-xl shadow-sm flex items-center justify-between">
        <div>
          <h3 className="font-medium text-foreground text-lg mb-1">Stato: <span className="capitalize">{gallery.status === 'draft' ? 'Bozza' : gallery.status === 'published' ? 'Pubblicata' : 'Archiviata'}</span></h3>
          <p className="text-sm text-muted-foreground">Cambia la visibilità per i clienti.</p>
        </div>
        <Button variant={gallery.status === 'published' ? 'secondary' : 'default'} onClick={handleStatusToggle}>
          {gallery.status === 'published' ? 'Ritira' : 'Pubblica'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border border-border p-6 rounded-xl shadow-sm">
          <h3 className="font-medium text-foreground mb-4">Dettagli Galleria</h3>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 text-muted-foreground"><span className="col-span-1">Data</span><span className="col-span-2 text-foreground">{gallery.eventDate || '-'}</span></div>
            <div className="grid grid-cols-3 text-muted-foreground"><span className="col-span-1">Luogo</span><span className="col-span-2 text-foreground">{gallery.location || '-'}</span></div>
            <div className="grid grid-cols-3 text-muted-foreground"><span className="col-span-1">Categoria</span><span className="col-span-2 text-foreground">{jobTypes.find(type => type.slug === gallery.jobType)?.nome || gallery.jobType || gallery.category || '-'}</span></div>
            <div className="grid grid-cols-3 text-muted-foreground"><span className="col-span-1">Job</span><span className="col-span-2 text-foreground">{job ? jobLabel(job) : gallery.jobId || 'Nessun Job'}</span></div>
            <div className="grid grid-cols-3 text-muted-foreground"><span className="col-span-1">Clienti</span><span className="col-span-2 text-foreground">{linkedClients.join(', ') || 'Nessun cliente'}</span></div>
          </div>
        </div>
        
        <div className="bg-card border border-border p-6 rounded-xl shadow-sm">
          <h3 className="font-medium text-foreground mb-4">Selezione Clienti</h3>
          {gallery.selectionMode ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 text-muted-foreground"><span className="col-span-1">Modalità</span><span className="col-span-2 text-foreground capitalize">{gallery.selectionMode === 'like' ? 'Mi piace' : 'Non mi piace'}</span></div>
              <div className="grid grid-cols-3 text-muted-foreground"><span className="col-span-1">Richieste</span><span className="col-span-2 text-foreground">{gallery.selectionRequiredCount}</span></div>
              <div className="grid grid-cols-3 text-muted-foreground"><span className="col-span-1">Scadenza</span><span className="col-span-2 text-foreground">{gallery.selectionDeadline ? new Date(gallery.selectionDeadline).toLocaleDateString() : '-'}</span></div>
              <div className="grid grid-cols-3 text-muted-foreground"><span className="col-span-1">Bloccata</span><span className="col-span-2 text-foreground">{gallery.selectionLocked ? 'Sì' : 'No'}</span></div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">La selezione clienti non è abilitata.</p>
          )}
        </div>
      </div>
      
      {gallery.selectionMode && gallery.selectionSnapshots && gallery.selectionSnapshots.length > 0 && (
        <div className="bg-card border border-border p-6 rounded-xl shadow-sm">
          <h3 className="font-medium text-foreground mb-4">Cronologia Selezione</h3>
          <div className="space-y-2">
            {gallery.selectionSnapshots.map((snap: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center p-3 rounded-md bg-muted/40 border border-border/50 text-sm">
                <div>
                  <div className="font-medium">{snap.label || 'Revisione'}</div>
                  <div className="text-muted-foreground text-xs">{new Date(snap.timestamp).toLocaleString()}</div>
                </div>
                <div className="text-muted-foreground">{snap.selectedCount} elementi</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
function SettingsTab({ gallery, updateGallery }: { gallery: any, updateGallery: any }) {
  const updateSecrets = useUpdateGallerySecrets(gallery.id);
  const [formData, setFormData] = useState({
    name: gallery.name || '',
    eventDate: gallery.eventDate || '',
    location: gallery.location || '',
    description: gallery.description || '',
    jobType: gallery.jobType || gallery.category || '',
    jobId: gallery.jobId || '',
    publicUrl: gallery.publicUrl || '',
    specialTheme: gallery.specialTheme || 'none',
    headerStyle: gallery.headerStyle || 'classico',
    accessMode: gallery.accessMode || (gallery.pinEnabled ? 'pin' : gallery.passwordEnabled ? 'password' : 'open') as 'open' | 'password' | 'pin',
    passwordEnabled: gallery.passwordEnabled === true,
    pinEnabled: gallery.pinEnabled === true,
    clientIds: gallery.clientIds || [],
  });
  const [secret, setSecret] = useState('');
  const [secretError, setSecretError] = useState('');
  const [copied, setCopied] = useState(false);
  const saving = updateGallery.isPending || updateSecrets.isPending;
  
  const handleSave = () => {
    if (saving) return;
    const accessMode = formData.accessMode;
    setSecretError('');
    const originalMode = gallery.accessMode || (gallery.pinEnabled ? 'pin' : gallery.passwordEnabled ? 'password' : 'open');
    const accessChanged = accessMode !== originalMode;
    const themeChanged = formData.specialTheme !== (gallery.specialTheme || 'none');
    if ((accessMode === 'pin') !== (formData.specialTheme !== 'none')) {
      setSecretError('Il tema speciale richiede un PIN. Senza tema scegli password o accesso pubblico.');
      return;
    }
    if (accessChanged && accessMode !== 'open' && !secret.trim()) {
      setSecretError(`Inserisci ${accessMode === 'password' ? 'una password' : 'un PIN'} prima di attivare la protezione.`);
      return;
    }
    if (accessChanged && accessMode === 'open' &&
        !window.confirm('Rimuovere la protezione? La galleria sarà accessibile senza password o PIN.')) return;
    const { accessMode: _accessMode, passwordEnabled: _passwordEnabled, pinEnabled: _pinEnabled,
      specialTheme: _specialTheme, ...settings } = formData;
    const saveSettings = () => updateGallery.mutate({
      ...settings, jobType: formData.jobType || null, category: formData.jobType || null,
    }, { onSuccess: () => { setSecret(''); window.alert('Impostazioni salvate.'); },
      onError: (e: Error) => setSecretError(`Accesso aggiornato, ma le altre impostazioni non sono state salvate: ${e.message}`) });
    if (!accessChanged && !themeChanged && !secret.trim()) { saveSettings(); return; }
    const payload = {
      accessMode,
      specialTheme: formData.specialTheme === 'none' ? null : formData.specialTheme,
      ...(accessMode === 'password' && secret.trim() ? { password: secret.trim() } : {}),
      ...(accessMode === 'pin' && secret.trim() ? { specialPin: secret.trim() } : {}),
    };
    updateSecrets.mutate(payload, {
      onSuccess: saveSettings,
      onError: (e: Error) => setSecretError(`Accesso e tema non modificati: ${e.message}`),
    });
  };
  const copyPublicLink = async () => {
    if (!gallery.publicUrl) return;
    try {
      await navigator.clipboard.writeText(gallery.publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { window.alert('Impossibile copiare il link.'); }
  };

  return (
    <div className="max-w-2xl space-y-6 pb-20">
      <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
        <h3 className="font-medium text-foreground text-lg mb-4">Informazioni galleria</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2 col-span-2">
            <Label htmlFor="gallery-name">Nome galleria</Label>
            <Input id="gallery-name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gallery-event-date">Data evento</Label>
            <Input id="gallery-event-date" type="date" value={formData.eventDate} onChange={e => setFormData({ ...formData, eventDate: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gallery-location">Luogo</Label>
            <Input id="gallery-location" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} />
          </div>
          <div className="space-y-2 col-span-2">
            <Label htmlFor="gallery-description">Descrizione</Label>
            <Input id="gallery-description" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
          </div>
        </div>
        <div className="border-t border-border pt-4">
          <GalleryAssociationFields
            idPrefix="gallery-settings"
            jobId={formData.jobId}
            clientIds={formData.clientIds}
            jobType={formData.jobType}
            onChange={(jobId, clientIds, jobType) => setFormData(current => ({
              ...current, jobId, clientIds, jobType: jobType ?? current.jobType,
            }))}
          />
        </div>
      </div>

      <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
        <h3 className="font-medium text-foreground text-lg mb-4">Aspetto</h3>
        <CoverControls gallery={gallery} />
        <CoverStylePicker
          value={formData.headerStyle}
          onChange={headerStyle => setFormData(current => ({ ...current, headerStyle }))}
          coverUrl={gallery.coverUrl}
          galleryName={formData.name}
          eventDate={formData.eventDate}
          location={formData.location}
        />
        <SpecialThemePicker
          value={formData.specialTheme}
          onChange={specialTheme => {
            setFormData(current => ({ ...current, specialTheme, accessMode: specialTheme === 'none' ? 'open' : 'pin' }));
            setSecret('');
            setSecretError('');
          }}
        />
      </div>

      <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
        <h3 className="font-medium text-foreground text-lg mb-4">Controllo accesso</h3>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole className="w-4 h-4" /> Scegli come il cliente accederà alla galleria.</div>
        <div className="space-y-2">
            <Label htmlFor="gallery-access-mode">Modalità di accesso</Label>
            <select id="gallery-access-mode" className="w-full h-11 rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.accessMode} onChange={e => {
              const accessMode = e.target.value as 'open' | 'password' | 'pin';
              setFormData(current => ({ ...current, accessMode, specialTheme: accessMode === 'pin' ? current.specialTheme : 'none' }));
              setSecret('');
              setSecretError('');
            }}>
            <option value="open">Pubblico (senza protezione)</option>
            <option value="password">Password</option>
            <option value="pin" disabled={formData.specialTheme === 'none'}>PIN / tema speciale</option>
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          Il tema speciale usa solo il PIN. Rimuovendo il tema, scegli una password oppure conferma l'accesso pubblico al salvataggio.
        </p>
        {formData.accessMode !== 'open' && <div className="space-y-2"><Label htmlFor="gallery-secret">{formData.accessMode === 'password' ? 'Nuova password' : 'Nuovo PIN'}</Label><Input id="gallery-secret" type={formData.accessMode === 'password' ? 'password' : 'text'} inputMode={formData.accessMode === 'pin' ? 'numeric' : undefined} value={secret} onChange={e => setSecret(e.target.value)} placeholder="Inserisci una nuova credenziale" /></div>}
        <p className="text-xs text-muted-foreground">Per sicurezza la credenziale attuale non viene mai caricata. Inserisci una nuova credenziale per salvarla.</p>
        {secretError && <p className="text-sm text-destructive">{secretError}</p>}
        {gallery.publicUrl && <Button type="button" variant="outline" onClick={copyPublicLink}>{copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}{copied ? 'Link copiato' : 'Copia link pubblico'}</Button>}
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Salvataggio...' : 'Salva modifiche'}
      </Button>
    </div>
  );
}

function SelectionTab({ gallery }: { gallery: any }) {
  const galleryId = gallery.id;
  const { data: selection, isLoading } = useCustomerSelection(galleryId);
  const { data: catalogProducts = [] } = useProducts();
  const { data: selectionResults } = useSelectionResults(galleryId);
  const { data: selectionHistory = [] } = useSelectionHistory(galleryId);
  const notify = useNotifyPhotosReady(galleryId);
  const configure = useConfigureSelection(galleryId);
  const unlock = useUnlockSelection(galleryId);
  const reset = useResetSelection(galleryId);
  
  const [formData, setFormData] = useState({
    enabled: selection?.enabled ?? gallery.selectionMode !== undefined,
    unlimited: selection?.unlimited ?? false,
    mode: selection?.mode || 'like',
    requiredCount: selection?.requiredCount || 0,
    deadline: selection?.deadline ? new Date(selection.deadline).toISOString().split('T')[0] : ''
  });
  const [productRequirements, setProductRequirements] = useState<Array<{ prodottoId: string; prodottoNome: string; prodottoNumeroFoto: number }>>([]);
  useEffect(() => {
    if (!selection) return;
    setFormData({
      enabled: selection.enabled ?? true,
      unlimited: selection.unlimited ?? false,
      mode: selection.mode || 'like',
      requiredCount: selection.requiredCount || 0,
      deadline: selection.deadline ? new Date(selection.deadline).toISOString().split('T')[0] : ''
    });
  }, [galleryId, selection?.mode, selection?.requiredCount, selection?.deadline, selection?.enabled, selection?.unlimited]);
  useEffect(() => {
    const source = selection?.productRequirements || selection?.products || gallery.productRequirements || [];
    setProductRequirements(source.map((product: any) => ({
      prodottoId: product.prodottoId || product.id || '',
      prodottoNome: product.prodottoNome || product.nome || product.name || 'Prodotto',
      prodottoNumeroFoto: Number(product.prodottoNumeroFoto ?? product.numeroFoto ?? 0),
    })));
  }, [galleryId, selection?.productRequirements, selection?.products, gallery.productRequirements]);

  const handleSave = () => {
    configure.mutate({ ...formData, productRequirements }, { onSuccess: () => window.alert('Selezione salvata.'), onError: (e: Error) => window.alert(`Salvataggio non riuscito: ${e.message}`) });
  };

  if (isLoading) return <div className="p-8 text-muted-foreground">Caricamento dati di selezione...</div>;

  return (
    <div className="max-w-4xl space-y-6 pb-20">
      <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
        <h3 className="font-medium text-foreground text-lg mb-4">Configurazione Selezione</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 flex items-center gap-2">
            <input id="selection-enabled" type="checkbox" checked={formData.enabled} onChange={e => setFormData({ ...formData, enabled: e.target.checked })} />
            <Label htmlFor="selection-enabled">Abilita selezione cliente</Label>
          </div>
          <div className="space-y-2">
            <Label>Modalità Selezione</Label>
            <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" value={formData.mode} onChange={e => setFormData({ ...formData, mode: e.target.value as 'like'|'dislike' })}>
              <option value="like">Mi piace</option>
              <option value="dislike">Non mi piace</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Numero Foto Richieste</Label>
            <Input type="number" min={0} disabled={formData.unlimited} value={formData.requiredCount} onChange={e => setFormData({ ...formData, requiredCount: parseInt(e.target.value, 10) || 0 })} />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input id="selection-unlimited" type="checkbox" checked={formData.unlimited} onChange={e => setFormData({ ...formData, unlimited: e.target.checked, requiredCount: e.target.checked ? 0 : formData.requiredCount })} />
            <Label htmlFor="selection-unlimited">Selezione libera (senza limite)</Label>
          </div>
          <div className="space-y-2">
            <Label>Scadenza (Opzionale)</Label>
            <Input type="date" value={formData.deadline} onChange={e => setFormData({ ...formData, deadline: e.target.value })} />
          </div>
        </div>
        <Button onClick={handleSave} disabled={configure.isPending}>
          {configure.isPending ? 'Salvataggio...' : 'Salva Configurazione'}
        </Button>
      </div>

      <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
        <h3 className="font-medium text-foreground text-lg">Prodotti e risultati</h3>
        <p className="text-sm text-muted-foreground">Associa prodotti del catalogo e definisci quante foto deve selezionare il cliente per ciascuno.</p>
        <div className="space-y-2">
          {productRequirements.map((product, index) => (
            <div key={`${product.prodottoId || 'custom'}-${index}`} className="grid grid-cols-[1fr_120px_auto] gap-2 items-center">
              <span className="text-sm truncate">{product.prodottoNome}</span>
              <Input type="number" min={0} value={product.prodottoNumeroFoto} onChange={e => setProductRequirements(rows => rows.map((row, i) => i === index ? { ...row, prodottoNumeroFoto: Math.max(0, Number(e.target.value) || 0) } : row))} aria-label={`Foto per ${product.prodottoNome}`} />
              <Button type="button" variant="ghost" size="sm" onClick={() => setProductRequirements(rows => rows.filter((_, i) => i !== index))}>Rimuovi</Button>
            </div>
          ))}
          <div className="flex gap-2">
            <select className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm" value="" onChange={e => {
              const selected = catalogProducts.find((product: any) => product.id === e.target.value);
              if (selected && !productRequirements.some(product => product.prodottoId === selected.id)) setProductRequirements(rows => [...rows, { prodottoId: selected.id, prodottoNome: selected.name || selected.nome || selected.title || selected.id, prodottoNumeroFoto: Number(selected.numeroFoto || selected.photoCount || 0) }]);
            }}>
              <option value="">Aggiungi prodotto dal catalogo…</option>
              {catalogProducts.filter((product: any) => !productRequirements.some(current => current.prodottoId === product.id)).map((product: any) => <option key={product.id} value={product.id}>{product.name || product.nome || product.title || product.id}</option>)}
            </select>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">Totale foto richieste dai prodotti: {productRequirements.reduce((sum, product) => sum + product.prodottoNumeroFoto, 0)}</div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-muted-foreground">Risultato cliente:</span> <strong>{selection?.selectedCount || 0} foto</strong></div>
          <div><span className="text-muted-foreground">Stato:</span> <strong>{selection?.locked ? 'Completato e bloccato' : 'In corso'}</strong></div>
        </div>
        <SelectionResultsPanel results={selectionResults} />
        {selectionHistory.length > 0 && <div className="space-y-2"><h4 className="text-sm font-medium">Cronologia dal server</h4>{selectionHistory.slice(0, 10).map((entry: any, index: number) => <div key={entry.id || index} className="flex justify-between rounded border p-2 text-xs"><span>{entry.label || entry.action || `Revisione ${index + 1}`}</span><span className="text-muted-foreground">{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''}</span></div>)}</div>}
        {selection?.snapshots?.length ? <div className="space-y-2"><h4 className="text-sm font-medium">Revisioni precedenti</h4>{selection.snapshots.map((snap: any, index: number) => <div key={snap.id || index} className="flex justify-between rounded border p-2 text-xs"><span>{snap.label || `Revisione ${index + 1}`}</span><span className="text-muted-foreground">{snap.selectedPhotoIds?.length ?? snap.selectedCount ?? 0} foto{(snap.createdAt || snap.timestamp) ? ` · ${new Date(snap.createdAt || snap.timestamp).toLocaleString()}` : ''}</span></div>)}</div> : null}
      </div>

      <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-3">
        <h3 className="font-medium text-foreground text-lg">Avvisa il cliente</h3>
        <p className="text-sm text-muted-foreground">Invia l'email "foto pronte" ai clienti associati alla galleria (stesso invio della webapp).</p>
        <Button variant="outline" disabled={notify.isPending || !(gallery.photoCount > 0)} onClick={() => notify.mutate(gallery.photoCount || 0, {
          onSuccess: r => window.alert(r.message || 'Email inviata al cliente'), onError: (e: Error) => window.alert(e.message),
        })}>
          {notify.isPending ? 'Invio in corso...' : 'Invia notifica foto pronte'}
        </Button>
      </div>

      <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
        <h3 className="font-medium text-foreground text-lg mb-4">Stato Selezione</h3>
        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <div><span className="text-muted-foreground">Selezionate:</span> <span className="font-medium">{selection?.selectedCount || 0} / {selection?.requiredCount || 0}</span></div>
          <div><span className="text-muted-foreground">Bloccata:</span> <span className="font-medium">{selection?.locked ? 'Sì' : 'No'}</span></div>
        </div>
        
        <div className="flex gap-3">
          {selection?.locked && (
            <Button variant="outline" onClick={() => unlock.mutate(undefined, { onSuccess: () => window.alert('Selezione sbloccata.'), onError: (e: Error) => window.alert(e.message) })} disabled={unlock.isPending}>
              {unlock.isPending ? 'Sblocco in corso...' : 'Sblocca Selezione'}
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={reset.isPending}>Ripristina Selezione</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Ripristinare la selezione cliente?</AlertDialogTitle>
                <AlertDialogDescription>Questo rimuoverà tutte le foto attualmente selezionate e sbloccherà la selezione. L'operazione non può essere annullata.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={() => reset.mutate(undefined, { onSuccess: () => window.alert('Selezione ripristinata.'), onError: (e: Error) => window.alert(e.message) })} className="bg-destructive text-destructive-foreground">Ripristina</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

function UploadTab({ galleryId }: { galleryId: string }) {
  const { items, addItem, clearCompleted, pauseItem, resumeItem, retryItem, concurrency, setConcurrency, aggregateProgress } = useUploadQueue();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const galleryItems = items.filter(i => i.galleryId === galleryId);

  const handleSelectFiles = () => {
    fileInputRef.current?.click();
  };

  const handleNativeFolder = async () => {
    try {
      const files = await selectFolderNative();
      if (files) {
        files.forEach(f => {
          addItem({
            fileName: f.fileName,
            relativePath: f.relativePath,
            absolutePath: f.absolutePath,
            chapterName: f.chapterName || 'Senza capitolo',
            size: f.size,
            galleryId
          });
        });
      }
    } catch (e) {
      window.alert(`Impossibile aprire la cartella: ${(e as Error).message}`);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      let skipped = 0;
      Array.from(e.target.files).forEach(f => {
        if (!supportedUploadImage(f.name)) { skipped++; return; }
        addItem({
          fileName: f.name,
          relativePath: f.webkitRelativePath || f.name,
          chapterName: browserFolderChapter(f.webkitRelativePath),
          size: f.size,
          galleryId,
          fileObj: f,
          contentType: f.type,
        });
      });
      if (skipped) window.alert(`${skipped} file ignorati: sono supportati JPG, PNG, WebP, GIF e HEIC/HEIF. TIFF non è supportato.`);
    }
    e.target.value = '';
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="bg-card border border-border p-8 rounded-xl shadow-sm flex flex-col items-center justify-center border-dashed text-center">
        <UploadCloud className="w-12 h-12 text-muted-foreground/50 mb-4" />
        <h3 className="font-medium text-lg mb-2">Carica Foto</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm">Seleziona file o cartelle. Verranno aggiunti alla coda e processati automaticamente.</p>
        
        <div className="flex gap-4">
          <Button onClick={handleSelectFiles} variant="outline">Seleziona File</Button>
          <Button onClick={handleNativeFolder}>Seleziona Cartella</Button>
          <Button onClick={() => folderInputRef.current?.click()} variant="outline">Cartella dal browser</Button>
          <input type="file" ref={fileInputRef} className="hidden" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.heic,.heif" onChange={onFileChange} />
          <input type="file" ref={folderInputRef} className="hidden" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.heic,.heif" onChange={onFileChange} {...{ webkitdirectory: "", directory: "" } as any} />
        </div>
      </div>

      {galleryItems.length > 0 && (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col max-h-[500px]">
          <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
            <div className="flex-1 mr-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-sm">Coda di Caricamento ({galleryItems.length})</h3>
                <span className="text-xs text-muted-foreground">{aggregateProgress}% complessivo</span>
              </div>
              <Progress value={aggregateProgress} className="h-2" />
              <div className="flex items-center gap-3 mt-3">
                <Label htmlFor="upload-concurrency" className="text-xs text-muted-foreground whitespace-nowrap">Upload simultanei</Label>
                <Input id="upload-concurrency" type="number" min={1} max={8} value={concurrency} onChange={e => setConcurrency(Number(e.target.value))} className="h-7 w-16 text-xs" />
                <span className="text-xs text-muted-foreground">1–8</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={clearCompleted}>Rimuovi Completati</Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {galleryItems.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-md group">
                <div className="flex items-center gap-3 overflow-hidden">
                  {item.status === 'success' ? <CheckCircle2 className="w-4 h-4 text-sage" /> : item.status === 'error' ? <AlertCircle className="w-4 h-4 text-destructive" /> : item.status === 'duplicate' ? <AlertCircle className="w-4 h-4 text-orange-500" /> : item.status === 'paused' ? <Pause className="w-4 h-4 text-muted-foreground" /> : (item.status === 'uploading' || item.status === 'hashing' || item.status === 'compressing') ? <Loader2 className="w-4 h-4 text-primary animate-spin" /> : <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium truncate">{item.fileName}</span>
                    <span className="text-xs text-muted-foreground">{item.chapterName} • {{
                      pending: 'In attesa', compressing: 'Compressione', hashing: 'Verifica file', uploading: 'Caricamento', paused: 'In pausa',
                      success: 'Completato', duplicate: 'Già presente', error: 'Errore'
                    }[item.status]}{item.error ? ` - ${item.error}` : ''}{item.warning ? ` - ${item.warning}` : ''}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground min-w-[3rem] text-right">{item.progress}%</span>
                  <div className="flex items-center gap-1">
                    {(item.status === 'pending' || item.status === 'compressing' || item.status === 'hashing' || item.status === 'uploading') && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => pauseItem(item.id)}>
                        <Pause className="w-4 h-4" />
                      </Button>
                    )}
                    {item.status === 'paused' && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => resumeItem(item.id)}>
                        <Play className="w-4 h-4" />
                      </Button>
                    )}
                    {item.status === 'error' && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => retryItem(item.id)}>
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
