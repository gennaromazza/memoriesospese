import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Camera, Heart, BookOpen, Calendar, Image as ImageIcon, Instagram, Phone, Mail, MapPin } from "lucide-react";
import { useStudio } from "@/context/StudioContext";

export default function PublicHomepage() {
  const { studioSettings } = useStudio();

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
              <Link href="/portfolio" className="text-blue-gray hover:text-sage transition">Portfolio</Link>
              <Link href="/storie" className="text-blue-gray hover:text-sage transition">La Mia Storia</Link>
              <Link href="/blog" className="text-blue-gray hover:text-sage transition">Blog</Link>
              <Link href="/consulenze" className="text-blue-gray hover:text-sage transition">Consulenze</Link>
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
                <Button className="bg-sage hover:bg-dark-sage text-white" data-testid="button-prenota-nav">
                  Contattami
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-5xl md:text-6xl font-playfair text-blue-gray mb-6 leading-tight">
                Lasciati <span className="text-[#C67B5C]">Trasportare</span>
              </h1>
              <p className="text-xl text-gray-600 mb-4">
                La fotografia è l'arte di immortalare momenti autentici
              </p>
              <p className="text-lg text-gray-500 mb-8">
                È tutta questione di <span className="font-semibold text-sage">Image</span>
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/consulenze">
                  <Button size="lg" className="bg-sage hover:bg-dark-sage text-white" data-testid="button-prenota-hero">
                    <Calendar className="mr-2 h-5 w-5" />
                    Prenota Consulenza Gratuita
                  </Button>
                </Link>
                <Link href="/portfolio">
                  <Button size="lg" variant="outline" className="border-sage text-sage hover:bg-sage/10" data-testid="button-portfolio-hero">
                    <Camera className="mr-2 h-5 w-5" />
                    Guarda il Portfolio
                  </Button>
                </Link>
              </div>
              <div className="mt-6">
                <Link href="/accesso-galleria">
                  <Button variant="link" className="text-blue-gray hover:text-sage" data-testid="link-accesso-galleria-hero">
                    <ImageIcon className="mr-2 h-4 w-4" />
                    Sei uno sposo? Accedi alla tua galleria
                  </Button>
                </Link>
              </div>
            </div>
            <div className="relative h-[500px] rounded-2xl overflow-hidden shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-br from-sage/20 to-transparent" />
              {/* Placeholder - sarà sostituito con foto vera */}
              <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                <Camera className="h-24 w-24 text-gray-400" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-playfair text-sage mb-2">10+</div>
              <div className="text-gray-600">Anni di Esperienza</div>
            </div>
            <div>
              <div className="text-4xl font-playfair text-sage mb-2">500+</div>
              <div className="text-gray-600">Matrimoni</div>
            </div>
            <div>
              <div className="text-4xl font-playfair text-sage mb-2">1000+</div>
              <div className="text-gray-600">Eventi</div>
            </div>
            <div>
              <div className="text-4xl font-playfair text-sage mb-2">100%</div>
              <div className="text-gray-600">Passione</div>
            </div>
          </div>
        </div>
      </section>

      {/* Portfolio Preview */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-playfair text-blue-gray mb-4">Portfolio</h2>
            <p className="text-xl text-gray-600">Ogni foto racconta una storia unica</p>
          </div>
          {/* Grid placeholder - sarà dinamico */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="aspect-square bg-gray-200 rounded-lg" />
            ))}
          </div>
          <div className="text-center">
            <Link href="/portfolio">
              <Button size="lg" variant="outline" className="border-sage text-sage hover:bg-sage/10">
                Vedi Tutto il Portfolio
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* About Preview */}
      <section className="py-20 bg-white px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="h-[400px] bg-gray-200 rounded-2xl" />
            <div>
              <h2 className="text-4xl font-playfair text-blue-gray mb-6">La Mia Storia</h2>
              <p className="text-lg text-gray-600 mb-6">
                La mia passione per la fotografia inizia a soli 10 anni, con una macchina fotografica 
                trovata in una confezione di merendine Kinder Brioss...
              </p>
              <Link href="/storie">
                <Button variant="outline" className="border-sage text-sage hover:bg-sage/10">
                  <BookOpen className="mr-2 h-4 w-4" />
                  Leggi la Storia Completa
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Accesso Gallerie CTA */}
      <section className="py-20 bg-gradient-to-r from-terracotta to-[#C67B5C] px-4">
        <div className="max-w-4xl mx-auto text-center text-white">
          <h2 className="text-4xl font-playfair mb-4">Sei uno Sposo?</h2>
          <p className="text-xl mb-8">
            Accedi alla tua galleria privata e rivivi le emozioni del tuo giorno speciale
          </p>
          <Link href="/accesso-galleria">
            <Button size="lg" className="bg-white text-terracotta hover:bg-gray-100" data-testid="button-accesso-galleria-cta">
              <ImageIcon className="mr-2 h-5 w-5" />
              Accedi alla Galleria
            </Button>
          </Link>
        </div>
      </section>

      {/* CTA Book */}
      <section className="py-20 bg-gradient-to-r from-sage to-dark-sage px-4">
        <div className="max-w-4xl mx-auto text-center text-white">
          <h2 className="text-4xl font-playfair mb-4">Scarica GRATIS il Libro</h2>
          <p className="text-xl mb-8">
            "Lasciati Trasportare" - La guida completa per organizzare il tuo matrimonio perfetto
          </p>
          <Link href="/lasciati-trasportare">
            <Button size="lg" className="bg-white text-sage hover:bg-gray-100" data-testid="button-libro">
              <BookOpen className="mr-2 h-5 w-5" />
              Scarica il Libro
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-blue-gray text-white py-12 px-4">
        <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-2xl font-playfair mb-4">iMaGe Studio</h3>
            <p className="text-gray-300 mb-4">
              {studioSettings.about || "Studio fotografico per matrimoni ed eventi a Napoli e Caserta"}
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
              <Link href="/portfolio" className="block text-gray-300 hover:text-white">Portfolio</Link>
              <Link href="/storie" className="block text-gray-300 hover:text-white">La Mia Storia</Link>
              <Link href="/blog" className="block text-gray-300 hover:text-white">Blog</Link>
              <Link href="/consulenze" className="block text-gray-300 hover:text-white">Consulenze</Link>
              <Link href="/accesso-galleria" className="block text-gray-300 hover:text-white">Accesso Galleria</Link>
              <Link href="/privacy" className="block text-gray-300 hover:text-white">Privacy</Link>
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
                <a href={`tel:${studioSettings.phone}`} className="flex items-center gap-2 text-gray-300 hover:text-white transition">
                  <Phone className="h-5 w-5 flex-shrink-0" />
                  <span>{studioSettings.phone}</span>
                </a>
              )}
              {studioSettings.email && (
                <a href={`mailto:${studioSettings.email}`} className="flex items-center gap-2 text-gray-300 hover:text-white transition">
                  <Mail className="h-5 w-5 flex-shrink-0" />
                  <span>{studioSettings.email}</span>
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-8 pt-8 border-t border-gray-700 text-center text-gray-400">
          <p>© 2025 iMaGe Studio Fotografico - Gennaro Mazzacane. Tutti i diritti riservati.</p>
        </div>
      </footer>
    </div>
  );
}
