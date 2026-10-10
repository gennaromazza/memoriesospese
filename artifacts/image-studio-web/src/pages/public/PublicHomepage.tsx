import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import {
  Camera,
  Heart,
  BookOpen,
  Calendar,
  Image as ImageIcon,
  Instagram,
  Phone,
  Mail,
  MapPin,
  Clock,
  Sparkles,
  Lock,
  ChevronRight,
  MessageCircle,
  CreditCard,
  PackageCheck,
  Printer,
  UploadCloud,
} from "lucide-react";
import { useStudio } from "@/context/StudioContext";
import HeroSlideshow from "@/components/HeroSlideshow";
import Navigation from "@/components/Navigation";
import type { BookingCampaignFE } from "@shared/booking-types";
import { BlogPostStatus, WeddingVideo } from "@shared/schema";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { FloralDivider, FloralCorner } from "@/components/WeddingIllustrations";


import ReviewsWidget from "@/components/ReviewsWidget";
import { usePrefetchPopularPages } from "@/hooks/usePrefetch";
import StudioLogo from "@/components/StudioLogo";
import PublicContactCard from "@/components/PublicContactCard";
import PublicStudioStructuredData from "@/components/PublicStudioStructuredData";
import { useSEO } from "@/hooks/useSEO";
import { WEDDING_HOME_SEO } from "@shared/public-seo-content";
import {
  resolveHomepageContent,
} from "@shared/homepage-content";
import { getPublicWeddingStoryPreviews, weddingCoverPositionStyle } from "@/lib/wedding-seo";
import type { PublicWeddingStoryPreview } from "@shared/wedding-seo-types";

interface PortfolioPhoto {
  id: string;
  photoUrl: string;
  galleryName: string;
  jobType: string;
  featured: boolean;
  sortOrder?: number;
}

type HomepageEditorialCard = {
  id: string;
  title: string;
  excerpt: string;
  publishedAt?: any;
  coverImage?: string;
  coverImagePosition?: PublicWeddingStoryPreview['coverPhotoPosition'];
  coverImageMobilePosition?: PublicWeddingStoryPreview['coverPhotoMobilePosition'];
  coverImageCardPosition?: PublicWeddingStoryPreview['coverPhotoCardPosition'];
  coverImageCardMobilePosition?: PublicWeddingStoryPreview['coverPhotoCardMobilePosition'];
  coverPhotoPosition?: PublicWeddingStoryPreview['coverPhotoPosition'];
  coverPhotoMobilePosition?: PublicWeddingStoryPreview['coverPhotoMobilePosition'];
  coverPhotoCardPosition?: PublicWeddingStoryPreview['coverPhotoCardPosition'];
  coverPhotoCardMobilePosition?: PublicWeddingStoryPreview['coverPhotoCardMobilePosition'];
  href: string;
  kind: 'blog' | 'real-wedding';
};

type PortfolioPreviewMode = "wedding" | "mixed-fallback";

function getInstagramProfile(value?: string | null) {
  const input = value?.trim();
  if (!input) return null;

  const profileUrlMatch = input.match(
    /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)/i,
  );
  const handle = (profileUrlMatch?.[1] ?? input).replace(/^@+/, "").trim();
  if (!handle || /[\s/?#]/.test(handle)) return null;

  return {
    handle,
    url: `https://www.instagram.com/${encodeURIComponent(handle)}/`,
  };
}

export default function PublicHomepage() {
  const {
    studioSettings,
    loading: studioSettingsLoading,
    error: studioSettingsError,
  } = useStudio();
  const publicAddress = studioSettings.address?.trim() || "";
  const publicPhone = studioSettings.phone?.trim() || "";
  const publicEmail = studioSettings.email?.trim() || "";
  const publicWhatsapp = studioSettings.whatsapp?.trim() || "";
  const whatsappNumber = (publicWhatsapp || publicPhone).replace(/\D/g, "");
  const homepageContent = resolveHomepageContent(studioSettings.homepageContent);
  const instagramProfile = getInstagramProfile(studioSettings.socialLinks?.instagram);
  const [, navigate] = useLocation();
  const [portfolioPhotos, setPortfolioPhotos] = useState<PortfolioPhoto[]>([]);
  const [portfolioPreviewMode, setPortfolioPreviewMode] =
    useState<PortfolioPreviewMode>("wedding");
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [activeCampaigns, setActiveCampaigns] = useState<BookingCampaignFE[]>([]);
  const [blogPosts, setBlogPosts] = useState<HomepageEditorialCard[]>([]);
  const [weddingVideos, setWeddingVideos] = useState<any[]>([]);
  const [loadingBlog, setLoadingBlog] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(true);

  usePrefetchPopularPages();

  useSEO({
    title: WEDDING_HOME_SEO.title,
    description: WEDDING_HOME_SEO.description,
    canonical: "/",
    keywords: WEDDING_HOME_SEO.keywords,
  });

  const [emblaRef] = useEmblaCarousel({ loop: true, align: "center" }, [
    Autoplay({ delay: 5000, stopOnInteraction: false }),
  ]);

  useEffect(() => {
    loadPortfolioPreview();
    loadLatestBlogPosts();
    loadLatestVideos();
  }, []);

  const loadPortfolioPreview = async () => {
    setLoadingPhotos(true);
    try {
      const photosRef = collection(db, "portfolioSelections");
      // Filtriamo prima per jobType, senza richiedere un indice composito:
      // le foto matrimoniali devono avere precedenza anche se non sono "featured".
      const weddingSnapshot = await getDocs(
        query(photosRef, where("jobType", "==", "matrimonio")),
      );
      const weddingPhotos = weddingSnapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }) as PortfolioPhoto)
        .sort(
          (a, b) =>
            Number(b.featured) - Number(a.featured) ||
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
        );

      let photos = weddingPhotos.slice(0, 6);
      let previewMode: PortfolioPreviewMode = "wedding";

      // Fallback esplicito: se il catalogo wedding non basta, completiamo
      // usando le selezioni generali già curate dall'amministratore.
      if (photos.length < 6) {
        const fallbackSnapshot = await getDocs(
          query(
            photosRef,
            where("featured", "==", true),
            orderBy("sortOrder", "asc"),
            limit(12),
          ),
        );
        const fallbackPhotos = fallbackSnapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }) as PortfolioPhoto)
          .filter((photo) => !photos.some((selected) => selected.id === photo.id));
        photos = [...photos, ...fallbackPhotos].slice(0, 6);
        previewMode = "mixed-fallback";
      }

      setPortfolioPreviewMode(previewMode);
      console.log(
        `[PublicHomepage] Portfolio preview: ${photos.length} photos (${previewMode})`,
      );
      setPortfolioPhotos(photos);
    } catch (error) {
      console.error("Errore caricamento portfolio preview:", error);
      setPortfolioPreviewMode("mixed-fallback");
    } finally {
      setLoadingPhotos(false);
    }
  };

  const loadLatestBlogPosts = async () => {
    setLoadingBlog(true);
    try {
      const postsRef = collection(db, 'blogPosts');
      const q = query(
        postsRef,
        where('status', '==', BlogPostStatus.PUBLISHED),
        where('publishedAt', '!=', null),
        orderBy('publishedAt', 'desc'),
        limit(3)
      );
      const [postsResult, storiesResult] = await Promise.allSettled([getDocs(q), getPublicWeddingStoryPreviews(3)]);
      if (postsResult.status === 'rejected') throw postsResult.reason;
      const snapshot = postsResult.value;
      const weddingStories = storiesResult.status === 'fulfilled' ? storiesResult.value : [];
      if (storiesResult.status === 'rejected') {
        console.warn('Real Wedding temporaneamente non disponibili nella Home:', storiesResult.reason);
      }
      const posts: HomepageEditorialCard[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        href: `/blog/${doc.data().slug}`,
        kind: 'blog' as const,
      })) as HomepageEditorialCard[];
      const realWeddings: HomepageEditorialCard[] = weddingStories.map((story: PublicWeddingStoryPreview) => ({
        id: `real-wedding-${story.slug}`,
        title: story.title,
        excerpt: story.excerpt,
        publishedAt: story.publishedAt,
        coverImage: story.coverImage,
         coverPhotoPosition: story.coverPhotoPosition,
         coverPhotoMobilePosition: story.coverPhotoMobilePosition,
         coverPhotoCardPosition: story.coverPhotoCardPosition,
         coverPhotoCardMobilePosition: story.coverPhotoCardMobilePosition,
        href: `/real-wedding/${story.slug}`,
        kind: 'real-wedding',
      }));
      setBlogPosts([...posts, ...realWeddings]
        .sort((a, b) => publishedAtValue(b.publishedAt) - publishedAtValue(a.publishedAt))
        .slice(0, 3));
    } catch (error) {
      console.error('Errore caricamento blog posts:', error);
    } finally {
      setLoadingBlog(false);
    }
  };

  const publishedAtValue = (timestamp: any): number => {
    if (timestamp?.seconds != null) return timestamp.seconds * 1000;
    const value = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp || 0).getTime();
    return Number.isNaN(value) ? 0 : value;
  };

  const loadLatestVideos = async () => {
    setLoadingVideos(true);
    try {
      const videosRef = collection(db, 'weddingVideos');
      const q = query(
        videosRef,
        where('active', '==', true),
        orderBy('createdAt', 'desc'),
        limit(3)
      );
      const snapshot = await getDocs(q);
      const videos = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data() as Omit<WeddingVideo, 'id'>
      }));

      console.log('[PublicHomepage] Video caricati:', videos.length);
      setWeddingVideos(videos);
    } catch (error) {
      console.error('[PublicHomepage] Errore caricamento video:', error);
      // Se fallisce la query con orderBy, prova senza
      try {
        const fallbackRef = collection(db, 'weddingVideos');
        const simpleQuery = query(fallbackRef, where('active', '==', true), limit(3));
        const snapshot = await getDocs(simpleQuery);
        const videos = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data() as Omit<WeddingVideo, 'id'>
        }));
        console.log('[PublicHomepage] Video caricati (fallback):', videos.length);
        setWeddingVideos(videos);
      } catch (fallbackError) {
        console.error('[PublicHomepage] Errore fallback video:', fallbackError);
      }
    } finally {
      setLoadingVideos(false);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp || !timestamp.seconds) return '';
    try {
      const date = new Date(timestamp.seconds * 1000);
      return date.toLocaleDateString('it-IT', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch (e) {
      return '';
    }
  };

  // Load active booking campaigns
  useEffect(() => {
    const loadActiveCampaigns = async () => {
      try {
        const { getActiveCampaigns } = await import("@/lib/booking-campaigns");
        const active = await getActiveCampaigns();

        // Sort by closest end date
        active.sort((a, b) => a.dataFine.getTime() - b.dataFine.getTime());

        setActiveCampaigns(active);
      } catch (error) {
        console.error("Errore caricamento campagne attive:", error);
      }
    };

    loadActiveCampaigns();
  }, []);

  return (
    <div className="min-h-screen bg-off-white overflow-x-hidden max-w-full">
      {/* Navigation */}
      <Navigation />

      {/* Hero Section */}
      <section className="pt-24 sm:pt-28 md:pt-32 pb-12 sm:pb-16 md:pb-20 bg-cream/25 px-4 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid w-full min-w-0 grid-cols-1 items-center gap-8 sm:gap-10 md:grid-cols-2 md:gap-12">
            <div className="min-w-0 max-w-full animate-fade-in">
              <p className="text-sm sm:text-base font-semibold uppercase tracking-[0.2em] text-sage mb-3">
                {homepageContent.hero.eyebrow}
              </p>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-playfair text-blue-gray mb-4 sm:mb-6 leading-tight">
                {homepageContent.hero.title}
              </h1>
              <p className="text-2xl sm:text-3xl font-playfair text-[hsl(14_37%_40%)] mb-4">
                {homepageContent.hero.tagline}
              </p>
              <p className="text-lg sm:text-xl text-dark-sage mb-3 sm:mb-4">
                {homepageContent.hero.description}
              </p>
              <p className="text-base sm:text-lg text-blue-gray/80 mb-6 sm:mb-8">
                {homepageContent.hero.signature}
              </p>
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:gap-4">
                <Link href="/consulenze" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className="h-auto min-h-11 w-full whitespace-normal bg-[hsl(120_7%_38%)] px-5 py-3 text-center leading-snug text-off-white hover:bg-[hsl(120_7%_34%)] sm:w-auto"
                    data-testid="button-prenota-hero"
                  >
                    <Calendar className="mr-2 h-5 w-5" />
                    <span className="min-w-0">{homepageContent.hero.primaryCta}</span>
                  </Button>
                </Link>
                <Link href="/portfolio/matrimonio" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-auto min-h-11 w-full whitespace-normal border-sage px-5 py-3 text-center leading-snug text-sage hover:bg-sage/10 sm:w-auto"
                    data-testid="button-portfolio-hero"
                  >
                    <Camera className="mr-2 h-5 w-5" />
                    <span className="min-w-0">{homepageContent.hero.portfolioCta}</span>
                  </Button>
                </Link>
              </div>
              <div className="mt-5 w-full sm:mt-6">
                <Link href="/accesso-galleria" className="block w-full sm:inline-block sm:w-auto">
                  <Button
                    variant="link"
                    className="h-auto min-h-11 w-full max-w-full whitespace-normal px-3 py-2 text-center leading-snug text-blue-gray hover:text-sage sm:w-auto"
                    data-testid="link-accesso-galleria-hero"
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    <span className="min-w-0">{homepageContent.hero.galleryAccessText}</span>
                  </Button>
                </Link>
              </div>
            </div>
            <div className="relative isolate mx-auto h-[280px] w-full min-w-0 max-w-full overflow-hidden rounded-xl shadow-lg sm:h-[400px] sm:rounded-2xl sm:shadow-2xl md:mx-0 md:h-[500px] md:animate-slide-up">
              <HeroSlideshow />
            </div>
          </div>
        </div>
      </section>

      {/* Image Vision Section */}
      <section className="py-12 sm:py-16 md:py-20 bg-light-mint text-blue-gray px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8 sm:mb-10 md:mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-terracotta/20 rounded-full mb-4">
              <Camera className="w-8 h-8 text-terracotta" />
            </div>
            <h2
              className="mb-3 text-4xl font-black tracking-tight text-blue-gray sm:mb-4 sm:text-5xl md:text-6xl"
              style={{
                fontFamily: '"DM Sans", "Helvetica Neue", Arial, sans-serif',
                lineHeight: 1.05,
              }}
            >
              Image Vision
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-dark-sage">
              I nostri ultimi video: emozioni in movimento
            </p>
          </div>

          {loadingVideos ? (
            <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl overflow-hidden animate-pulse">
                  <div className="bg-beige/70 aspect-video" />
                  <div className="p-4">
                    <div className="h-4 bg-beige/70 rounded w-3/4 mb-3" />
                    <div className="h-3 bg-beige/70 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : weddingVideos.length > 0 ? (
            <>
              <div className="grid md:grid-cols-3 gap-6 sm:gap-8 mb-8">
                {weddingVideos.map((video) => (
                  <Link key={video.id} href="/vision">
                    <div className="bg-white rounded-xl overflow-hidden hover:bg-light-mint/50 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 cursor-pointer group">
                      <div className="relative aspect-video overflow-hidden">
                        <img
                          src={video.thumbnailUrl}
                          alt={video.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                            <div className="w-0 h-0 border-l-[20px] border-l-terracotta border-t-[12px] border-t-transparent border-b-[12px] border-b-transparent ml-1" />
                          </div>
                        </div>
                        {video.duration && (
                          <div className="absolute bottom-2 right-2 bg-[hsl(200_21%_34%)] text-off-white px-2 py-1 rounded text-xs font-semibold">
                            {video.duration}
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold text-blue-gray group-hover:text-[hsl(14_37%_40%)] transition-colors mb-2 line-clamp-2">
                          {video.title}
                        </h3>
                        {video.category && (
                          <span className="text-xs text-[hsl(200_21%_34%)]">
                            {video.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="text-center">
                <Link href="/vision">
                  <Button size="lg" className="h-auto max-w-full whitespace-normal bg-[hsl(120_7%_38%)] px-5 py-3 text-center leading-snug text-off-white shadow-lg transition-all hover:bg-[hsl(120_7%_34%)] hover:shadow-xl">
                    <Camera className="mr-2 h-5 w-5" />
                    Scopri tutti i Video
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <Camera className="w-16 h-16 mx-auto mb-4 text-sage opacity-50" />
              <p className="text-blue-gray text-lg mb-2">Nuovi video in arrivo...</p>
              <p className="text-dark-sage text-sm">
                Vai alla Dashboard Admin → Wedding Videos per aggiungere i tuoi video
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Image Experience */}
      <section className="px-4 py-12 sm:py-16 md:py-20 bg-cream/25">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[hsl(200_21%_34%)] text-off-white shadow-xl">
          <div className="grid items-stretch md:grid-cols-[1.05fr_0.95fr]">
            <div className="flex flex-col justify-center p-7 sm:p-10 md:p-14">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-cream">
                Una nuova esperienza
              </p>
              <h2 className="max-w-xl font-playfair text-3xl leading-tight sm:text-4xl md:text-5xl">
                Non un pacchetto.<br />
                <em className="text-cream">Il vostro punto di partenza.</em>
              </h2>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-off-white/90 sm:text-lg">
                Image Experience parte da 2.200 €. Scoprite le possibilità,
                scegliete ciò che vi rappresenta e costruite il servizio del
                vostro matrimonio con calma.
              </p>
              <div className="mt-7">
                <Link href="/image-experience" className="inline-block max-w-full">
                  <Button
                    size="lg"
                    className="h-auto max-w-full whitespace-normal rounded-full bg-off-white px-6 py-3 text-center leading-snug text-[hsl(200_21%_34%)] hover:bg-cream"
                    data-testid="button-image-experience-home"
                  >
                    Scopri Image Experience
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </Button>
                </Link>
              </div>
            </div>
            <div className="relative min-h-[260px] overflow-hidden md:min-h-[360px]">
              <img
                src="/images/image-experience/coppia-configura-servizio-matrimonio-1024.webp"
                alt="Una coppia configura insieme il servizio fotografico del matrimonio"
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
              />
              <div className="absolute bottom-5 right-5 rounded-full bg-off-white px-4 py-2 text-sm font-semibold text-[hsl(200_21%_34%)] shadow-lg">
                Da 2.200 €
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 sm:py-16 bg-off-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 text-center">
            <div>
              <div className="text-3xl sm:text-4xl md:text-5xl font-playfair text-sage mb-2">
                10+
              </div>
              <div className="text-sm sm:text-base text-dark-sage">
                Anni di Esperienza
              </div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl md:text-5xl font-playfair text-sage mb-2">
                500+
              </div>
              <div className="text-sm sm:text-base text-dark-sage">
                Matrimoni
              </div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl md:text-5xl font-playfair text-sage mb-2">
                1000+
              </div>
              <div className="text-sm sm:text-base text-dark-sage">Eventi</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl md:text-5xl font-playfair text-sage mb-2">
                100%
              </div>
              <div className="text-sm sm:text-base text-dark-sage">Passione</div>
            </div>
          </div>
        </div>
      </section>

      {/* Portfolio Preview */}
      <section className="py-12 sm:py-16 md:py-20 bg-light-mint/40 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8 sm:mb-10 md:mb-12 animate-fade-in">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-playfair text-blue-gray mb-3 sm:mb-4">
              {homepageContent.portfolio.title}
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-dark-sage">
              {homepageContent.portfolio.description}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6 mb-6 sm:mb-8">
            {loadingPhotos ? (
              [1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="bg-beige rounded-lg animate-pulse"
                  style={{ aspectRatio: "1" }}
                />
              ))
            ) : portfolioPhotos.length > 0 ? (
              portfolioPhotos.map((photo, index) => (
                <Link key={photo.id} href="/portfolio/matrimonio">
                  <div className="rounded-lg overflow-hidden group cursor-pointer">
                    <img
                      src={photo.photoUrl}
                      alt={`${photo.galleryName} - ${photo.jobType}`}
                      className="w-full h-auto object-cover group-hover:scale-110 transition-transform duration-300"
                      loading="lazy"
                      onError={(e) => {
                        console.error(
                          `[PublicHomepage] Failed to load image ${index + 1}:`,
                          photo.photoUrl,
                        );
                        e.currentTarget.style.display = "none";
                        e.currentTarget.parentElement!.innerHTML = `<div class="w-full h-full bg-terracotta/15 flex items-center justify-center text-dark-sage text-sm p-4 text-center">Errore caricamento foto</div>`;
                      }}
                      onLoad={() => {
                        console.log(
                          `[PublicHomepage] Successfully loaded image ${index + 1}`,
                        );
                      }}
                    />
                  </div>
                </Link>
              ))
            ) : (
              <div className="col-span-2 md:col-span-3 text-center py-12">
                <p className="text-lg text-blue-gray/80">
                  Nessuna foto nel portfolio. Le foto in evidenza verranno
                  visualizzate qui.
                </p>
                <p className="text-sm text-dark-sage mt-2">
                  Vai al Portfolio Manager per aggiungere foto in evidenza.
                </p>
              </div>
            )}
          </div>
          {portfolioPreviewMode === "mixed-fallback" && (
            <p className="text-center text-sm text-blue-gray/80 mb-4">
              Selezione matrimoniale in aggiornamento: mostriamo anche alcuni
              lavori dello studio per farti conoscere il portfolio completo.
            </p>
          )}
          <div className="text-center">
            <Link href="/portfolio/matrimonio" className="inline-block max-w-full">
              <Button
                size="lg"
                variant="outline"
                className="h-auto max-w-full whitespace-normal border-sage px-5 py-3 text-center leading-snug text-sage hover:bg-sage/10"
              >
                <span className="min-w-0">{homepageContent.portfolio.cta}</span>
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stampa foto online */}
      <section className="relative overflow-hidden bg-[hsl(200_21%_34%)] px-4 py-14 text-white sm:py-20 md:py-24">
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16">
          <div className="order-2 lg:order-1">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-cream">
              Stampa foto online
            </p>
            <h2 className="max-w-2xl text-3xl font-playfair leading-tight sm:text-4xl md:text-5xl">
              Le fotografie più importanti meritano di uscire dal telefono.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-off-white/90 sm:text-lg">
              Carica i tuoi JPG, scegli formato e carta lucida o opaca e decidi se mantenere la foto intera oppure riempire tutto il foglio. Al resto pensiamo noi.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {[
                { icon: UploadCloud, title: "Caricamento semplice", text: "Direttamente da telefono o computer" },
                { icon: Printer, title: "Stampa su carta vera", text: "Formati classici e grandi" },
                { icon: CreditCard, title: "Pagamento protetto", text: "Ordine anticipato e sicuro con PayPal" },
                { icon: PackageCheck, title: "Consegna flessibile", text: "Ritiro in studio o spedizione, se attiva" },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-cream/10 text-cream">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-white">{title}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-off-white/85">{text}</span>
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/stampa-foto-aversa" className="w-full sm:w-auto">
                <Button size="lg" className="h-12 w-full rounded-full bg-[hsl(14_37%_40%)] px-7 text-off-white hover:bg-[hsl(14_37%_36%)] sm:w-auto">
                  Scopri prezzi e formati
                  <ChevronRight className="ml-2 h-5 w-5" aria-hidden="true" />
                </Button>
              </Link>
              <Link href="/stampa-foto-aversa/ordine" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="h-12 w-full rounded-full border-white/35 bg-transparent px-7 text-white hover:bg-white hover:text-[hsl(200_21%_34%)] sm:w-auto">
                  Ordina le tue stampe
                </Button>
              </Link>
            </div>
          </div>

          <div className="order-1 mx-auto w-full max-w-xl lg:order-2">
            <div className="relative pb-7 pr-5 sm:pb-10 sm:pr-10">
              <div className="overflow-hidden rounded-[2rem] border border-white/15 bg-white p-2 shadow-2xl sm:p-3">
                <img
                  src="/images/print-service/printed-memories-table.jpg"
                  alt="Stampe fotografiche disposte su un tavolo"
                  className="aspect-[4/3] w-full rounded-[1.5rem] object-cover"
                  loading="lazy"
                />
              </div>
              <div className="absolute bottom-0 right-0 w-[42%] rotate-3 rounded-xl bg-white p-2 shadow-2xl sm:p-3">
                <img
                  src="/images/print-service/printed-memories-table.jpg"
                  alt="Fotografie di viaggio stampate su carta fotografica"
                  className="aspect-square w-full rounded-lg object-cover"
                  loading="lazy"
                />
                <p className="px-1 pb-1 pt-2 text-center font-playfair text-xs italic text-blue-gray sm:text-sm">
                  Ricordi da tenere tra le mani
                </p>
              </div>
              <div className="absolute -left-2 top-5 max-w-[12rem] -rotate-3 rounded-2xl border border-white/15 bg-[hsl(120_7%_38%)] px-4 py-3 shadow-xl backdrop-blur sm:-left-5 sm:top-8">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cream">Foto vere. Carta vera.</p>
                <p className="mt-1 font-playfair text-base leading-snug text-off-white sm:text-lg">Un ricordo non dovrebbe restare in una galleria.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Servizi secondari: disponibili, ma distinti dal focus wedding. */}
      <section className="py-12 sm:py-16 bg-cream/35 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-playfair text-blue-gray mb-3">
            {homepageContent.secondaryServices.title}
          </h2>
          <p className="text-base sm:text-lg text-dark-sage mb-6">
            {homepageContent.secondaryServices.description}
          </p>
          <Link href="/portfolio" className="inline-block max-w-full">
            <Button variant="outline" className="h-auto max-w-full whitespace-normal border-sage px-5 py-3 text-center leading-snug text-sage hover:bg-sage/10">
              <span className="min-w-0">{homepageContent.secondaryServices.cta}</span>
            </Button>
          </Link>
        </div>
      </section>

      {/* Active Booking Campaigns */}
      {activeCampaigns.length > 0 && (
        <section className="py-20 bg-light-mint/40 relative overflow-hidden">
          <div className="absolute inset-0 opacity-5">
            <div
              className="absolute inset-0"
               style={{ backgroundColor: "hsl(var(--sage) / 0.05)" }}
            />
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-4">
            {activeCampaigns.length === 1 ? (
              // Single campaign display
              (() => {
                const campaign = activeCampaigns[0];
                const formatDate = (date: Date) =>
                  date.toLocaleDateString("it-IT", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  });
                const daysLeft = Math.ceil(
                  (campaign.dataFine.getTime() - new Date().getTime()) /
                    (1000 * 60 * 60 * 24),
                );

                return (
                  <div className="bg-off-white rounded-3xl shadow-2xl border border-sage/10 overflow-hidden">
                    {campaign.immagineSlider && (
                      <div className="w-full">
                        <img
                          src={campaign.immagineSlider}
                          alt={campaign.nome}
                          className="w-full h-64 md:h-96 object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}

                    <div className="flex flex-col md:flex-row items-center gap-8 p-8 md:p-12">
                      <div className="flex-1 text-center md:text-left space-y-6">
                        <div className="inline-flex items-center gap-2 bg-sage/10 px-4 py-2 rounded-full">
                          <Sparkles className="w-4 h-4 text-sage" />
                          <span className="text-xs font-semibold uppercase tracking-wider text-sage">
                            Prenotazioni Aperte
                          </span>
                        </div>

                        {!campaign.immagineSlider && (
                          <h2 className="break-words text-3xl font-playfair leading-tight text-blue-gray sm:text-4xl md:text-5xl">
                            {campaign.nome}
                          </h2>
                        )}

                        <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                          <div className="flex items-center gap-2 bg-sage/5 px-4 py-2 rounded-xl border border-sage/10">
                            <Calendar className="w-4 h-4 text-sage" />
                            <span className="text-sm font-medium text-blue-gray">
                              {formatDate(campaign.dataInizio)} —{" "}
                              {formatDate(campaign.dataFine)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 bg-cream/50 px-4 py-2 rounded-xl border border-terracotta/30">
                            <Clock className="w-4 h-4 text-terracotta" />
                            <span className="text-sm font-bold text-dark-sage">
                              {daysLeft} giorni rimasti
                            </span>
                          </div>
                        </div>

                        {campaign.descrizione && (
                          <p className="text-lg text-dark-sage leading-relaxed">
                            {campaign.descrizione}
                          </p>
                        )}
                      </div>

                      <div className="flex-shrink-0">
                        <Button
                          onClick={() => navigate(`/prenota/${campaign.code}`)}
                          size="lg"
                          className="bg-[hsl(120_7%_38%)] hover:bg-[hsl(120_7%_34%)] text-off-white text-lg font-bold px-8 py-6 shadow-lg hover:shadow-xl transition-all"
                          data-testid={`button-book-campaign-${campaign.id}`}
                        >
                          <Calendar className="w-5 h-5 mr-2" />
                          Prenota Subito
                        </Button>
                        <p className="text-center text-xs text-blue-gray/80 mt-3">
                          Posti limitati disponibili
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-center pb-6">
                      <FloralDivider className="w-32 h-8 text-sage/20" />
                    </div>
                  </div>
                );
              })()
            ) : (
              // Multiple campaigns carousel
              <div>
                <div className="text-center mb-12">
                  <div className="inline-flex items-center gap-2 bg-sage/10 px-6 py-3 rounded-full mb-6">
                    <Sparkles className="w-5 h-5 text-sage" />
                    <span className="text-sm font-semibold uppercase tracking-wider text-sage">
                      Prenotazioni Aperte
                    </span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-playfair text-blue-gray mb-2">
                    Offerte Speciali
                  </h2>
                    <p className="text-xl text-dark-sage">
                    Approfitta delle nostre promozioni stagionali
                  </p>
                </div>

                <div className="overflow-hidden" ref={emblaRef}>
                  <div className="flex">
                    {activeCampaigns.map((campaign) => {
                      const formatDate = (date: Date) =>
                        date.toLocaleDateString("it-IT", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        });
                      const daysLeft = Math.ceil(
                        (campaign.dataFine.getTime() - new Date().getTime()) /
                          (1000 * 60 * 60 * 24),
                      );

                      return (
                        <div
                          key={campaign.id}
                          className="flex-[0_0_100%] min-w-0 px-4"
                        >
                          <div className="bg-off-white rounded-3xl shadow-xl border border-sage/10 overflow-hidden">
                            {campaign.immagineSlider && (
                              <img
                                src={campaign.immagineSlider}
                                alt={campaign.nome}
                                className="w-full h-56 md:h-80 object-cover"
                                loading="lazy"
                              />
                            )}

                            <div className="p-8 md:p-12 text-center">
                              {!campaign.immagineSlider && (
                                <h3 className="break-words text-2xl font-playfair leading-tight text-blue-gray sm:text-3xl md:text-4xl mb-4">
                                  {campaign.nome}
                                </h3>
                              )}

                              <div className="flex flex-wrap gap-3 justify-center mb-6">
                                <div className="flex items-center gap-2 bg-sage/5 px-4 py-2 rounded-xl border border-sage/10">
                                  <Calendar className="w-4 h-4 text-sage" />
                                  <span className="text-sm font-medium text-blue-gray">
                                    {formatDate(campaign.dataInizio)} —{" "}
                                    {formatDate(campaign.dataFine)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 bg-cream/50 px-4 py-2 rounded-xl border border-terracotta/30">
                                  <Clock className="w-4 h-4 text-terracotta" />
                                  <span className="text-sm font-bold text-dark-sage">
                                    {daysLeft} giorni rimasti
                                  </span>
                                </div>
                              </div>

                              {campaign.descrizione && (
                                <p className="text-lg text-dark-sage mb-8 leading-relaxed">
                                  {campaign.descrizione}
                                </p>
                              )}

                              <Button
                                onClick={() =>
                                  navigate(`/prenota/${campaign.code}`)
                                }
                                size="lg"
                                className="bg-[hsl(120_7%_38%)] hover:bg-[hsl(120_7%_34%)] text-off-white font-bold px-8 py-4 shadow-lg hover:shadow-xl transition-all"
                                data-testid={`button-book-campaign-${campaign.id}`}
                              >
                                <Calendar className="w-5 h-5 mr-2" />
                                Prenota Subito
                              </Button>
                            </div>

                            <div className="flex justify-center pb-6">
                              <FloralDivider className="w-32 h-8 text-sage/20" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Carousel indicators */}
                <div className="flex justify-center gap-2 mt-8">
                  {activeCampaigns.map((_, idx) => (
                    <div
                      key={idx}
                      className="w-2 h-2 rounded-full bg-sage/30 hover:bg-sage/60 transition-colors cursor-pointer"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* About Preview */}
      <section className="py-12 sm:py-16 md:py-20 bg-cream/30 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6 sm:gap-8 md:gap-12 items-center">
            <div className="rounded-xl sm:rounded-2xl overflow-hidden shadow-lg animate-slide-up group">
              <img
                src="/images/gennaro-mazzacane.jpg"
                alt="Gennaro Mazzacane - Fotografo Professionista"
                className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
            </div>
            <div className="animate-fade-in">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-playfair text-blue-gray mb-3 sm:mb-4 md:mb-6">
                La Mia Storia
              </h2>
              <p className="text-base sm:text-lg text-dark-sage mb-4 sm:mb-6">
                La mia passione per la fotografia inizia a soli 10 anni, con una
                macchina fotografica trovata in una confezione di merendine
                Kinder Brioss...
              </p>
              <Link href="/storie">
                <Button
                  variant="outline"
                  className="border-sage text-sage hover:bg-sage/10"
                >
                  <BookOpen className="mr-2 h-4 w-4" />
                  Leggi la Storia Completa
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Gallerie Speciali */}
      <section className="py-20 bg-off-white px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-sage rounded-full mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-playfair text-blue-gray mb-4">
              Gallerie Speciali
            </h2>
            <p className="text-xl text-dark-sage">
              Accedi alle nostre gallerie tematiche esclusive con il PIN che ti
              è stato fornito
            </p>
          </div>

          <div className="bg-off-white rounded-2xl shadow-xl border border-sage/10 p-8 md:p-12">
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 sm:gap-4 mb-8">
              <div className="text-center">
                <div className="bg-sage/5 rounded-xl p-3 sm:p-4 border border-sage/10 hover:bg-sage/10 transition-colors">
                  <span className="text-3xl sm:text-4xl">🎄</span>
                  <p className="text-xs sm:text-sm text-dark-sage mt-2 font-medium">
                    Natale
                  </p>
                </div>
              </div>
              <div className="text-center">
                <div className="bg-sage/5 rounded-xl p-3 sm:p-4 border border-sage/10 hover:bg-sage/10 transition-colors">
                  <span className="text-3xl sm:text-4xl">🎭</span>
                  <p className="text-xs sm:text-sm text-dark-sage mt-2 font-medium">
                    Carnevale
                  </p>
                </div>
              </div>
              <div className="text-center">
                <div className="bg-sage/5 rounded-xl p-3 sm:p-4 border border-sage/10 hover:bg-sage/10 transition-colors">
                  <span className="text-3xl sm:text-4xl">💕</span>
                  <p className="text-xs sm:text-sm text-dark-sage mt-2 font-medium">
                    San Valentino
                  </p>
                </div>
              </div>
              <div className="text-center hidden sm:block">
                <div className="bg-sage/5 rounded-xl p-3 sm:p-4 border border-sage/10 hover:bg-sage/10 transition-colors">
                  <span className="text-3xl sm:text-4xl">🐰</span>
                  <p className="text-xs sm:text-sm text-dark-sage mt-2 font-medium">
                    Pasqua
                  </p>
                </div>
              </div>
              <div className="text-center hidden sm:block">
                <div className="bg-sage/5 rounded-xl p-3 sm:p-4 border border-sage/10 hover:bg-sage/10 transition-colors">
                  <span className="text-3xl sm:text-4xl">🎃</span>
                  <p className="text-xs sm:text-sm text-dark-sage mt-2 font-medium">
                    Halloween
                  </p>
                </div>
              </div>
            </div>

            <div className="text-center">
              <p className="text-dark-sage mb-6">
                Hai ricevuto un PIN per una galleria speciale? Accedi qui:
              </p>
              <Link href="/special-gallery">
                <Button
                  size="lg"
                  className="bg-[hsl(120_7%_38%)] hover:bg-[hsl(120_7%_34%)] text-off-white shadow-lg hover:shadow-xl transition-all"
                  data-testid="button-special-gallery"
                >
                  <Lock className="mr-2 h-5 w-5" />
                  Accedi con PIN
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Accesso Gallerie CTA */}
      <section className="py-10 sm:py-16 md:py-20 bg-cream/45 px-4">
        <div className="max-w-4xl mx-auto text-center text-[hsl(200_21%_34%)]">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-playfair mb-3 sm:mb-4">
            Hai partecipato a un evento?
          </h2>
          <p className="text-base sm:text-lg md:text-xl mb-6 sm:mb-8">
            Accedi alla galleria e rivivi le emozioni del giorno speciale
          </p>
          <Link href="/accesso-galleria" className="inline-block max-w-full">
            <Button
              size="lg"
              className="h-auto max-w-full whitespace-normal bg-[hsl(14_37%_40%)] px-5 py-3 text-center leading-snug text-off-white hover:bg-[hsl(14_37%_36%)]"
              data-testid="button-accesso-galleria-cta"
            >
              <ImageIcon className="mr-2 h-5 w-5" />
              Accedi alla Galleria
            </Button>
          </Link>
        </div>
      </section>

      {/* CTA Book - Lasciati Trasportare */}
      <section className="py-12 sm:py-16 md:py-20 bg-[hsl(200_21%_34%)] px-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div
            className="absolute inset-0"
            style={{
               backgroundColor: "hsl(var(--cream) / 0.05)",
            }}
          />
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="grid items-center gap-7 md:grid-cols-2 md:gap-8">
            <div className="flex justify-center md:justify-end">
              <div className="relative group max-w-[260px] sm:max-w-sm">
                <div className="absolute inset-0 bg-white/20 rounded-2xl transform rotate-3 group-hover:rotate-6 transition-transform duration-300" />
                <img
                  src={`${import.meta.env.BASE_URL || '/'}images/libro-copertina.jpg`}
                  alt="Lasciati Trasportare - Copertina del Libro"
                  className="relative w-full max-w-sm rounded-2xl shadow-2xl transform group-hover:scale-105 transition-transform duration-300"
                />
              </div>
            </div>

            <div className="space-y-5 text-center text-off-white md:space-y-6 md:text-left">
              <div>
                  <h2 className="text-3xl sm:text-4xl md:text-5xl font-playfair mb-4">
                    Lasciati <span className="text-cream">Trasportare</span>
                </h2>
                <p className="text-base sm:text-xl text-white/90 mb-2 leading-relaxed">
                  Un libro sul matrimonio, le emozioni e le fotografie che resteranno.
                </p>
                <p className="text-sm sm:text-lg text-white/80 leading-relaxed">
                  Leggi l’anteprima e scarica gratuitamente il PDF nella pagina dedicata.
                </p>
              </div>

              <div className="space-y-3 text-white/90">
                <div className="flex items-start gap-2">
                  <Heart className="h-5 w-5 mt-1 flex-shrink-0 text-cream" />
                  <span>
                    Consigli pratici per ogni fase dell'organizzazione
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Camera className="h-5 w-5 mt-1 flex-shrink-0 text-cream" />
                  <span>Segreti per foto di matrimonio indimenticabili</span>
                </div>
                <div className="flex items-start gap-2">
                  <Sparkles className="h-5 w-5 mt-1 flex-shrink-0 text-cream" />
                  <span>Storie vere ed emozioni autentiche</span>
                </div>
              </div>

              <Link href="/lasciati-trasportare" className="inline-block max-w-full">
                <Button
                  size="lg"
                  className="h-auto max-w-full whitespace-normal bg-off-white px-5 py-3 text-center leading-snug text-blue-gray shadow-lg transition-colors hover:bg-cream hover:text-blue-gray"
                  data-testid="button-libro"
                >
                  <BookOpen className="mr-2 h-5 w-5" />
                  Scopri il libro
                </Button>
              </Link>

              <p className="text-sm text-white/70">
                Anteprima e download gratuito · Nessuna registrazione
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Google Reviews Section */}
      <ReviewsWidget />

      {/* Latest Blog Posts Section */}
      <section className="py-12 sm:py-16 md:py-20 bg-off-white px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8 sm:mb-10 md:mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-sage/10 rounded-full mb-4">
              <BookOpen className="w-8 h-8 text-sage" />
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-playfair text-blue-gray mb-3 sm:mb-4">
              Dal Nostro Blog
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-dark-sage">
              Storie, consigli e ispirazioni dal mondo della fotografia
            </p>
          </div>

          {loadingBlog ? (
            <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-off-white rounded-xl shadow-lg overflow-hidden animate-pulse">
                  <div className="bg-beige h-48" />
                  <div className="p-6">
                    <div className="h-4 bg-beige rounded w-3/4 mb-3" />
                    <div className="h-3 bg-beige rounded w-1/2 mb-4" />
                    <div className="h-3 bg-beige rounded w-full mb-2" />
                    <div className="h-3 bg-beige rounded w-5/6" />
                  </div>
                </div>
              ))}
            </div>
          ) : blogPosts.length > 0 ? (
            <>
              <div className="grid md:grid-cols-3 gap-6 sm:gap-8 mb-8">
                {blogPosts.map((post) => (
                  <Link key={post.id} href={post.href}>
                    <div className="bg-off-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 cursor-pointer group h-full flex flex-col">
                      {post.coverImage && (
                         <div className="aspect-[4/3] overflow-hidden bg-beige">
                          <img
                            src={post.coverImage}
                            alt={post.title}
                             className="wedding-cover-card-image w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                             style={weddingCoverPositionStyle(
                               post.kind === 'blog' ? post.coverImagePosition : post.coverPhotoPosition,
                               post.kind === 'blog' ? post.coverImageMobilePosition : post.coverPhotoMobilePosition,
                               post.kind === 'blog' ? post.coverImageCardPosition : post.coverPhotoCardPosition,
                               post.kind === 'blog' ? post.coverImageCardMobilePosition : post.coverPhotoCardMobilePosition,
                             )}
                            loading="lazy"
                          />
                        </div>
                      )}
                      <div className="p-6 flex-1 flex flex-col">
                        <div className="flex items-center gap-2 text-xs text-blue-gray/80 mb-3">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(post.publishedAt)}</span>
                          {post.kind === 'real-wedding' && <span className="rounded-full bg-sage/10 px-2 py-0.5 font-semibold text-sage">Real Wedding</span>}
                        </div>
                        <h3 className="text-xl font-playfair text-blue-gray group-hover:text-sage transition-colors mb-3 line-clamp-2">
                          {post.title}
                        </h3>
                        <p className="text-dark-sage text-sm line-clamp-3 flex-1">
                          {post.excerpt}
                        </p>
                        <div className="mt-4 text-sage font-semibold text-sm group-hover:text-dark-sage transition-colors">
                          {post.kind === 'real-wedding' ? 'Scopri il Real Wedding →' : 'Leggi articolo →'}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="text-center">
                <Link href="/blog">
                  <Button size="lg" variant="outline" className="border-sage text-sage hover:bg-sage/10">
                    <BookOpen className="mr-2 h-5 w-5" />
                    Vai al Blog
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-blue-gray/80 text-lg">Nuovi articoli in arrivo...</p>
            </div>
          )}
        </div>
      </section>

      {/* Dove Ci Troviamo Section */}
      <section className="py-12 sm:py-16 md:py-20 bg-mint/25 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8 sm:mb-10 md:mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-sage/10 rounded-full mb-4">
              <MapPin className="w-8 h-8 text-sage" />
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-playfair text-blue-gray mb-3 sm:mb-4">
              {publicAddress ? "Dove Ci Troviamo" : "Contatti e Appuntamenti"}
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-dark-sage max-w-2xl mx-auto">
              {publicAddress
                ? "Vieni a trovarci nel nostro studio"
                : "Prenota un appuntamento o contattaci tramite i canali disponibili."}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            {/* Info Column */}
            <div className="space-y-6">
              <PublicContactCard
                address={publicAddress}
                phone={publicPhone}
                email={publicEmail}
              />

              <Link href="/consulenze">
                <Button size="lg" className="h-auto w-full whitespace-normal bg-[hsl(120_7%_38%)] px-5 py-3 text-center leading-snug text-off-white shadow-lg transition-all hover:bg-[hsl(120_7%_34%)] hover:shadow-xl">
                  <Calendar className="mr-2 h-5 w-5" />
                  Prenota un Appuntamento
                </Button>
              </Link>
            </div>

            {/* Map Column */}
            <div className="relative isolate h-[400px] overflow-hidden rounded-2xl border border-sage/20 bg-sage/15 shadow-2xl md:h-[500px]">
              {publicAddress ? (
                <>
                  <iframe
                    className="absolute inset-0 h-full w-full border-0"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(publicAddress)}&z=15&output=embed`}
                    title={`Mappa dello studio Image Studio: ${publicAddress}`}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                    style={{ filter: "grayscale(0.45) saturate(0.78) contrast(0.96)" }}
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-mint/10 mix-blend-multiply"
                  />
                  <div className="absolute inset-x-4 top-1/2 z-10 mx-auto max-w-sm -translate-y-1/2 rounded-2xl border border-sage/40 bg-off-white/95 p-6 text-center shadow-xl backdrop-blur-sm sm:p-7">
                    <MapPin className="mx-auto mb-2.5 h-10 w-10 text-terracotta" />
                    <h3 className="mb-2 font-playfair text-2xl text-blue-gray">
                      Ci trovi qui
                    </h3>
                    <p className="mb-5 break-words text-dark-sage">
                      {publicAddress}
                    </p>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(publicAddress)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[hsl(120_7%_38%)] px-5 py-3 font-medium text-off-white shadow-md transition-all hover:bg-[hsl(120_7%_34%)] hover:shadow-lg"
                    >
                      <MapPin className="h-5 w-5" />
                      Apri in Google Maps
                    </a>
                  </div>
                </>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center bg-sage/15 p-8 text-center text-blue-gray/80">
                  <MapPin className="mx-auto mb-4 h-16 w-16 opacity-30" />
                  <p>Indirizzo non disponibile</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* SEO Local - Fotografo Aversa */}
      <section className="py-14 px-4 bg-cream/35">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col items-center gap-6 rounded-2xl border border-terracotta/15 bg-off-white p-5 shadow-sm sm:p-8 md:flex-row md:gap-8">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 text-[hsl(14_37%_40%)] text-xs font-semibold uppercase tracking-widest mb-3">
                <MapPin className="h-4 w-4" />
                Aversa · Agro Aversano · Campania
              </div>
              <h2 className="text-2xl md:text-3xl font-playfair text-blue-gray mb-3">
                Fotografo Professionista ad Aversa
              </h2>
              <p className="text-dark-sage mb-4 leading-relaxed">
                Studio fotografico con sede ad Aversa. Matrimoni, battesimi, comunioni e cerimonie
                nell'agro aversano — senza costi di trasferta per Aversa, Sant'Arpino, Succivo,
                Casal di Principe, Frignano, Parete, Lusciano, Teverola, Giugliano e tutta la provincia.
              </p>
              <Link href="/fotografo-aversa">
                <Button className="h-auto max-w-full whitespace-normal rounded-full bg-[hsl(14_37%_40%)] px-5 py-3 text-center leading-snug text-off-white hover:bg-[hsl(14_37%_36%)]">
                  Scopri lo studio ad Aversa
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="hidden md:flex flex-col items-center justify-center text-center bg-[hsl(200_21%_34%)] rounded-xl px-8 py-6 text-off-white min-w-[180px]">
              <span className="text-4xl font-playfair font-bold text-cream">500+</span>
              <span className="text-sm text-off-white mt-1">Matrimoni documentati</span>
              <div className="border-t border-white/20 my-3 w-full" />
              <span className="text-4xl font-playfair font-bold text-cream">10+</span>
              <span className="text-sm text-off-white mt-1">Anni di esperienza</span>
            </div>
          </div>
        </div>
      </section>

      {/* Instagram Feed */}
      {instagramProfile && (
        <section className="py-20 bg-light-mint/35 relative overflow-hidden">
          <FloralCorner
            position="top-left"
            className="absolute top-0 left-0 w-32 h-32 opacity-10 pointer-events-none"
          />
          <FloralCorner
            position="bottom-right"
            className="absolute bottom-0 right-0 w-32 h-32 opacity-10 pointer-events-none"
          />

          <div className="max-w-7xl mx-auto px-4 relative z-10">
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-sage/25 rounded-full mb-6">
                <Instagram className="w-10 h-10 text-sage" />
              </div>

              <h2 className="text-3xl sm:text-4xl font-playfair text-blue-gray mb-4">
                Seguici su Instagram
              </h2>

              <p className="text-xl text-dark-sage max-w-2xl mx-auto mb-6">
                Scopri i nostri ultimi lavori, dietro le quinte e lasciati
                ispirare dalle emozioni che catturiamo ogni giorno
              </p>

              <a
                href={instagramProfile.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[hsl(120_7%_38%)] hover:bg-[hsl(120_7%_34%)] text-off-white font-medium rounded-lg shadow-md transition-all hover:shadow-lg hover:scale-105"
                data-testid="link-instagram-section"
              >
                <Instagram className="w-5 h-5" />
                <span>@{instagramProfile.handle}</span>
              </a>
            </div>

            {/* Instagram Feed Embed */}
            <div className="bg-off-white rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl border border-sage/10 p-4 sm:p-6 md:p-8 overflow-hidden">
              <div
                className="w-full"
                style={{ maxHeight: "600px", overflowY: "auto" }}
              >
                <iframe
                  src={`https://www.instagram.com/${instagramProfile.handle}/embed`}
                  className="w-full border-0 rounded-lg"
                  style={{ minHeight: "350px", height: "450px" }}
                  scrolling="yes"
                  title="Instagram Feed"
                  loading="lazy"
                />
              </div>

              <div className="mt-6 pt-6 border-t border-sage/10 text-center">
                <p className="text-sm text-blue-gray/80 italic">
                  Resta aggiornato sui nostri servizi, promozioni e scopri le
                  storie dei nostri clienti soddisfatti
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {whatsappNumber && (
        <section className="bg-off-white px-4 py-16">
          <div className="mx-auto max-w-4xl rounded-2xl bg-sage/15 px-6 py-10 text-center shadow-sm">
            <MessageCircle className="mx-auto mb-4 h-12 w-12 text-sage" />
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-sage">
              {homepageContent.whatsapp.subtitle}
            </p>
            <h2 className="mb-4 text-3xl font-playfair text-blue-gray">
              {homepageContent.whatsapp.title}
            </h2>
            <p className="mx-auto mb-6 max-w-2xl text-dark-sage">
              {homepageContent.whatsapp.description}
            </p>
            <a
              href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(homepageContent.whatsapp.initialMessage)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="lg" className="h-auto max-w-full whitespace-normal bg-[hsl(120_7%_38%)] px-5 py-3 text-center leading-snug text-off-white hover:bg-[hsl(120_7%_34%)]">
                <MessageCircle className="mr-2 h-5 w-5" />
                <span className="min-w-0">{homepageContent.whatsapp.buttonText}</span>
              </Button>
            </a>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-[hsl(200_21%_34%)] text-white py-12 px-4">
        <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-8">
          <div>
            <StudioLogo 
              showLink={false}
              imgClassName="h-10 w-auto mb-2" 
              textClassName="text-2xl font-playfair text-white"
            />
            <p className="text-cream mb-4">
              {studioSettings.about ||
                "Studio fotografico per matrimoni ed eventi a Napoli e Caserta"}
            </p>
            {instagramProfile && (
              <a
                href={instagramProfile.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-cream hover:text-white transition"
                data-testid="link-instagram-footer"
              >
                <Instagram className="h-5 w-5" />
                Seguici su Instagram
              </a>
            )}
          </div>
          <div>
            <h4 className="font-semibold mb-4">Link Utili</h4>
            <div className="space-y-2">
              <Link
                href="/fotografo-aversa"
                className="block text-cream hover:text-white font-medium"
              >
                Fotografo ad Aversa
              </Link>
              <Link
                href="/portfolio/matrimonio"
                className="block text-cream hover:text-white"
              >
                Portfolio Matrimoni
              </Link>
              <Link
                href="/portfolio"
                className="block text-cream hover:text-white"
              >
                Tutte le categorie
              </Link>
              <Link
                href="/storie"
                className="block text-cream hover:text-white"
              >
                La Mia Storia
              </Link>
              <Link
                href="/blog"
                className="block text-cream hover:text-white"
              >
                Blog
              </Link>
              <Link
                href="/consulenze"
                className="block text-cream hover:text-white"
              >
                Contattami
              </Link>
              <a
                href="https://share.google/SW1hp2vnc9Csiwfkc"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-cream hover:text-white"
              >
                Recensioni
              </a>
              <Link
                href="/accesso-galleria"
                className="block text-cream hover:text-white"
              >
                Accesso Galleria
              </Link>
              <Link
                href="/stampa-foto-aversa"
                className="block font-medium text-cream hover:text-white"
              >
                Stampa Foto Online
              </Link>
              <Link
                href="/privacy"
                className="block text-cream hover:text-white"
              >
                Privacy
              </Link>
            </div>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Contatti</h4>
            <div className="space-y-3">
              {publicAddress && (
                <div className="flex items-start gap-2 text-cream">
                  <MapPin className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <span>{publicAddress}</span>
                </div>
              )}
              {publicPhone && (
                <a
                  href={`tel:${publicPhone}`}
                  className="flex items-center gap-2 text-cream hover:text-white transition"
                >
                  <Phone className="h-5 w-5 flex-shrink-0" />
                  <span>{publicPhone}</span>
                </a>
              )}
              {publicEmail && (
                <a
                  href={`mailto:${publicEmail}`}
                  className="flex items-center gap-2 text-cream hover:text-white transition"
                >
                  <Mail className="h-5 w-5 flex-shrink-0" />
                  <span>{publicEmail}</span>
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-8 pt-8 border-t border-cream/20 text-center text-cream/75">
          <p>
            © {new Date().getFullYear()} {studioSettings.name}. Tutti i
            diritti riservati.
          </p>
        </div>
        {!studioSettingsLoading && !studioSettingsError && (
          <PublicStudioStructuredData
            name={studioSettings.name}
            address={publicAddress}
            phone={publicPhone}
            email={publicEmail}
            websiteUrl={studioSettings.websiteUrl}
            logo={studioSettings.logo}
            openingTime={studioSettings.publicOpeningTime}
            closingTime={studioSettings.publicClosingTime}
          />
        )}
      </footer>
    </div>
  );
}
