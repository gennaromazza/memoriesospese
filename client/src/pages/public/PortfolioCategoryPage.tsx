import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import Lightbox from "@/components/public/Lightbox";
import { useSEO } from "@/hooks/useSEO";
import { portfolioCategoryContent, PortfolioInline, PortfolioParagraph } from "@shared/portfolio-seo-content";

interface PortfolioPhoto {
  id: string;
  photoUrl: string;
  galleryName: string;
  jobType: string;
  featured: boolean;
  sortOrder: number;
  caption?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  'matrimonio': 'Matrimoni',
  'battesimo': 'Battesimi',
  'comunione': 'Comunioni',
  'cresima': 'Cresime',
  'evento': 'Eventi',
  'ritratto': 'Ritratti',
  'famiglia': 'Famiglia',
  'altro': 'Altri Lavori'
};

export default function PortfolioCategoryPage() {
  const { categoria } = useParams<{ categoria: string }>();
  const [photos, setPhotos] = useState<PortfolioPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const capitalizedCategoria = categoria ? categoria.charAt(0).toUpperCase() + categoria.slice(1) : '';

  useSEO({
    title: `Portfolio ${capitalizedCategoria} | Image Studio Napoli`,
    description: `Galleria fotografica ${categoria || ''} di Image Studio. Foto professionali a Napoli, Caserta e Campania.`,
    canonical: `/portfolio/${categoria || ''}`,
    keywords: `foto ${categoria || ''} napoli, ${categoria || ''} caserta, fotografo ${categoria || ''} campania`,
  });

  useEffect(() => {
    loadPhotos();
  }, [categoria]);

  const loadPhotos = async () => {
    if (!categoria) return;

    setLoading(true);
    try {
      // Nota: where + orderBy su campi diversi richiede un indice composito Firestore
      // (non deployabile da qui): filtriamo con where e ordiniamo lato client.
      const photosRef = collection(db, 'portfolioSelections');
      const q = query(photosRef, where('jobType', '==', categoria));

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PortfolioPhoto[];

      data.sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      setPhotos(data);
    } catch (error) {
      console.error('Errore caricamento portfolio:', error);
    } finally {
      setLoading(false);
    }
  };

  const openLightbox = (index: number) => {
    setCurrentImageIndex(index);
    setLightboxOpen(true);
  };

  const photoUrls = photos.map(p => p.photoUrl);

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-beige sticky top-0 bg-white/80 backdrop-blur-md z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/portfolio">
            <Button variant="ghost" className="text-sage hover:text-dark-sage" data-testid="button-back-portfolio">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Portfolio
            </Button>
          </Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-playfair text-blue-gray mb-4">
            {CATEGORY_LABELS[categoria || ''] || categoria?.replace('-', ' ')}
          </h1>
          <p className="text-xl text-gray-600">
            {loading ? 'Caricamento...' : `${photos.length} foto`}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-24">
            <Loader2 className="h-12 w-12 animate-spin text-terracotta" />
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-xl text-gray-500">
              Nessuna foto disponibile in questa categoria al momento.
            </p>
            <Link href="/portfolio">
              <Button className="mt-6" data-testid="button-back-to-portfolio">
                Torna al Portfolio
              </Button>
            </Link>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
            {photos.map((photo, index) => (
              <div 
                key={photo.id} 
                className="break-inside-avoid group cursor-pointer"
                onClick={() => openLightbox(index)}
                data-testid={`portfolio-photo-${index}`}
              >
                <div className="relative overflow-hidden rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300">
                  <img
                    src={photo.photoUrl}
                    alt={photo.caption || photo.galleryName}
                    className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  {photo.featured && (
                    <div className="absolute top-2 left-2 bg-terracotta text-white px-3 py-1 rounded-full text-xs font-medium">
                      In Evidenza
                    </div>
                  )}
                  {photo.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <p className="text-white text-sm">{photo.caption}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Lightbox
        images={photoUrls}
        currentIndex={currentImageIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onNext={() => setCurrentImageIndex(prev => Math.min(prev + 1, photoUrls.length - 1))}
        onPrevious={() => setCurrentImageIndex(prev => Math.max(prev - 1, 0))}
      />

      {categoria && portfolioCategoryContent[categoria] && (
        <PortfolioSeoSection categoria={categoria} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: render un paragrafo (array di inline: testo + link facoltativi)
// ---------------------------------------------------------------------------
function RenderParagraph({ parts }: { parts: PortfolioParagraph }) {
  return (
    <p className="text-gray-600 leading-relaxed">
      {parts.map((part: PortfolioInline, i: number) =>
        part.href ? (
          <Link key={i} href={part.href} className="text-terracotta underline hover:text-dark-sage transition-colors">
            {part.text}
          </Link>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Sezione SEO — mostrata in fondo alla pagina, dopo la galleria
// ---------------------------------------------------------------------------
function PortfolioSeoSection({ categoria }: { categoria: string }) {
  const content = portfolioCategoryContent[categoria];
  if (!content) return null;

  return (
    <section className="bg-gray-50 border-t border-gray-100 mt-16 py-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Sezioni testuali (approccio, aree, come funziona, …) */}
        {content.sections.map((section, si) => (
          <div key={si}>
            <h2 className="text-2xl font-playfair text-blue-gray mb-3">{section.heading}</h2>
            <div className="space-y-2">
              {section.paragraphs.map((para, pi) => (
                <RenderParagraph key={pi} parts={para} />
              ))}
            </div>
          </div>
        ))}

        {/* FAQ */}
        {content.faqs && content.faqs.length > 0 && (
          <div>
            <h2 className="text-2xl font-playfair text-blue-gray mb-6">Domande Frequenti</h2>
            <dl className="space-y-6">
              {content.faqs.map((faq, fi) => (
                <div key={fi} className="border-b border-gray-200 pb-6 last:border-b-0 last:pb-0">
                  <dt className="text-lg font-semibold text-blue-gray mb-2">{faq.question}</dt>
                  <dd>
                    <RenderParagraph parts={faq.answer} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* Link correlati */}
        {content.relatedLinks && content.relatedLinks.length > 0 && (
          <p className="text-sm text-gray-500">
            Vedi anche:{' '}
            {content.relatedLinks.map((link, li) => (
              <span key={li}>
                {li > 0 && ' | '}
                <Link href={link.href} className="text-terracotta underline hover:text-dark-sage transition-colors">
                  {link.text}
                </Link>
              </span>
            ))}
          </p>
        )}
      </div>
    </section>
  );
}
