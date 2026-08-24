import { useEffect, useMemo, useRef, useState } from 'react';
import type { Gallery } from '@/lib/galleries';
import type { Photo } from '@/lib/photos';
import { WEDDING_STORY_LIMITS, type WeddingSeoStory, type WeddingStorySource } from '@shared/wedding-seo-types';
import {
  generateWeddingStoryDraft,
  getWeddingStoryEditor,
  saveWeddingStory,
  visibleWeddingPhotos,
  WEDDING_PHOTO_PAGE_SIZE,
  weddingPhotoPreview,
} from '@/lib/wedding-seo';
import { parseWeddingStoryMarkdown, weddingStorySlug } from '@/lib/wedding-story-format';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertCircle, CheckCircle2, Eye, ImageIcon, Loader2, Lock, RefreshCw, Save, Send, Sparkles } from 'lucide-react';

interface Props {
  gallery: Gallery;
  photos: Photo[];
}

type DraftFields = Pick<WeddingSeoStory, 'title' | 'slug' | 'excerpt' | 'story' | 'seoTitle' | 'seoDescription'>;

const EMPTY_DRAFT: DraftFields = {
  title: '',
  slug: '',
  excerpt: '',
  story: '',
  seoTitle: '',
  seoDescription: '',
};

function readableError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || 'Errore sconosciuto');
  try {
    const jsonStart = raw.indexOf('{');
    if (jsonStart >= 0) {
      const parsed = JSON.parse(raw.slice(jsonStart));
      if (parsed?.error) return typeof parsed.error === 'string' ? parsed.error : parsed.error.message;
    }
  } catch { /* usa il messaggio originale */ }
  return raw.replace(/^\d+:\s*/, '') || 'Operazione non riuscita. Riprova.';
}

function sourceValue(source: WeddingStorySource): string {
  if (!source.consentGranted) return 'Consenso editoriale non concesso';
  if (source.value && typeof source.value === 'object' && !Array.isArray(source.value)) {
    const vendor = source.value as Record<string, unknown>;
    return [vendor.name, vendor.role, vendor.url].filter(Boolean).join(' · ');
  }
  return Array.isArray(source.value) ? source.value.join(', ') : String(source.value ?? '');
}

export default function WeddingSeoDraftPanel({ gallery, photos }: Props) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [slugIsCustom, setSlugIsCustom] = useState(false);
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [sources, setSources] = useState<WeddingStorySource[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [warning, setWarning] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'draft' | 'published' | null>(null);
  const [generating, setGenerating] = useState(false);
  const [refreshingSources, setRefreshingSources] = useState(false);
  const [error, setError] = useState<string>();
  const [visiblePhotoCount, setVisiblePhotoCount] = useState(WEDDING_PHOTO_PAGE_SIZE);
  const [viewer, setViewer] = useState<Photo | null>(null);
  const loadedGallery = useRef<string>();

  useEffect(() => {
    if (loadedGallery.current === gallery.id) return;
    loadedGallery.current = gallery.id;
    setLoading(true);
    setError(undefined);
    getWeddingStoryEditor(gallery.id)
      .then(context => {
        setSources(context.sources);
        setWarning(context.warning);
        if (context.story) {
          setDraft({
            title: context.story.title,
            slug: context.story.slug,
            excerpt: context.story.excerpt,
            story: context.story.story,
            seoTitle: context.story.seoTitle,
            seoDescription: context.story.seoDescription,
          });
          setStatus(context.story.status);
          setSlugIsCustom(Boolean(context.story.slug));
          setSelectedSourceIds(new Set(context.story.approvedSourceIds));
          setSelectedPhotoIds(new Set(context.story.selectedPhotoIds));
        } else {
          setSlugIsCustom(false);
        }
      })
      .catch(reason => setError(readableError(reason)))
      .finally(() => setLoading(false));
  }, [gallery.id]);

  useEffect(() => {
    if (slugIsCustom || !draft.title) return;
    const automaticSlug = weddingStorySlug(draft.title);
    if (draft.slug === automaticSlug) return;
    setDraft(current => ({ ...current, slug: automaticSlug }));
  }, [draft.title, draft.slug, slugIsCustom]);

  const visiblePhotos = useMemo(
    () => visibleWeddingPhotos(photos, visiblePhotoCount),
    [photos, visiblePhotoCount],
  );
  const authorizedSources = sources.filter(source => source.consentGranted);
  const legacySources = sources.filter(source => source.legacyImported);
  const authorizedSourceIds = new Set(authorizedSources.map(source => source.id));
  const availablePhotoIds = new Set(photos.map(photo => photo.id));
  const validSelectedSourceIds = [...selectedSourceIds].filter(id => authorizedSourceIds.has(id));
  const validSelectedPhotoIds = [...selectedPhotoIds].filter(id => availablePhotoIds.has(id));
  const storyBlocks = useMemo(() => parseWeddingStoryMarkdown(draft.story), [draft.story]);

  const updateDraft = (field: keyof DraftFields, value: string) => {
    if (field === 'slug') setSlugIsCustom(true);
    setDraft(current => {
      if (field === 'title' && !slugIsCustom) {
        return { ...current, title: value, slug: weddingStorySlug(value) };
      }
      return { ...current, [field]: value };
    });
    setError(undefined);
  };

  const toggleSource = (source: WeddingStorySource) => {
    if (!source.consentGranted) return;
    setSelectedSourceIds(current => {
      const next = new Set(current);
      next.has(source.id) ? next.delete(source.id) : next.add(source.id);
      return next;
    });
  };

  const togglePhoto = (photoId: string) => {
    setSelectedPhotoIds(current => {
      const next = new Set(current);
      if (next.has(photoId)) next.delete(photoId);
      else if (validSelectedPhotoIds.length < 24) next.add(photoId);
      else toast({ title: 'Limite raggiunto', description: 'Puoi usare fino a 24 fotografie per una storia.' });
      return next;
    });
  };

  const refreshSources = async () => {
    setRefreshingSources(true);
    setError(undefined);
    try {
      const context = await getWeddingStoryEditor(gallery.id);
      setSources(context.sources);
      setWarning(context.warning);
      toast({ title: 'Risposte aggiornate', description: `${context.sources.length} risposte editoriali trovate per questo Job.` });
    } catch (reason) {
      const message = readableError(reason);
      setError(message);
      toast({ title: 'Aggiornamento non riuscito', description: message, variant: 'destructive' });
    } finally {
      setRefreshingSources(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(undefined);
    try {
      const generated = await generateWeddingStoryDraft(
        gallery.id,
        validSelectedSourceIds,
        validSelectedPhotoIds,
      );
      setDraft(current => {
        const title = generated.title || current.title;
        return {
          ...current,
          ...generated,
          slug: slugIsCustom ? current.slug : weddingStorySlug(title),
        };
      });
      setStatus('draft');
      toast({
        title: 'Bozza IA generata',
        description: 'Rileggila e modificala liberamente. Non è stata salvata né pubblicata.',
      });
    } catch (reason) {
      const message = readableError(reason);
      setError(message);
      toast({ title: 'Generazione non riuscita', description: message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (nextStatus: 'draft' | 'published') => {
    if (nextStatus === 'published' && !window.confirm('Pubblicare ora questa storia? Sarà indicizzabile e inserita nella sitemap.')) return;
    setSaving(nextStatus);
    setError(undefined);
    try {
      const saved = await saveWeddingStory(gallery.id, {
        ...draft,
        status: nextStatus,
        selectedPhotoIds: validSelectedPhotoIds,
        approvedSourceIds: validSelectedSourceIds,
      });
      setDraft({
        title: saved.title,
        slug: saved.slug,
        excerpt: saved.excerpt,
        story: saved.story,
        seoTitle: saved.seoTitle,
        seoDescription: saved.seoDescription,
      });
      setStatus(saved.status);
      toast({
        title: nextStatus === 'published' ? 'Storia pubblicata' : 'Bozza privata salvata',
        description: nextStatus === 'published'
          ? `Pagina disponibile su /real-wedding/${saved.slug}`
          : 'Il contenuto resta privato e non indicizzato.',
      });
    } catch (reason) {
      const message = readableError(reason);
      setError(message);
      toast({ title: 'Salvataggio non riuscito', description: message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Storia Real Wedding</CardTitle>
              <CardDescription>Bozza editoriale collegata al Job della galleria. Nessuna pubblicazione automatica.</CardDescription>
            </div>
            <Badge variant={status === 'published' ? 'default' : 'secondary'}>
              {status === 'published' ? <><CheckCircle2 className="mr-1 h-3 w-3" /> Pubblicata</> : <><Lock className="mr-1 h-3 w-3" /> Bozza privata</>}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {(warning || error) && (
            <div className={`flex gap-2 rounded-lg border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error || warning}</span>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">Titolo ({draft.title.length}/{WEDDING_STORY_LIMITS.title})
              <Input value={draft.title} onChange={event => updateDraft('title', event.target.value)} maxLength={WEDDING_STORY_LIMITS.title} placeholder="Un titolo specifico per questo matrimonio" />
            </label>
            <label className="space-y-1 text-sm font-medium">Slug pubblico
              <Input value={draft.slug} onChange={event => updateDraft('slug', event.target.value)} placeholder="generato automaticamente dal titolo" />
              <span className="block text-xs font-normal text-gray-500">
                {slugIsCustom ? 'Slug personalizzato: resta invariato quando modifichi il titolo.' : 'Si aggiorna automaticamente dal titolo finché non lo modifichi.'}
              </span>
            </label>
          </div>
          <label className="block space-y-1 text-sm font-medium">Introduzione ({draft.excerpt.length}/{WEDDING_STORY_LIMITS.excerpt})
            <Textarea value={draft.excerpt} onChange={event => updateDraft('excerpt', event.target.value)} maxLength={WEDDING_STORY_LIMITS.excerpt} rows={3} placeholder="Sintesi visibile nella pagina e nelle anteprime" />
          </label>
          <label className="block space-y-1 text-sm font-medium">Racconto ({draft.story.length}/{WEDDING_STORY_LIMITS.story})
            <Textarea value={draft.story} onChange={event => updateDraft('story', event.target.value)} maxLength={WEDDING_STORY_LIMITS.story} rows={18} placeholder="Scrivi o genera una bozza strutturata. Puoi modificarla prima di salvarla." />
          </label>
          <details className="rounded-lg border bg-stone-50/60 p-4">
            <summary className="cursor-pointer font-medium">Anteprima formattata della pagina pubblica</summary>
            <div className="mt-4 space-y-6 text-gray-700">
              {storyBlocks.length === 0 ? (
                <p className="text-sm text-gray-500">Scrivi o genera il racconto per vedere titoli e paragrafi formattati.</p>
              ) : storyBlocks.map((block, index) => (
                <section key={`${block.heading || 'intro'}-${index}`}>
                  {block.heading && <h2 className="mb-3 font-playfair text-2xl text-gray-900">{block.heading}</h2>}
                  <div className="space-y-3 leading-7">
                    {block.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
                  </div>
                </section>
              ))}
            </div>
          </details>

          {/* Le azioni restano accanto al Racconto, prima della griglia foto. */}
          <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur">
            <Button variant="outline" onClick={handleGenerate} disabled={generating || saving !== null}>
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Genera bozza IA
            </Button>
            <Button variant="secondary" onClick={() => handleSave('draft')} disabled={saving !== null || generating}>
              {saving === 'draft' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salva bozza privata
            </Button>
            <Button onClick={() => handleSave('published')} disabled={saving !== null || generating}>
              {saving === 'published' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Salva e pubblica
            </Button>
            <span className="ml-auto text-xs text-gray-500">Le modifiche restano nel form in caso di errore.</span>
          </div>

          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer font-medium">Segnali SEO</summary>
            <div className="mt-4 grid gap-4">
              <label className="space-y-1 text-sm">Titolo SEO ({draft.seoTitle.length}/{WEDDING_STORY_LIMITS.seoTitle})
                <Input value={draft.seoTitle} onChange={event => updateDraft('seoTitle', event.target.value)} maxLength={WEDDING_STORY_LIMITS.seoTitle} />
              </label>
              <label className="space-y-1 text-sm">Descrizione SEO ({draft.seoDescription.length}/{WEDDING_STORY_LIMITS.seoDescription})
                <Textarea value={draft.seoDescription} onChange={event => updateDraft('seoDescription', event.target.value)} maxLength={WEDDING_STORY_LIMITS.seoDescription} rows={3} />
              </label>
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle className="text-lg">Risposte autorizzate dai Moduli Informativi</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={refreshSources} disabled={refreshingSources}>
              {refreshingSources ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Aggiorna risposte
            </Button>
          </div>
          <CardDescription>
            Mostrate solo dal Job <strong>{gallery.jobId || 'non associato'}</strong>. Seleziona manualmente ciò che Groq può ricevere.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {legacySources.length > 0 && (
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              <strong>{legacySources.length} risposte storiche recuperate.</strong>{' '}
              Provengono da moduli completati prima dei nuovi campi editoriali: restano escluse da Groq finché non le selezioni singolarmente.
            </div>
          )}
          {sources.length === 0 && <p className="text-sm text-gray-500">Nessuna risposta editoriale disponibile per questo Job.</p>}
          {sources.map(source => (
            <label key={source.id} className={`flex items-start gap-3 rounded-lg border p-3 ${source.consentGranted ? 'cursor-pointer bg-white' : 'bg-gray-50 text-gray-500'}`}>
              <Checkbox
                checked={source.consentGranted && selectedSourceIds.has(source.id)}
                disabled={!source.consentGranted}
                onCheckedChange={() => toggleSource(source)}
              />
              <span className="min-w-0 text-sm">
                <span className="block font-medium">{source.label} · {source.clientName}</span>
                <span className="block break-words text-gray-600">{sourceValue(source)}</span>
              </span>
              <Badge variant="outline" className="ml-auto shrink-0">
                {source.legacyImported
                  ? `Storica · ${source.category === 'vendor' ? 'Fornitore' : 'Racconto'}`
                  : source.category === 'vendor' ? 'Fornitore' : 'Racconto'}
              </Badge>
            </label>
          ))}
          {authorizedSources.length > 0 && <p className="pt-2 text-xs text-gray-500">Selezionate: {validSelectedSourceIds.length} di {authorizedSources.length} risposte autorizzate.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><ImageIcon className="h-5 w-5" /> Fotografie della storia</CardTitle>
          <CardDescription>
            La griglia usa solo miniature leggere. L’originale viene richiesto quando apri la foto o nella pagina pubblica. Selezionate {validSelectedPhotoIds.length}/24.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10">
            {visiblePhotos.map(photo => {
              const selected = selectedPhotoIds.has(photo.id);
              return (
                <div key={photo.id} className={`relative aspect-square overflow-hidden rounded-lg border-2 ${selected ? 'border-sage ring-2 ring-sage/30' : 'border-gray-200'}`} style={{ contentVisibility: 'auto', containIntrinsicSize: '120px 120px' }}>
                  <img src={weddingPhotoPreview(photo)} alt={photo.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  <button type="button" aria-label={`Seleziona ${photo.name}`} className="absolute inset-0" onClick={() => togglePhoto(photo.id)} />
                  <Checkbox checked={selected} className="pointer-events-none absolute left-2 top-2 bg-white" />
                  <Button type="button" variant="secondary" size="icon" className="absolute bottom-1 right-1 h-7 w-7" onClick={event => { event.stopPropagation(); setViewer(photo); }}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
          {visiblePhotoCount < photos.length && (
            <div className="mt-4 text-center"><Button variant="outline" onClick={() => setVisiblePhotoCount(count => count + WEDDING_PHOTO_PAGE_SIZE)}>Mostra altre 60 foto</Button></div>
          )}
        </CardContent>
      </Card>

      <Dialog open={viewer !== null} onOpenChange={open => { if (!open) setViewer(null); }}>
        <DialogContent className="max-w-5xl">
          <DialogHeader><DialogTitle>{viewer?.name}</DialogTitle><DialogDescription>Anteprima a piena qualità caricata su richiesta.</DialogDescription></DialogHeader>
          {viewer && <img src={viewer.url} alt={viewer.name} className="max-h-[75vh] w-full object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
