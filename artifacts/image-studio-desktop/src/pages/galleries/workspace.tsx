import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { useGallery, useUpdateGallery, useDeleteGallery, useGalleryPhotos, useGalleryChapters, useDeletePhoto, useCreateChapter, useCustomerSelection, useConfigureSelection, useUnlockSelection, useResetSelection } from '../../lib/api-hooks';
import { useUploadQueue } from '../../lib/uploadQueue';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Camera, Settings, UploadCloud, Images, Trash2, ArrowLeft, Loader2, CheckCircle2, AlertCircle, Share, Play, Pause, RefreshCw } from 'lucide-react';
import { selectFolderNative } from '../../lib/native';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export default function GalleryWorkspace({ id }: { id: string }) {
  const [, setLocation] = useLocation();
  const { data: gallery, isLoading, error } = useGallery(id);
  const updateGallery = useUpdateGallery(id);
  const deleteGallery = useDeleteGallery();
  
  if (isLoading) return <div className="p-8 flex justify-center text-muted-foreground"><Loader2 className="animate-spin" /></div>;
  if (error || !gallery) return <div className="p-8 text-destructive">Error loading gallery {id}</div>;

  const handleDelete = () => {
    deleteGallery.mutate(id, {
      onSuccess: () => setLocation('/')
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
            {gallery.publicUrl && (
              <Button variant="outline" size="sm" onClick={() => window.open(gallery.publicUrl, '_blank')}>
                <Share className="w-4 h-4 mr-2" />
                Visualizza Pubblica
              </Button>
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
  const handleStatusToggle = () => {
    updateGallery.mutate({ status: gallery.status === 'published' ? 'draft' : 'published' });
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
            <div className="grid grid-cols-3 text-muted-foreground"><span className="col-span-1">Categoria</span><span className="col-span-2 text-foreground">{gallery.category || '-'}</span></div>
            <div className="grid grid-cols-3 text-muted-foreground"><span className="col-span-1">ID Lavoro</span><span className="col-span-2 text-foreground truncate">{gallery.jobId || '-'}</span></div>
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
  const [formData, setFormData] = useState({
    name: gallery.name || '',
    eventDate: gallery.eventDate || '',
    location: gallery.location || '',
    description: gallery.description || '',
    category: gallery.category || '',
    jobId: gallery.jobId || '',
    publicUrl: gallery.publicUrl || '',
    passwordEnabled: gallery.passwordEnabled || false,
    pinEnabled: gallery.pinEnabled || false,
    specialTheme: gallery.specialTheme || '',
    coverUrl: gallery.coverUrl || '',
    mobileCoverUrl: gallery.mobileCoverUrl || '',
    headerStyle: gallery.headerStyle || ''
  });
  
  const handleSave = () => {
    updateGallery.mutate(formData);
  };

  return (
    <div className="max-w-2xl space-y-6 pb-20">
      <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
        <h3 className="font-medium text-foreground text-lg mb-4">Basic Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2 col-span-2">
            <Label>Gallery Name</Label>
            <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Event Date</Label>
            <Input type="date" value={formData.eventDate} onChange={e => setFormData({ ...formData, eventDate: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <Input value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Description</Label>
            <Input value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Input value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Job ID</Label>
            <Input value={formData.jobId} onChange={e => setFormData({ ...formData, jobId: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
        <h3 className="font-medium text-foreground text-lg mb-4">Appearance</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2 col-span-2">
            <Label>Desktop Cover URL</Label>
            <Input value={formData.coverUrl} onChange={e => setFormData({ ...formData, coverUrl: e.target.value })} />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Mobile Cover URL</Label>
            <Input value={formData.mobileCoverUrl} onChange={e => setFormData({ ...formData, mobileCoverUrl: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Header Style</Label>
            <Input value={formData.headerStyle} onChange={e => setFormData({ ...formData, headerStyle: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Special Theme</Label>
            <Input value={formData.specialTheme} onChange={e => setFormData({ ...formData, specialTheme: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
        <h3 className="font-medium text-foreground text-lg mb-4">Access Control</h3>
        <div className="flex items-center justify-between">
          <div>
            <Label>Password Protection</Label>
            <p className="text-sm text-muted-foreground">Require a password to view the gallery.</p>
          </div>
          <input type="checkbox" className="w-5 h-5 accent-primary" checked={formData.passwordEnabled} onChange={e => setFormData({ ...formData, passwordEnabled: e.target.checked })} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label>PIN Protection</Label>
            <p className="text-sm text-muted-foreground">Require a PIN code to view the gallery.</p>
          </div>
          <input type="checkbox" className="w-5 h-5 accent-primary" checked={formData.pinEnabled} onChange={e => setFormData({ ...formData, pinEnabled: e.target.checked })} />
        </div>
      </div>

      <Button onClick={handleSave} disabled={updateGallery.isPending}>
        {updateGallery.isPending ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  );
}

function SelectionTab({ gallery }: { gallery: any }) {
  const galleryId = gallery.id;
  const { data: selection, isLoading } = useCustomerSelection(galleryId);
  const configure = useConfigureSelection(galleryId);
  const unlock = useUnlockSelection(galleryId);
  const reset = useResetSelection(galleryId);
  
  const [formData, setFormData] = useState({
    mode: selection?.mode || 'like',
    requiredCount: selection?.requiredCount || 0,
    deadline: selection?.deadline ? new Date(selection.deadline).toISOString().split('T')[0] : ''
  });

  const handleSave = () => {
    configure.mutate(formData);
  };

  if (isLoading) return <div className="p-8 text-muted-foreground">Caricamento dati di selezione...</div>;

  return (
    <div className="max-w-4xl space-y-6 pb-20">
      <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
        <h3 className="font-medium text-foreground text-lg mb-4">Configurazione Selezione</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Modalità Selezione</Label>
            <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" value={formData.mode} onChange={e => setFormData({ ...formData, mode: e.target.value as 'like'|'dislike' })}>
              <option value="like">Mi piace</option>
              <option value="dislike">Non mi piace</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Numero Foto Richieste</Label>
            <Input type="number" value={formData.requiredCount} onChange={e => setFormData({ ...formData, requiredCount: parseInt(e.target.value, 10) || 0 })} />
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
        <h3 className="font-medium text-foreground text-lg mb-4">Stato Selezione</h3>
        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <div><span className="text-muted-foreground">Selezionate:</span> <span className="font-medium">{selection?.selectedCount || 0} / {selection?.requiredCount || 0}</span></div>
          <div><span className="text-muted-foreground">Bloccata:</span> <span className="font-medium">{selection?.locked ? 'Sì' : 'No'}</span></div>
        </div>
        
        <div className="flex gap-3">
          {selection?.locked && (
            <Button variant="outline" onClick={() => unlock.mutate()} disabled={unlock.isPending}>
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
                <AlertDialogAction onClick={() => reset.mutate()} className="bg-destructive text-destructive-foreground">Ripristina</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

function UploadTab({ galleryId }: { galleryId: string }) {
  const { items, addItem, clearCompleted, pauseItem, resumeItem, retryItem } = useUploadQueue();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryItems = items.filter(i => i.galleryId === galleryId);

  const handleSelectFiles = () => {
    fileInputRef.current?.click();
  };

  const handleNativeFolder = async () => {
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
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(f => {
        addItem({
          fileName: f.name,
          relativePath: f.webkitRelativePath || f.name,
          chapterName: f.webkitRelativePath ? f.webkitRelativePath.split('/')[0] : 'Default',
          size: f.size,
          galleryId,
          fileObj: f
        });
      });
    }
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
          <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*" onChange={onFileChange} {...{ webkitdirectory: "", directory: "" } as any} />
        </div>
      </div>

      {galleryItems.length > 0 && (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col max-h-[500px]">
          <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
            <h3 className="font-medium text-sm">Coda di Caricamento ({galleryItems.length})</h3>
            <Button variant="ghost" size="sm" onClick={clearCompleted}>Rimuovi Completati</Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {galleryItems.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-md group">
                <div className="flex items-center gap-3 overflow-hidden">
                  {item.status === 'success' ? <CheckCircle2 className="w-4 h-4 text-sage" /> : item.status === 'error' ? <AlertCircle className="w-4 h-4 text-destructive" /> : item.status === 'duplicate' ? <AlertCircle className="w-4 h-4 text-orange-500" /> : item.status === 'paused' ? <Pause className="w-4 h-4 text-muted-foreground" /> : (item.status === 'uploading' || item.status === 'hashing') ? <Loader2 className="w-4 h-4 text-primary animate-spin" /> : <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium truncate">{item.fileName}</span>
                    <span className="text-xs text-muted-foreground">{item.chapterName} • {item.status}{item.error ? ` - ${item.error}` : ''}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground min-w-[3rem] text-right">{item.progress}%</span>
                  <div className="flex items-center gap-1">
                    {(item.status === 'pending' || item.status === 'hashing' || item.status === 'uploading') && (
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

function PhotosTab({ galleryId }: { galleryId: string }) {
  const { data: photos, isLoading: loadingPhotos } = useGalleryPhotos(galleryId);
  const { data: chapters, isLoading: loadingChapters } = useGalleryChapters(galleryId);
  const deletePhoto = useDeletePhoto();
  const createChapter = useCreateChapter(galleryId);

  const handleAddChapter = () => {
    const title = window.prompt("Inserisci il titolo del capitolo:");
    if (title) {
      createChapter.mutate({ title, order: chapters?.length || 0 });
    }
  };

  if (loadingPhotos || loadingChapters) return <div className="p-8 text-muted-foreground">Caricamento foto...</div>;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-border shadow-sm">
        <h3 className="font-medium text-sm">Tutte le Foto ({photos?.length || 0}) in {chapters?.length || 0} capitoli</h3>
        <Button variant="outline" size="sm" onClick={handleAddChapter} disabled={createChapter.isPending}>
          Aggiungi Capitolo
        </Button>
      </div>
      
      {photos?.length === 0 ? (
        <div className="text-center p-12 bg-card rounded-xl border border-border border-dashed">
          <Images className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">Nessuna foto caricata finora.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {(chapters?.length ? chapters : [{ id: 'default', title: 'Senza capitolo', galleryId, order: 0, photoCount: photos?.length || 0 }]).map(chapter => {
            const chapterPhotos = photos?.filter(p => p.chapterId === chapter.id || (chapter.id === 'default' && !p.chapterId)) || [];
            
            if (chapterPhotos.length === 0) return null;

            return (
              <div key={chapter.id} className="space-y-4">
                <h4 className="font-medium text-foreground border-b border-border pb-2">{chapter.title}</h4>
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {chapterPhotos.map(photo => (
                    <div key={photo.id} className="group relative aspect-square bg-muted rounded-lg overflow-hidden border border-border shadow-sm">
                      <img src={photo.thumbnailUrl || photo.url} alt={photo.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eliminare la foto?</AlertDialogTitle>
                              <AlertDialogDescription>Questa azione non può essere annullata.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deletePhoto.mutate({ galleryId, photoId: photo.id })} className="bg-destructive text-destructive-foreground">Elimina</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
