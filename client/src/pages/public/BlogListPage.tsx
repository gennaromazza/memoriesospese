import { useState, useEffect } from "react";
import { Link } from "wouter";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, Calendar, Clock, Instagram, Mail, Phone, MapPin, AlertCircle } from "lucide-react";
import { BlogPostStatus } from "@shared/schema";
import { useStudio } from "@/context/StudioContext";
import StudioLogo from "@/components/StudioLogo";
import { useSEO } from "@/hooks/useSEO";
import { getPublicWeddingStoryPreviews } from "@/lib/wedding-seo";
import type { PublicWeddingStoryPreview } from "@shared/wedding-seo-types";

type EditorialCard = {
  id: string;
  title: string;
  excerpt: string;
  publishedAt?: any;
  coverImage?: string;
  category: string;
  tags: string[];
  href: string;
  kind: 'blog' | 'real-wedding';
  content?: string;
  contentUrl?: string;
};

export default function BlogListPage() {
  const { studioSettings } = useStudio();
  const [posts, setPosts] = useState<EditorialCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(9);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');

  useSEO({
    title: "Blog | Consigli Matrimonio e Fotografia | Image Studio",
    description: "Il blog di Image Studio: consigli per il matrimonio, storie di coppie, tendenze fotografia, guide per sposi a Napoli e Caserta.",
    canonical: `${window.location.origin}/blog`,
    keywords: "blog matrimonio, consigli sposi, fotografia matrimonio, storie matrimoni campania",
  });

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const postsRef = collection(db, 'blogPosts');
      // publishedAt != null è ridondante: se status='published' il modello garantisce publishedAt.
      // Rimuoverlo semplifica l'indice composito richiesto da Firestore.
      const q = query(
        postsRef,
        where('status', '==', BlogPostStatus.PUBLISHED),
        orderBy('publishedAt', 'desc')
      );
      const [postsResult, storiesResult] = await Promise.allSettled([getDocs(q), getPublicWeddingStoryPreviews(50)]);
      if (postsResult.status === 'rejected') throw postsResult.reason;
      const snapshot = postsResult.value;
      const weddingStories = storiesResult.status === 'fulfilled' ? storiesResult.value : [];
      if (storiesResult.status === 'rejected') {
        console.warn('Real Wedding temporaneamente non disponibili nel Blog:', storiesResult.reason);
      }
      const loadedPosts: EditorialCard[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        href: `/blog/${d.data().slug}`,
        kind: 'blog' as const,
      })) as EditorialCard[];
      const weddingCards: EditorialCard[] = weddingStories.map((story: PublicWeddingStoryPreview) => ({
        id: `real-wedding-${story.slug}`,
        title: story.title,
        excerpt: story.excerpt,
        publishedAt: story.publishedAt,
        coverImage: story.coverImage,
        category: 'Real Wedding',
        tags: ['matrimonio'],
        href: `/real-wedding/${story.slug}`,
        kind: 'real-wedding',
        content: story.excerpt,
      }));
      setPosts([...loadedPosts, ...weddingCards].sort((a, b) => timestampValue(b.publishedAt) - timestampValue(a.publishedAt)));
    } catch (error) {
      console.error('Errore caricamento blog:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  // Estrai categorie e tag unici
  const allCategories = ['all', ...new Set(posts.map(p => p.category).filter(Boolean))];
  const allTags = ['all', ...new Set(posts.flatMap(p => p.tags || []))];

  // Filtra posts — guard su title/excerpt per documenti legacy o importati con campi mancanti
  const filteredPosts = posts.filter(post => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = searchQuery === '' || 
      (post.title || '').toLowerCase().includes(q) ||
      (post.excerpt || '').toLowerCase().includes(q);
    
    const matchesCategory = selectedCategory === 'all' || post.category === selectedCategory;
    const matchesTag = selectedTag === 'all' || post.tags?.includes(selectedTag);
    
    return matchesSearch && matchesCategory && matchesTag;
  });

  // Paginazione
  const totalPages = Math.ceil(filteredPosts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPosts = filteredPosts.slice(startIndex, endIndex);

  // Reset pagina quando cambiano i filtri
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, selectedTag]);

  const timestampValue = (timestamp: any): number => {
    if (timestamp?.seconds != null) return timestamp.seconds * 1000;
    const value = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp || 0).getTime();
    return Number.isNaN(value) ? 0 : value;
  };

  const formatDate = (timestamp: any): string => {
    if (!timestamp) return '';
    try {
      let date: Date;
      if (timestamp.seconds != null) {
        date = new Date(timestamp.seconds * 1000);
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
        date = new Date(timestamp);
      } else {
        return '';
      }
      if (isNaN(date.getTime())) return '';
      return date.toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return '';
    }
  };

  // Stima tempo di lettura su testo pulito (HTML strippato).
  // Per post grandi (content='', contentUrl set) non è possibile calcolare il tempo
  // senza scaricare il file: in quel caso mostriamo un placeholder.
  const estimateReadTime = (post: EditorialCard): string => {
    const content = post.content || '';
    if (!content && post.contentUrl) return 'lettura lunga';
    if (!content) return '0 min';
    const plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const words = plainText.split(' ').filter(Boolean).length;
    return `${Math.ceil(words / 200)} min`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-[#F5EFE6] flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-sage" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-[#F5EFE6] flex flex-col items-center justify-center gap-4 px-4 text-center">
        <AlertCircle className="h-12 w-12 text-terracotta" />
        <h2 className="text-xl font-semibold text-blue-gray">Impossibile caricare gli articoli</h2>
        <p className="text-gray-500">Verifica la connessione e riprova.</p>
        <Button onClick={loadPosts} className="bg-sage hover:bg-dark-sage text-white">
          Riprova
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-[#F5EFE6]">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/90 backdrop-blur-lg z-50 border-b border-sage/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <StudioLogo 
              imgClassName="h-12 w-auto" 
              textClassName="text-blue-gray font-playfair font-bold text-2xl"
            />
            <Link href="/">
              <Button variant="ghost" className="relative font-medium text-blue-gray hover:text-sage px-4 py-2 rounded-xl transition-all duration-300 group">
                <ArrowLeft className="mr-2 h-4 w-4" />
                <span className="relative z-10">Torna alla Home</span>
                <span className="absolute inset-0 bg-gradient-to-r from-sage/0 via-sage/5 to-sage/0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-24 bg-gradient-to-r from-sage to-blue-gray text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-playfair mb-4 text-white">
            Blog
          </h1>
          <p className="text-lg sm:text-xl text-white/90 max-w-2xl mx-auto">
            Storie, riflessioni e consigli dal mondo della fotografia
          </p>
        </div>
      </section>

      {/* Filtri e Ricerca */}
      <section className="py-8 px-4 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Barra di ricerca */}
            <div className="flex-1">
              <Input
                type="text"
                placeholder="🔍 Cerca articoli..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Filtro Categoria */}
            {allCategories.length > 1 && (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-sage"
              >
                <option value="all">Tutte le Categorie</option>
                {allCategories.slice(1).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            )}

            {/* Filtro Tag */}
            {allTags.length > 1 && (
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-sage"
              >
                <option value="all">Tutti i Tag</option>
                {allTags.slice(1).map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            )}
          </div>

          {/* Risultati */}
          {(searchQuery || selectedCategory !== 'all' || selectedTag !== 'all') && (
            <p className="text-sm text-gray-600 mt-4">
              {filteredPosts.length} {filteredPosts.length === 1 ? 'articolo trovato' : 'articoli trovati'}
            </p>
          )}
        </div>
      </section>

      {/* Posts Grid */}
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          {filteredPosts.length === 0 ? (
            <div className="text-center py-24 bg-white rounded-2xl shadow-lg">
              {posts.length === 0 ? (
                <>
                  <p className="text-xl text-gray-500">Nessun articolo pubblicato al momento</p>
                  <p className="text-gray-400 mt-2">Torna presto per nuovi contenuti!</p>
                </>
              ) : (
                <>
                  <p className="text-xl text-gray-500">Nessun articolo trovato</p>
                  <p className="text-gray-400 mt-2">Prova a modificare i filtri di ricerca</p>
                  <Button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('all');
                      setSelectedTag('all');
                    }}
                    className="mt-4 bg-sage hover:bg-dark-sage"
                  >
                    Resetta Filtri
                  </Button>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                {paginatedPosts.map((post) => (
                  <Card key={post.id} className="overflow-hidden hover:shadow-xl transition-all duration-300 bg-white border-sage/10 animate-slide-up" data-testid={`card-post-${post.id}`}>
                    {post.coverImage && (
                      <div className="overflow-hidden bg-beige">
                        <img 
                          src={post.coverImage} 
                          alt={post.title}
                          className="w-full h-auto object-cover hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                      </div>
                    )}
                    <CardHeader>
                      <div className="flex items-center gap-2 mb-3">
                        {post.category && (
                          <Badge variant="outline" className="text-sage border-sage">
                            {post.category}
                          </Badge>
                        )}
                        {post.tags?.slice(0, 2).map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs bg-beige text-blue-gray">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <Link href={post.href}>
                        <CardTitle className="text-2xl font-playfair text-blue-gray hover:text-terracotta transition-colors cursor-pointer" data-testid={`title-${post.id}`}>
                          {post.title}
                        </CardTitle>
                      </Link>
                      <CardDescription className="flex items-center gap-4 text-sm mt-3">
                        <span className="flex items-center gap-1 text-sage">
                          <Calendar className="h-4 w-4" />
                          {formatDate(post.publishedAt)}
                        </span>
                        <span className="flex items-center gap-1 text-sage">
                          <Clock className="h-4 w-4" />
                          {estimateReadTime(post)}
                        </span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-600 mb-4 line-clamp-3">
                        {post.excerpt}
                      </p>
                      <Link href={post.href}>
                        <Button variant="link" className="text-sage hover:text-dark-sage p-0 font-semibold" data-testid={`button-read-${post.id}`}>
                          {post.kind === 'real-wedding' ? 'Scopri il Real Wedding →' : 'Leggi articolo →'}
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-3 mt-12">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="border-sage text-sage hover:bg-sage hover:text-white"
                  >
                    ← Precedente
                  </Button>

                  <div className="flex gap-2">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          onClick={() => setCurrentPage(pageNum)}
                          className={currentPage === pageNum ? "bg-sage hover:bg-dark-sage" : "border-sage/30 hover:border-sage"}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="border-sage text-sage hover:bg-sage hover:text-white"
                  >
                    Successivo →
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-blue-gray text-white py-12 px-4 mt-20">
        <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-8">
          <div>
            <StudioLogo 
              showLink={false}
              imgClassName="h-10 w-auto mb-2" 
              textClassName="text-2xl font-playfair text-white"
            />
            <p className="text-gray-300 mb-4">
              {studioSettings.about || "Studio fotografico per matrimoni ed eventi"}
            </p>
            {studioSettings.socialLinks?.instagram && (
              <a
                href={studioSettings.socialLinks.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-gray-300 hover:text-white transition"
              >
                <Instagram className="h-5 w-5" />
                Seguici su Instagram
              </a>
            )}
          </div>
          <div>
            <h4 className="font-semibold mb-4">Link Utili</h4>
            <div className="space-y-2">
              <Link href="/" className="block text-gray-300 hover:text-white">Home</Link>
              <Link href="/portfolio" className="block text-gray-300 hover:text-white">Portfolio</Link>
              <Link href="/storie" className="block text-gray-300 hover:text-white">La Mia Storia</Link>
              <Link href="/blog" className="block text-gray-300 hover:text-white">Blog</Link>
              <Link href="/consulenze" className="block text-gray-300 hover:text-white">Contattami</Link>
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
          <p>© {new Date().getFullYear()} iMaGe Studio. Tutti i diritti riservati.</p>
        </div>
      </footer>
    </div>
  );
}
