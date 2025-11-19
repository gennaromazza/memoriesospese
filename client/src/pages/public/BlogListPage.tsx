import { useState, useEffect } from "react";
import { Link } from "wouter";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Calendar, Clock, Instagram, Mail, Phone, MapPin } from "lucide-react";
import { BlogPost, BlogPostStatus } from "@shared/schema";
import { useStudio } from "@/context/StudioContext";

export default function BlogListPage() {
  const { studioSettings } = useStudio();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(9);

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const postsRef = collection(db, 'blogPosts');
      const q = query(
        postsRef,
        where('status', '==', BlogPostStatus.PUBLISHED),
        where('publishedAt', '!=', null),
        orderBy('publishedAt', 'desc')
      );
      const snapshot = await getDocs(q);

      const loadedPosts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BlogPost[];

      setPosts(loadedPosts);
    } catch (error) {
      console.error('Errore caricamento blog:', error);
    } finally {
      setLoading(false);
    }
  };

  // Paginazione
  const totalPages = Math.ceil(posts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPosts = posts.slice(startIndex, endIndex);

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

  const estimateReadTime = (content: string) => {
    if (!content) return '0 min di lettura';
    const wordsPerMinute = 200;
    const words = content.split(/\s+/).length;
    const minutes = Math.ceil(words / wordsPerMinute);
    return `${minutes} min di lettura`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-[#F5EFE6] flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-sage" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-[#F5EFE6]">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/90 backdrop-blur-lg z-50 border-b border-sage/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <Link href="/">
              <h1 className="text-blue-gray font-playfair font-bold text-2xl cursor-pointer transition-colors duration-300 hover:text-sage">
                iMaGe <span className="text-sage">Studio</span>
              </h1>
            </Link>
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

      {/* Posts Grid */}
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          {posts.length === 0 ? (
            <div className="text-center py-24 bg-white rounded-2xl shadow-lg">
              <p className="text-xl text-gray-500">Nessun articolo pubblicato al momento</p>
              <p className="text-gray-400 mt-2">Torna presto per nuovi contenuti!</p>
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
                      <Link href={`/blog/${post.slug}`}>
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
                          {estimateReadTime(post.content)}
                        </span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-600 mb-4 line-clamp-3">
                        {post.excerpt}
                      </p>
                      <Link href={`/blog/${post.slug}`}>
                        <Button variant="link" className="text-sage hover:text-dark-sage p-0 font-semibold" data-testid={`button-read-${post.id}`}>
                          Leggi articolo →
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
            <h3 className="text-2xl font-playfair mb-4">iMaGe Studio</h3>
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
          <p>© 2025 iMaGe Studio. Tutti i diritti riservati.</p>
        </div>
      </footer>
    </div>
  );
}