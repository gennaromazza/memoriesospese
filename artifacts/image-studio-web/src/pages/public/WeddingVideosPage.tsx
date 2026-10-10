import { useState, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Play, Loader2, Eye, Sparkles, TrendingUp, Heart, Share2, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import Navigation from '@/components/Navigation';
import { JobTypeIcon } from '@/lib/job-type-icons';
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

function VideoRail({ children, label, itemCount }: {
  children: React.ReactNode;
  label: string;
  itemCount: number;
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
    <div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
      {canScrollLeft && (
        <button
          type="button"
          aria-label={`Scorri indietro: ${label}`}
          onClick={() => scroll(-1)}
          className="absolute left-2 top-[34%] z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-[#111714]/90 text-white shadow-lg backdrop-blur transition hover:border-sage hover:bg-[#26332D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          <ChevronLeft className="h-6 w-6" aria-hidden="true" />
        </button>
      )}
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
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-4 py-3 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-6 lg:px-8"
      >
        {children}
      </div>
      {canScrollRight && (
        <button
          type="button"
          aria-label={`Scorri avanti: ${label}`}
          onClick={() => scroll(1)}
          className="absolute right-2 top-[34%] z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-[#111714]/90 text-white shadow-lg backdrop-blur transition hover:border-sage hover:bg-[#26332D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          <ChevronRight className="h-6 w-6" aria-hidden="true" />
        </button>
      )}
    </div>
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
  const previewDescription = video.description || realWedding?.excerpt;

  return (
    <article className={`group shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 bg-[#1B2420] shadow-lg shadow-black/15 transition-all duration-300 hover:-translate-y-1 hover:border-sage/45 hover:shadow-2xl ${cardClassName}`}>
      <button
        type="button"
        onClick={onClick}
        aria-label={`Apri la descrizione del video: ${video.title}`}
        className="relative block aspect-video w-full overflow-hidden bg-black text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-terracotta"
      >
        <img
          src={video.thumbnailUrl}
          alt={`Anteprima del video: ${video.title}`}
          width={1280}
          height={720}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span aria-hidden="true" className="absolute inset-0 bg-black/15 transition-colors group-hover:bg-black/40" />
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-terracotta text-white shadow-lg transition-transform group-hover:scale-110">
            <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true" />
          </span>
        </span>
        {previewDescription && (
          <span className="absolute inset-x-0 bottom-0 max-h-0 overflow-hidden bg-[#111714]/95 px-4 text-xs leading-5 text-[#F4EFE8] opacity-0 backdrop-blur-sm transition-all duration-300 group-hover:max-h-28 group-hover:py-3 group-hover:opacity-100 group-focus-within:max-h-28 group-focus-within:py-3 group-focus-within:opacity-100">
            <span className="line-clamp-3">{previewDescription}</span>
            <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-sage">
              Apri i dettagli
            </span>
          </span>
        )}
        {video.duration && (
          <span className="absolute bottom-3 right-3 rounded-md bg-black/80 px-2 py-1 text-xs font-semibold text-white">
            {video.duration}
          </span>
        )}
      </button>
      <div className="p-4">
        <h3 className="mb-3 line-clamp-2 min-h-12 text-sm font-bold leading-6 text-[#F4EFE8]">
          {video.title}
        </h3>
        {realWedding && (
          <Link
            href={`/real-wedding/${encodeURIComponent(realWedding.storySlug)}`}
            aria-label={`Leggi il Real Wedding: ${realWedding.storyTitle}`}
            className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-sage/20 bg-sage/[0.06] p-3 transition-colors hover:border-sage/45 hover:bg-sage/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            <span className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-sage">
                Real Wedding
              </span>
              <span className="mt-0.5 block truncate text-xs font-semibold text-[#F4EFE8]">
                {realWedding.storyTitle}
              </span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-sage" aria-hidden="true" />
          </Link>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-[#C7CEC7]/70">
            <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{displayViews.toLocaleString('it-IT')} visualizzazioni</span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={onLike}
              aria-pressed={isLiked}
              aria-label={isLiked ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
              className={`flex items-center gap-1.5 rounded-md text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${isLiked ? 'text-terracotta' : 'text-[#C7CEC7]/70 hover:text-terracotta'}`}
            >
              <Heart className={`h-4 w-4 ${isLiked ? 'fill-current' : ''}`} aria-hidden="true" />
              <span className="font-semibold">{likeCount.toLocaleString('it-IT')}</span>
            </button>
            <button
              type="button"
              onClick={onShare}
              aria-label={`Condividi il video: ${video.title}`}
              className="rounded-md p-1 text-[#C7CEC7]/70 transition-colors hover:text-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
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

  // Video Nuovi (ultimi 30 giorni)
  const newVideos = videos.filter(v => {
    if (!v.createdAt) return false;
    // FIX: Usa math per calcolo date (evita setDate())
    const thirtyDaysAgo = new Date(new Date().getTime() - 30 * 86400000);
    const videoDate = v.createdAt.toDate();
    return videoDate >= thirtyDaysAgo;
  }).slice(0, 8);

  // Video Consigliati (più visualizzati)
  const recommendedVideos = [...videos]
    .filter(v => v.views && v.views > 0)
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 8);

  // Video per JobType
  const videosByJobType = jobTypes.map(jobType => ({
    jobType,
    videos: videos.filter(v => v.category === jobType.nome).slice(0, 8)
  })).filter(item => item.videos.length > 0);

  const categories = Array.from(new Set(
    videos.map(v => v.category).filter((category): category is string => Boolean(category))
  ));
  const filteredVideos = selectedCategory === 'all' 
    ? videos 
    : videos.filter(v => v.category === selectedCategory);
  const selectedRealWedding = selectedVideo ? realWeddingByVideoSlug[selectedVideo.slug] : undefined;

  return (
    <div className="min-h-screen bg-[#111714] text-[#F4EFE8]">
      <Navigation />

      <main className="mx-auto max-w-7xl px-4 pb-20 pt-20 sm:px-6 lg:px-8">
        <section
          aria-labelledby="vision-page-title"
          className="mb-14 overflow-hidden rounded-3xl border border-sage/20 bg-[#1A231F] px-6 py-12 shadow-2xl shadow-black/15 sm:px-12 sm:py-16"
        >
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-terracotta sm:text-sm">
              Image Studio presenta
            </p>
            <h1
              id="vision-page-title"
              className="mt-5 text-5xl font-black leading-[0.98] tracking-[-0.055em] text-[#F4EFE8] sm:text-6xl md:text-7xl"
              style={{ fontFamily: '"DM Sans", sans-serif' }}
            >
              <span className="block">Image <span className="text-sage">Vision</span></span>
              <span className="mt-3 block text-[0.36em] font-bold uppercase leading-tight tracking-[0.14em] text-[#D8DED6] sm:mt-4">
                Film di matrimonio
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-[#C7CEC7] sm:text-lg sm:leading-8">
              I vostri film di matrimonio, raccontati con uno sguardo cinematografico e pronti da rivivere.
              Realizzati ad Aversa, Napoli e Caserta.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/consulenze"
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-terracotta px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#A86552] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4EFE8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1A231F]"
              >
                Parliamo del vostro film
              </Link>
              <a
                href="#catalogo"
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-sage/40 bg-[#111714] px-6 py-3 text-sm font-bold text-[#F4EFE8] transition-colors hover:border-sage hover:bg-sage/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
              >
                Sfoglia i video
              </a>
            </div>
          </div>
        </section>

        {loading ? (
          <div role="status" aria-label="Caricamento dei video" className="flex items-center justify-center py-24">
            <Loader2 className="h-10 w-10 animate-spin text-sage" aria-hidden="true" />
            <span className="sr-only">Caricamento dei video…</span>
          </div>
        ) : (
          <>
            {/* Featured Videos - Hero Carousel */}
            {featuredVideos.length > 0 && (
              <section aria-labelledby="vision-featured-title" className="mb-16">
                <div className="mb-6 flex items-end justify-between gap-4">
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-terracotta">Da guardare</p>
                    <h2 id="vision-featured-title" className="text-2xl font-bold tracking-tight text-[#F4EFE8] sm:text-3xl">
                      In evidenza
                    </h2>
                  </div>
                  <span className="hidden text-sm text-[#C7CEC7]/65 sm:block">Storie da rivivere</span>
                </div>
                <VideoRail label="Film in evidenza" itemCount={featuredVideos.length}>
                  {featuredVideos.map(video => (
                    <button
                      type="button"
                      key={video.id}
                      aria-label={`Apri i dettagli del film in evidenza: ${video.title}`}
                      onClick={() => handleSelectVideo(video)}
                      className="group relative block aspect-video w-[86vw] max-w-[720px] shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 bg-[#1B2420] text-left shadow-xl shadow-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta md:w-[calc(50%-0.5rem)]"
                    >
                      <img
                        src={video.thumbnailUrl}
                        alt={`Film di matrimonio: ${video.title}`}
                        width={1280}
                        height={720}
                        fetchPriority="high"
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                      <span aria-hidden="true" className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/45" />
                      <span className="absolute left-4 top-4 flex flex-wrap gap-2">
                        <span className="inline-flex rounded-full bg-terracotta px-3 py-1 text-xs font-bold text-white">
                          In evidenza
                        </span>
                        {realWeddingByVideoSlug[video.slug] && (
                          <span className="inline-flex rounded-full bg-sage px-3 py-1 text-xs font-bold text-[#111714]">
                            Real Wedding
                          </span>
                        )}
                      </span>
                      <span className="absolute inset-x-0 bottom-0 bg-[#111714]/90 p-5 backdrop-blur-sm sm:p-6">
                        <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-sage">
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          Scopri il film
                          {video.duration && <span className="text-[#C7CEC7]/70">· {video.duration}</span>}
                        </span>
                        <span className="block text-xl font-bold leading-tight text-white sm:text-2xl">{video.title}</span>
                        {video.description && (
                          <span className="mt-2 line-clamp-2 block text-sm leading-6 text-[#D8DED6]/85">
                            {video.description}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </VideoRail>
              </section>
            )}

            {/* Video Nuovi */}
            {newVideos.length > 0 && (
              <section aria-labelledby="vision-new-title" className="mb-16">
                <div className="mb-6 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-sage/15 text-sage">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#C7CEC7]/55">Appena aggiunti</p>
                    <h2 id="vision-new-title" className="text-xl font-bold text-[#F4EFE8] sm:text-2xl">Nuovi video</h2>
                  </div>
                </div>
                <VideoRail label="Nuovi video" itemCount={newVideos.length}>
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
                      cardClassName="w-[78vw] max-w-[320px] sm:w-[calc(50%-0.5rem)] lg:w-[calc(25%-0.75rem)]"
                    />
                  ))}
                </VideoRail>
              </section>
            )}

            {/* Video Consigliati */}
            {recommendedVideos.length > 0 && (
              <section aria-labelledby="vision-recommended-title" className="mb-16">
                <div className="mb-6 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-terracotta/15 text-terracotta">
                    <TrendingUp className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#C7CEC7]/55">Selezionati per voi</p>
                    <h2 id="vision-recommended-title" className="text-xl font-bold text-[#F4EFE8] sm:text-2xl">Consigliati</h2>
                  </div>
                </div>
                <VideoRail label="Video consigliati" itemCount={recommendedVideos.length}>
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
                      cardClassName="w-[78vw] max-w-[320px] sm:w-[calc(50%-0.5rem)] lg:w-[calc(25%-0.75rem)]"
                    />
                  ))}
                </VideoRail>
              </section>
            )}

            {/* Video per Tipo Lavoro (JobTypes) */}
            {videosByJobType.map(({ jobType, videos: typeVideos }) => (
              <section key={jobType.id} aria-labelledby={`vision-category-${jobType.id}`} className="mb-16">
                <div className="mb-6 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-sage/15 text-sage">
                    <JobTypeIcon slug={jobType.slug} size="sm" />
                  </span>
                  <h2 id={`vision-category-${jobType.id}`} className="text-xl font-bold text-[#F4EFE8] sm:text-2xl">
                    Video {jobType.nome.toLocaleLowerCase('it-IT')}
                  </h2>
                  <Badge variant="outline" className="border-sage/30 text-sage">{typeVideos.length}</Badge>
                </div>
                <VideoRail label={`Video ${jobType.nome.toLocaleLowerCase('it-IT')}`} itemCount={typeVideos.length}>
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
                      cardClassName="w-[78vw] max-w-[320px] sm:w-[calc(50%-0.5rem)] lg:w-[calc(25%-0.75rem)]"
                    />
                  ))}
                </VideoRail>
              </section>
            ))}

            {/* Tutti i Video - mostra TUTTI i video pubblicati */}
            {videos.length > 0 && (
              <section id="catalogo" aria-labelledby="vision-catalog-title" className="mb-12 scroll-mt-24">
                <div className="mb-6 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-terracotta/15 text-terracotta">
                    <Play className="ml-0.5 h-4 w-4 fill-current" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#C7CEC7]/55">La raccolta</p>
                    <h2 id="vision-catalog-title" className="text-xl font-bold text-[#F4EFE8] sm:text-2xl">
                      {selectedCategory === 'all' ? 'Tutti i film di matrimonio' : `Video: ${selectedCategory}`}
                    </h2>
                  </div>
                  <Badge variant="outline" className="border-sage/30 text-sage">{filteredVideos.length}</Badge>
                </div>
                {categories.length > 0 && (
                  <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filtra i video per categoria">
                    <button
                      type="button"
                      aria-pressed={selectedCategory === 'all'}
                      onClick={() => setSelectedCategory('all')}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage ${selectedCategory === 'all' ? 'border-sage bg-sage text-[#111714]' : 'border-white/15 bg-[#1A231F] text-[#D8DED6] hover:border-sage/50'}`}
                    >
                      Tutti
                    </button>
                    {categories.map(category => (
                      <button
                        key={category}
                        type="button"
                        aria-pressed={selectedCategory === category}
                        onClick={() => setSelectedCategory(category)}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage ${selectedCategory === category ? 'border-sage bg-sage text-[#111714]' : 'border-white/15 bg-[#1A231F] text-[#D8DED6] hover:border-sage/50'}`}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                )}
                <VideoRail label={`Catalogo video ${selectedCategory === 'all' ? 'completo' : selectedCategory}`} itemCount={filteredVideos.length}>
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
                      cardClassName="w-[78vw] max-w-[320px] sm:w-[calc(50%-0.5rem)] lg:w-[calc(25%-0.75rem)]"
                    />
                  ))}
                </VideoRail>
              </section>
            )}

            {/* Fallback se non ci sono video */}
            {videos.length === 0 && (
              <section className="rounded-2xl border border-white/10 bg-[#1A231F] px-6 py-16 text-center">
                <Play className="mx-auto mb-4 h-10 w-10 text-sage" aria-hidden="true" />
                <h2 className="text-2xl font-bold text-[#F4EFE8]">La raccolta si sta preparando</h2>
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
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto border border-white/10 bg-[#151D19] p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-2xl text-[#F4EFE8]">{selectedVideo?.title}</DialogTitle>
            <DialogDescription className="sr-only">
              Dettagli del film e storia del matrimonio. Avvia la riproduzione quando vuoi.
            </DialogDescription>
          </DialogHeader>
          <div className="relative aspect-video w-full bg-black">
            {selectedVideo && (isPlayingVideo ? (
              <iframe
                src={`https://www.youtube.com/embed/${getYouTubeVideoId(selectedVideo.youtubeUrl)}?autoplay=1`}
                title={selectedVideo.title}
                className="h-full w-full"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <>
                <img
                  src={selectedVideo.thumbnailUrl}
                  alt={`Anteprima del film: ${selectedVideo.title}`}
                  className="h-full w-full object-cover"
                />
                <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#111714]/95 via-[#111714]/15 to-black/10" />
                <button
                  type="button"
                  onClick={handleStartPlayback}
                  className="absolute bottom-5 left-5 inline-flex min-h-12 items-center gap-2 rounded-lg bg-terracotta px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-[#A86552] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                  Guarda il film
                </button>
              </>
            ))}
          </div>
          {(selectedVideo?.description || selectedRealWedding) && (
            <div className="space-y-4 px-6 pb-6">
              {selectedVideo?.description && (
                <p className="text-gray-300">{selectedVideo.description}</p>
              )}
              {selectedRealWedding && (
                <section className="rounded-2xl border border-sage/25 bg-sage/[0.06] p-5 sm:p-6">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-sage">
                    La storia dietro il film
                  </p>
                  <h3 className="mt-2 text-lg font-bold text-[#F4EFE8] sm:text-xl">
                    {selectedRealWedding.storyTitle}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#D8DED6]">
                    {selectedRealWedding.excerpt}
                  </p>
                  <Link
                    href={`/real-wedding/${encodeURIComponent(selectedRealWedding.storySlug)}`}
                    className="mt-4 inline-flex min-h-10 items-center gap-1 rounded-md font-bold text-sage transition-colors hover:text-[#F4EFE8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                  >
                    Leggi il Real Wedding completo
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </section>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
