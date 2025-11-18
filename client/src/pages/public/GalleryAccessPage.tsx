import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Lock,
  Calendar,
  ImageIcon,
} from "lucide-react";
import { useStudio } from "@/context/StudioContext";
import GallerySearch from "@/components/GallerySearch";
import type { BookingCampaign } from "@shared/booking-types";

export default function GalleryAccessPage() {
  const { studioSettings } = useStudio();
  const [activeCampaigns, setActiveCampaigns] = useState<BookingCampaign[]>([]);

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
            Cerca la tua galleria per nome evento o sposi
          </p>
        </div>
      </section>

      {/* Gallery Search Section */}
      <section className="py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-sage/10 p-8">
            <h2 className="text-2xl font-playfair text-blue-gray mb-6 text-center">
              Cerca la Tua Galleria
            </h2>
            <p className="text-gray-600 text-center mb-6">
              Inserisci il nome degli sposi o dell'evento per trovare la tua galleria
            </p>
            
            {/* Use existing GallerySearch component - works exactly like Home */}
            <div className="bg-off-white p-4 rounded-lg shadow-inner">
              <GallerySearch />
            </div>
            
            <div className="mt-6 text-center text-sm text-gray-500">
              <p>
                Una volta trovata la galleria, potrai inserire la password ricevuta via email.
              </p>
              <p className="mt-2">
                Se non hai la password, potrai richiederla direttamente dalla pagina della galleria.
              </p>
            </div>
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
