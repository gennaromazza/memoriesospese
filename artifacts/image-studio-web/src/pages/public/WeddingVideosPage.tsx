import { useState, useEffect, useRef } from 'react';
import { Play, Loader2, Eye, Heart, Share2, ArrowUpRight, ChevronLeft, ChevronRight, CirclePlay } from 'lucide-react';
import Navigation from '@/components/Navigation';
import WeddingVideoService from '@/lib/weddingVideos';
import { getActiveJobTypes } from '@/lib/job-types';
import type { WeddingVideo } from '@shared/schema';
import type { JobTypeFE as JobType } from '@shared/job-types';
import type { PublicWeddingVideoAssociation } from '@shared/wedding-seo-types';
import { getPublicWeddingVideoAssociations } from '@/lib/wedding-seo';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSEO } from "@/hooks/useSEO";

// Helper per estrarre ID YouTube
function getYouTubeVideoId(url: string): string {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : '';
}

// Helper per generare likes casuali (400-1200)
function getRandomLikes(videoId: string): number {
  // Usa l'ID del video come seed per generare un numero consistente
  const seed = videoId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return 400 + (seed % 800);
}

// Helper per generare visualizzazioni casuali (8k-25k + views reali)
function getRandomBaseViews(videoId: string): number {
  const seed = videoId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return 8000 + (seed % 17000);
}

function VideoRail({ children, label, itemCount, eyebrow, title, titleId }: {
  children: React.ReactNode;
  label: string;
  itemCount: number;
  eyebrow: string;
  title: string;
  titleId: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const syncScrollButtons = () => {
      const firstItem = rail.firstElementChild as HTMLElement | null;
      const scrollportLeft = rail.getBoundingClientRect().left + rail.clientLeft;
      setCanScrollLeft(
        firstItem
          ? firstItem.getBoundingClientRect().left < scrollportLeft - 8
          : rail.scrollLeft > 8
      );
      setCanScrollRight(rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 8);
    };

    syncScrollButtons();
    rail.addEventListener('scroll', syncScrollButtons, { passive: true });
    window.addEventListener('resize', syncScrollButtons);
    const resizeObserver = new ResizeObserver(syncScrollButtons);
    resizeObserver.observe(rail);

    return () => {
      rail.removeEventListener('scroll', syncScrollButtons);
      window.removeEventListener('resize', syncScrollButtons);
      resizeObserver.disconnect();
    };
  }, [itemCount]);

  const scroll = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
    rail.scrollBy({ left: direction * Math.max(rail.clientWidth * 0.82, 280), behavior });
  };

  return (
    <section aria-labelledby={titleId} className="mb-11 md:mb-14">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-terracotta">{eyebrow}</p>
          <h2 id={titleId} className="font-playfair text-[22px] leading-tight text-[#F4EFE8] md:text-[28px]">{title}</h2>
        </div>
        {itemCount > 1 && (
          <div className="hidden gap-2 md:flex">
            <button
              type="button"
              aria-label={`Film precedenti: ${title}`}
              disabled={!canScrollLeft}
              onClick={() => scroll(-1)}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-[#1A211E] text-[#D8DED6] transition hover:border-sage hover:text-white disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-white/15 disabled:hover:text-[#D8DED6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`Film successivi: ${title}`}
              disabled={!canScrollRight}
              onClick={() => scroll(1)}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-[#1A211E] text-[#D8DED6] transition hover:border-sage hover:text-white disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-white/15 disabled:hover:text-[#D8DED6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
        <div
          ref={railRef}
          role="region"
          aria-label={label}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              scroll(event.key === 'ArrowLeft' ? -1 : 1);
            }
          }}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-4 pt-1 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-4 sm:px-6 lg:px-8 motion-reduce:scroll-auto"
        >
          {children}
        </div>
      </div>
    </section>
  );
}

// VideoCard component
function VideoCard({ video, onClick, onLike, onShare, isLiked, likeCount, realWedding, cardClassName }: {
  video: WeddingVideo; 
  onClick: () => void;
  onLike: (e: React.MouseEvent) => void;
  onShare: (e: React.MouseEvent) => void;
  isLiked: boolean;
  likeCount: number;
  realWedding?: PublicWeddingVideoAssociation;
  cardClassName: string;
}) {
  // Visualizzazioni: base casuale + conteggio reale
  const displayViews = getRandomBaseViews(video.id) + (video.views || 0);
  const previewDescription = realWedding?.excerpt || video.description;

  return (
    <article className={`group shrink-0 snap-start overflow-hidden rounded-[13px] border border-white/[0.08] bg-[#202924] shadow-sm shadow-black/15 transition-all duration-300 hover:-translate-y-1 hover:border-sage/55 hover:shadow-xl ${cardClassName}`}>
      <button
        type="button"
        onClick={onClick}
        aria-label={`Apri la descrizione del video: ${video.title}`}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sage"
      >
        <div className="relative aspect-video overflow-hidden bg-black">
          <img
            src={video.thumbnailUrl}
            alt={`Anteprima del video: ${video.title}`}
            width={1280}
            height={720}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
          />
          <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#111714]/65 via-transparent to-black/5" />
          {video.duration && (
            <span className="absolute bottom-2 right-2 rounded bg-black/75 px-2 py-1 text-[10px] font-semibold text-white/90">
              {video.duration}
            </span>
          )}
          <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <span className="grid h-12 w-12 place-items-center rounded-full border border-white/60 bg-[#111714]/50 text-white shadow-lg backdrop-blur-sm">
              <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true" />
            </span>
          </span>
        </div>
        <div className="px-3.5 pb-3 pt-2.5 sm:px-4 sm:pb-4">
          <h3 className="truncate text-sm font-bold text-[#F4EFE8] sm:text-[15px]">{video.title}</h3>
          <p className="mt-1 text-[10px] font-medium text-sage/80">{video.category || 'Film di matrimonio'}</p>
          {previewDescription && (
            <p className="mt-2 line-clamp-2 min-h-[34px] text-[11px] leading-[1.55] text-[#D8DED6]/80">
              {previewDescription}
            </p>
          )}
        </div>
      </button>
      <div className="flex items-center justify-between gap-3 px-3.5 pb-3 sm:px-4 sm:pb-4">
        <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-[#C7CEC7]/65">
          <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{displayViews.toLocaleString('it-IT')} visualizzazioni</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={onLike}
            aria-pressed={isLiked}
            aria-label={isLiked ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
            className={`flex items-center gap-1 rounded-md text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${isLiked ? 'text-terracotta' : 'text-[#C7CEC7]/70 hover:text-terracotta'}`}
          >
            <Heart className={`h-3.5 w-3.5 ${isLiked ? 'fill-current' : ''}`} aria-hidden="true" />
            <span className="font-semibold">{likeCount.toLocaleString('it-IT')}</span>
          </button>
          <button
            type="button"
            onClick={onShare}
            aria-label={`Condividi il video: ${video.title}`}
            className="rounded-md p-1 text-[#C7CEC7]/70 transition-colors hover:text-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function WeddingVideosPage() {
  const [videos, setVideos] = useState<WeddingVideo[]>([]);
  const [featuredVideos, setFeaturedVideos] = useState<WeddingVideo[]>([]);
  const [realWeddingByVideoSlug, setRealWeddingByVideoSlug] = useState<Record<string, PublicWeddingVideoAssociation>>({});
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<WeddingVideo | null>(null);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [likedVideos, setLikedVideos] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const { toast } = useToast();

  useSEO({
    title: "Video di matrimonio ad Aversa | Image Vision",
    description: "Guarda i film di matrimonio di Image Studio ad Aversa, Napoli e Caserta: racconti cinematografici autentici da rivivere insieme.",
    canonical: "/vision",
    ogType: "website",
    ogImage: "/images/image-vision-social.jpg",
    ogImageAlt: "Image Vision di Image Studio: film di matrimonio raccontati con uno stile cinematografico",
    ogImageWidth: 1200,
    ogImageHeight: 630,
    ogImageType: "image/jpeg",
    ogImageSource: "curated-static",
    keywords: "film di matrimonio aversa, video matrimonio napoli, videografo matrimonio caserta, video matrimoniali campania",
  });

  useEffect(() => {
    loadVideos();
    loadJobTypes();
    getPublicWeddingVideoAssociations()
      .then(associations => {
        setRealWeddingByVideoSlug(Object.fromEntries(
          associations.map(association => [association.videoSlug, association])
        ));
      })
      .catch(error => console.error('Errore caricamento Real Wedding collegati ai video:', error));
  }, []);

  const loadVideos = async () => {
    setLoading(true);
    try {
      const [allVideos, featured] = await Promise.all([
        WeddingVideoService.getAllVideos(),
        WeddingVideoService.getFeaturedVideos()
      ]);

      setVideos(allVideos);
      setFeaturedVideos(featured);

      // Inizializza i contatori like con valori casuali
      const initialCounts: Record<string, number> = {};
      allVideos.forEach(video => {
        initialCounts[video.id] = getRandomLikes(video.id);
      });
      setLikeCounts(initialCounts);
    } catch (error) {
      console.error('Errore caricamento video:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadJobTypes = async () => {
    try {
      const types = await getActiveJobTypes();
      setJobTypes(types);
    } catch (error) {
      console.error('Errore caricamento tipi lavoro:', error);
    }
  };

  const handleSelectVideo = (video: WeddingVideo) => {
    setSelectedVideo(video);
    setIsPlayingVideo(false);
  };

  const handleStartPlayback = () => {
    if (!selectedVideo) return;
    WeddingVideoService.incrementViews(selectedVideo.id);
    setIsPlayingVideo(true);
  };

  const handlePlayVideoNow = (video: WeddingVideo) => {
    WeddingVideoService.incrementViews(video.id);
    setSelectedVideo(video);
    setIsPlayingVideo(true);
  };

  const handleLike = (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    setLikedVideos(prev => {
      const newSet = new Set(prev);
      const wasLiked = newSet.has(videoId);

      if (wasLiked) {
        newSet.delete(videoId);
        setLikeCounts(counts => ({
          ...counts,
          [videoId]: (counts[videoId] || 0) - 1
        }));
        toast({
          description: "Rimosso dai preferiti"
        });
      } else {
        newSet.add(videoId);
        setLikeCounts(counts => ({
          ...counts,
          [videoId]: (counts[videoId] || 0) + 1
        }));
        toast({
          description: "❤️ Aggiunto ai preferiti"
        });
      }
      return newSet;
    });
  };

  const handleShare = (video: WeddingVideo, e: React.MouseEvent) => {
    e.stopPropagation();
    const shareUrl = window.location.origin + window.location.pathname;

    if (navigator.share) {
      navigator.share({
        title: video.title,
        text: video.description || 'Guarda questo video su iMaGe Vision',
        url: shareUrl
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl);
      toast({
        title: "Link copiato!",
        description: "Il link è stato copiato negli appunti"
      });
    }
  };

  const categories = Array.from(new Set(
    videos.map(v => v.category).filter((category): category is string => Boolean(category))
  ));
  const filteredVideos = selectedCategory === 'all'
    ? videos
    : videos.filter(v => v.category === selectedCategory);
  const visibleFeaturedVideos = selectedCategory === 'all'
    ? featuredVideos
    : featuredVideos.filter(v => v.category === selectedCategory);
  const heroVideo = visibleFeaturedVideos[0] || filteredVideos[0] || videos[0];
  const firstRealWedding = filteredVideos
    .map(video => realWeddingByVideoSlug[video.slug])
    .find((association): association is PublicWeddingVideoAssociation => Boolean(association));

  // Video Nuovi (ultimi 30 giorni)
  const newVideos = filteredVideos.filter(v => {
    if (!v.createdAt) return false;
    // FIX: Usa math per calcolo date (evita setDate())
    const thirtyDaysAgo = new Date(new Date().getTime() - 30 * 86400000);
    const videoDate = v.createdAt.toDate();
    return videoDate >= thirtyDaysAgo;
  }).slice(0, 8);

  // Video Consigliati (più visualizzati)
  const recommendedVideos = [...filteredVideos]
    .filter(v => v.views && v.views > 0)
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 8);

  // Video per JobType
  const videosByJobType = jobTypes.map(jobType => ({
    jobType,
    videos: filteredVideos.filter(v => v.category === jobType.nome).slice(0, 8)
  })).filter(item => item.videos.length > 0);

  const selectedRealWedding = selectedVideo ? realWeddingByVideoSlug[selectedVideo.slug] : undefined;

  return (
    <div className="min-h-screen bg-[#111714] text-[#F4EFE8]">
      <Navigation />

      <main className="mx-auto max-w-7xl px-4 pb-20 pt-20 sm:px-6 lg:px-8">
        {loading ? (
          <div role="status" aria-label="Caricamento dei video" className="flex items-center justify-center py-24">
            <Loader2 className="h-10 w-10 animate-spin text-sage" aria-hidden="true" />
            <span className="sr-only">Caricamento dei video…</span>
          </div>
        ) : (
          <>
            <section
              aria-labelledby="vision-page-title"
              className="relative left-1/2 mb-10 flex min-h-[490px] w-screen -translate-x-1/2 items-end overflow-hidden bg-[#111714] sm:min-h-[540px] md:mb-14 md:min-h-[600px]"
            >
              {heroVideo?.thumbnailUrl && (
                <img
                  src={heroVideo.thumbnailUrl}
                  alt=""
                  width={1920}
                  height={1080}
                  fetchPriority="high"
                  className="absolute inset-0 h-full w-full object-cover object-center"
                />
              )}
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#111714] via-[#111714]/75 to-[#111714]/10 md:via-[#111714]/60" />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#111714] via-[#111714]/15 to-[#111714]/10" />
              <div className="relative mx-auto w-full max-w-7xl px-5 pb-10 pt-20 sm:px-10 sm:pb-14 md:px-14 md:pb-16">
                <div className="max-w-[600px]">
                  <p className="mb-4 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.24em] text-[#D7A18D] sm:text-xs">
                    <span aria-hidden="true" className="h-px w-7 bg-terracotta" />
                    Image Studio presenta
                  </p>
                  <h1
                    id="vision-page-title"
                    className="font-playfair text-5xl leading-[0.98] tracking-[-0.04em] text-[#F4EFE8] sm:text-6xl md:text-7xl"
                  >
                    Image <em className="font-normal text-sage">Vision</em>
                  </h1>
                  <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#D8DED6] sm:text-xs">
                    Film di matrimonio
                  </p>
                  <p className="mt-5 max-w-xl text-sm leading-6 text-[#E1E4DF]/90 sm:text-base sm:leading-7">
                    {heroVideo?.description ||
                      'I vostri film, raccontati con uno sguardo cinematografico e pronti da rivivere. Storie vere, realizzate ad Aversa, Napoli e Caserta.'}
                  </p>
                  <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                    {heroVideo && (
                      <button
                        type="button"
                        onClick={() => handlePlayVideoNow(heroVideo)}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-terracotta px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#A86552] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                        Guarda il film
                      </button>
                    )}
                    <a
                      href="#catalogo"
                      onClick={(event) => {
                        event.preventDefault();
                        const catalog = document.getElementById('catalogo');
                        if (!catalog) return;

                        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                        catalog.scrollIntoView({
                          behavior: reduceMotion ? 'auto' : 'smooth',
                          block: 'start',
                        });
                        catalog.focus({ preventScroll: true });
                      }}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/25 bg-[#111714]/45 px-5 py-3 text-sm font-bold text-[#F4EFE8] backdrop-blur-sm transition-colors hover:border-sage hover:bg-[#111714]/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                    >
                      <CirclePlay className="h-4 w-4" aria-hidden="true" />
                      Esplora la raccolta
                    </a>
                  </div>
                  {heroVideo && (
                    <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#D8DED6]/75 sm:text-[10px]">
                      <span>In primo piano</span>
                      <span aria-hidden="true" className="text-terracotta">/</span>
                      <span>{heroVideo.title}</span>
                      {heroVideo.category && (
                        <>
                          <span aria-hidden="true" className="text-terracotta">·</span>
                          <span>{heroVideo.category}</span>
                        </>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="mb-9 flex flex-col gap-5 sm:mb-11 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-terracotta">Una raccolta di storie vere</p>
                <h2 className="font-playfair text-[26px] leading-tight text-[#F4EFE8] sm:text-[32px]">
                  Ogni amore ha il suo film.
                </h2>
              </div>
              {categories.length > 0 && (
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="group" aria-label="Filtra i film per categoria">
                  <button
                    type="button"
                    aria-pressed={selectedCategory === 'all'}
                    onClick={() => setSelectedCategory('all')}
                    className={`shrink-0 rounded-full border px-4 py-2 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage ${selectedCategory === 'all' ? 'border-sage bg-sage text-[#111714]' : 'border-white/15 bg-[#1A211E] text-[#D8DED6] hover:border-sage/50'}`}
                  >
                    Tutti
                  </button>
                  {categories.map(category => (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={selectedCategory === category}
                      onClick={() => setSelectedCategory(category)}
                      className={`shrink-0 rounded-full border px-4 py-2 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage ${selectedCategory === category ? 'border-sage bg-sage text-[#111714]' : 'border-white/15 bg-[#1A211E] text-[#D8DED6] hover:border-sage/50'}`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {visibleFeaturedVideos.length > 0 && (
              <VideoRail
                label="Film selezionati da Image Studio"
                itemCount={visibleFeaturedVideos.length}
                eyebrow="Una selezione per voi"
                title="Storie da rivivere"
                titleId="vision-featured-title"
              >
                {visibleFeaturedVideos.map(video => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    onClick={() => handleSelectVideo(video)}
                    onLike={(e) => handleLike(video.id, e)}
                    onShare={(e) => handleShare(video, e)}
                    isLiked={likedVideos.has(video.id)}
                    likeCount={likeCounts[video.id] || 0}
                    realWedding={realWeddingByVideoSlug[video.slug]}
                    cardClassName="w-[76vw] max-w-[318px] sm:w-[43vw] md:w-[31vw] lg:w-[25vw] xl:w-[22vw]"
                  />
                ))}
              </VideoRail>
            )}

            {newVideos.length > 0 && (
                <VideoRail label="Nuovi video" itemCount={newVideos.length} eyebrow="Appena aggiunti" title="Nuovi video" titleId="vision-new-title">
                  {newVideos.map(video => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      onClick={() => handleSelectVideo(video)}
                      onLike={(e) => handleLike(video.id, e)}
                      onShare={(e) => handleShare(video, e)}
                      isLiked={likedVideos.has(video.id)}
                      likeCount={likeCounts[video.id] || 0}
                      realWedding={realWeddingByVideoSlug[video.slug]}
                      cardClassName="w-[76vw] max-w-[318px] sm:w-[43vw] md:w-[31vw] lg:w-[25vw] xl:w-[22vw]"
                    />
                  ))}
                </VideoRail>
            )}

            {recommendedVideos.length > 0 && (
              <VideoRail label="Video consigliati" itemCount={recommendedVideos.length} eyebrow="Guardati che restano" title="Emozioni senza copione" titleId="vision-recommended-title">
                  {recommendedVideos.map(video => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      onClick={() => handleSelectVideo(video)}
                      onLike={(e) => handleLike(video.id, e)}
                      onShare={(e) => handleShare(video, e)}
                      isLiked={likedVideos.has(video.id)}
                      likeCount={likeCounts[video.id] || 0}
                      realWedding={realWeddingByVideoSlug[video.slug]}
                      cardClassName="w-[76vw] max-w-[318px] sm:w-[43vw] md:w-[31vw] lg:w-[25vw] xl:w-[22vw]"
                    />
                  ))}
              </VideoRail>
            )}

            {videosByJobType.map(({ jobType, videos: typeVideos }) => (
              <VideoRail
                key={jobType.id}
                label={`Video ${jobType.nome.toLocaleLowerCase('it-IT')}`}
                itemCount={typeVideos.length}
                eyebrow="Dalla raccolta"
                title={`Video ${jobType.nome.toLocaleLowerCase('it-IT')}`}
                titleId={`vision-category-${jobType.id}`}
              >
                  {typeVideos.map(video => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      onClick={() => handleSelectVideo(video)}
                      onLike={(e) => handleLike(video.id, e)}
                      onShare={(e) => handleShare(video, e)}
                      isLiked={likedVideos.has(video.id)}
                      likeCount={likeCounts[video.id] || 0}
                      realWedding={realWeddingByVideoSlug[video.slug]}
                      cardClassName="w-[76vw] max-w-[318px] sm:w-[43vw] md:w-[31vw] lg:w-[25vw] xl:w-[22vw]"
                    />
                  ))}
              </VideoRail>
            ))}

            {videos.length > 0 && (
              <section id="catalogo" tabIndex={-1} aria-labelledby="vision-catalog-title" className="mb-12 scroll-mt-24 focus:outline-none">
                <div className="mb-5 flex items-end justify-between gap-4">
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-terracotta">La raccolta</p>
                    <h2 id="vision-catalog-title" className="font-playfair text-[26px] leading-tight text-[#F4EFE8] sm:text-[32px]">
                      {selectedCategory === 'all' ? 'Tutti i film' : `Film: ${selectedCategory}`}
                    </h2>
                  </div>
                  <span className="pb-1 text-xs text-[#C7CEC7]/65">{filteredVideos.length} {filteredVideos.length === 1 ? 'storia' : 'storie'}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                  {filteredVideos.map(video => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      onClick={() => handleSelectVideo(video)}
                      onLike={(e) => handleLike(video.id, e)}
                      onShare={(e) => handleShare(video, e)}
                      isLiked={likedVideos.has(video.id)}
                      likeCount={likeCounts[video.id] || 0}
                      realWedding={realWeddingByVideoSlug[video.slug]}
                      cardClassName="w-full min-w-0"
                    />
                  ))}
                </div>
              </section>
            )}

            {firstRealWedding && (
              <section className="mt-16 rounded-2xl border border-white/[0.08] bg-[#1A211E] p-5 sm:p-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="max-w-3xl">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-terracotta">Dal film alla storia</p>
                    <h2 className="font-playfair text-xl text-[#F4EFE8] sm:text-2xl">Dietro ogni immagine, una storia vera.</h2>
                    {firstRealWedding.excerpt && (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#C7CEC7]/75">{firstRealWedding.excerpt}</p>
                    )}
                  </div>
                  <Link
                    href={`/real-wedding/${encodeURIComponent(firstRealWedding.storySlug)}`}
                    className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-xs font-semibold text-[#F4EFE8] transition-colors hover:border-sage hover:text-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                  >
                    Scopri il Real Wedding
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </section>
            )}

            {videos.length === 0 && (
              <section id="catalogo" tabIndex={-1} className="scroll-mt-24 rounded-2xl border border-white/10 bg-[#1A231F] px-6 py-16 text-center focus:outline-none">
                <Play className="mx-auto mb-4 h-10 w-10 text-sage" aria-hidden="true" />
                <h2 className="font-playfair text-2xl text-[#F4EFE8]">La raccolta si sta preparando</h2>
                <p className="mx-auto mt-3 max-w-xl text-[#C7CEC7]">
                  I film di matrimonio saranno disponibili qui. Nel frattempo, scopri come raccontiamo il vostro giorno.
                </p>
                <Link
                  href="/consulenze"
                  className="mt-6 inline-flex items-center justify-center rounded-lg bg-terracotta px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#A86552] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4EFE8]"
                >
                  Parliamo del vostro matrimonio
                </Link>
              </section>
            )}
          </>
        )}
      </main>

      {/* Film details first, with playback as an explicit action */}
      <Dialog
        open={!!selectedVideo}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedVideo(null);
            setIsPlayingVideo(false);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto border border-white/10 bg-[#151D19] p-0">
          <div className="relative aspect-video w-full bg-black">
            {selectedVideo && isPlayingVideo ? (
              <iframe
                src={`https://www.youtube.com/embed/${getYouTubeVideoId(selectedVideo.youtubeUrl)}?autoplay=1`}
                title={selectedVideo.title}
                className="h-full w-full"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : selectedVideo ? (
              <>
                <img
                  src={selectedVideo.thumbnailUrl}
                  alt={`Anteprima del film: ${selectedVideo.title}`}
                  className="h-full w-full object-cover"
                />
                <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#111714]/35 to-transparent" />
              </>
            ) : null}
          </div>
          {selectedVideo && (
            <div className={`grid gap-6 p-5 sm:p-7 ${selectedRealWedding ? 'md:grid-cols-[1.15fr_.85fr]' : ''}`}>
              <section>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-terracotta">Image Vision · Film di matrimonio</p>
                <DialogHeader className="space-y-2 text-left">
                  <DialogTitle className="font-playfair text-2xl leading-tight text-[#F4EFE8] sm:text-3xl">
                    {selectedVideo.title}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-[#C7CEC7]/70">
                    {[selectedVideo.category, selectedVideo.duration].filter(Boolean).join(' · ')}
                  </DialogDescription>
                </DialogHeader>
                {selectedVideo.description && (
                  <p className="mt-4 text-sm leading-6 text-[#D8DED6]/90">{selectedVideo.description}</p>
                )}
                {!isPlayingVideo && (
                  <button
                    type="button"
                    onClick={handleStartPlayback}
                    className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-terracotta px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-[#A86552] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                    Guarda il film
                  </button>
                )}
              </section>
              {selectedRealWedding && (
                <aside className="rounded-xl border border-sage/20 bg-[#202924] p-5 sm:p-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sage">La storia dietro il film</p>
                  <h3 className="mt-2 font-playfair text-xl leading-tight text-[#F4EFE8] sm:text-2xl">
                    {selectedRealWedding.storyTitle}
                  </h3>
                  {selectedRealWedding.excerpt && (
                    <p className="mt-3 text-sm leading-6 text-[#D8DED6]/85">
                      {selectedRealWedding.excerpt}
                    </p>
                  )}
                  <Link
                    href={`/real-wedding/${encodeURIComponent(selectedRealWedding.storySlug)}`}
                    className="mt-4 inline-flex min-h-10 items-center gap-1 rounded-md text-sm font-bold text-sage transition-colors hover:text-[#F4EFE8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                  >
                    Leggi il Real Wedding completo
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </aside>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
