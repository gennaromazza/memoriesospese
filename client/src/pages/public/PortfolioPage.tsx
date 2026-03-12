import { useState, useEffect } from "react";
import { Link } from "wouter";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Grid, LayoutGrid } from "lucide-react";
import Lightbox from "@/components/public/Lightbox";
import StudioLogo from "@/components/StudioLogo";
import { useSEO } from "@/hooks/useSEO";
import { getActiveJobTypes } from "@/lib/job-types";
import type { JobTypeFE } from "@shared/job-types";

interface PortfolioPhoto {
  id: string;
  photoUrl: string;
  galleryName: string;
  jobType: string;
  featured: boolean;
  sortOrder: number;
  caption?: string;
}

interface CategorySummary {
  jobType: string;
  label: string;
  ordine: number;
  count: number;
  coverPhoto: string;
}

export default function PortfolioPage() {
  const [allPhotos, setAllPhotos] = useState<PortfolioPhoto[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [jobTypes, setJobTypes] = useState<JobTypeFE[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'categories' | 'grid'>('categories');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useSEO({
    title: "Portfolio Fotografico | Matrimoni, Battesimi, Eventi | Image Studio Napoli",
    description: "Scopri il portfolio fotografico di Image Studio: matrimoni, battesimi, comunioni, ritratti ed eventi a Napoli, Caserta e Campania. Fotografie emozionali.",
    canonical: "/portfolio",
    keywords: "portfolio fotografo napoli, foto matrimoni campania, galleria fotografica, foto battesimi napoli",
  });

  useEffect(() => {
    loadPortfolioPhotos();
  }, []);

  const getLabelForSlug = (slug: string, types: JobTypeFE[]): string => {
    return types.find(t => t.slug === slug)?.nome || slug;
  };

  const getOrdineForSlug = (slug: string, types: JobTypeFE[]): number => {
    return types.find(t => t.slug === slug)?.ordine ?? 999;
  };

  const loadPortfolioPhotos = async () => {
    setLoading(true);
    try {
      const [photos, types] = await Promise.all([
        getDocs(query(collection(db, 'portfolioSelections'), orderBy('sortOrder', 'asc'))).then(
          snap => snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as PortfolioPhoto[]
        ),
        getActiveJobTypes()
      ]);

      setJobTypes(types);
      setAllPhotos(photos);

      // Raggruppa per jobType
      const grouped = photos.reduce((acc, photo) => {
        if (!acc[photo.jobType]) acc[photo.jobType] = [];
        acc[photo.jobType].push(photo);
        return acc;
      }, {} as Record<string, PortfolioPhoto[]>);

      // Crea riepiloghi categoria con nome e ordine da Firestore
      const summaries: CategorySummary[] = Object.entries(grouped).map(([jobType, photos]) => ({
        jobType,
        label: getLabelForSlug(jobType, types),
        ordine: getOrdineForSlug(jobType, types),
        count: photos.length,
        coverPhoto: photos.find(p => p.featured)?.photoUrl || photos[0]?.photoUrl || ''
      }));

      // Ordina secondo il campo `ordine` di Firestore
      summaries.sort((a, b) => a.ordine - b.ordine);

      setCategories(summaries);
    } catch (error) {
      console.error('Errore caricamento portfolio:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPhotos = selectedCategory === 'all' 
    ? allPhotos 
    : allPhotos.filter(p => p.jobType === selectedCategory);

  const photoUrls = filteredPhotos.map(p => p.photoUrl);

  const openLightbox = (index: number) => {
    setCurrentImageIndex(index);
    setLightboxOpen(true);
  };

  const availableCategories = Array.from(new Set(allPhotos.map(p => p.jobType)));

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-[#F5EFE6]">
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-beige">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <StudioLogo 
              imgClassName="h-12 w-auto" 
              textClassName="text-2xl font-playfair text-blue-gray"
            />
            <Link href="/">
              <Button variant="ghost" className="text-sage hover:text-dark-sage" data-testid="button-back-home">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Home
              </Button>
            </Link>

            {/* View mode toggle */}
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'categories' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('categories')}
                data-testid="button-view-categories"
              >
                <LayoutGrid className="mr-2 h-4 w-4" />
                Categorie
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
                data-testid="button-view-grid"
              >
                <Grid className="mr-2 h-4 w-4" />
                Tutte le Foto
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 pt-24 sm:pt-28 md:pt-32 pb-12">
        <div className="text-center mb-12 animate-fade-in">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-playfair text-blue-gray mb-4">Portfolio</h1>
          <p className="text-xl text-gray-600">
            {viewMode === 'categories' 
              ? 'Esplora i miei lavori divisi per categoria' 
              : `${filteredPhotos.length} foto`}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-24">
            <Loader2 className="h-12 w-12 animate-spin text-terracotta" />
          </div>
        ) : allPhotos.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-xl text-gray-500">
              Il portfolio è in fase di allestimento. Torna presto per vedere i miei lavori!
            </p>
          </div>
        ) : (
          <>
            {/* Categories View */}
            {viewMode === 'categories' && (
              <div className="columns-1 sm:columns-2 lg:columns-3 gap-8">
                {categories.map(category => (
                  <div 
                    key={category.jobType}
                    onClick={() => {
                      setSelectedCategory(category.jobType);
                      setViewMode('grid');
                    }}
                    className="group cursor-pointer mb-8 break-inside-avoid"
                    data-testid={`category-card-${category.jobType}`}
                  >
                    <div className="bg-gray-200 rounded-lg mb-4 overflow-hidden shadow-md hover:shadow-xl transition-shadow duration-300">
                      {category.coverPhoto ? (
                        <img
                          src={category.coverPhoto}
                          alt={category.label}
                          className="w-full h-auto object-cover group-hover:scale-110 transition-transform duration-700"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full aspect-square flex items-center justify-center bg-beige">
                          <span className="text-4xl font-playfair text-sage">{category.label}</span>
                        </div>
                      )}
                    </div>
                    <h3 className="text-2xl font-playfair text-center text-blue-gray group-hover:text-terracotta transition-colors">
                      {category.label}
                    </h3>
                    <p className="text-center text-gray-500 mt-1">
                      {category.count} {category.count === 1 ? 'foto' : 'foto'}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Grid View with Filters */}
            {viewMode === 'grid' && (
              <>
                {/* Category Filters */}
                <div className="flex flex-wrap justify-center gap-2 mb-12">
                  <Badge
                    variant={selectedCategory === 'all' ? 'default' : 'outline'}
                    className="cursor-pointer px-4 py-2 text-sm"
                    onClick={() => setSelectedCategory('all')}
                    data-testid="filter-all"
                  >
                    Tutte ({allPhotos.length})
                  </Badge>
                  {availableCategories.map(cat => {
                    const count = allPhotos.filter(p => p.jobType === cat).length;
                    const label = jobTypes.find(t => t.slug === cat)?.nome || cat;
                    return (
                      <Badge
                        key={cat}
                        variant={selectedCategory === cat ? 'default' : 'outline'}
                        className="cursor-pointer px-4 py-2 text-sm"
                        onClick={() => setSelectedCategory(cat)}
                        data-testid={`filter-${cat}`}
                      >
                        {label} ({count})
                      </Badge>
                    );
                  })}
                </div>

                {/* Masonry Grid */}
                {filteredPhotos.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-500">Nessuna foto in questa categoria.</p>
                  </div>
                ) : (
                  <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
                    {filteredPhotos.map((photo, index) => (
                      <div 
                        key={photo.id} 
                        className="break-inside-avoid group cursor-pointer"
                        onClick={() => openLightbox(index)}
                        data-testid={`photo-${index}`}
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
              </>
            )}
          </>
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
    </div>
  );
}
