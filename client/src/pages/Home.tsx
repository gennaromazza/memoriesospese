import React, { useState, FormEvent, useEffect } from "react";
import { useLocation } from "wouter";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { trackPasswordRequest } from "@/lib/analytics";
import { useStudio } from "@/context/StudioContext";
import { createUrl } from "@/lib/basePath";
import { SecurityQuestionType } from "@shared/schema";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import GallerySearch from "@/components/GallerySearch";
import HeroSlideshow from "@/components/HeroSlideshow";
import {
  FloralCorner,
  FloralDivider,
  BackgroundDecoration,
} from "@/components/WeddingIllustrations";
import { WeddingImage, DecorativeImage } from "@/components/WeddingImages";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Calendar, Clock, Sparkles } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import type { BookingCampaign } from "@shared/booking-types";

export default function Home() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedGallery, setSelectedGallery] = useState<any>(null);
  const [showSecurityQuestion, setShowSecurityQuestion] = useState(false);
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [securityError, setSecurityError] = useState("");
  const [activeCampaigns, setActiveCampaigns] = useState<BookingCampaign[]>([]);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { studioSettings } = useStudio();

  // Carousel for campaigns
  const [emblaRef] = useEmblaCarousel({ loop: true, align: "center" }, [
    Autoplay({ delay: 5000, stopOnInteraction: false }),
  ]);

  // Form data state
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    relation: "",
    gallerySearch: "",
  });

  // Handle input changes
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // If changing gallery search, search for galleries
    if (name === "gallerySearch" && value.length >= 3) {
      searchGalleries(value);
    } else if (name === "gallerySearch" && value.length < 3) {
      setSearchResults([]);
      setSelectedGallery(null);
    }
  };

  // Search galleries by name
  const searchGalleries = async (searchTerm: string) => {
    if (searchTerm.length < 3) return;

    try {
      const galleryRef = collection(db, "galleries");
      const q = query(galleryRef, where("active", "==", true));
      const querySnapshot = await getDocs(q);

      // Lista degli ID dei temi speciali da escludere (salvati come ID in minuscolo nel DB)
      const specialThemeIds = ['natale', 'carnevale', 'san-valentino', 'pasqua', 'halloween'];

      // Filter galleries based on search term
      // Escludi special galleries (quelle con specialTheme definito)
      const results: any[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        
        // Salta le special gallery - hanno una schermata dedicata con PIN
        // Escludi se ha un tema speciale assegnato (controlla ID tema)
        if (data.specialTheme && specialThemeIds.includes(data.specialTheme)) {
          console.log(`🚫 Esclusa special gallery "${data.name}" con tema ID "${data.specialTheme}"`);
          return;
        }
        
        const galleryName = data.name.toLowerCase();
        const searchTermLower = searchTerm.toLowerCase();

        // Check if gallery name contains search term
        if (galleryName.includes(searchTermLower)) {
          results.push({
            id: doc.id,
            ...data,
          });
        }
      });

      setSearchResults(results);
    } catch (error) {}
  };

  // Handle gallery selection
  const handleGallerySelect = (gallery: any) => {
    setSelectedGallery(gallery);
    setFormData((prev) => ({ ...prev, gallerySearch: gallery.name }));
    setSearchResults([]);
  };

  // Get security question text
  const getSecurityQuestionText = (gallery: any): string => {
    if (!gallery.requiresSecurityQuestion) return "";

    const questionType = gallery.securityQuestionType;

    switch (questionType) {
      case SecurityQuestionType.LOCATION:
        return "Qual è il nome della location dell'evento?";
      case SecurityQuestionType.MONTH:
        return "In che mese si è svolto l'evento?";
      case SecurityQuestionType.CUSTOM:
        return gallery.securityQuestionCustom || "Domanda personalizzata";
      default:
        return "Domanda di sicurezza";
    }
  };

  // Load active booking campaigns
  useEffect(() => {
    const loadActiveCampaigns = async () => {
      try {
        // Import helper function from booking-campaigns.ts
        const { getActiveCampaigns } = await import('@/lib/booking-campaigns');
        const active = await getActiveCampaigns();
        
        // Ordina per data fine più vicina
        active.sort(
          (a, b) => a.dataFine.getTime() - b.dataFine.getTime()
        );

        setActiveCampaigns(active);
      } catch (error) {
        console.error("Errore caricamento campagne attive:", error);
      }
    };

    loadActiveCampaigns();
  }, []);

  // Submit form to request password
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!selectedGallery) {
      toast({
        title: "Errore",
        description: "Seleziona una galleria valida.",
        variant: "destructive",
      });
      return;
    }

    if (
      !formData.firstName ||
      !formData.lastName ||
      !formData.email ||
      !formData.relation
    ) {
      toast({
        title: "Errore",
        description: "Compila tutti i campi richiesti.",
        variant: "destructive",
      });
      return;
    }

    // Verifica se la galleria richiede una domanda di sicurezza
    const hasSecurityQuestion =
      selectedGallery.requiresSecurityQuestion === true &&
      selectedGallery.securityQuestionType &&
      selectedGallery.securityAnswer;

    if (hasSecurityQuestion && !showSecurityQuestion) {
      // Mostra la domanda di sicurezza
      setShowSecurityQuestion(true);
      return;
    }

    if (hasSecurityQuestion && !securityAnswer.trim()) {
      setSecurityError("La risposta è obbligatoria");
      return;
    }

    setIsSubmitting(true);
    setSecurityError("");

    try {
      // Verifica la risposta alla domanda di sicurezza se richiesta
      if (hasSecurityQuestion) {
        const correctAnswer = selectedGallery.securityAnswer
          ?.toLowerCase()
          .trim();
        const providedAnswer = securityAnswer.toLowerCase().trim();

        if (providedAnswer !== correctAnswer) {
          setSecurityError("Risposta alla domanda di sicurezza non corretta");
          setIsSubmitting(false);
          return;
        }
      }

      // Salva la richiesta in Firestore
      const passwordRequestsRef = collection(db, "passwordRequests");
      await addDoc(passwordRequestsRef, {
        galleryId: selectedGallery.id,
        galleryCode: selectedGallery.code,
        galleryName: selectedGallery.name,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        relation: formData.relation,
        status: "completed",
        createdAt: serverTimestamp(),
        securityQuestionAnswered: hasSecurityQuestion,
      });

      // Track password request in analytics
      trackPasswordRequest(selectedGallery.code);

      // Show success message
      toast({
        title: "Richiesta ricevuta",
        description: hasSecurityQuestion
          ? "Accesso autorizzato! Password visualizzata."
          : "Password visualizzata. Le tue informazioni sono state salvate.",
      });

      // Redirect to password result page with correct base path
      navigate(createUrl(`/password-result/${selectedGallery.id}`));
    } catch (error) {
      toast({
        title: "Errore",
        description:
          "Si è verificato un errore nell'invio della richiesta. Riprova più tardi.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navigation />

      {/* Hero Section */}
      <div className="relative bg-light-mint">
        <HeroSlideshow />
        <div className="absolute inset-0 bg-gradient-to-r from-blue-gray/30 to-transparent"></div>
        <div className="relative max-w-7xl mx-auto py-24 px-4 sm:py-32 sm:px-6 lg:px-8">
          <div className="relative z-10 backdrop-blur-sm bg-white/5 p-6 sm:p-8 rounded-lg shadow-lg inline-block">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl font-playfair animate-slide-up drop-shadow-md">
              {studioSettings.heroTitle
                .split(" <br> ")
                .map((part, index, array) =>
                  index < array.length - 1 ? (
                    <React.Fragment key={index}>
                      {part}
                      <br />
                    </React.Fragment>
                  ) : (
                    part
                  ),
                )}
            </h1>
            <p
              className="mt-6 text-xl text-white max-w-2xl font-sans animate-slide-up drop-shadow"
              style={{ animationDelay: "100ms" }}
            >
              {studioSettings.heroSubtitle}
            </p>
            <div
              className="mt-10 animate-slide-up flex flex-col sm:flex-row gap-4"
              style={{ animationDelay: "200ms" }}
            >
              <a
                href="#access-gallery"
                className="px-8 py-3 bg-sage text-white font-medium rounded-md shadow-md hover:bg-dark-sage transition-all hover:shadow-lg inline-block text-center"
              >
                {studioSettings.heroButtonText}
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Active Booking Campaigns Slider - FULL WIDTH */}
      {activeCampaigns.length > 0 && (
        <section className="py-16 bg-gradient-to-b from-sage/5 via-off-white to-cream/20 relative overflow-hidden">
          <div className="absolute inset-0 opacity-5">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(139, 154, 139, 0.05) 10px, rgba(139, 154, 139, 0.05) 20px)`,
              }}
            ></div>
          </div>

          <div className="relative z-10 w-full">
            {activeCampaigns.length === 1 ? (
              // Single campaign - full width display
              <div className="w-full">
                {(() => {
                  const campaign = activeCampaigns[0];
                  const startDate = campaign.dataInizio;
                  const endDate = campaign.dataFine;
                  const formatDate = (date: Date) =>
                    date.toLocaleDateString("it-IT", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    });
                  const daysLeft = Math.ceil(
                    (endDate.getTime() - new Date().getTime()) /
                      (1000 * 60 * 60 * 24),
                  );

                  return (
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                      <div className="bg-gradient-to-br from-white via-cream/30 to-white rounded-3xl shadow-xl border border-sage/10 overflow-hidden backdrop-blur-sm">
                        <div className="flex flex-col md:flex-row items-center gap-12 p-8 sm:p-12 lg:p-16">
                          {/* Left side - Info */}
                          <div className="flex-1 text-center md:text-left space-y-6">
                            <div className="inline-flex items-center gap-2 bg-sage/5 px-5 py-2 rounded-full border border-sage/20">
                              <Sparkles className="w-4 h-4 text-sage animate-shimmer" />
                              <span className="text-xs font-semibold uppercase tracking-wider text-sage">
                                Prenotazioni Aperte
                              </span>
                            </div>

                            <div>
                              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold font-playfair mb-3 text-blue-gray leading-tight">
                                {campaign.nome}
                              </h2>
                              <div className="w-24 h-0.5 bg-gradient-to-r from-sage via-gold to-transparent mx-auto md:mx-0"></div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-4 text-base">
                              <div className="flex items-center gap-2 bg-sage/5 px-5 py-3 rounded-xl border border-sage/10">
                                <Calendar className="w-5 h-5 text-sage" />
                                <span className="font-medium text-gray-700">
                                  {formatDate(startDate)}
                                </span>
                                <span className="text-gray-400">—</span>
                                <span className="font-medium text-gray-700">
                                  {formatDate(endDate)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 bg-gradient-to-r from-yellow-50 to-yellow-100/50 px-5 py-3 rounded-xl border border-yellow-200/50 shadow-sm animate-shimmer-slow">
                                <Clock className="w-5 h-5 text-yellow-600" />
                                <span className="font-bold text-yellow-700">
                                  {daysLeft} giorni rimasti
                                </span>
                              </div>
                            </div>

                            {campaign.descrizione && (
                              <div className="bg-gradient-to-br from-sage/5 to-transparent p-6 rounded-2xl border border-sage/10">
                                <p className="text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto md:mx-0">
                                  {campaign.descrizione}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Right side - CTA */}
                          <div className="flex-shrink-0">
                            <div className="bg-gradient-to-br from-white to-sage/5 p-8 rounded-2xl border border-sage/20 shadow-lg">
                              <Button
                                onClick={() => navigate(createUrl(`/prenota/${campaign.code}`))}
                                size="lg"
                                className="bg-sage text-white hover:bg-dark-sage text-xl font-bold py-8 px-12 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 border-2 border-sage/20"
                                data-testid={`button-book-campaign-${campaign.id}`}
                                style={{
                                  boxShadow: "inset 0 -2px 8px rgba(0,0,0,0.1)",
                                }}
                              >
                                <Calendar className="w-7 h-7 mr-3" />
                                Prenota Subito
                              </Button>
                              <p className="text-center text-xs text-gray-500 mt-4 tracking-wide">
                                Posti limitati disponibili
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Decorative floral divider */}
                        <div className="flex justify-center pb-6">
                          <FloralDivider className="w-32 h-8 text-sage/20" />
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              // Multiple campaigns - carousel slider
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                  <div className="inline-flex items-center gap-2 bg-sage/5 px-6 py-3 rounded-full border border-sage/20 mb-3">
                    <Sparkles className="w-5 h-5 text-sage animate-shimmer" />
                    <span className="text-sm font-semibold uppercase tracking-wider text-sage">
                      Prenotazioni Aperte
                    </span>
                  </div>
                </div>

                <div className="overflow-hidden" ref={emblaRef}>
                  <div className="flex transition-all duration-500 ease-out">
                    {activeCampaigns.map((campaign) => {
                      const startDate = campaign.dataInizio;
                      const endDate = campaign.dataFine;
                      const formatDate = (date: Date) =>
                        date.toLocaleDateString("it-IT", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        });
                      const daysLeft = Math.ceil(
                        (endDate.getTime() - new Date().getTime()) /
                          (1000 * 60 * 60 * 24),
                      );

                      return (
                        <div
                          key={campaign.id}
                          className="flex-[0_0_100%] min-w-0 px-4"
                        >
                          <div className="bg-gradient-to-br from-white via-cream/30 to-white rounded-3xl shadow-xl border border-sage/10 overflow-hidden backdrop-blur-sm">
                            <div className="flex flex-col md:flex-row items-center gap-10 p-8 sm:p-12 lg:p-14">
                              {/* Campaign Info */}
                              <div className="flex-1 text-center md:text-left space-y-5">
                                <div>
                                  <h3 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-playfair mb-3 text-blue-gray leading-tight">
                                    {campaign.nome}
                                  </h3>
                                  <div className="w-24 h-0.5 bg-gradient-to-r from-sage via-gold to-transparent mx-auto md:mx-0"></div>
                                </div>

                                <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-3 text-sm">
                                  <div className="flex items-center gap-2 bg-sage/5 px-4 py-2.5 rounded-xl border border-sage/10">
                                    <Calendar className="w-4 h-4 text-sage" />
                                    <span className="font-medium text-gray-700">
                                      {formatDate(startDate)}
                                    </span>
                                    <span className="text-gray-400">—</span>
                                    <span className="font-medium text-gray-700">
                                      {formatDate(endDate)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 bg-gradient-to-r from-yellow-50 to-yellow-100/50 px-4 py-2.5 rounded-xl border border-yellow-200/50 shadow-sm animate-shimmer-slow">
                                    <Clock className="w-4 h-4 text-yellow-600" />
                                    <span className="font-bold text-yellow-700">
                                      {daysLeft} giorni rimasti
                                    </span>
                                  </div>
                                </div>

                                {campaign.descrizione && (
                                  <div className="bg-gradient-to-br from-sage/5 to-transparent p-5 rounded-2xl border border-sage/10">
                                    <p className="text-base text-gray-600 leading-relaxed max-w-xl mx-auto md:mx-0">
                                      {campaign.descrizione}
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* CTA Button */}
                              <div className="flex-shrink-0">
                                <div className="bg-gradient-to-br from-white to-sage/5 p-6 rounded-2xl border border-sage/20 shadow-lg">
                                  <Button
                                    onClick={() =>
                                      navigate(createUrl(`/prenota/${campaign.code}`))
                                    }
                                    size="lg"
                                    className="bg-sage text-white hover:bg-dark-sage text-lg font-bold py-6 px-10 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 border-2 border-sage/20"
                                    data-testid={`button-book-campaign-${campaign.id}`}
                                    style={{
                                      boxShadow:
                                        "inset 0 -2px 8px rgba(0,0,0,0.1)",
                                    }}
                                  >
                                    <Calendar className="w-6 h-6 mr-2" />
                                    Prenota Ora
                                  </Button>
                                  <p className="text-center text-xs text-gray-500 mt-3 tracking-wide">
                                    Posti limitati disponibili
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Decorative floral divider */}
                            <div className="flex justify-center pb-5">
                              <FloralDivider className="w-28 h-7 text-sage/20" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Carousel indicators */}
                <div className="flex justify-center gap-2.5 mt-8">
                  {activeCampaigns.map((_, idx) => (
                    <div
                      key={idx}
                      className="w-2.5 h-2.5 rounded-full bg-sage/20 hover:bg-sage/40 transition-colors cursor-pointer border border-sage/30"
                    ></div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Access Gallery Form */}
      <section id="access-gallery" className="py-20 bg-off-white relative">
        {/* Decorazioni a tema matrimonio con le immagini fornite */}
        <div className="absolute left-0 top-0 w-40 h-40 opacity-20 pointer-events-none">
          <WeddingImage
            type="heart-balloon"
            className="w-full h-auto"
            alt="Decorazione palloncino a cuore"
          />
        </div>
        <div className="absolute right-0 bottom-0 w-40 h-40 opacity-20 pointer-events-none">
          <WeddingImage
            type="wedding-cake"
            className="w-full h-auto"
            alt="Decorazione torta nuziale"
          />
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 animate-fade-in relative z-10">
          {/* Titolo e Intro Sezione */}
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-blue-gray font-playfair mb-4">
              Accedi alle Foto del Tuo Evento
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-2">
              Rivivi le emozioni del tuo giorno speciale attraverso le nostre gallerie fotografiche esclusive
            </p>
            <div className="w-32 h-0.5 bg-gradient-to-r from-transparent via-sage to-transparent mx-auto"></div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {/* Card Ricerca Galleria */}
            <div className="bg-white shadow-xl rounded-xl overflow-hidden border border-sage/10">
              {/* Header decorativo */}
              <div className="relative h-16 bg-gradient-to-r from-sage/30 via-sage/40 to-sage/30 flex items-center justify-center">
                <div className="absolute -bottom-12 left-1/2 transform -translate-x-1/2 h-24 w-24">
                  <DecorativeImage
                    type="standing"
                    className="w-full h-auto"
                    alt="Decorazione sposi"
                  />
                </div>
              </div>

              <div className="px-6 sm:px-8 pt-16 pb-8">
                <h3 className="text-center text-xl font-bold text-blue-gray font-playfair mb-2">
                  Cerca la Tua Galleria
                </h3>
                <p className="text-center text-gray-600 mb-6 text-sm">
                  Inserisci i nomi dei protagonisti dell'evento
                </p>

                <div className="space-y-4">
                  <div className="bg-off-white p-4 rounded-lg shadow-inner">
                    <GallerySearch />
                  </div>
                </div>
              </div>

              {/* Footer decorativo */}
              <div className="h-2 bg-gradient-to-r from-sage/30 via-sage/40 to-sage/30"></div>
            </div>

            {/* Card Informazioni Accesso */}
            <div className="bg-white shadow-xl rounded-xl overflow-hidden border border-sage/10 p-6 sm:p-8">
              <div className="flex items-center justify-center mb-6">
                <div className="w-20 h-20">
                  <WeddingImage
                    type="flower-bouquet"
                    className="w-full h-auto opacity-70"
                    alt="Decorazione bouquet"
                  />
                </div>
              </div>

              <h3 className="text-xl font-bold text-blue-gray font-playfair mb-6 text-center">
                Come Funziona
              </h3>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-sage/10 rounded-full flex items-center justify-center">
                    <span className="text-sage font-bold text-sm">1</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-blue-gray mb-1">Cerca l'Evento</h4>
                    <p className="text-sm text-gray-600">
                      Inserisci i nomi degli sposi o il nome dell'evento nel campo di ricerca
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-sage/10 rounded-full flex items-center justify-center">
                    <span className="text-sage font-bold text-sm">2</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-blue-gray mb-1">Compila i Dati</h4>
                    <p className="text-sm text-gray-600">
                      Inserisci il tuo nome, email e indica il tuo ruolo all'evento
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-sage/10 rounded-full flex items-center justify-center">
                    <span className="text-sage font-bold text-sm">3</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-blue-gray mb-1">Ricevi l'Accesso</h4>
                    <p className="text-sm text-gray-600">
                      Visualizza immediatamente la password per accedere alla galleria
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-sage/10 rounded-full flex items-center justify-center">
                    <span className="text-sage font-bold text-sm">4</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-blue-gray mb-1">Goditi i Ricordi</h4>
                    <p className="text-sm text-gray-600">
                      Esplora, scarica e condividi le foto più belle del tuo evento speciale
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-sage/10">
                <div className="bg-light-mint/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-sage mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span className="font-semibold text-sm">Accesso Sicuro e Privato</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Le tue foto sono protette e accessibili solo agli invitati dell'evento
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Features Grid - Vantaggi della Galleria */}
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg p-6 shadow-md border border-sage/10 text-center hover:shadow-lg transition-shadow">
              <div className="w-16 h-16 mx-auto mb-4 bg-sage/10 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-sage" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h4 className="font-semibold text-blue-gray mb-2">Foto in Alta Qualità</h4>
              <p className="text-sm text-gray-600">
                Scarica tutte le foto in risoluzione originale, senza limiti
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-md border border-sage/10 text-center hover:shadow-lg transition-shadow">
              <div className="w-16 h-16 mx-auto mb-4 bg-sage/10 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-sage" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </div>
              <h4 className="font-semibold text-blue-gray mb-2">Condivisione Facile</h4>
              <p className="text-sm text-gray-600">
                Condividi le foto preferite sui social o tramite link diretto
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-md border border-sage/10 text-center hover:shadow-lg transition-shadow">
              <div className="w-16 h-16 mx-auto mb-4 bg-sage/10 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-sage" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h4 className="font-semibold text-blue-gray mb-2">Accesso Illimitato</h4>
              <p className="text-sm text-gray-600">
                Rivedi le tue foto quando vuoi, per tutto il tempo che desideri
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Special Gallery Section */}
      <section className="py-16 bg-off-white dark:bg-gray-900 relative overflow-hidden">
        {/* Decorazioni a tema matrimonio */}
        <FloralCorner
          position="top-right"
          className="absolute top-0 right-0 w-32 h-32 opacity-15 dark:opacity-10 pointer-events-none"
        />
        <FloralCorner
          position="bottom-left"
          className="absolute bottom-0 left-0 w-32 h-32 opacity-15 dark:opacity-10 pointer-events-none"
        />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-sage/80 to-dark-sage/80 dark:from-sage/60 dark:to-dark-sage/60 rounded-full mb-4">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-blue-gray dark:text-white font-playfair mb-3">
              Gallerie Speciali
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Accedi alle nostre gallerie tematiche esclusive con il PIN che ti
              è stato fornito
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8 border border-sage/10 dark:border-sage/20">
            <div className="flex flex-col items-center">
              <div className="w-full max-w-sm">
                {/* Elemento decorativo con immagine */}
                <div className="flex justify-center mb-6">
                  <div className="w-24 h-24 opacity-90 dark:opacity-70">
                    <WeddingImage
                      type="flower-bouquet"
                      className="w-full h-auto"
                      alt="Decorazione floreale"
                    />
                  </div>
                </div>

                <p className="text-center text-gray-600 dark:text-gray-300 mb-6">
                  Hai ricevuto un PIN per una galleria speciale? Inseriscilo qui
                  per accedere
                </p>

                <Button
                  className="w-full bg-sage hover:bg-dark-sage dark:bg-sage/90 dark:hover:bg-dark-sage/90 text-white py-6 text-lg font-medium shadow-md hover:shadow-lg transition-all"
                  data-testid="button-access-special-gallery"
                  onClick={() => navigate(createUrl("/special-gallery"))}
                >
                  <svg
                    className="w-6 h-6 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  Accedi con PIN
                </Button>

                <div className="mt-8 pt-6 border-t border-beige dark:border-gray-600">
                  <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-4 font-medium">
                    Temi disponibili
                  </p>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    <div className="bg-cream dark:bg-gray-700 p-2 rounded-lg border border-beige/50 dark:border-gray-600">
                      <span className="text-2xl">🎄</span>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                        Natale
                      </p>
                    </div>
                    <div className="bg-cream dark:bg-gray-700 p-2 rounded-lg border border-beige/50 dark:border-gray-600">
                      <span className="text-2xl">🎭</span>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                        Carnevale
                      </p>
                    </div>
                    <div className="bg-cream dark:bg-gray-700 p-2 rounded-lg border border-beige/50 dark:border-gray-600">
                      <span className="text-2xl">💕</span>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                        S. Valentino
                      </p>
                    </div>
                    <div className="bg-cream dark:bg-gray-700 p-2 rounded-lg border border-beige/50 dark:border-gray-600">
                      <span className="text-2xl">🐰</span>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                        Pasqua
                      </p>
                    </div>
                    <div className="bg-cream dark:bg-gray-700 p-2 rounded-lg border border-beige/50 dark:border-gray-600">
                      <span className="text-2xl">🎃</span>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                        Halloween
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Separatore decorativo */}
      <div className="w-full flex justify-center py-2 bg-off-white">
        <FloralDivider className="w-full h-12" />
      </div>

      {/* About Section */}
      <section id="about" className="py-16 bg-white relative overflow-hidden">
        {/* Decorazioni floreali agli angoli */}
        <FloralCorner
          position="top-left"
          className="absolute top-0 left-0 w-32 h-32 opacity-20 pointer-events-none"
        />
        <FloralCorner
          position="bottom-right"
          className="absolute bottom-0 right-0 w-32 h-32 opacity-20 pointer-events-none"
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="lg:text-center">
            <h2 className="text-base text-terracotta font-semibold tracking-wide uppercase">
              La Fotografia Che Crea Ricordi
            </h2>
            <p className="mt-2 text-3xl leading-8 font-bold tracking-tight text-blue-gray sm:text-4xl font-playfair">
              {studioSettings.name}
            </p>
            <p className="mt-2 text-xl text-terracotta lg:mx-auto font-medium">
              {studioSettings.slogan}
            </p>
            <p className="mt-6 max-w-3xl text-lg text-gray-600 lg:mx-auto">
              {studioSettings.about}
            </p>
          </div>

          {/* Feature Cards - sostituisce Informazioni con mappa e social */}
          <div className="mt-16">
            <div className="space-y-10 sm:space-y-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-6 md:gap-8">
              {/* Card Dove Siamo */}
              <div className="bg-off-white rounded-lg p-6 shadow-sm flex flex-col items-center text-center">
                <div className="h-16 w-16 mb-4">
                  <DecorativeImage
                    type="wedding-cake"
                    className="w-full h-auto opacity-80"
                    alt="Icona indirizzo"
                  />
                </div>
                <h3 className="text-xl font-medium text-terracotta mb-3">
                  La nostra sede
                </h3>
                {studioSettings.address ? (
                  <>
                    <p className="text-gray-600 mb-4">
                      {studioSettings.address}
                    </p>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(studioSettings.address)}&travelmode=driving`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 bg-white border border-sage text-sage rounded-md text-sm hover:bg-sage hover:text-white transition-colors"
                    >
                      <svg
                        className="h-4 w-4 mr-2"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.6-1.3-.9-2.1-.9H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                        <circle cx="7" cy="17" r="2" />
                        <circle cx="17" cy="17" r="2" />
                      </svg>
                      <span className="relative">
                        Naviga fino a noi
                        <span className="absolute -top-1 -right-3 animate-ping">
                          →
                        </span>
                      </span>
                    </a>
                  </>
                ) : (
                  <p className="text-gray-600">Indirizzo non disponibile</p>
                )}
              </div>

              {/* Card Social */}
              <div className="bg-off-white rounded-lg p-6 shadow-sm flex flex-col items-center text-center">
                <div className="h-16 w-16 mb-4">
                  <DecorativeImage
                    type="heart-balloon"
                    className="w-full h-auto opacity-80"
                    alt="Icona social"
                  />
                </div>
                <h3 className="text-xl font-medium text-terracotta mb-3">
                  Seguici sui social
                </h3>
                <p className="text-gray-600 mb-4">
                  Scopri le nostre ultime opere e rimani aggiornato sui nostri
                  servizi!
                </p>
                <div className="flex space-x-4 mt-2">
                  {studioSettings.socialLinks.facebook && (
                    <a
                      href={studioSettings.socialLinks.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <svg
                        className="h-8 w-8"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </a>
                  )}

                  {studioSettings.socialLinks.instagram && (
                    <a
                      href={studioSettings.socialLinks.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-pink-600 hover:text-pink-800"
                    >
                      <svg
                        className="h-8 w-8"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </a>
                  )}

                  {studioSettings.socialLinks.twitter && (
                    <a
                      href={studioSettings.socialLinks.twitter}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-600"
                    >
                      <svg
                        className="h-8 w-8"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>

              {/* Card Contatti */}
              <div className="bg-off-white rounded-lg p-6 shadow-sm flex flex-col items-center text-center">
                <div className="h-16 w-16 mb-4">
                  <DecorativeImage
                    type="standing"
                    className="w-full h-auto opacity-80"
                    alt="Icona contatti"
                  />
                </div>
                <h3 className="text-xl font-medium text-terracotta mb-3">
                  Contatti diretti
                </h3>
                {studioSettings.phone && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-400 mb-1">Telefono</p>
                    <p className="text-gray-600">{studioSettings.phone}</p>
                  </div>
                )}

                {studioSettings.email && (
                  <div className="mb-4">
                    <p className="text-xs text-gray-400 mb-1">Email</p>
                    <p className="text-gray-600">{studioSettings.email}</p>
                  </div>
                )}

                {studioSettings.phone && (
                  <a
                    href={`tel:${studioSettings.phone.replace(/\s/g, "")}`}
                    className="inline-flex items-center px-4 py-2 bg-white border border-sage text-sage rounded-md text-sm hover:bg-sage hover:text-white transition-colors"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                      />
                    </svg>
                    Chiamaci ora
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="mt-16">
            <div className="space-y-10 md:space-y-0 md:grid md:grid-cols-3 md:gap-x-8 md:gap-y-10">
              {/* Feature 1 */}
              <div className="relative group">
                <div className="absolute h-14 w-14">
                  <DecorativeImage
                    type="heart-balloon"
                    className="w-full h-auto"
                    alt="Icona palloncino a cuore"
                  />
                </div>
                <div className="ml-16">
                  <h3 className="text-lg leading-6 font-medium text-blue-gray font-playfair">
                    Accesso riservato agli invitati
                  </h3>
                  <p className="mt-2 text-base text-gray-500">
                    Solo gli ospiti dell'evento hanno accesso alle gallerie,
                    mantenendo i ricordi privati e speciali.
                  </p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="relative group">
                <div className="absolute h-14 w-14">
                  <DecorativeImage
                    type="wedding-cake"
                    className="w-full h-auto"
                    alt="Icona torta nuziale"
                  />
                </div>
                <div className="ml-16">
                  <h3 className="text-lg leading-6 font-medium text-blue-gray font-playfair">
                    Ricordi in alta qualità
                  </h3>
                  <p className="mt-2 text-base text-gray-500">
                    Rivivi ogni emozione dell'evento con immagini professionali
                    che catturano l'essenza di ogni momento.
                  </p>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="relative group">
                <div className="absolute h-14 w-14">
                  <DecorativeImage
                    type="standing"
                    className="w-full h-auto"
                    alt="Icona sposi"
                  />
                </div>
                <div className="ml-16">
                  <h3 className="text-lg leading-6 font-medium text-blue-gray font-playfair">
                    Condivisione tra invitati
                  </h3>
                  <p className="mt-2 text-base text-gray-500">
                    Condividi facilmente l'indirizzo della galleria con altri
                    invitati dell'evento o richiedi la password ai protagonisti.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Separatore decorativo */}
      <div className="w-full flex justify-center py-2 bg-white">
        <FloralDivider className="w-full h-12" />
      </div>

      {/* Sezione WhatsApp */}
      <section id="contact" className="bg-mint py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-blue-gray font-playfair sm:text-3xl">
              {studioSettings.whatsappTitle}
            </h2>
            <p className="mt-3 text-lg text-gray-600 max-w-2xl mx-auto">
              Hai domande o desideri maggiori informazioni sui nostri servizi
              fotografici per eventi? Contattaci su WhatsApp!
            </p>
          </div>

          <div className="bg-white p-8 rounded-lg shadow border border-sage/20 flex flex-col md:flex-row items-center">
            <div className="flex-shrink-0 h-28 w-28 mb-6 md:mb-0">
              <DecorativeImage
                type="heart-balloon"
                className="w-full h-auto"
                alt="WhatsApp"
              />
            </div>
            <div className="md:ml-8 flex-1">
              <h3 className="text-xl font-medium text-terracotta mb-2">
                {studioSettings.whatsappSubtitle}
              </h3>
              <p className="text-gray-600 mb-6">
                {studioSettings.whatsappText}
              </p>

              <a
                href={
                  studioSettings.phone
                    ? `https://wa.me/${studioSettings.phone.replace(/\s+/g, "").replace(/^\+/, "")}`
                    : "https://wa.me/3491234567"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-blue-gray hover:bg-dark-sage focus:outline-none btn-primary"
              >
                <span className="mr-2">
                  {studioSettings.whatsappButtonText}
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path
                    d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0
                  11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
                  />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}