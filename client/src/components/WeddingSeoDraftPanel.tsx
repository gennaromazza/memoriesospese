import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Gallery } from '@/lib/galleries';
import type { Photo } from '@/lib/photos';
import {
  WEDDING_STORY_LIMITS,
  type WeddingCoverPosition,
  type WeddingSeoStory,
  type WeddingStorySource,
  type WeddingVendorReview,
} from '@shared/wedding-seo-types';
import { normalizeInfoFormVendors } from '@shared/info-form-types';
import {
  generateWeddingStoryDraft,
  getWeddingStoryEditor,
  saveWeddingStory,
  saveWeddingStorySelection,
  visibleWeddingPhotos,
  WEDDING_PHOTO_PAGE_SIZE,
  weddingPhotoPreview,
} from '@/lib/wedding-seo';
import { parseWeddingStoryMarkdown, weddingStorySlug } from '@/lib/wedding-story-format';
import WeddingStoryInline from '@/components/WeddingStoryInline';
import { useToast } from '@/hooks/use-toast';
import { createUrl } from '@/lib/basePath';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ToastAction } from '@/components/ui/toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Eye, ImageIcon, Loader2, Lock, RefreshCw, Save, Send, ShieldCheck, Sparkles, Star } from 'lucide-react';

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
  if (source.category === 'vendor') {
    return normalizeInfoFormVendors(source.value)
      .map(vendor => [vendor.name, vendor.category, vendor.location].filter(Boolean).join(' · '))
      .join(' | ');
  }
  if (source.value && typeof source.value === 'object' && !Array.isArray(source.value)) {
    const vendor = source.value as Record<string, unknown>;
    return [vendor.name, vendor.role].filter(Boolean).join(' · ');
  }
  return Array.isArray(source.value) ? source.value.join(', ') : String(source.value ?? '');
}

const MAX_WEDDING_STORY_PHOTOS = 12;
const DEFAULT_COVER_POSITION: WeddingCoverPosition = { x: 50, y: 50 };

function photoSelectionSignature(
  photoIds: string[],
  coverPhotoId?: string,
  photoAltTexts: Record<string, string> = {},
  coverPhotoPosition: WeddingCoverPosition = DEFAULT_COVER_POSITION,
  coverPhotoMobilePosition: WeddingCoverPosition = DEFAULT_COVER_POSITION,
  coverPhotoCardPosition: WeddingCoverPosition = DEFAULT_COVER_POSITION,
  coverPhotoCardMobilePosition: WeddingCoverPosition = DEFAULT_COVER_POSITION,
): string {
  return JSON.stringify({
    photoIds,
    coverPhotoId: coverPhotoId || '',
    photoAltTexts,
    coverPhotoPosition,
    coverPhotoMobilePosition,
    coverPhotoCardPosition,
    coverPhotoCardMobilePosition,
  });
}

export default function WeddingSeoDraftPanel({ gallery, photos }: Props) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [slugIsCustom, setSlugIsCustom] = useState(false);
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [sources, setSources] = useState<WeddingStorySource[]>([]);
  const [vendorReviews, setVendorReviews] = useState<WeddingVendorReview[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [coverPhotoId, setCoverPhotoId] = useState<string>();
  const [coverPhotoPosition, setCoverPhotoPosition] = useState<WeddingCoverPosition>(DEFAULT_COVER_POSITION);
  const [coverPhotoMobilePosition, setCoverPhotoMobilePosition] = useState<WeddingCoverPosition>(DEFAULT_COVER_POSITION);
  const [coverPhotoCardPosition, setCoverPhotoCardPosition] = useState<WeddingCoverPosition>(DEFAULT_COVER_POSITION);
  const [coverPhotoCardMobilePosition, setCoverPhotoCardMobilePosition] = useState<WeddingCoverPosition>(DEFAULT_COVER_POSITION);
  const [photoAltTexts, setPhotoAltTexts] = useState<Record<string, string>>({});
  const [coverEditorOpen, setCoverEditorOpen] = useState(false);
  const [coverEditorMode, setCoverEditorMode] = useState<'desktop' | 'mobile' | 'card-desktop' | 'card-mobile'>('desktop');
  const [activeChapterId, setActiveChapterId] = useState('__all__');
  const [warning, setWarning] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'draft' | 'published' | null>(null);
  const [generating, setGenerating] = useState(false);
  const [refreshingSources, setRefreshingSources] = useState(false);
  const [selectionSaveState, setSelectionSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string>();
  const [visiblePhotoCount, setVisiblePhotoCount] = useState(WEDDING_PHOTO_PAGE_SIZE);
  const [viewer, setViewer] = useState<Photo | null>(null);
  const loadedGallery = useRef<string>();
  const selectionInitialized = useRef(false);
  const lastSavedSelection = useRef('');
  const selectionSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const selectionSaveVersion = useRef(0);

  useEffect(() => {
    if (loadedGallery.current === gallery.id) return;
    loadedGallery.current = gallery.id;
    selectionInitialized.current = false;
    selectionSaveVersion.current += 1;
    setLoading(true);
    setError(undefined);
    getWeddingStoryEditor(gallery.id)
      .then(context => {
        setSources(context.sources);
        setVendorReviews(context.vendorReviews);
        setWarning(context.warning);
        if (context.story) {
          const initialPhotoIds = context.story.selectedPhotoIds.slice(0, MAX_WEDDING_STORY_PHOTOS);
          const initialCoverPhotoId = context.story.coverPhotoId || initialPhotoIds[0];
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
          setSelectedPhotoIds(new Set(initialPhotoIds));
          setCoverPhotoId(initialCoverPhotoId);
           setCoverPhotoPosition(context.story.coverPhotoPosition || DEFAULT_COVER_POSITION);
           setCoverPhotoMobilePosition(context.story.coverPhotoMobilePosition || context.story.coverPhotoPosition || DEFAULT_COVER_POSITION);
            setCoverPhotoCardPosition(context.story.coverPhotoCardPosition || context.story.coverPhotoPosition || DEFAULT_COVER_POSITION);
            setCoverPhotoCardMobilePosition(context.story.coverPhotoCardMobilePosition || context.story.coverPhotoMobilePosition || context.story.coverPhotoPosition || DEFAULT_COVER_POSITION);
           setPhotoAltTexts(context.story.photoAltTexts || {});
           lastSavedSelection.current = photoSelectionSignature(
             initialPhotoIds,
             initialCoverPhotoId,
             context.story.photoAltTexts || {},
             context.story.coverPhotoPosition || DEFAULT_COVER_POSITION,
             context.story.coverPhotoMobilePosition || context.story.coverPhotoPosition || DEFAULT_COVER_POSITION,
              context.story.coverPhotoCardPosition || context.story.coverPhotoPosition || DEFAULT_COVER_POSITION,
              context.story.coverPhotoCardMobilePosition || context.story.coverPhotoMobilePosition || context.story.coverPhotoPosition || DEFAULT_COVER_POSITION,
           );
        } else {
          setSlugIsCustom(false);
          setSelectedPhotoIds(new Set());
          setCoverPhotoId(undefined);
           setCoverPhotoPosition(DEFAULT_COVER_POSITION);
           setCoverPhotoMobilePosition(DEFAULT_COVER_POSITION);
            setCoverPhotoCardPosition(DEFAULT_COVER_POSITION);
            setCoverPhotoCardMobilePosition(DEFAULT_COVER_POSITION);
           setPhotoAltTexts({});
           lastSavedSelection.current = photoSelectionSignature([]);
        }
        selectionInitialized.current = true;
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

  const chapterOptions = useMemo(() => {
    const chapters = [...(gallery.chapters || [])].sort((a, b) => {
      const orderA = gallery.chaptersOrder?.indexOf(a.id) ?? -1;
      const orderB = gallery.chaptersOrder?.indexOf(b.id) ?? -1;
      if (orderA >= 0 && orderB >= 0 && orderA !== orderB) return orderA - orderB;
      if (orderA >= 0) return -1;
      if (orderB >= 0) return 1;
      return (a.ordine ?? 0) - (b.ordine ?? 0);
    });
    const options = [{ id: '__all__', title: 'Tutte le foto', count: photos.length }];
    options.push(...chapters.map(chapter => ({
      id: chapter.id,
      title: chapter.titolo || 'Capitolo senza titolo',
      count: photos.filter(photo => photo.chapterId === chapter.id).length,
    })));
    const unassignedCount = photos.filter(photo => !photo.chapterId).length;
    if (unassignedCount > 0) options.push({ id: '__unassigned__', title: 'Senza capitolo', count: unassignedCount });
    return options;
  }, [gallery.chapters, gallery.chaptersOrder, photos]);
  const chapterPhotos = useMemo(() => {
    const filteredPhotos = activeChapterId === '__all__'
      ? photos
      : activeChapterId === '__unassigned__'
        ? photos.filter(photo => !photo.chapterId)
        : photos.filter(photo => photo.chapterId === activeChapterId);

    // Mantieni subito visibili le foto già associate alla storia, senza
    // cambiare l'ordine relativo delle foto selezionate o non selezionate.
    return [...filteredPhotos].sort((a, b) => {
      const aSelected = selectedPhotoIds.has(a.id) ? 1 : 0;
      const bSelected = selectedPhotoIds.has(b.id) ? 1 : 0;
      return bSelected - aSelected;
    });
  }, [activeChapterId, photos, selectedPhotoIds]);
  const visiblePhotos = useMemo(
    () => visibleWeddingPhotos(chapterPhotos, visiblePhotoCount),
    [chapterPhotos, visiblePhotoCount],
  );
  const activeChapterIndex = Math.max(0, chapterOptions.findIndex(option => option.id === activeChapterId));
  const activeChapter = chapterOptions[activeChapterIndex] || chapterOptions[0];
  const selectChapter = (chapterId: string) => {
    setActiveChapterId(chapterId);
    setVisiblePhotoCount(WEDDING_PHOTO_PAGE_SIZE);
  };
  useEffect(() => {
    if (!chapterOptions.some(option => option.id === activeChapterId)) setActiveChapterId('__all__');
    setVisiblePhotoCount(WEDDING_PHOTO_PAGE_SIZE);
  }, [chapterOptions, activeChapterId]);
  const authorizedSources = sources.filter(source => source.consentGranted);
  const legacySources = sources.filter(source => source.legacyImported);
  const authorizedSourceIds = new Set(authorizedSources.map(source => source.id));
  const availablePhotoIds = new Set(photos.map(photo => photo.id));
  const validSelectedSourceIds = [...selectedSourceIds].filter(id => authorizedSourceIds.has(id));
  const validSelectedPhotoIds = [...selectedPhotoIds]
    .filter(id => availablePhotoIds.has(id))
    .slice(0, MAX_WEDDING_STORY_PHOTOS);
  const validCoverPhotoId = coverPhotoId && validSelectedPhotoIds.includes(coverPhotoId)
    ? coverPhotoId
    : validSelectedPhotoIds[0];
  const coverPhoto = photos.find(photo => photo.id === validCoverPhotoId);
  const activeCoverPosition = coverEditorMode === 'desktop'
    ? coverPhotoPosition
    : coverEditorMode === 'mobile'
      ? coverPhotoMobilePosition
      : coverEditorMode === 'card-desktop'
        ? coverPhotoCardPosition
        : coverPhotoCardMobilePosition;
  const coverEditorFrameClass = coverEditorMode === 'desktop'
    ? 'aspect-[3.6/1]'
    : coverEditorMode === 'mobile'
      ? 'max-w-[280px] aspect-[5/6]'
      : 'max-w-[360px] aspect-[4/3]';
  const coverEditorModeLabel = coverEditorMode === 'desktop'
    ? 'hero desktop'
    : coverEditorMode === 'mobile'
      ? 'hero smartphone'
      : coverEditorMode === 'card-desktop'
        ? 'card desktop'
        : 'card smartphone';
  const updateCoverPosition = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = {
      x: Math.round(Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100))),
      y: Math.round(Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100))),
    };
    if (coverEditorMode === 'desktop') setCoverPhotoPosition(position);
    else if (coverEditorMode === 'mobile') setCoverPhotoMobilePosition(position);
    else if (coverEditorMode === 'card-desktop') setCoverPhotoCardPosition(position);
    else setCoverPhotoCardMobilePosition(position);
  };
  const coverPositionStyle = (position: WeddingCoverPosition) => ({
    objectPosition: `${position.x}% ${position.y}%`,
  });
  const validPhotoAltTexts = Object.fromEntries(
    validSelectedPhotoIds
      .map(photoId => [photoId, String(photoAltTexts[photoId] || '').trim().slice(0, 200)] as const)
      .filter(([, alt]) => Boolean(alt)),
  );
  const displayedVendorReviews = sources
    .filter(source => source.category === 'vendor' && validSelectedSourceIds.includes(source.id))
    .flatMap(source => normalizeInfoFormVendors(source.value).map(vendor => {
      const existing = vendorReviews.find(review => (
        review.sourceId === source.id && review.requestedName === vendor.name
      ));
      return existing || {
        id: `${source.id}:${vendor.name}`,
        sourceId: source.id,
        requestedName: vendor.name,
        category: vendor.category || undefined,
        location: vendor.location || undefined,
        status: 'pending' as const,
        reason: 'La verifica online verrà eseguita durante la generazione della bozza.',
      };
    }));
  const storyBlocks = useMemo(() => parseWeddingStoryMarkdown(draft.story), [draft.story]);
  const currentSelectionSignature = photoSelectionSignature(
    validSelectedPhotoIds,
    validCoverPhotoId,
    validPhotoAltTexts,
    coverPhotoPosition,
    coverPhotoMobilePosition,
    coverPhotoCardPosition,
    coverPhotoCardMobilePosition,
  );

  useEffect(() => {
    if (loading || !selectionInitialized.current || currentSelectionSignature === lastSavedSelection.current) return;
    setSelectionSaveState('saving');
    const timer = window.setTimeout(() => {
      const selection = JSON.parse(currentSelectionSignature) as {
        photoIds: string[];
        coverPhotoId: string;
        photoAltTexts: Record<string, string>;
        coverPhotoPosition: WeddingCoverPosition;
        coverPhotoMobilePosition: WeddingCoverPosition;
        coverPhotoCardPosition: WeddingCoverPosition;
        coverPhotoCardMobilePosition: WeddingCoverPosition;
      };
      const saveVersion = ++selectionSaveVersion.current;
      const request = selectionSaveQueue.current.then(
          () => saveWeddingStorySelection(gallery.id, selection.photoIds, selection.coverPhotoId || undefined, selection.photoAltTexts, selection.coverPhotoPosition, selection.coverPhotoMobilePosition, selection.coverPhotoCardPosition, selection.coverPhotoCardMobilePosition),
          () => saveWeddingStorySelection(gallery.id, selection.photoIds, selection.coverPhotoId || undefined, selection.photoAltTexts, selection.coverPhotoPosition, selection.coverPhotoMobilePosition, selection.coverPhotoCardPosition, selection.coverPhotoCardMobilePosition),
      );
      selectionSaveQueue.current = request.then(() => undefined, () => undefined);
      request
        .then(saved => {
          if (saveVersion !== selectionSaveVersion.current) return;
           lastSavedSelection.current = photoSelectionSignature(
             saved.selectedPhotoIds,
             saved.coverPhotoId,
             saved.photoAltTexts || {},
             saved.coverPhotoPosition || DEFAULT_COVER_POSITION,
             saved.coverPhotoMobilePosition || saved.coverPhotoPosition || DEFAULT_COVER_POSITION,
              saved.coverPhotoCardPosition || saved.coverPhotoPosition || DEFAULT_COVER_POSITION,
              saved.coverPhotoCardMobilePosition || saved.coverPhotoMobilePosition || saved.coverPhotoPosition || DEFAULT_COVER_POSITION,
           );
          setSelectionSaveState('saved');
        })
        .catch(() => {
          if (saveVersion === selectionSaveVersion.current) setSelectionSaveState('error');
        });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [currentSelectionSignature, gallery.id, loading]);

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
    const next = new Set(selectedPhotoIds);
    if (next.has(photoId)) {
      next.delete(photoId);
      setPhotoAltTexts(current => {
        const nextAltTexts = { ...current };
        delete nextAltTexts[photoId];
        return nextAltTexts;
      });
      if (coverPhotoId === photoId) {
        setCoverPhotoId([...next][0]);
        setCoverPhotoPosition(DEFAULT_COVER_POSITION);
        setCoverPhotoMobilePosition(DEFAULT_COVER_POSITION);
        setCoverPhotoCardPosition(DEFAULT_COVER_POSITION);
        setCoverPhotoCardMobilePosition(DEFAULT_COVER_POSITION);
      }
    } else if (validSelectedPhotoIds.length < MAX_WEDDING_STORY_PHOTOS) {
      next.add(photoId);
      if (!coverPhotoId) setCoverPhotoId(photoId);
    } else {
      toast({ title: 'Limite raggiunto', description: `Puoi usare fino a ${MAX_WEDDING_STORY_PHOTOS} fotografie per una storia.` });
      return;
    }
    setSelectedPhotoIds(next);
  };

  const chooseCoverPhoto = (photoId: string) => {
    if (!selectedPhotoIds.has(photoId)) {
      if (validSelectedPhotoIds.length >= MAX_WEDDING_STORY_PHOTOS) {
        toast({ title: 'Limite raggiunto', description: 'Deseleziona una fotografia prima di scegliere questa copertina.' });
        return;
      }
      setSelectedPhotoIds(new Set(selectedPhotoIds).add(photoId));
    }
    if (coverPhotoId !== photoId) {
      setCoverPhotoPosition(DEFAULT_COVER_POSITION);
      setCoverPhotoMobilePosition(DEFAULT_COVER_POSITION);
      setCoverPhotoCardPosition(DEFAULT_COVER_POSITION);
      setCoverPhotoCardMobilePosition(DEFAULT_COVER_POSITION);
    }
    setCoverPhotoId(photoId);
  };

  const refreshSources = async () => {
    setRefreshingSources(true);
    setError(undefined);
    try {
      const context = await getWeddingStoryEditor(gallery.id);
      setSources(context.sources);
      setVendorReviews(context.vendorReviews);
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
      setVendorReviews(generated.vendorReviews);
      if (generated.fallbackUsed) {
        setWarning(generated.fallbackReason || 'È stata preparata una bozza di sicurezza modificabile.');
      } else {
        setWarning(undefined);
      }
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
        title: generated.fallbackUsed ? 'Bozza pronta con modalità di sicurezza' : 'Bozza IA generata',
        description: generated.fallbackUsed
          ? 'La generazione IA non è andata a buon fine, ma ho preparato un articolo modificabile dai dati reali. Salvalo per conservarlo.'
          : 'Rileggila e modificala liberamente. Non è stata salvata né pubblicata.',
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
        photoAltTexts: validPhotoAltTexts,
        coverPhotoId: validCoverPhotoId,
         coverPhotoPosition,
         coverPhotoMobilePosition,
         coverPhotoCardPosition,
         coverPhotoCardMobilePosition,
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
      setCoverPhotoId(saved.coverPhotoId || saved.selectedPhotoIds[0]);
       setCoverPhotoPosition(saved.coverPhotoPosition || DEFAULT_COVER_POSITION);
       setCoverPhotoMobilePosition(saved.coverPhotoMobilePosition || saved.coverPhotoPosition || DEFAULT_COVER_POSITION);
       setCoverPhotoCardPosition(saved.coverPhotoCardPosition || saved.coverPhotoPosition || DEFAULT_COVER_POSITION);
       setCoverPhotoCardMobilePosition(saved.coverPhotoCardMobilePosition || saved.coverPhotoMobilePosition || saved.coverPhotoPosition || DEFAULT_COVER_POSITION);
      setPhotoAltTexts(saved.photoAltTexts || {});
      const publicStoryUrl = createUrl(`/real-wedding/${saved.slug}`);
      toast({
        title: nextStatus === 'published' ? 'Storia pubblicata' : 'Bozza privata salvata',
        description: nextStatus === 'published'
          ? `Pagina disponibile su ${publicStoryUrl}`
          : 'Il contenuto resta privato e non indicizzato.',
        action: nextStatus === 'published' ? (
          <ToastAction
            altText="Apri la storia pubblicata in una nuova finestra"
            onClick={() => window.open(publicStoryUrl, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="mr-1 h-3.5 w-3.5" />
            Apri in nuova finestra
          </ToastAction>
        ) : undefined,
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
             <span className="block text-xs font-normal text-gray-500">Puoi inserire link usando: [testo](https://sito.it)</span>
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
                    {block.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}><WeddingStoryInline text={paragraph} /></p>)}
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

      {displayedVendorReviews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5" /> Verifica fornitori approvati
            </CardTitle>
            <CardDescription>
              Riepilogo della verifica online sui fornitori autorizzati e selezionati manualmente.
              Solo i riferimenti verificati ricevono un collegamento; i match incerti restano privati.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {displayedVendorReviews.map(review => {
              const status = review.status === 'verified'
                ? {
                    label: 'Verificato',
                    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
                    icon: <CheckCircle2 className="mr-1 h-3.5 w-3.5" />,
                  }
                : review.status === 'uncertain'
                  ? {
                      label: 'Match incerto',
                      className: 'border-amber-200 bg-amber-50 text-amber-800',
                      icon: <AlertCircle className="mr-1 h-3.5 w-3.5" />,
                    }
                  : review.status === 'not_found'
                    ? {
                        label: 'Nessun collegamento verificato',
                        className: 'border-gray-200 bg-gray-50 text-gray-700',
                        icon: <AlertCircle className="mr-1 h-3.5 w-3.5" />,
                      }
                    : {
                        label: 'In attesa di verifica',
                        className: 'border-blue-200 bg-blue-50 text-blue-800',
                        icon: <RefreshCw className="mr-1 h-3.5 w-3.5" />,
                      };
              return (
                <div
                  key={review.id}
                  className={`rounded-lg border p-3 ${review.status === 'uncertain' ? 'border-amber-300 bg-amber-50/40' : 'bg-white'}`}
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{review.requestedName}</p>
                      <p className="text-sm text-gray-600">
                        {[review.category, review.location].filter(Boolean).join(' · ') || 'Categoria e luogo non specificati'}
                      </p>
                    </div>
                    <Badge variant="outline" className={status.className}>
                      {status.icon}
                      {status.label}
                    </Badge>
                  </div>
                  {review.status === 'verified' && review.url ? (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <a
                        href={review.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center font-medium text-sky-700 underline underline-offset-2"
                      >
                        {review.verifiedName || review.requestedName}
                        <ExternalLink className="ml-1 h-3.5 w-3.5" />
                      </a>
                      <span className="text-gray-600">
                        Fonte: {review.sourceKind === 'instagram' ? 'Instagram' : 'sito web'}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-gray-600">{review.reason}</p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

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
            Mostrate solo dal Job <strong>{gallery.jobId || 'non associato'}</strong>. Seleziona manualmente ciò che Gemini può ricevere.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {legacySources.length > 0 && (
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              <strong>{legacySources.length} risposte storiche recuperate.</strong>{' '}
              Provengono da moduli completati prima dei nuovi campi editoriali: restano escluse da Gemini finché non le selezioni singolarmente.
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
            Seleziona fino a {MAX_WEDDING_STORY_PHOTOS} foto e usa la stella per scegliere la copertina del blog. Selezionate {validSelectedPhotoIds.length}/{MAX_WEDDING_STORY_PHOTOS}.
          </CardDescription>
           {coverPhoto && (
             <div className="flex flex-wrap items-center gap-3 pt-2">
               <Button
                 type="button"
                 variant="outline"
                 size="sm"
                 onClick={() => setCoverEditorOpen(true)}
               >
                 <ImageIcon className="mr-2 h-4 w-4" />
                 Posiziona copertina
               </Button>
               <span className="text-xs text-gray-500">
                 Copertina: {coverPhoto.name} · desktop {coverPhotoPosition.x}%/{coverPhotoPosition.y}% · mobile {coverPhotoMobilePosition.x}%/{coverPhotoMobilePosition.y}%
               </span>
             </div>
           )}
          <p className={`text-xs ${selectionSaveState === 'error' ? 'text-red-600' : 'text-gray-500'}`}>
            {selectionSaveState === 'saving' && 'Salvataggio automatico della selezione…'}
             {selectionSaveState === 'saved' && 'Selezione foto, copertina e testi alternativi salvati automaticamente.'}
             {selectionSaveState === 'error' && 'Salvataggio automatico non riuscito: la selezione resta visibile, ma ricaricando la pagina potrebbe andare persa.'}
             {selectionSaveState === 'idle' && 'La selezione foto, copertina e testi alternativi vengono salvati automaticamente.'}
          </p>
        </CardHeader>
        <CardContent>
           {chapterOptions.length > 1 && (
             <div className="mb-4 rounded-lg border bg-stone-50/70 p-3">
               <div className="mb-2 flex items-center justify-between gap-2">
                 <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Capitolo da assegnare</p>
                 <span className="text-xs text-gray-500">{activeChapter?.count || 0} foto</span>
               </div>
               <div className="flex items-center gap-2">
                 <Button
                   type="button"
                   variant="outline"
                   size="icon"
                   aria-label="Capitolo precedente"
                   disabled={activeChapterIndex <= 0}
                   onClick={() => selectChapter(chapterOptions[activeChapterIndex - 1].id)}
                 >
                   <ChevronLeft className="h-4 w-4" />
                 </Button>
                 <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                   {chapterOptions.map(option => (
                     <Button
                       key={option.id}
                       type="button"
                       variant={option.id === activeChapterId ? 'default' : 'outline'}
                       size="sm"
                       className="shrink-0"
                       onClick={() => selectChapter(option.id)}
                     >
                       {option.title} <span className="ml-1 opacity-70">({option.count})</span>
                     </Button>
                   ))}
                 </div>
                 <Button
                   type="button"
                   variant="outline"
                   size="icon"
                   aria-label="Capitolo successivo"
                   disabled={activeChapterIndex >= chapterOptions.length - 1}
                   onClick={() => selectChapter(chapterOptions[activeChapterIndex + 1].id)}
                 >
                   <ChevronRight className="h-4 w-4" />
                 </Button>
               </div>
             </div>
           )}
           {chapterPhotos.length === 0 ? (
             <p className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">
               Nessuna foto in questo capitolo.
             </p>
           ) : (
           <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {visiblePhotos.map(photo => {
              const selected = selectedPhotoIds.has(photo.id);
              const isCover = validCoverPhotoId === photo.id;
              return (
                 <div key={photo.id} className="min-w-0">
                   <div className={`relative aspect-square overflow-hidden rounded-lg border-2 ${isCover ? 'border-amber-500 ring-2 ring-amber-300/60' : selected ? 'border-sage ring-2 ring-sage/30' : 'border-gray-200'}`} style={{ contentVisibility: 'auto', containIntrinsicSize: '120px 120px' }}>
                     <img src={weddingPhotoPreview(photo)} alt={photo.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                     <button type="button" aria-label={`Seleziona ${photo.name}`} className="absolute inset-0" onClick={() => togglePhoto(photo.id)} />
                     <Checkbox checked={selected} className="pointer-events-none absolute left-2 top-2 bg-white" />
                     <Button
                       type="button"
                       variant={isCover ? 'default' : 'secondary'}
                       size="icon"
                       aria-label={isCover ? `${photo.name} è la copertina` : `Usa ${photo.name} come copertina`}
                       title={isCover ? 'Copertina attuale' : 'Imposta come copertina'}
                       className={`absolute right-1 top-1 h-7 w-7 ${isCover ? 'bg-amber-500 hover:bg-amber-600' : ''}`}
                       onClick={event => { event.stopPropagation(); chooseCoverPhoto(photo.id); }}
                     >
                       <Star className={`h-3.5 w-3.5 ${isCover ? 'fill-current' : ''}`} />
                     </Button>
                     <Button type="button" variant="secondary" size="icon" className="absolute bottom-1 right-1 h-7 w-7" onClick={event => { event.stopPropagation(); setViewer(photo); }}>
                       <Eye className="h-3.5 w-3.5" />
                     </Button>
                   </div>
                   <Input
                     value={photoAltTexts[photo.id] || ''}
                     maxLength={200}
                     placeholder="Testo alt"
                     aria-label={`Testo alternativo per ${photo.name}`}
                     className={`mt-2 h-8 text-xs ${selected ? '' : 'bg-gray-50'}`}
                     onClick={event => event.stopPropagation()}
                     onChange={event => setPhotoAltTexts(current => ({ ...current, [photo.id]: event.target.value }))}
                   />
                </div>
              );
            })}
           </div>
           )}
           {visiblePhotoCount < chapterPhotos.length && (
            <div className="mt-4 text-center"><Button variant="outline" onClick={() => setVisiblePhotoCount(count => count + WEDDING_PHOTO_PAGE_SIZE)}>Mostra altre 60 foto</Button></div>
          )}
           <p className="mt-3 text-xs text-gray-500">Il testo alt è associato alla foto quando la selezioni per la storia. Se lasciato vuoto, la pagina userà il capitolo o il titolo della storia come fallback.</p>
        </CardContent>
      </Card>

       <Dialog open={coverEditorOpen} onOpenChange={setCoverEditorOpen}>
         <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
           <DialogHeader>
             <DialogTitle>Posiziona la copertina</DialogTitle>
             <DialogDescription>
               Clicca o trascina il punto focale sull’immagine. Le due posizioni vengono applicate automaticamente ai ritagli desktop e smartphone del sito.
             </DialogDescription>
           </DialogHeader>
           {coverPhoto && (
             <div className="space-y-5">
               <div className="flex flex-wrap gap-2">
                 <Button
                   type="button"
                   size="sm"
                   variant={coverEditorMode === 'desktop' ? 'default' : 'outline'}
                   onClick={() => setCoverEditorMode('desktop')}
                 >
                   Desktop
                 </Button>
                 <Button
                   type="button"
                   size="sm"
                   variant={coverEditorMode === 'mobile' ? 'default' : 'outline'}
                   onClick={() => setCoverEditorMode('mobile')}
                 >
                   Smartphone
                 </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={coverEditorMode === 'card-desktop' ? 'default' : 'outline'}
                    onClick={() => setCoverEditorMode('card-desktop')}
                  >
                    Card desktop
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={coverEditorMode === 'card-mobile' ? 'default' : 'outline'}
                    onClick={() => setCoverEditorMode('card-mobile')}
                  >
                    Card smartphone
                  </Button>
                 <span className="self-center text-xs text-gray-500">
                   Posizione {activeCoverPosition.x}% orizzontale · {activeCoverPosition.y}% verticale
                 </span>
               </div>

               <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)]">
                 <div>
                   <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Editor · {coverEditorModeLabel}
                   </p>
                   <div
                      className={`relative mx-auto max-h-[420px] w-full overflow-hidden rounded-xl border-2 border-sage/40 bg-gray-100 touch-none ${coverEditorFrameClass}`}
                     onPointerDown={event => {
                       event.currentTarget.setPointerCapture(event.pointerId);
                       updateCoverPosition(event);
                     }}
                     onPointerMove={event => {
                       if (event.currentTarget.hasPointerCapture(event.pointerId)) updateCoverPosition(event);
                     }}
                   >
                     <img
                       src={coverPhoto.url}
                       alt={coverPhoto.name}
                       className="h-full w-full select-none object-cover"
                       draggable={false}
                       style={coverPositionStyle(activeCoverPosition)}
                     />
                     <div
                       className="pointer-events-none absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg"
                       style={{ left: `${activeCoverPosition.x}%`, top: `${activeCoverPosition.y}%` }}
                     >
                       <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                     </div>
                   </div>
                   <p className="mt-2 text-center text-xs text-gray-500">Trascina o clicca sull’immagine per scegliere il soggetto da mantenere nel ritaglio.</p>
                 </div>

                 <div className="space-y-4">
                   <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Anteprime reali</p>
                   <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 space-y-1.5">
                        <p className="text-xs font-medium text-gray-600">Pagina Real Wedding completa · desktop</p>
                        <div className="mx-auto aspect-[16/10] max-w-[760px] overflow-hidden rounded-lg border bg-[#f7f3ed]">
                          <div className="flex h-[30%] flex-col items-center justify-center gap-1 px-5 text-center">
                            <span className="text-[7px] font-semibold uppercase tracking-[0.25em] text-[#6b7f6b]">Real Wedding · Image Studio</span>
                            <span className="line-clamp-2 max-w-[90%] font-playfair text-sm leading-tight text-gray-800">{draft.title || 'Titolo della storia'}</span>
                            <span className="line-clamp-2 max-w-[80%] text-[8px] leading-tight text-gray-500">{draft.excerpt || 'Descrizione della storia fotografica'}</span>
                          </div>
                          <div className="h-[55%] overflow-hidden bg-gray-100">
                            <img src={coverPhoto.url} alt="" className="h-full w-full object-cover" style={coverPositionStyle(coverPhotoPosition)} />
                          </div>
                        </div>
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <p className="text-xs font-medium text-gray-600">Pagina Real Wedding completa · smartphone</p>
                        <div className="mx-auto aspect-[9/16] max-w-[220px] overflow-hidden rounded-lg border bg-[#f7f3ed]">
                          <div className="flex h-[30%] flex-col items-center justify-center gap-1 px-3 text-center">
                            <span className="text-[5px] font-semibold uppercase tracking-[0.2em] text-[#6b7f6b]">Real Wedding</span>
                            <span className="line-clamp-3 max-w-full font-playfair text-[11px] leading-tight text-gray-800">{draft.title || 'Titolo della storia'}</span>
                            <span className="line-clamp-3 max-w-full text-[6px] leading-tight text-gray-500">{draft.excerpt || 'Descrizione della storia fotografica'}</span>
                          </div>
                          <div className="h-[55%] overflow-hidden bg-gray-100">
                            <img src={coverPhoto.url} alt="" className="h-full w-full object-cover" style={coverPositionStyle(coverPhotoMobilePosition)} />
                          </div>
                        </div>
                      </div>
                     <div className="space-y-1.5">
                       <p className="text-xs font-medium text-gray-600">Pagina Real Wedding · desktop · hero 55vh</p>
                       <div className="aspect-[3.6/1] overflow-hidden rounded-lg bg-gray-100">
                         <img src={coverPhoto.url} alt="" className="h-full w-full object-cover" style={coverPositionStyle(coverPhotoPosition)} />
                       </div>
                     </div>
                     <div className="space-y-1.5">
                       <p className="text-xs font-medium text-gray-600">Pagina Real Wedding · smartphone · hero 55vh</p>
                       <div className="aspect-[5/6] overflow-hidden rounded-lg bg-gray-100">
                         <img src={coverPhoto.url} alt="" className="h-full w-full object-cover" style={coverPositionStyle(coverPhotoMobilePosition)} />
                       </div>
                     </div>
                     <div className="space-y-1.5">
                       <p className="text-xs font-medium text-gray-600">Card Blog/Home · desktop</p>
                       <div className="aspect-[4/3] overflow-hidden rounded-lg bg-gray-100">
                          <img src={coverPhoto.url} alt="" className="h-full w-full object-cover" style={coverPositionStyle(coverPhotoCardPosition)} />
                       </div>
                     </div>
                     <div className="space-y-1.5">
                       <p className="text-xs font-medium text-gray-600">Card Blog/Home · smartphone</p>
                       <div className="aspect-[4/3] overflow-hidden rounded-lg bg-gray-100">
                          <img src={coverPhoto.url} alt="" className="h-full w-full object-cover" style={coverPositionStyle(coverPhotoCardMobilePosition)} />
                       </div>
                     </div>
                   </div>
                 </div>
               </div>
               <div className="flex justify-end">
                 <Button type="button" onClick={() => setCoverEditorOpen(false)}>Fatto</Button>
               </div>
             </div>
           )}
         </DialogContent>
       </Dialog>

      <Dialog open={viewer !== null} onOpenChange={open => { if (!open) setViewer(null); }}>
        <DialogContent className="max-w-5xl">
          <DialogHeader><DialogTitle>{viewer?.name}</DialogTitle><DialogDescription>Anteprima a piena qualità caricata su richiesta.</DialogDescription></DialogHeader>
          {viewer && <img src={viewer.url} alt={viewer.name} className="max-h-[75vh] w-full object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
