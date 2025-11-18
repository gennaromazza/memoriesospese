import { useState, useEffect, FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Lock,
  Calendar,
  ImageIcon,
  Search,
  Loader2,
} from "lucide-react";
import { useStudio } from "@/context/StudioContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { trackPasswordRequest } from "@/lib/analytics";
import type { BookingCampaign } from "@shared/booking-types";

enum SecurityQuestionType {
  LOCATION = "location",
  MONTH = "month",
  CUSTOM = "custom",
}

export default function GalleryAccessPage() {
  const { studioSettings } = useStudio();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [activeCampaigns, setActiveCampaigns] = useState<BookingCampaign[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedGallery, setSelectedGallery] = useState<any>(null);
  const [showSecurityQuestion, setShowSecurityQuestion] = useState(false);
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [securityError, setSecurityError] = useState("");

  // Form data state
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    relation: "",
    gallerySearch: "",
  });

  // Load active campaigns
  useEffect(() => {
    const loadActiveCampaigns = async () => {
      try {
        const { getActiveCampaigns } = await import("@/lib/booking-campaigns");
        const active = await getActiveCampaigns();
        setActiveCampaigns(active);
      } catch (error) {
        console.error("Errore caricamento campagne:", error);
      }
    };
    loadActiveCampaigns();
  }, []);

  // Handle input changes
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
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

  // Search galleries
  const searchGalleries = async (searchTerm: string) => {
    if (searchTerm.length < 3) return;

    try {
      const galleryRef = collection(db, "galleries");
      const q = query(galleryRef, where("active", "==", true));
      const querySnapshot = await getDocs(q);

      const specialThemeIds = [
        "natale",
        "carnevale",
        "san-valentino",
        "pasqua",
        "halloween",
      ];

      const results: any[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();

        if (data.specialTheme && specialThemeIds.includes(data.specialTheme)) {
          return;
        }

        const galleryName = data.name.toLowerCase();
        const searchTermLower = searchTerm.toLowerCase();

        if (galleryName.includes(searchTermLower)) {
          results.push({
            id: doc.id,
            ...data,
          });
        }
      });

      setSearchResults(results);
    } catch (error) {
      console.error("Errore ricerca gallerie:", error);
    }
  };

  // Handle gallery selection
  const handleGallerySelect = (gallery: any) => {
    setSelectedGallery(gallery);
    setFormData((prev) => ({ ...prev, gallerySearch: gallery.name }));
    setSearchResults([]);
    // Reset security question state when selecting a new gallery
    setShowSecurityQuestion(false);
    setSecurityAnswer("");
    setSecurityError("");
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

    const hasSecurityQuestion =
      selectedGallery.requiresSecurityQuestion === true &&
      selectedGallery.securityQuestionType &&
      selectedGallery.securityAnswer;

    if (hasSecurityQuestion && !showSecurityQuestion) {
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

      trackPasswordRequest(selectedGallery.code);

      toast({
        title: "Richiesta ricevuta",
        description: hasSecurityQuestion
          ? "Accesso autorizzato! Password visualizzata."
          : "Ti abbiamo inviato la password via email.",
      });

      setLocation(`/password-result/${selectedGallery.code}`);
    } catch (error: any) {
      console.error("Errore invio richiesta:", error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore. Riprova più tardi.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-[#F5EFE6]">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-beige">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-2xl font-playfair text-blue-gray">
              <span className="text-[#C67B5C]">i</span>MaGe Studio
            </Link>
            <Link href="/">
              <Button variant="ghost" className="text-sage hover:text-dark-sage">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Torna alla Home
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-sage rounded-full mb-6">
            <ImageIcon className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-5xl md:text-6xl font-playfair text-blue-gray mb-6">
            Accedi alla Tua <span className="text-[#C67B5C]">Galleria</span>
          </h1>
          <p className="text-xl text-gray-600 mb-4">
            Rivivi le emozioni del tuo evento speciale
          </p>
          <p className="text-lg text-gray-500">
            Cerca la tua galleria e richiedi l'accesso
          </p>
        </div>
      </section>

      {/* Gallery Access Form Section */}
      <section className="py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-sage/10 p-8">
            <h2 className="text-2xl font-playfair text-blue-gray mb-6 text-center">
              Richiedi Accesso alla Galleria
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Gallery Search */}
              <div>
                <Label htmlFor="gallerySearch" className="text-base font-medium">
                  Cerca la tua galleria *
                </Label>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    data-testid="input-gallery-search"
                    id="gallerySearch"
                    name="gallerySearch"
                    type="text"
                    placeholder="Nome evento o sposi..."
                    value={formData.gallerySearch}
                    onChange={handleInputChange}
                    className="pl-10"
                    required
                  />
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="mt-2 border border-sage/20 rounded-lg bg-white shadow-md max-h-48 overflow-y-auto">
                    {searchResults.map((gallery) => (
                      <button
                        key={gallery.id}
                        type="button"
                        data-testid={`button-select-gallery-${gallery.id}`}
                        onClick={() => handleGallerySelect(gallery)}
                        className="w-full text-left px-4 py-3 hover:bg-sage/5 border-b border-sage/10 last:border-0 transition-colors"
                      >
                        <div className="font-medium text-blue-gray">
                          {gallery.name}
                        </div>
                        {gallery.date && (
                          <div className="text-sm text-gray-500">
                            {new Date(gallery.date).toLocaleDateString("it-IT")}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Selected Gallery */}
                {selectedGallery && (
                  <div className="mt-3 p-3 bg-sage/5 rounded-lg border border-sage/20">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-sage" />
                      <span className="font-medium text-blue-gray">
                        {selectedGallery.name}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Personal Info Fields */}
              {selectedGallery && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName" className="text-base font-medium">
                        Nome *
                      </Label>
                      <Input
                        data-testid="input-first-name"
                        id="firstName"
                        name="firstName"
                        type="text"
                        value={formData.firstName}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName" className="text-base font-medium">
                        Cognome *
                      </Label>
                      <Input
                        data-testid="input-last-name"
                        id="lastName"
                        name="lastName"
                        type="text"
                        value={formData.lastName}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="email" className="text-base font-medium">
                      Email *
                    </Label>
                    <Input
                      data-testid="input-email"
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="relation" className="text-base font-medium">
                      Relazione con l'evento *
                    </Label>
                    <Select
                      value={formData.relation}
                      onValueChange={(value) =>
                        setFormData((prev) => ({ ...prev, relation: value }))
                      }
                      required
                    >
                      <SelectTrigger data-testid="select-relation">
                        <SelectValue placeholder="Seleziona..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sposo">Sposo</SelectItem>
                        <SelectItem value="sposa">Sposa</SelectItem>
                        <SelectItem value="genitore">Genitore</SelectItem>
                        <SelectItem value="testimone">Testimone</SelectItem>
                        <SelectItem value="invitato">Invitato</SelectItem>
                        <SelectItem value="altro">Altro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Security Question */}
                  {showSecurityQuestion && (
                    <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                      <Label htmlFor="securityAnswer" className="text-base font-medium text-amber-900">
                        {getSecurityQuestionText(selectedGallery)} *
                      </Label>
                      <Input
                        data-testid="input-security-answer"
                        id="securityAnswer"
                        type="text"
                        value={securityAnswer}
                        onChange={(e) => setSecurityAnswer(e.target.value)}
                        className="mt-2"
                        placeholder="Inserisci la risposta..."
                        required
                      />
                      {securityError && (
                        <p className="text-sm text-red-600 mt-2">{securityError}</p>
                      )}
                    </div>
                  )}

                  {/* Submit Button */}
                  <Button
                    data-testid="button-submit-request"
                    type="submit"
                    className="w-full bg-sage hover:bg-dark-sage text-white"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Invio in corso...
                      </>
                    ) : showSecurityQuestion ? (
                      "Verifica e Accedi"
                    ) : (
                      "Richiedi Accesso"
                    )}
                  </Button>
                </>
              )}
            </form>
          </div>
        </div>
      </section>

      {/* Quick Links */}
      <section className="py-12 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-playfair text-blue-gray text-center mb-8">
            Altre Opzioni
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Special Gallery Link */}
            <Link href="/special-gallery">
              <div className="bg-gradient-to-br from-sage/5 to-sage/10 rounded-2xl p-8 border border-sage/20 hover:border-sage/40 transition-all cursor-pointer group">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 bg-sage rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Lock className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-playfair text-blue-gray">
                    Gallerie Speciali
                  </h3>
                </div>
                <p className="text-gray-600 mb-4">
                  Accedi alle gallerie tematiche con il tuo PIN (Natale,
                  Carnevale, San Valentino...)
                </p>
                <div className="flex items-center text-sage font-semibold">
                  Accedi con PIN →
                </div>
              </div>
            </Link>

            {/* Booking Campaign Link - Conditional */}
            {activeCampaigns.length > 0 && (
              <Link href="/prenota">
                <div className="bg-gradient-to-br from-terracotta/5 to-terracotta/10 rounded-2xl p-8 border border-terracotta/20 hover:border-terracotta/40 transition-all cursor-pointer group">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-terracotta rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Calendar className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-2xl font-playfair text-blue-gray">
                      Offerte Speciali
                    </h3>
                  </div>
                  <p className="text-gray-600 mb-4">
                    {activeCampaigns.length}{" "}
                    {activeCampaigns.length === 1
                      ? "promozione attiva"
                      : "promozioni attive"}
                    ! Prenota ora il tuo servizio fotografico
                  </p>
                  <div className="flex items-center text-terracotta font-semibold">
                    Vedi Offerte →
                  </div>
                </div>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-blue-gray text-white py-12 px-4 mt-20">
        <div className="max-w-7xl mx-auto text-center">
          <h3 className="text-2xl font-playfair mb-4">iMaGe Studio</h3>
          <p className="text-gray-300 mb-6">
            {studioSettings.about ||
              "Studio fotografico per matrimoni ed eventi"}
          </p>
          <div className="flex justify-center gap-6">
            <Link href="/" className="text-gray-300 hover:text-white">
              Home
            </Link>
            <Link href="/portfolio" className="text-gray-300 hover:text-white">
              Portfolio
            </Link>
            <Link href="/blog" className="text-gray-300 hover:text-white">
              Blog
            </Link>
            <Link href="/consulenze" className="text-gray-300 hover:text-white">
              Consulenze
            </Link>
          </div>
          <div className="mt-8 text-sm text-gray-400">
            © {new Date().getFullYear()} iMaGe Studio. Tutti i diritti riservati.
          </div>
        </div>
      </footer>
    </div>
  );
}
