import { useState, useEffect } from "react";
import { Link } from "wouter";
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
} from "lucide-react";
import { useStudio } from "@/context/StudioContext";
import HeroSlideshow from "@/components/HeroSlideshow";
import type { BookingCampaign } from "@shared/booking-types";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { FloralDivider, FloralCorner } from "@/components/WeddingIllustrations";
import { useLocation } from "wouter";
import libroCopertina from "@assets/libro-copertina.jpg";
import libroPdf from "@assets/lasciati-trasportare.pdf";
import gennaroProfile from "@assets/DSCF7220 copia (Grande)_1763486024338.jpg";

interface PortfolioPhoto {
  id: string;
  photoUrl: string;
  galleryName: string;
  jobType: string;
  featured: boolean;
}

export default function PublicHomepage() {
  const { studioSettings } = useStudio();
  const [, navigate] = useLocation();
  const [portfolioPhotos, setPortfolioPhotos] = useState<PortfolioPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [activeCampaigns, setActiveCampaigns] = useState<BookingCampaign[]>([]);

  // Carousel for campaigns
  const [emblaRef] = useEmblaCarousel({ loop: true, align: "center" }, [
    Autoplay({ delay: 5000, stopOnInteraction: false }),
  ]);

  useEffect(() => {
    loadPortfolioPreview();

    // SEO meta tags
    document.title =
      "Image Studio | Fotografia Professionale | Lasciati Trasportare";

    const updateMetaTag = (name: string, content: string) => {
      let tag = document.querySelector(`meta[name="${name}"]`);
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", name);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };

    updateMetaTag(
      "description",
      "Fotografia professionale per matrimoni, battesimi, eventi. Lasciati trasportare dalle emozioni dei tuoi momenti più belli. Image Studio - È tutta questione di Image.",
    );

    // Open Graph tags
    const updateOgTag = (property: string, content: string) => {
      let tag = document.querySelector(`meta[property="${property}"]`);
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("property", property);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };

    updateOgTag("og:title", "Image Studio | Fotografia Professionale");
    updateOgTag(
      "og:description",
      "Lasciati trasportare dalle emozioni dei tuoi momenti più belli",
    );
    updateOgTag("og:type", "website");
  }, []);

  const loadPortfolioPreview = async () => {
    setLoadingPhotos(true);
    try {
      const photosRef = collection(db, "portfolioSelections");
      const q = query(
        photosRef,
        where("featured", "==", true),
        orderBy("sortOrder", "asc"),
        limit(6),
      );
      const snapshot = await getDocs(q);

      let photos = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as PortfolioPhoto[];

      console.log(`[PublicHomepage] Featured photos loaded: ${photos.length}`);
      photos.forEach((photo, idx) => {
        console.log(`[PublicHomepage] Photo ${idx + 1}:`, {
          id: photo.id,
          photoUrl: photo.photoUrl,
          galleryName: photo.galleryName,
          featured: photo.featured,
        });
      });

      // If less than 6 featured photos, fetch additional non-featured ones
      if (photos.length < 6) {
        const remaining = 6 - photos.length;
        const additionalQ = query(
          photosRef,
          where("featured", "==", false),
          orderBy("sortOrder", "asc"),
          limit(remaining),
        );
        const additionalSnapshot = await getDocs(additionalQ);
        const additionalPhotos = additionalSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as PortfolioPhoto[];

        console.log(
          `[PublicHomepage] Additional photos loaded: ${additionalPhotos.length}`,
        );

        // Append additional photos, deduplicating by id
        const featuredIds = new Set(photos.map((p) => p.id));
        const uniqueAdditional = additionalPhotos.filter(
          (p) => !featuredIds.has(p.id),
        );
        photos = [...photos, ...uniqueAdditional].slice(0, 6);
      }

      console.log(`[PublicHomepage] Total photos to display: ${photos.length}`);
      setPortfolioPhotos(photos);
    } catch (error) {
      console.error("Errore caricamento portfolio preview:", error);
    } finally {
      setLoadingPhotos(false);
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
    <div className="min-h-screen bg-gradient-to-b from-white to-[#F5EFE6]">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-beige">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-2xl font-playfair text-blue-gray">
              iMaGe <span className="text-sage">Studio</span>
            </Link>
            <div className="hidden md:flex space-x-8">
              <Link
                href="/portfolio"
                className="text-blue-gray hover:text-sage transition"
              >
                Portfolio
              </Link>
              <Link
                href="/storie"
                className="text-blue-gray hover:text-sage transition"
              >
                La Mia Storia
              </Link>
              <Link
                href="/blog"
                className="text-blue-gray hover:text-sage transition"
              >
                Blog
              </Link>
              <Link
                href="/consulenze"
                className="text-blue-gray hover:text-sage transition"
              >
                Consulenze
              </Link>
            </div>
            <div className="flex items-center gap-3">
              {studioSettings.socialLinks.instagram && (
                <a
                  href={studioSettings.socialLinks.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-gray hover:text-sage transition"
                  data-testid="link-instagram"
                >
                  <Instagram className="h-5 w-5" />
                </a>
              )}
              <Link href="/consulenze">
                <Button
                  className="bg-sage hover:bg-dark-sage text-white"
                  data-testid="button-prenota-nav"
                >
                  Contattami
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-24 sm:pt-28 md:pt-32 pb-12 sm:pb-16 md:pb-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 sm:gap-10 md:gap-12 items-center">
            <div className="animate-fade-in">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-playfair text-blue-gray mb-4 sm:mb-6 leading-tight">
                Lasciati <span className="text-[#C67B5C]">Trasportare</span>
              </h1>
              <p className="text-lg sm:text-xl text-gray-600 mb-3 sm:mb-4">
                La fotografia è l'arte di immortalare momenti autentici
              </p>
              <p className="text-base sm:text-lg text-gray-500 mb-6 sm:mb-8">
                È tutta questione di{" "}
                <span className="font-semibold text-sage">Image</span>
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/consulenze">
                  <Button
                    size="lg"
                    className="bg-sage hover:bg-dark-sage text-white"
                    data-testid="button-prenota-hero"
                  >
                    <Calendar className="mr-2 h-5 w-5" />
                    Prenota un Appuntamento
                  </Button>
                </Link>
                <Link href="/portfolio">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-sage text-sage hover:bg-sage/10"
                    data-testid="button-portfolio-hero"
                  >
                    <Camera className="mr-2 h-5 w-5" />
                    Guarda il Portfolio
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
                    Hai partecipato a un evento? Accedi alla tua galleria
                  </Button>
                </Link>
              </div>
            </div>
            <div className="relative h-[280px] sm:h-[400px] md:h-[500px] rounded-xl sm:rounded-2xl overflow-hidden shadow-lg sm:shadow-2xl animate-slide-up">
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
              Portfolio
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-gray-600">
              Ogni foto racconta una storia unica
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
                <Link key={photo.id} href="/portfolio">
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
          <div className="text-center">
            <Link href="/portfolio">
              <Button
                size="lg"
                variant="outline"
                className="border-sage text-sage hover:bg-sage/10"
              >
                Vedi Tutto il Portfolio
              </Button>
            </Link>
          </div>
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
                src={gennaroProfile}
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
        {/* Background decorative elements */}
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
            {/* Book Cover Image */}
            <div className="flex justify-center md:justify-end">
              <div className="relative group">
                <div className="absolute inset-0 bg-white/20 rounded-2xl transform rotate-3 group-hover:rotate-6 transition-transform duration-300" />
                <img
                  src={libroCopertina}
                  alt="Lasciati Trasportare - Copertina del Libro"
                  className="relative w-full max-w-sm rounded-2xl shadow-2xl transform group-hover:scale-105 transition-transform duration-300"
                />
              </div>
            </div>

            {/* Book Info */}
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
                href={libroPdf}
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
      <section id="recensioni" className="py-20 bg-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-yellow-100 to-yellow-200 rounded-full mb-6">
              <svg className="w-10 h-10 text-yellow-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
              </svg>
            </div>

            <h2 className="text-4xl font-playfair text-blue-gray mb-4">
              Le Nostre Recensioni
            </h2>

            <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-6">
              Scopri cosa dicono di noi i nostri clienti soddisfatti
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <a
                href="https://share.google/SW1hp2vnc9Csiwfkc"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-sage hover:bg-dark-sage text-white font-medium rounded-lg shadow-md transition-all hover:shadow-lg hover:scale-105"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                </svg>
                <span>Google Reviews</span>
              </a>

              <a
                href="https://www.facebook.com/gennaromazzacanefotografo/?locale=it_IT"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-md transition-all hover:shadow-lg hover:scale-105"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                <span>Facebook</span>
              </a>

              <a
                href="https://www.matrimonio.com/fotografo-matrimonio/image-studio-fotografico--e149790/opinioni"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white hover:bg-gray-50 text-blue-gray border-2 border-sage font-medium rounded-lg shadow-md transition-all hover:shadow-lg hover:scale-105"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                </svg>
                <span>Matrimonio.com</span>
              </a>
            </div>
          </div>

          {/* Reviews Widgets Grid */}
          <div className="grid md:grid-cols-3 gap-6">
            {/* Google Reviews Widget */}
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl border border-sage/10 p-4 sm:p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-sage/10">
                <h3 className="text-xl font-semibold text-blue-gray flex items-center gap-2">
                  <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                  </svg>
                  Google
                </h3>
                <a
                  href="https://share.google/SW1hp2vnc9Csiwfkc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-sage hover:text-dark-sage font-medium"
                >
                  Vedi tutte →
                </a>
              </div>
              <div className="w-full" style={{ maxHeight: "500px", overflowY: "auto" }}>
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3022.2412648718453!2d-73.98731668459395!3d40.74844097932681!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNDDCsDQ0JzU0LjQiTiA3M8KwNTknMTQuMyJX!5e0!3m2!1sen!2sit!4v1234567890123!5m2!1sen!2sit&q=https://share.google/SW1hp2vnc9Csiwfkc"
                  className="w-full border-0 rounded-lg"
                  style={{ minHeight: "350px", height: "400px" }}
                  loading="lazy"
                  title="Google Reviews"
                />
              </div>
            </div>

            {/* Facebook Reviews Widget */}
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl border border-sage/10 p-4 sm:p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-sage/10">
                <h3 className="text-xl font-semibold text-blue-gray flex items-center gap-2">
                  <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  Facebook
                </h3>
                <a
                  href="https://www.facebook.com/gennaromazzacanefotografo/?locale=it_IT"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-sage hover:text-dark-sage font-medium"
                >
                  Vedi tutte →
                </a>
              </div>
              <div className="w-full" style={{ maxHeight: "500px", overflowY: "auto" }}>
                <iframe
                  src="https://www.facebook.com/plugins/page.php?href=https%3A%2F%2Fwww.facebook.com%2Fgennaromazzacanefotografo&tabs=reviews&width=340&height=400&small_header=false&adapt_container_width=true&hide_cover=false&show_facepile=false&appId"
                  className="w-full border-0 rounded-lg"
                  style={{ minHeight: "350px", height: "400px" }}
                  scrolling="yes"
                  frameBorder="0"
                  allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                  loading="lazy"
                  title="Facebook Reviews"
                />
              </div>
            </div>

            {/* Matrimonio.com Widget */}
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl border border-sage/10 p-4 sm:p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-sage/10">
                <h3 className="text-xl font-semibold text-blue-gray flex items-center gap-2">
                  <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                  </svg>
                  Matrimonio.com
                </h3>
                <a
                  href="https://www.matrimonio.com/fotografo-matrimonio/image-studio-fotografico--e149790/opinioni"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-sage hover:text-dark-sage font-medium"
                >
                  Vedi tutte →
                </a>
              </div>
              <div className="w-full" style={{ maxHeight: "500px", overflowY: "auto" }}>
                <div id="wp-widget-reviews">
                  <div id="wp-widget-preview" className="text-center py-8">
                    <p className="text-gray-600 mb-4">
                      Leggi{" "}
                      <a 
                        href="https://www.matrimonio.com/fotografo-matrimonio/image-studio-fotografico--e149790/opinioni" 
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sage hover:text-dark-sage font-semibold"
                      >
                        le nostre recensioni
                      </a>
                      {" "}su
                    </p>
                    <a href="https://www.matrimonio.com" target="_blank" rel="noopener noreferrer">
                      <img 
                        src="https://cdn1.matrimonio.com/assets/img/logos/gen_logoHeader.svg" 
                        alt="Matrimonio.com"
                        className="h-8 mx-auto"
                      />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500 italic">
              La soddisfazione dei nostri clienti è la nostra priorità. Leggi le loro storie!
            </p>
          </div>
        </div>
      </section>

      {/* Instagram Feed */}
      {studioSettings.socialLinks?.instagram && (
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
                href={(() => {
                  const normalized = studioSettings.socialLinks.instagram
                    .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
                    .replace(/^@/, "")
                    .replace(/\/$/, "")
                    .replace(/[?#].*$/, "");
                  return normalized
                    ? `https://www.instagram.com/${normalized}`
                    : studioSettings.socialLinks.instagram.startsWith("http")
                      ? studioSettings.socialLinks.instagram
                      : `https://www.instagram.com/${studioSettings.socialLinks.instagram}`;
                })()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-sage hover:bg-dark-sage text-white font-medium rounded-lg shadow-md transition-all hover:shadow-lg hover:scale-105"
                data-testid="link-instagram-section"
              >
                <Instagram className="w-5 h-5" />
                <span>
                  @
                  {studioSettings.socialLinks.instagram
                    .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
                    .replace(/^@/, "")
                    .replace(/\/$/, "")
                    .replace(/[?#].*$/, "")}
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
                  src={`https://www.instagram.com/${studioSettings.socialLinks.instagram
                    .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
                    .replace(/^@/, "")
                    .replace(/\/$/, "")
                    .replace(/[?#].*$/, "")}/embed`}
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

      {/* Footer */}
      <footer className="bg-blue-gray text-white py-12 px-4">
        <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-2xl font-playfair mb-4">iMaGe Studio</h3>
            <p className="text-gray-300 mb-4">
              {studioSettings.about ||
                "Studio fotografico per matrimoni ed eventi a Napoli e Caserta"}
            </p>
            {studioSettings.socialLinks.instagram && (
              <a
                href={studioSettings.socialLinks.instagram}
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
                href="/portfolio"
                className="block text-gray-300 hover:text-white"
              >
                Portfolio
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
                Consulenze
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
            © 2025 iMaGe Studio Fotografico - Gennaro Mazzacane. Tutti i
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
              name: "Image Studio Fotografico",
              description:
                "Fotografia professionale per matrimoni, battesimi e eventi a Napoli e Caserta",
              image: studioSettings.socialLinks.instagram || "",
              address: studioSettings.address
                ? {
                    "@type": "PostalAddress",
                    streetAddress: studioSettings.address,
                    addressLocality: "Napoli",
                    addressRegion: "Campania",
                    addressCountry: "IT",
                  }
                : undefined,
              telephone: studioSettings.phone || "",
              email: studioSettings.email || "",
              url: window.location.origin,
              priceRange: "€€€",
              openingHours: "Mo-Fr 09:00-18:00",
            }),
          }}
        />
      </footer>
    </div>
  );
}
