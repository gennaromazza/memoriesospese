import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateChapter, useDeletePhoto, useGalleryChapters, useGalleryOrganization, useGalleryPhotos, type Chapter, type Photo, type Gallery } from '../../lib/api-hooks';
import { fetchApi } from '../../lib/api';

const notifyError = (error: Error) => window.alert(`Operazione non riuscita: ${error.message}`);
type Position = { x: number; y: number };
const center = { x: 50, y: 50 };

function FocalPreview({ url, position, onChange, ratio = '16 / 9' }: {
  url: string; position: Position; onChange: (p: Position) => void; ratio?: string
}) {
  return <div className="space-y-2">
    <p className="text-xs text-muted-foreground">Clicca sull'immagine per impostare il punto focale ({position.x}%, {position.y}%).</p>
    <div className="relative max-w-lg cursor-crosshair overflow-hidden rounded-lg border" style={{ aspectRatio: ratio }}
      onClick={e => {
        const rect = e.currentTarget.getBoundingClientRect();
        onChange({ x: Math.round(100 * (e.clientX - rect.left) / rect.width), y: Math.round(100 * (e.clientY - rect.top) / rect.height) });
      }}>
      <img src={url} alt="Anteprima copertina" className="w-full h-full object-cover" style={{ objectPosition: `${position.x}% ${position.y}%` }} />
      <span className="absolute w-5 h-5 rounded-full border-2 border-white shadow bg-black/30 pointer-events-none" style={{ left: `${position.x}%`, top: `${position.y}%`, transform: 'translate(-50%, -50%)' }} />
    </div>
  </div>;
}

export function CoverControls({ gallery }: { gallery: Gallery }) {
  const { data: photos = [], isLoading: photosLoading, error: photosError } = useGalleryPhotos(gallery.id);
  const org = useGalleryOrganization(gallery.id);
  return <div className="space-y-6">
    {(['desktop', 'mobile'] as const).map(kind =>
      <GalleryCover key={kind} kind={kind} gallery={gallery} photos={photos} photosLoading={photosLoading} photosError={photosError} org={org} />)}
  </div>;
}

function GalleryCover({ kind, gallery, photos, photosLoading, photosError, org }: {
  kind: 'desktop' | 'mobile';
  gallery: Gallery;
  photos: Photo[];
  photosLoading: boolean;
  photosError: unknown;
  org: ReturnType<typeof useGalleryOrganization>;
}) {
  const url = kind === 'desktop' ? gallery.coverUrl : gallery.mobileCoverUrl;
  const storedPosition = kind === 'desktop' ? gallery.focalPoint : gallery.mobileFocalPoint;
  const [selected, setSelected] = useState('');
  const [position, setPosition] = useState<Position>(storedPosition || center);
  const [uploading, setUploading] = useState(false);
  useEffect(() => { setSelected(''); setPosition(storedPosition || center); }, [url, storedPosition?.x, storedPosition?.y]);
  const preview = photos.find(p => p.id === selected)?.url || url;
  const label = kind === 'desktop' ? 'Desktop' : 'Mobile';
  const save = async () => {
    try {
      // If no photo is newly selected, retain the existing uploaded or legacy URL while changing the focal point.
      if (!selected && url) await fetchApi(`/galleries/${gallery.id}/cover/position`, {
        method: 'PATCH', body: JSON.stringify({ kind, position })
      });
      else await org.galleryCover.mutateAsync({ kind, photoId: selected || null, position });
      org.refresh();
      window.alert(`Copertina ${label.toLowerCase()} salvata.`);
    } catch (e) { notifyError(e as Error); }
  };
  const upload = async (file: File) => {
    setUploading(true);
    try {
      const session = await fetchApi<{ storagePath: string; uploadUrl: string }>(`/galleries/${gallery.id}/covers/upload-sessions`, {
        method: 'POST', body: JSON.stringify({ size: file.size, contentType: file.type })
      });
      const response = await fetch(session.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!response.ok) throw new Error(`Caricamento fallito (${response.status})`);
      await fetchApi(`/galleries/${gallery.id}/covers/finalize`, {
        method: 'POST', body: JSON.stringify({ storagePath: session.storagePath, kind, position })
      });
      org.refresh();
      window.alert('Copertina caricata.');
    } catch (e) { notifyError(e as Error); }
    finally { setUploading(false); }
  };
  return <div className="space-y-3 border rounded-lg p-4">
    <Label>Copertina {label}</Label>
    <p className="text-xs text-muted-foreground">Scegli una foto dalla galleria o carica una copertina separata.</p>
    {photosLoading ? <p role="status" className="text-sm text-muted-foreground">Caricamento foto…</p> :
      photosError ? <p role="alert" className="text-sm text-destructive">Impossibile caricare le foto della galleria.</p> :
        photos.length > 0 ? (
          <div role="radiogroup" aria-label={`Scegli copertina ${label}`} className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto rounded-md border p-2 sm:grid-cols-4">
            {photos.map(photo => (
              <button
                key={photo.id}
                type="button"
                role="radio"
                aria-checked={selected === photo.id}
                aria-label={`Seleziona ${photo.name || photo.id}`}
                onClick={() => { setSelected(photo.id); setPosition(center); }}
                className={`overflow-hidden rounded-md border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selected === photo.id ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-primary/50'
                }`}
              >
                <img src={photo.thumbnailUrl || photo.url} alt="" loading="lazy" className="aspect-square w-full bg-muted object-cover" />
                <span className="block truncate px-2 py-1.5 text-xs" title={photo.name || photo.id}>{photo.name || photo.id}</span>
              </button>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">Non ci sono foto nella galleria. Puoi caricare una copertina separata.</p>}
    <Input aria-label={`Carica copertina ${label}`} type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e => {
      const file = e.target.files?.[0];
      if (file) void upload(file);
      e.target.value = '';
    }} />
    {preview && <FocalPreview url={preview} position={position} onChange={setPosition} ratio={kind === 'desktop' ? '16 / 9' : '9 / 16'} />}
    <div className="flex gap-2">
      <Button type="button" disabled={uploading || org.galleryCover.isPending || !preview} onClick={() => void save()}>Salva copertina e posizione</Button>
      {url && <Button type="button" variant="outline" disabled={org.galleryCover.isPending} onClick={() => {
        if (!window.confirm(`Rimuovere la copertina ${label.toLowerCase()}?`)) return;
        org.galleryCover.mutate({ kind, photoId: null, position: center }, { onSuccess: () => window.alert('Copertina rimossa.'), onError: notifyError });
      }}>Rimuovi</Button>}
    </div>
  </div>;
}

export function PhotosTab({ galleryId }: { galleryId: string }) {
  const { data: photos = [], isLoading: loadingPhotos, error: photosError } = useGalleryPhotos(galleryId);
  const { data: chapters = [], isLoading: loadingChapters, error: chaptersError } = useGalleryChapters(galleryId);
  const create = useCreateChapter(galleryId), removePhoto = useDeletePhoto(), org = useGalleryOrganization(galleryId);
  const [filter, setFilter] = useState('all'), [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(48);
  const [preview, setPreview] = useState<Photo | null>(null);
  const [editing, setEditing] = useState<Chapter | 'new' | null>(null);
  const [title, setTitle] = useState(''), [description, setDescription] = useState('');
  const [cover, setCover] = useState<Chapter | null>(null), [coverId, setCoverId] = useState('');
  const [coverPosition, setCoverPosition] = useState<Position>(center);
  const ordered = [...chapters].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));
  const known = new Set(chapters.map(c => c.id));
  const unassigned = (p: Photo) => !p.chapterId || !known.has(p.chapterId);
  const visible = photos.filter(p => (filter === 'all' || (filter === 'unassigned' ? unassigned(p) : p.chapterId === filter)) &&
    (p.name || '').toLowerCase().includes(search.toLowerCase()));
  useEffect(() => { setPage(48); setSelected([]); }, [filter, search]);
  useEffect(() => { setSelected(current => current.filter(id => photos.some(p => p.id === id))); }, [photos]);
  const act = async (action: Promise<unknown>, message: string) => {
    try { await action; window.alert(message); } catch (e) { notifyError(e as Error); }
  };
  const openEdit = (ch: Chapter | 'new') => {
    setEditing(ch); setTitle(ch === 'new' ? '' : ch.titolo || (ch as any).title || (ch as any).name || '');
    setDescription(ch === 'new' ? '' : ch.descrizione || '');
  };
  const saveChapter = async () => {
    if (!title.trim()) return window.alert('Inserisci un titolo.');
    try {
      if (editing === 'new') await create.mutateAsync({ titolo: title.trim(), descrizione: description });
      else if (editing) await org.updateChapter.mutateAsync({ id: editing.id, titolo: title.trim(), descrizione: description });
      setEditing(null); window.alert('Capitolo salvato.');
    } catch (e) { notifyError(e as Error); }
  };
  const shift = (index: number, direction: number) => {
    const ids = ordered.map(c => c.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    void act(org.reorder.mutateAsync({ chapterIds: ids }), 'Ordine dei capitoli salvato.');
  };
  const assign = (chapterId: string | null) => {
    if (!selected.length) return;
    void act(org.assign.mutateAsync({ photoIds: selected, chapterId }).then(() => setSelected([])), `${selected.length} foto spostate.`);
  };
  const chapterPhotos = cover ? photos.filter(p => p.chapterId === cover.id) : [];
  const coverPreview = chapterPhotos.find(p => p.id === coverId);

  if (loadingPhotos || loadingChapters) return <p className="p-8">Caricamento foto e capitoli...</p>;
  if (photosError || chaptersError) return <p className="p-8 text-destructive">Impossibile caricare foto e capitoli. Aggiorna la pagina per riprovare.</p>;
  return <div className="space-y-6 pb-20">
    <div className="bg-card border rounded-xl p-4 space-y-3">
      <div className="flex justify-between items-center"><h3 className="font-medium">Capitoli ({chapters.length}) · Foto ({photos.length})</h3>
        <Button variant="outline" onClick={() => openEdit('new')}>Nuovo capitolo</Button></div>
      <p className="text-sm text-muted-foreground">I capitoli creati dal caricamento delle cartelle sono modificabili qui. Le foto senza capitolo rimangono sempre accessibili.</p>
      {ordered.map((c, i) => <div key={c.id} className="flex flex-wrap items-center gap-2 border-t pt-2 text-sm">
        <button className="font-medium hover:underline" onClick={() => setFilter(c.id)}>{c.titolo || (c as any).title || (c as any).name} ({photos.filter(p => p.chapterId === c.id).length})</button>
        <span className="text-muted-foreground">{c.descrizione}</span>
        <Button size="sm" variant="ghost" disabled={i === 0 || org.reorder.isPending} onClick={() => shift(i, -1)}>↑</Button>
        <Button size="sm" variant="ghost" disabled={i === ordered.length - 1 || org.reorder.isPending} onClick={() => shift(i, 1)}>↓</Button>
        <Button size="sm" variant="outline" onClick={() => openEdit(c)}>Modifica</Button>
        <Button size="sm" variant="outline" onClick={() => { setCover(c); setCoverId(c.coverPhotoId || ''); setCoverPosition(c.coverPhotoPosition || center); }}>Copertina</Button>
        <Button size="sm" variant="destructive" disabled={org.deleteChapter.isPending} onClick={() => {
          if (window.confirm(`Eliminare "${c.titolo || (c as any).title}"? Le foto resteranno nella galleria, senza capitolo.`))
            void act(org.deleteChapter.mutateAsync(c.id).then(() => setFilter('unassigned')), 'Capitolo eliminato. Le foto sono ora senza capitolo.');
        }}>Elimina</Button>
      </div>)}
    </div>
    {editing && <div className="bg-card border rounded-xl p-4 space-y-2">
      <Label>Titolo</Label><Input value={title} onChange={e => setTitle(e.target.value)} maxLength={150} />
      <Label>Descrizione</Label><Input value={description} onChange={e => setDescription(e.target.value)} />
      <div className="flex gap-2"><Button disabled={create.isPending || org.updateChapter.isPending} onClick={() => void saveChapter()}>Salva capitolo</Button>
        <Button variant="outline" onClick={() => setEditing(null)}>Annulla</Button></div>
    </div>}
    {cover && <div className="bg-card border rounded-xl p-4 space-y-3">
      <h3>Copertina: {cover.titolo || (cover as any).title}</h3>
      <select className="w-full border rounded p-2 bg-background" aria-label="Foto copertina capitolo" value={coverId} onChange={e => { setCoverId(e.target.value); setCoverPosition(center); }}>
        <option value="">Nessuna copertina</option>{chapterPhotos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {coverPreview && <FocalPreview url={coverPreview.url} position={coverPosition} onChange={setCoverPosition} ratio="3 / 4" />}
      <div className="flex gap-2"><Button disabled={org.chapterCover.isPending} onClick={() => void act(org.chapterCover.mutateAsync({ id: cover.id, photoId: coverId || null, position: coverPosition }).then(() => setCover(null)), 'Copertina del capitolo salvata.')}>Salva copertina</Button>
        <Button variant="outline" onClick={() => setCover(null)}>Annulla</Button></div>
    </div>}
    <div className="bg-card border rounded-xl p-4 flex flex-wrap gap-3 items-center">
      <Input aria-label="Cerca foto per nome" placeholder="Cerca foto per nome" className="max-w-xs" value={search} onChange={e => setSearch(e.target.value)} />
      <select aria-label="Filtra capitolo" className="border rounded-md p-2 bg-background" value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="all">Tutte ({photos.length})</option>
        <option value="unassigned">Senza capitolo ({photos.filter(unassigned).length})</option>
        {ordered.map(c => <option key={c.id} value={c.id}>{c.titolo || (c as any).title || (c as any).name} ({photos.filter(p => p.chapterId === c.id).length})</option>)}
      </select>
      <span className="text-sm text-muted-foreground">{visible.length} risultati</span>
    </div>
    <div className="bg-card border rounded-xl p-4 flex flex-wrap items-center gap-3">
      <span className="text-sm">{selected.length} selezionate</span>
      <Button variant="outline" size="sm" onClick={() => setSelected(visible.slice(0, page).map(p => p.id))}>Seleziona foto visibili</Button>
      <Button variant="outline" size="sm" onClick={() => setSelected([])}>Deseleziona</Button>
      <select aria-label="Sposta foto selezionate" className="border rounded-md p-2 bg-background" value="" disabled={!selected.length || org.assign.isPending}
        onChange={e => assign(e.target.value === 'unassigned' ? null : e.target.value)}>
        <option value="">Sposta in...</option><option value="unassigned">Senza capitolo</option>
        {ordered.map(c => <option key={c.id} value={c.id}>{c.titolo || (c as any).title || (c as any).name}</option>)}
      </select>
    </div>
    {!visible.length ? <p className="bg-card border rounded-xl p-10 text-center text-muted-foreground">Nessuna foto trovata. Carica delle foto o modifica la ricerca.</p> :
      <><div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-3">
        {visible.slice(0, page).map(p => <div key={p.id} className={`bg-card border-2 rounded-lg overflow-hidden ${selected.includes(p.id) ? 'border-primary' : 'border-border'}`}>
          <button className="aspect-square w-full" onClick={() => setSelected(current => current.includes(p.id) ? current.filter(id => id !== p.id) : [...current, p.id])}
            aria-label={`Seleziona ${p.name}`} aria-pressed={selected.includes(p.id)}>
            <img loading="lazy" src={p.thumbnailUrl || p.url} alt={p.name} className="w-full h-full object-cover" />
          </button>
          <div className="p-2 text-xs truncate" title={p.name}>{p.name}</div>
          <div className="flex gap-1 p-1"><Button size="sm" variant="outline" onClick={() => setPreview(p)}>Apri</Button>
            <Button size="sm" variant="ghost" onClick={() => {
              if (window.confirm(`Eliminare definitivamente ${p.name}?`)) void act(removePhoto.mutateAsync({ galleryId, photoId: p.id }), 'Foto eliminata.');
            }}>Elimina</Button></div>
        </div>)}</div>
        {visible.length > page && <Button variant="outline" onClick={() => setPage(n => n + 48)}>Mostra altre foto ({visible.length - page} rimanenti)</Button>}</>}
    {preview && <div role="dialog" aria-label={`Anteprima ${preview.name}`} className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center gap-4 p-8">
      <Button onClick={() => setPreview(null)}>Chiudi anteprima</Button>
      <img src={preview.url} alt={preview.name} className="max-w-full max-h-[80vh] object-contain" />
      <span className="text-white">{preview.name}</span>
    </div>}
  </div>;
}