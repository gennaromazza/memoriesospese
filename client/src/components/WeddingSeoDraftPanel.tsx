import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Check, RefreshCw, Sparkles } from 'lucide-react';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';

export interface SeoPhoto { photoId: string; url: string; section: string; alt: string; }
type GalleryPhoto = { id: string; url: string; name: string; uploadedBy?: string; createdAt?: any; chapterId?: string | null; chapterPosition?: number };
type Props = { gallery: any; photos: GalleryPhoto[]; jobId?: string; clientiIds: string[]; isWedding: boolean; onSaved?: () => void };

const sections = ['Preparativi', 'Cerimonia', 'Coppia', 'Location e ricevimento', 'Festa'];
const slugify = (v: string) => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const firstName = (value?: string) => (value || '').trim().split(/\s+/)[0] || '';

function time(value: any) { return value?.toMillis?.() ?? value?.seconds * 1000 ?? (new Date(value || 0).valueOf() || 0); }
function automaticSelection(photos: GalleryPhoto[], coverUrl: string, names: string): SeoPhoto[] {
  const unique = new Map<string, GalleryPhoto>();
  photos.filter(p => p.url && p.uploadedBy !== 'guest').forEach(p => { if (!unique.has(p.url)) unique.set(p.url, p); });
  const ordered = [...unique.values()].sort((a, b) => time(a.createdAt) - time(b.createdAt));
  const cover = ordered.find(p => p.url === coverUrl);
  const groups = new Map<string, GalleryPhoto[]>();
  ordered.forEach(p => { const key = p.chapterId || 'senza-capitolo'; groups.set(key, [...(groups.get(key) || []), p]); });
  const picked: GalleryPhoto[] = cover ? [cover] : [];
  // Prima una foto per capitolo, poi campionamento regolare della sequenza: evita blocchi di immagini quasi identiche.
  for (const group of groups.values()) { const candidate = group[Math.floor(group.length / 2)]; if (candidate && !picked.some(p => p.id === candidate.id)) picked.push(candidate); }
  const target = Math.min(15, ordered.length);
  for (let i = 0; picked.length < target && i < target * 3; i++) {
    const index = Math.min(ordered.length - 1, Math.floor(((i + 1) * ordered.length) / (target + 1)));
    const candidate = ordered[index]; if (candidate && !picked.some(p => p.id === candidate.id)) picked.push(candidate);
  }
  return picked.slice(0, target).map((p, index) => ({ photoId: p.id, url: p.url, section: sections[Math.min(sections.length - 1, Math.floor(index * sections.length / Math.max(target, 1)))], alt: `Matrimonio di ${names || 'una coppia'} – ${sections[Math.min(sections.length - 1, Math.floor(index * sections.length / Math.max(target, 1)))].toLowerCase()}` }));
}

export default function WeddingSeoDraftPanel({ gallery, photos, jobId, clientiIds, isWedding, onSaved }: Props) {
  const [images, setImages] = useState<SeoPhoto[]>(gallery.seoImages || []);
  const [isWorking, setIsWorking] = useState(false);
  const [published, setPublished] = useState(!!gallery.seoPublished);
  const [names, setNames] = useState(gallery.seoCoupleNames || '');
  const [location, setLocation] = useState(gallery.seoLocation || gallery.location || '');
  const [church, setChurch] = useState(gallery.seoChurch || '');
  const [comune, setComune] = useState(gallery.seoMunicipality || '');
  const [story, setStory] = useState(gallery.seoStory || '');
  useEffect(() => { setImages(gallery.seoImages || []); setPublished(!!gallery.seoPublished); }, [gallery.id, gallery.seoImages, gallery.seoPublished]);
  const selectedIds = useMemo(() => new Set(images.map(i => i.photoId)), [images]);
  if (!isWedding) return <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Questa sezione è disponibile per gallerie di tipo <strong>matrimonio</strong>.</div>;

  const generateDraft = async () => {
    setIsWorking(true);
    try {
      const job = jobId ? (await getDoc(doc(db, 'jobs', jobId))).data() : undefined;
      const clients = await Promise.all(clientiIds.slice(0, 2).map(id => getDoc(doc(db, 'clienti', id))));
      const autoNames = clients.filter(c => c.exists()).map(c => firstName(c.data().nome)).filter(Boolean).join(' e ') || gallery.name.replace(/^matrimonio\s*/i, '');
      const nextNames = names || autoNames;
      const nextLocation = location || job?.eventLocation || gallery.location || '';
      const nextChurch = church || job?.rituLocation || job?.locationCerimonia || '';
      const nextComune = comune || clients.find(c => c.exists())?.data().citta || '';
      const selected = automaticSelection(photos, gallery.coverImageDesktop || gallery.coverImageUrl || gallery.coverImageMobile, nextNames);
      const nextStory = story || `Un matrimonio reale raccontato con attenzione ai gesti, alle persone e ai dettagli che hanno reso unica la giornata di ${nextNames}. Image Studio Fotografico di Gennaro Mazzacane è uno studio di fotografia matrimoniale ad Aversa, attivo principalmente tra Caserta, Napoli e Campania, specializzato in fotografia spontanea, reportage ed editoriale.`;
      await updateDoc(doc(db, 'galleries', gallery.id), { seoImages: selected, seoCoupleNames: nextNames, seoLocation: nextLocation, seoChurch: nextChurch || null, seoMunicipality: nextComune || null, seoStyle: gallery.seoStyle || 'fotografia spontanea, reportage ed editoriale', seoStory: nextStory, seoSlug: gallery.seoSlug || slugify(`matrimonio-${nextNames}-${nextLocation}`), seoStatus: 'draft', seoGeneratedAt: serverTimestamp(), seoPublished: false, updatedAt: serverTimestamp() });
      setImages(selected); setNames(nextNames); setLocation(nextLocation); setChurch(nextChurch); setComune(nextComune); setStory(nextStory); setPublished(false); onSaved?.();
    } finally { setIsWorking(false); }
  };
  const toggle = (photo: GalleryPhoto) => setImages(current => selectedIds.has(photo.id) ? current.filter(i => i.photoId !== photo.id) : [...current, { photoId: photo.id, url: photo.url, section: sections[Math.min(sections.length - 1, current.length % sections.length)], alt: `Matrimonio di ${names || 'una coppia'}` }]);
  const save = async () => { setIsWorking(true); try { await updateDoc(doc(db, 'galleries', gallery.id), { seoImages: images, seoCoupleNames: names, seoLocation: location, seoChurch: church || null, seoMunicipality: comune || null, seoStory: story, seoSlug: gallery.seoSlug || slugify(`matrimonio-${names}-${location}`), seoStatus: published ? 'published' : 'draft', seoPublished: published, seoUpdatedAt: serverTimestamp(), updatedAt: serverTimestamp() }); onSaved?.(); } finally { setIsWorking(false); } };

  return <div className="space-y-5 overflow-y-auto pr-1">
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><div className="flex gap-2 font-semibold"><Sparkles className="h-4 w-4 mt-0.5" />Bozza automatica, mai pubblicata da sola</div><p className="mt-1">Il sistema usa cover, sequenza delle foto e capitoli. Puoi modificare la proposta, poi pubblicare solo quando hai consenso.</p></div>
    <Button onClick={generateDraft} disabled={isWorking || photos.length === 0} className="bg-[#2C3A2C]"><RefreshCw className="mr-2 h-4 w-4" />{images.length ? 'Rigenera bozza automatica' : 'Genera bozza automatica'}</Button>
    {images.length > 0 && <><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Nomi (solo nome)<input className="mt-1 w-full rounded border p-2" value={names} onChange={e => setNames(e.target.value)} /></label><label className="text-sm">Ricevimento / location<input className="mt-1 w-full rounded border p-2" value={location} onChange={e => setLocation(e.target.value)} /></label><label className="text-sm">Chiesa / rito<input className="mt-1 w-full rounded border p-2" value={church} onChange={e => setChurch(e.target.value)} /></label><label className="text-sm">Comune<input className="mt-1 w-full rounded border p-2" value={comune} onChange={e => setComune(e.target.value)} /></label></div><label className="block text-sm">Racconto<input className="mt-1 w-full rounded border p-2" value={story} onChange={e => setStory(e.target.value)} /></label><div><p className="mb-2 text-sm font-medium">Foto dell’articolo ({images.length}) — clicca per aggiungere o rimuovere</p><div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{photos.filter(p => p.uploadedBy !== 'guest').map(photo => <button key={photo.id} type="button" onClick={() => toggle(photo)} className={`relative aspect-square overflow-hidden rounded border-2 ${selectedIds.has(photo.id) ? 'border-[#c4724a]' : 'border-transparent opacity-60'}`}><img src={photo.url} alt="Foto galleria" className="h-full w-full object-cover" />{selectedIds.has(photo.id) && <span className="absolute right-1 top-1 rounded-full bg-[#c4724a] p-1 text-white"><Check className="h-3 w-3" /></span>}</button>)}</div></div><label className="flex items-start gap-3 rounded border p-4 text-sm"><input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} className="mt-1" /><span><strong>Pubblica la storia sul sito</strong><br />La pagina sarà indicizzabile e inserita nella sitemap. Attivala solo dopo consenso degli sposi.</span></label><Button onClick={save} disabled={isWorking || images.length === 0}>{published ? 'Salva e pubblica' : 'Salva bozza privata'}</Button></>}
  </div>;
}
