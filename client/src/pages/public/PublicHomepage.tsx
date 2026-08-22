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
} from "lucide-react";
import { useStudio } from "@/context/StudioContext";
import HeroSlideshow from "@/components/HeroSlideshow";
import Navigation from "@/components/Navigation";
import type { BookingCampaignFE } from "@shared/booking-types";
import { BlogPost, BlogPostStatus, WeddingVideo } from "@shared/schema";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { FloralDivider, FloralCorner } from "@/components/WeddingIllustrations";


import ReviewsWidget from "@/components/ReviewsWidget";
import { usePrefetchPopularPages } from "@/hooks/usePrefetch";
import StudioLogo from "@/components/StudioLogo";
import { useSEO } from "@/hooks/useSEO";
import { WEDDING_HOME_SEO } from "@shared/public-seo-content";
import { resolveHomepageContent } from "@shared/homepage-content";
import { instagramHandle, normalizeSocialUrl } from "@/lib/social-links";

interface PortfolioPhoto {
  id: string;
  photoUrl: string;
  galleryName: string;
  jobType: string;
  featured: boolean;
  sortOrder?: number;
}

type PortfolioPreviewMode = "wedding" | "mixed-fallback";

export default function PublicHomepage() {
  const { studioSettings } = useStudio();
  const homepageContent = resolveHomepageContent(studioSettings.homepageContent);
  const instagramUrl = normalizeSocialUrl("instagram", studioSettings.socialLinks?.instagram);
  const instagramUsername = instagramHandle(studioSettings.socialLinks?.instagram);
  const [, navigate] = useLocation();
  const [portfolioPhotos, setPortfolioPhotos] = useState<PortfolioPhoto[]>([]);
  const [portfolioPreviewMode, setPortfolioPreviewMode] =
    useState<PortfolioPreviewMode>("wedding");
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [activeCampaigns, setActiveCampaigns] = useState<BookingCampaignFE[]>([]);
  const [blogPosts, setBlogPosts] = useState<any[]>([]);
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
      const snapshot = await getDocs(q);
      const posts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BlogPost[];
      setBlogPosts(posts);
    } catch (error) {
      console.error('Errore caricamento blog posts:', error);
    } finally {
      setLoadingBlog(false);
    }
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
    <div className="min-h-screen bg-gradient-to-b from-white to-[#F5EFE6] overflow-x-hidden max-w-full">
      {/* Navigation */}
      <Navigation />

      {/* Hero Section */}
      <section className="pt-24 sm:pt-28 md:pt-32 pb-12 sm:pb-16 md:pb-20 px-4 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid w-full min-w-0 grid-cols-1 items-center gap-8 sm:gap-10 md:grid-cols-2 md:gap-12">
            <div className="min-w-0 max-w-full animate-fade-in">
              <p className="text-sm sm:text-base font-semibold uppercase tracking-[0.2em] text-sage mb-3">
                {homepageContent.hero.eyebrow}
              </p>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-playfair text-blue-gray mb-4 sm:mb-6 leading-tight">
                {homepageContent.hero.title}
              </h1>
              <p className="text-2xl sm:text-3xl font-playfair text-[#C67B5C] mb-4">
                {homepageContent.hero.tagline}
              </p>
              <p className="text-lg sm:text-xl text-gray-600 mb-3 sm:mb-4">
                {homepageContent.hero.description}
              </p>
              <p className="text-base sm:text-lg text-gray-500 mb-6 sm:mb-8">
                {homepageContent.hero.signature}
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/consulenze">
                  <Button
                    size="lg"
                    className="bg-sage hover:bg-dark-sage text-white"
                    data-testid="button-prenota-hero"
                  >
                    <Calendar className="mr-2 h-5 w-5" />
                    {homepageContent.hero.primaryCta}
                  </Button>
                </Link>
                <Link href="/portfolio/matrimonio">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-sage text-sage hover:bg-sage/10"
                    data-testid="button-portfolio-hero"
                  >
                    <Camera className="mr-2 h-5 w-5" />
                    {homepageContent.hero.portfolioCta}
                  </Button>
                </Link>
              </div>
              <div className="mt-6">
                <Link href="/accesso-galleria">
                  <Button
                    variant="link"
                    className="text-blue-gray hover:text-sage"
                    data-testid="link-accesso-galleria-hero"
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    {homepageContent.hero.galleryAccessText}
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

      {/* Stats Section */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 text-center">
            <div>
              <div className="text-3xl sm:text-4xl md:text-5xl font-playfair text-sage mb-2">
                10+
              </div>
              <div className="text-sm sm:text-base text-gray-600">
                Anni di Esperienza
              </div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl md:text-5xl font-playfair text-sage mb-2">
                500+
              </div>
              <div className="text-sm sm:text-base text-gray-600">
                Matrimoni
              </div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl md:text-5xl font-playfair text-sage mb-2">
                1000+
              </div>
              <div className="text-sm sm:text-base text-gray-600">Eventi</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl md:text-5xl font-playfair text-sage mb-2">
                100%
              </div>
              <div className="text-sm sm:text-base text-gray-600">Passione</div>
            </div>
          </div>
        </div>
      </section>

      {/* Portfolio Preview */}
      <section className="py-12 sm:py-16 md:py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8 sm:mb-10 md:mb-12 animate-fade-in">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-playfair text-blue-gray mb-3 sm:mb-4">
              {homepageContent.portfolio.title}
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-gray-600">
              {homepageContent.portfolio.description}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6 mb-6 sm:mb-8">
            {loadingPhotos ? (
              [1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="bg-gray-200 rounded-lg animate-pulse"
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
                        e.currentTarget.parentElement!.innerHTML = `<div class="w-full h-full bg-red-100 flex items-center justify-center text-red-600 text-sm p-4 text-center">Errore caricamento foto</div>`;
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
                <p className="text-lg text-gray-500">
                  Nessuna foto nel portfolio. Le foto in evidenza verranno
                  visualizzate qui.
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  Vai al Portfolio Manager per aggiungere foto in evidenza.
                </p>
              </div>
            )}
          </div>
          {portfolioPreviewMode === "mixed-fallback" && (
            <p className="text-center text-sm text-gray-500 mb-4">
              Selezione matrimoniale in aggiornamento: mostriamo anche alcuni
              lavori dello studio per farti conoscere il portfolio completo.
            </p>
          )}
          <div className="text-center">
            <Link href="/portfolio/matrimonio">
              <Button
                size="lg"
                variant="outline"
                className="border-sage text-sage hover:bg-sage/10"
              >
                {homepageContent.portfolio.cta}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Servizi secondari: disponibili, ma distinti dal focus wedding. */}
      <section className="py-12 sm:py-16 bg-white px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-playfair text-blue-gray mb-3">
            {homepageContent.secondaryServices.title}
          </h2>
          <p className="text-base sm:text-lg text-gray-600 mb-6">
            {homepageContent.secondaryServices.description}
          </p>
          <Link href="/portfolio">
            <Button variant="outline" className="border-sage text-sage hover:bg-sage/10">
              {homepageContent.secondaryServices.cta}
            </Button>
          </Link>
        </div>
      </section>

      {/* Active Booking Campaigns */}
      {activeCampaigns.length > 0 && (
        <section className="py-20 bg-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-5">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(139, 154, 139, 0.05) 10px, rgba(139, 154, 139, 0.05) 20px)`,
              }}
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
                  <div className="bg-gradient-to-br from-white via-cream/30 to-white rounded-3xl shadow-2xl border border-sage/10 overflow-hidden">
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
                          <h2 className="text-4xl md:text-5xl font-playfair text-blue-gray">
                            {campaign.nome}
                          </h2>
                        )}

                        <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                          <div className="flex items-center gap-2 bg-sage/5 px-4 py-2 rounded-xl border border-sage/10">
                            <Calendar className="w-4 h-4 text-sage" />
                            <span className="text-sm font-medium text-gray-700">
                              {formatDate(campaign.dataInizio)} —{" "}
                              {formatDate(campaign.dataFine)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 bg-yellow-50 px-4 py-2 rounded-xl border border-yellow-200">
                            <Clock className="w-4 h-4 text-yellow-600" />
                            <span className="text-sm font-bold text-yellow-700">
                              {daysLeft} giorni rimasti
                            </span>
                          </div>
                        </div>

                        {campaign.descrizione && (
                          <p className="text-lg text-gray-600 leading-relaxed">
                            {campaign.descrizione}
                          </p>
                        )}
                      </div>

                      <div className="flex-shrink-0">
                        <Button
                          onClick={() => navigate(`/prenota/${campaign.code}`)}
                          size="lg"
                          className="bg-sage hover:bg-dark-sage text-white text-lg font-bold px-8 py-6 shadow-lg hover:shadow-xl transition-all"
                          data-testid={`button-book-campaign-${campaign.id}`}
                        >
                          <Calendar className="w-5 h-5 mr-2" />
                          Prenota Subito
                        </Button>
                        <p className="text-center text-xs text-gray-500 mt-3">
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
                  <h2 className="text-4xl font-playfair text-blue-gray mb-2">
                    Offerte Speciali
                  </h2>
                  <p className="text-xl text-gray-600">
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
                          <div className="bg-gradient-to-br from-white via-cream/30 to-white rounded-3xl shadow-xl border border-sage/10 overflow-hidden">
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
                                <h3 className="text-3xl md:text-4xl font-playfair text-blue-gray mb-4">
                                  {campaign.nome}
                                </h3>
                              )}

                              <div className="flex flex-wrap gap-3 justify-center mb-6">
                                <div className="flex items-center gap-2 bg-sage/5 px-4 py-2 rounded-xl border border-sage/10">
                                  <Calendar className="w-4 h-4 text-sage" />
                                  <span className="text-sm font-medium text-gray-700">
                                    {formatDate(campaign.dataInizio)} —{" "}
                                    {formatDate(campaign.dataFine)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 bg-yellow-50 px-4 py-2 rounded-xl border border-yellow-200">
                                  <Clock className="w-4 h-4 text-yellow-600" />
                                  <span className="text-sm font-bold text-yellow-700">
                                    {daysLeft} giorni rimasti
                                  </span>
                                </div>
                              </div>

                              {campaign.descrizione && (
                                <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                                  {campaign.descrizione}
                                </p>
                              )}

                              <Button
                                onClick={() =>
                                  navigate(`/prenota/${campaign.code}`)
                                }
                                size="lg"
                                className="bg-sage hover:bg-dark-sage text-white font-bold px-8 py-4 shadow-lg hover:shadow-xl transition-all"
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
      <section className="py-12 sm:py-16 md:py-20 bg-white px-4">
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
              <p className="text-base sm:text-lg text-gray-600 mb-4 sm:mb-6">
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
      <section className="py-20 bg-white px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-sage rounded-full mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-4xl font-playfair text-blue-gray mb-4">
              Gallerie Speciali
            </h2>
            <p className="text-xl text-gray-600">
              Accedi alle nostre gallerie tematiche esclusive con il PIN che ti
              è stato fornito
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-sage/10 p-8 md:p-12">
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 sm:gap-4 mb-8">
              <div className="text-center">
                <div className="bg-sage/5 rounded-xl p-3 sm:p-4 border border-sage/10 hover:bg-sage/10 transition-colors">
                  <span className="text-3xl sm:text-4xl">🎄</span>
                  <p className="text-xs sm:text-sm text-gray-600 mt-2 font-medium">
                    Natale
                  </p>
                </div>
              </div>
              <div className="text-center">
                <div className="bg-sage/5 rounded-xl p-3 sm:p-4 border border-sage/10 hover:bg-sage/10 transition-colors">
                  <span className="text-3xl sm:text-4xl">🎭</span>
                  <p className="text-xs sm:text-sm text-gray-600 mt-2 font-medium">
                    Carnevale
                  </p>
                </div>
              </div>
              <div className="text-center">
                <div className="bg-sage/5 rounded-xl p-3 sm:p-4 border border-sage/10 hover:bg-sage/10 transition-colors">
                  <span className="text-3xl sm:text-4xl">💕</span>
                  <p className="text-xs sm:text-sm text-gray-600 mt-2 font-medium">
                    San Valentino
                  </p>
                </div>
              </div>
              <div className="text-center hidden sm:block">
                <div className="bg-sage/5 rounded-xl p-3 sm:p-4 border border-sage/10 hover:bg-sage/10 transition-colors">
                  <span className="text-3xl sm:text-4xl">🐰</span>
                  <p className="text-xs sm:text-sm text-gray-600 mt-2 font-medium">
                    Pasqua
                  </p>
                </div>
              </div>
              <div className="text-center hidden sm:block">
                <div className="bg-sage/5 rounded-xl p-3 sm:p-4 border border-sage/10 hover:bg-sage/10 transition-colors">
                  <span className="text-3xl sm:text-4xl">🎃</span>
                  <p className="text-xs sm:text-sm text-gray-600 mt-2 font-medium">
                    Halloween
                  </p>
                </div>
              </div>
            </div>

            <div className="text-center">
              <p className="text-gray-600 mb-6">
                Hai ricevuto un PIN per una galleria speciale? Accedi qui:
              </p>
              <Link href="/special-gallery">
                <Button
                  size="lg"
                  className="bg-sage hover:bg-dark-sage text-white shadow-lg hover:shadow-xl transition-all"
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
      <section className="py-12 sm:py-16 md:py-20 bg-gradient-to-r from-terracotta to-[#C67B5C] px-4">
        <div className="max-w-4xl mx-auto text-center text-white">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-playfair mb-3 sm:mb-4">
            Hai partecipato a un evento?
          </h2>
          <p className="text-base sm:text-lg md:text-xl mb-6 sm:mb-8">
            Accedi alla galleria e rivivi le emozioni del giorno speciale
          </p>
          <Link href="/accesso-galleria">
            <Button
              size="lg"
              className="bg-white text-terracotta hover:bg-gray-100"
              data-testid="button-accesso-galleria-cta"
            >
              <ImageIcon className="mr-2 h-5 w-5" />
              Accedi alla Galleria
            </Button>
          </Link>
        </div>
      </section>

      {/* CTA Book - Lasciati Trasportare */}
      <section className="py-12 sm:py-16 md:py-20 bg-gradient-to-br from-[#8B9A8B] via-[#9AA89A] to-[#7A8A7A] px-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255, 255, 255, 0.1) 10px, rgba(255, 255, 255, 0.1) 20px)`,
            }}
          />
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="flex justify-center md:justify-end">
              <div className="relative group">
                <div className="absolute inset-0 bg-white/20 rounded-2xl transform rotate-3 group-hover:rotate-6 transition-transform duration-300" />
                <img
                  src={`${import.meta.env.BASE_URL || '/'}images/libro-copertina.jpg`}
                  alt="Lasciati Trasportare - Copertina del Libro"
                  className="relative w-full max-w-sm rounded-2xl shadow-2xl transform group-hover:scale-105 transition-transform duration-300"
                />
              </div>
            </div>

            <div className="text-white space-y-6">
              <div>
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-playfair mb-4">
                  Lasciati <span className="text-[#F5E6D3]">Trasportare</span>
                </h2>
                <p className="text-lg sm:text-xl text-white/90 mb-2">
                  Un viaggio emozionante attraverso il mondo dei matrimoni e
                  della fotografia
                </p>
                <p className="text-base sm:text-lg text-white/80">
                  La guida completa per organizzare il tuo matrimonio perfetto,
                  raccontata da un fotografo professionista
                </p>
              </div>

              <div className="space-y-3 text-white/90">
                <div className="flex items-start gap-2">
                  <Heart className="h-5 w-5 mt-1 flex-shrink-0 text-[#F5E6D3]" />
                  <span>
                    Consigli pratici per ogni fase dell'organizzazione
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Camera className="h-5 w-5 mt-1 flex-shrink-0 text-[#F5E6D3]" />
                  <span>Segreti per foto di matrimonio indimenticabili</span>
                </div>
                <div className="flex items-start gap-2">
                  <Sparkles className="h-5 w-5 mt-1 flex-shrink-0 text-[#F5E6D3]" />
                  <span>Storie vere ed emozioni autentiche</span>
                </div>
              </div>

              <a
                href={`${import.meta.env.BASE_URL || '/'}docs/lasciati-trasportare.pdf`}
                download="Lasciati-Trasportare.pdf"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button
                  size="lg"
                  className="bg-white text-sage hover:bg-cream hover:text-sage transition-colors shadow-lg"
                  data-testid="button-libro"
                >
                  <BookOpen className="mr-2 h-5 w-5" />
                  Scarica GRATIS il Libro
                </Button>
              </a>

              <p className="text-sm text-white/70">
                Download immediato - File PDF - Nessuna registrazione richiesta
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Google Reviews Section */}
      <ReviewsWidget />

      {/* Latest Blog Posts Section */}
      <section className="py-12 sm:py-16 md:py-20 bg-gradient-to-b from-white to-cream/30 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8 sm:mb-10 md:mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-sage/10 rounded-full mb-4">
              <BookOpen className="w-8 h-8 text-sage" />
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-playfair text-blue-gray mb-3 sm:mb-4">
              Dal Nostro Blog
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-gray-600">
              Storie, consigli e ispirazioni dal mondo della fotografia
            </p>
          </div>

          {loadingBlog ? (
            <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl shadow-lg overflow-hidden animate-pulse">
                  <div className="bg-gray-200 h-48" />
                  <div className="p-6">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
                    <div className="h-3 bg-gray-200 rounded w-1/2 mb-4" />
                    <div className="h-3 bg-gray-200 rounded w-full mb-2" />
                    <div className="h-3 bg-gray-200 rounded w-5/6" />
                  </div>
                </div>
              ))}
            </div>
          ) : blogPosts.length > 0 ? (
            <>
              <div className="grid md:grid-cols-3 gap-6 sm:gap-8 mb-8">
                {blogPosts.map((post) => (
                  <Link key={post.id} href={`/blog/${post.slug}`}>
                    <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 cursor-pointer group h-full flex flex-col">
                      {post.coverImage && (
                        <div className="overflow-hidden bg-beige h-48">
                          <img
                            src={post.coverImage}
                            alt={post.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            loading="lazy"
                          />
                        </div>
                      )}
                      <div className="p-6 flex-1 flex flex-col">
                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(post.publishedAt)}</span>
                        </div>
                        <h3 className="text-xl font-playfair text-blue-gray group-hover:text-sage transition-colors mb-3 line-clamp-2">
                          {post.title}
                        </h3>
                        <p className="text-gray-600 text-sm line-clamp-3 flex-1">
                          {post.excerpt}
                        </p>
                        <div className="mt-4 text-sage font-semibold text-sm group-hover:text-dark-sage transition-colors">
                          Leggi articolo →
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
              <p className="text-gray-500 text-lg">Nuovi articoli in arrivo...</p>
            </div>
          )}
        </div>
      </section>

      {/* iMaGe Vision Section */}
      <section className="py-12 sm:py-16 md:py-20 bg-gradient-to-b from-gray-900 via-gray-800 to-black text-white px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8 sm:mb-10 md:mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-terracotta/20 rounded-full mb-4">
              <Camera className="w-8 h-8 text-terracotta" />
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black uppercase tracking-tight mb-3 sm:mb-4" style={{ fontFamily: 'Impact, "Arial Black", sans-serif' }}>
              iMaGe Vision
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-gray-300">
              I nostri ultimi video: emozioni in movimento
            </p>
          </div>

          {loadingVideos ? (
            <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-gray-800 rounded-xl overflow-hidden animate-pulse">
                  <div className="bg-gray-700 aspect-video" />
                  <div className="p-4">
                    <div className="h-4 bg-gray-700 rounded w-3/4 mb-3" />
                    <div className="h-3 bg-gray-700 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : weddingVideos.length > 0 ? (
            <>
              <div className="grid md:grid-cols-3 gap-6 sm:gap-8 mb-8">
                {weddingVideos.map((video) => (
                  <Link key={video.id} href="/vision">
                    <div className="bg-gray-800 rounded-xl overflow-hidden hover:bg-gray-700 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 cursor-pointer group">
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
                          <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded text-xs font-semibold">
                            {video.duration}
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold text-white group-hover:text-terracotta transition-colors mb-2 line-clamp-2">
                          {video.title}
                        </h3>
                        {video.category && (
                          <span className="text-xs text-gray-400">
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
                  <Button size="lg" className="bg-terracotta hover:bg-terracotta/90 text-white shadow-lg hover:shadow-xl transition-all">
                    <Camera className="mr-2 h-5 w-5" />
                    Scopri tutti i Video
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <Camera className="w-16 h-16 mx-auto mb-4 text-gray-600 opacity-50" />
              <p className="text-gray-400 text-lg mb-2">Nuovi video in arrivo...</p>
              <p className="text-gray-500 text-sm">
                Vai alla Dashboard Admin → Wedding Videos per aggiungere i tuoi video
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Dove Ci Troviamo Section */}
      <section className="py-12 sm:py-16 md:py-20 bg-gradient-to-b from-cream/30 to-white px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8 sm:mb-10 md:mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-sage/10 rounded-full mb-4">
              <MapPin className="w-8 h-8 text-sage" />
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-playfair text-blue-gray mb-3 sm:mb-4">
              Dove Ci Troviamo
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
              Vieni a trovarci nel nostro studio
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            {/* Info Column */}
            <div className="space-y-6">
              <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-sage/10">
                <h3 className="text-2xl font-playfair text-blue-gray mb-6">
                  Informazioni di Contatto
                </h3>
                <div className="space-y-4">
                  {studioSettings.address && (
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-sage/10 flex items-center justify-center flex-shrink-0">
                        <MapPin className="h-5 w-5 text-sage" />
                      </div>
                      <div>
                        <p className="font-semibold text-blue-gray mb-1">Indirizzo</p>
                        <p className="text-gray-600">{studioSettings.address}</p>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(studioSettings.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sage hover:text-dark-sage text-sm font-medium mt-2 inline-flex items-center gap-1"
                        >
                          Apri in Google Maps
                          <span className="text-xs">→</span>
                        </a>
                      </div>
                    </div>
                  )}
                  {studioSettings.phone && (
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-sage/10 flex items-center justify-center flex-shrink-0">
                        <Phone className="h-5 w-5 text-sage" />
                      </div>
                      <div>
                        <p className="font-semibold text-blue-gray mb-1">Telefono</p>
                        <a href={`tel:${studioSettings.phone}`} className="text-gray-600 hover:text-sage transition">
                          {studioSettings.phone}
                        </a>
                      </div>
                    </div>
                  )}
                  {studioSettings.email && (
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-sage/10 flex items-center justify-center flex-shrink-0">
                        <Mail className="h-5 w-5 text-sage" />
                      </div>
                      <div>
                        <p className="font-semibold text-blue-gray mb-1">Email</p>
                        <a href={`mailto:${studioSettings.email}`} className="text-gray-600 hover:text-sage transition break-all">
                          {studioSettings.email}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <Link href="/consulenze">
                <Button size="lg" className="w-full bg-sage hover:bg-dark-sage text-white shadow-lg hover:shadow-xl transition-all">
                  <Calendar className="mr-2 h-5 w-5" />
                  Prenota un Appuntamento
                </Button>
              </Link>
            </div>

            {/* Map Column */}
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-sage/10 h-[400px] md:h-[500px] bg-gradient-to-br from-sage/5 to-sage/10 flex flex-col items-center justify-center p-8 text-center">
              {studioSettings.address ? (
                <>
                  <MapPin className="w-16 h-16 text-sage mb-4" />
                  <h3 className="text-2xl font-playfair text-blue-gray mb-4">
                    Ci trovi qui
                  </h3>
                  <p className="text-gray-600 mb-6 max-w-md">
                    {studioSettings.address}
                  </p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(studioSettings.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-sage hover:bg-dark-sage text-white font-medium rounded-lg shadow-md transition-all hover:shadow-lg"
                  >
                    <MapPin className="w-5 h-5" />
                    Apri in Google Maps
                  </a>
                </>
              ) : (
                <div className="text-gray-500">
                  <MapPin className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p>Indirizzo non disponibile</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* SEO Local - Fotografo Aversa */}
      <section className="py-14 px-4 bg-[#F5EFE6]/50">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center gap-8 bg-white rounded-2xl p-8 shadow-sm border border-[#c4724a]/10">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 text-[#c4724a] text-xs font-semibold uppercase tracking-widest mb-3">
                <MapPin className="h-4 w-4" />
                Aversa · Agro Aversano · Campania
              </div>
              <h2 className="text-2xl md:text-3xl font-playfair text-[#2C3A2C] mb-3">
                Fotografo Professionista ad Aversa
              </h2>
              <p className="text-gray-600 mb-4 leading-relaxed">
                Studio fotografico con sede ad Aversa. Matrimoni, battesimi, comunioni e cerimonie
                nell'agro aversano — senza costi di trasferta per Aversa, Sant'Arpino, Succivo,
                Casal di Principe, Frignano, Parete, Lusciano, Teverola, Giugliano e tutta la provincia.
              </p>
              <Link href="/fotografo-aversa">
                <Button className="bg-[#c4724a] hover:bg-[#a85d3b] text-white rounded-full px-6">
                  Scopri i servizi ad Aversa
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="hidden md:flex flex-col items-center justify-center text-center bg-[#2C3A2C] rounded-xl px-8 py-6 text-white min-w-[180px]">
              <span className="text-4xl font-playfair font-bold text-[#c4724a]">500+</span>
              <span className="text-sm text-white/70 mt-1">Matrimoni documentati</span>
              <div className="border-t border-white/20 my-3 w-full" />
              <span className="text-4xl font-playfair font-bold text-[#c4724a]">10+</span>
              <span className="text-sm text-white/70 mt-1">Anni di esperienza</span>
            </div>
          </div>
        </div>
      </section>

      {/* Instagram Feed */}
      {instagramUrl && instagramUsername && (
        <section className="py-20 bg-gradient-to-b from-cream/30 to-white relative overflow-hidden">
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
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-sage/20 to-sage/30 rounded-full mb-6">
                <Instagram className="w-10 h-10 text-sage" />
              </div>

              <h2 className="text-4xl font-playfair text-blue-gray mb-4">
                Seguici su Instagram
              </h2>

              <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-6">
                Scopri i nostri ultimi lavori, dietro le quinte e lasciati
                ispirare dalle emozioni che catturiamo ogni giorno
              </p>

              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-sage hover:bg-dark-sage text-white font-medium rounded-lg shadow-md transition-all hover:shadow-lg hover:scale-105"
                data-testid="link-instagram-section"
              >
                <Instagram className="w-5 h-5" />
                <span>
                  @
                  {instagramUsername}
                </span>
              </a>
            </div>

            {/* Instagram Feed Embed */}
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl border border-sage/10 p-4 sm:p-6 md:p-8 overflow-hidden">
              <div
                className="w-full"
                style={{ maxHeight: "600px", overflowY: "auto" }}
              >
                <iframe
                  src={`https://www.instagram.com/${instagramUsername}/embed`}
                  className="w-full border-0 rounded-lg"
                  style={{ minHeight: "350px", height: "450px" }}
                  scrolling="yes"
                  title="Instagram Feed"
                  loading="lazy"
                />
              </div>

              <div className="mt-6 pt-6 border-t border-sage/10 text-center">
                <p className="text-sm text-gray-500 italic">
                  Resta aggiornato sui nostri servizi, promozioni e scopri le
                  storie dei nostri clienti soddisfatti
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {(studioSettings.whatsapp || studioSettings.phone) && (
        <section className="bg-white px-4 py-16">
          <div className="mx-auto max-w-4xl rounded-2xl bg-gradient-to-br from-sage/15 to-mint/20 px-6 py-10 text-center shadow-sm">
            <MessageCircle className="mx-auto mb-4 h-12 w-12 text-sage" />
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-sage">
              {homepageContent.whatsapp.subtitle}
            </p>
            <h2 className="mb-4 text-3xl font-playfair text-blue-gray">
              {homepageContent.whatsapp.title}
            </h2>
            <p className="mx-auto mb-6 max-w-2xl text-gray-600">
              {homepageContent.whatsapp.description}
            </p>
            <a
              href={`https://wa.me/${(studioSettings.whatsapp || studioSettings.phone).replace(/\D/g, '')}?text=${encodeURIComponent(homepageContent.whatsapp.initialMessage)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="lg" className="bg-sage text-white hover:bg-dark-sage">
                <MessageCircle className="mr-2 h-5 w-5" />
                {homepageContent.whatsapp.buttonText}
              </Button>
            </a>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-blue-gray text-white py-12 px-4">
        <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-8">
          <div>
            <StudioLogo 
              showLink={false}
              imgClassName="h-10 w-auto mb-2" 
              textClassName="text-2xl font-playfair text-white"
            />
            <p className="text-gray-300 mb-4">
              {studioSettings.about ||
                "Studio fotografico per matrimoni ed eventi a Napoli e Caserta"}
            </p>
            {instagramUrl && (
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-gray-300 hover:text-white transition"
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
                className="block text-[#c4724a] hover:text-white font-medium"
              >
                Fotografo ad Aversa
              </Link>
              <Link
                href="/portfolio/matrimonio"
                className="block text-gray-300 hover:text-white"
              >
                Portfolio Matrimoni
              </Link>
              <Link
                href="/portfolio"
                className="block text-gray-300 hover:text-white"
              >
                Tutte le categorie
              </Link>
              <Link
                href="/storie"
                className="block text-gray-300 hover:text-white"
              >
                La Mia Storia
              </Link>
              <Link
                href="/blog"
                className="block text-gray-300 hover:text-white"
              >
                Blog
              </Link>
              <Link
                href="/consulenze"
                className="block text-gray-300 hover:text-white"
              >
                Contattami
              </Link>
              <a
                href="https://share.google/SW1hp2vnc9Csiwfkc"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-gray-300 hover:text-white"
              >
                Recensioni
              </a>
              <Link
                href="/accesso-galleria"
                className="block text-gray-300 hover:text-white"
              >
                Accesso Galleria
              </Link>
              <Link
                href="/privacy"
                className="block text-gray-300 hover:text-white"
              >
                Privacy
              </Link>
            </div>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Contatti</h4>
            <div className="space-y-3">
              {studioSettings.address && (
                <div className="flex items-start gap-2 text-gray-300">
                  <MapPin className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <span>{studioSettings.address}</span>
                </div>
              )}
              {studioSettings.phone && (
                <a
                  href={`tel:${studioSettings.phone}`}
                  className="flex items-center gap-2 text-gray-300 hover:text-white transition"
                >
                  <Phone className="h-5 w-5 flex-shrink-0" />
                  <span>{studioSettings.phone}</span>
                </a>
              )}
              {studioSettings.email && (
                <a
                  href={`mailto:${studioSettings.email}`}
                  className="flex items-center gap-2 text-gray-300 hover:text-white transition"
                >
                  <Mail className="h-5 w-5 flex-shrink-0" />
                  <span>{studioSettings.email}</span>
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-8 pt-8 border-t border-gray-700 text-center text-gray-400">
          <p>
            © {new Date().getFullYear()} {studioSettings.name}. Tutti i
            diritti riservati.
          </p>
        </div>

        {/* Schema.org LocalBusiness JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "ProfessionalService",
              name: studioSettings.name,
              description:
                "Fotografia e video di matrimonio ad Aversa, Napoli, Caserta e in Campania. Disponibili anche battesimi, comunioni ed eventi.",
              image: studioSettings.logo || "",
              address: studioSettings.address
                ? {
                    "@type": "PostalAddress",
                    streetAddress: studioSettings.address,
                    addressLocality: studioSettings.fiscalComune || "Aversa",
                    addressRegion: studioSettings.fiscalProvincia || "CE",
                    addressCountry: "IT",
                  }
                : undefined,
              telephone: studioSettings.phone || "",
              email: studioSettings.email || "",
              url: studioSettings.websiteUrl || window.location.origin,
              priceRange: "€€€",
              openingHours: "Mo-Fr 09:00-18:00",
            }),
          }}
        />
      </footer>
    </div>
  );
}
