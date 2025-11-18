import { useState, useEffect } from "react";
import { Link, useRoute } from "wouter";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Calendar, User } from "lucide-react";
import { BlogPost, BlogPostStatus } from "@shared/schema";

export default function BlogPostPage() {
  const [, params] = useRoute("/blog/:slug");
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (params?.slug) {
      loadPost(params.slug);
    }
  }, [params?.slug]);

  const loadPost = async (slug: string) => {
    setLoading(true);
    setNotFound(false);
    try {
      const postsRef = collection(db, 'blogPosts');
      const q = query(
        postsRef,
        where('slug', '==', slug),
        where('status', '==', BlogPostStatus.PUBLISHED)
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setNotFound(true);
        setPost(null);
      } else {
        const doc = snapshot.docs[0];
        setPost({
          id: doc.id,
          ...doc.data()
        } as BlogPost);
      }
    } catch (error) {
      console.error('Errore caricamento articolo:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
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

  const estimateReadTime = (content: string) => {
    if (!content) return '0 min';
    const wordsPerMinute = 200;
    const words = content.split(/\s+/).length;
    const minutes = Math.ceil(words / wordsPerMinute);
    return `${minutes} min`;
  };

  useEffect(() => {
    if (post) {
      const pageTitle = post.metaTitle || `${post.title} | Image Studio`;
      const pageDescription = post.metaDescription || post.excerpt || '';

      document.title = pageTitle;

      // Meta description
      let metaDescription = document.querySelector('meta[name="description"]');
      if (!metaDescription) {
        metaDescription = document.createElement('meta');
        metaDescription.setAttribute('name', 'description');
        document.head.appendChild(metaDescription);
      }
      metaDescription.setAttribute('content', pageDescription);

      // Open Graph tags
      const updateOgTag = (property: string, content: string) => {
        let tag = document.querySelector(`meta[property="${property}"]`);
        if (!tag) {
          tag = document.createElement('meta');
          tag.setAttribute('property', property);
          document.head.appendChild(tag);
        }
        tag.setAttribute('content', content);
      };

      updateOgTag('og:title', pageTitle);
      updateOgTag('og:description', pageDescription);
      updateOgTag('og:type', 'article');
      if (post.coverImage) {
        updateOgTag('og:image', post.coverImage);
      }
    }

    // Cleanup function to reset on unmount
    return () => {
      document.title = 'Image Studio';

      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute('content', 'Image Studio - Fotografia Professionale');
      }

      // Remove OG tags to prevent stale metadata
      const ogTags = ['og:title', 'og:description', 'og:type', 'og:image'];
      ogTags.forEach(property => {
        const tag = document.querySelector(`meta[property="${property}"]`);
        if (tag) {
          tag.remove();
        }
      });
    };
  }, [post]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-terracotta" />
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="min-h-screen bg-cream">
        {/* Navigation */}
        <nav className="fixed top-0 w-full bg-white/90 backdrop-blur-lg z-50 border-b border-sage/10 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-20">
              <Link href="/">
                <h1 className="text-blue-gray font-playfair font-bold text-2xl cursor-pointer transition-colors duration-300 hover:text-sage">
                  iMaGe <span className="text-sage">Studio</span>
                </h1>
              </Link>
              <div className="flex gap-2">
                <Link href="/blog">
                  <Button variant="ghost" className="relative font-medium text-blue-gray hover:text-sage px-4 py-2 rounded-xl transition-all duration-300 group">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    <span className="relative z-10">Tutti gli Articoli</span>
                    <span className="absolute inset-0 bg-gradient-to-r from-sage/0 via-sage/5 to-sage/0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
                  </Button>
                </Link>
                <Link href="/">
                  <Button variant="ghost" className="relative font-medium text-blue-gray hover:text-sage px-4 py-2 rounded-xl transition-all duration-300 group">
                    <span className="relative z-10">Home</span>
                    <span className="absolute inset-0 bg-gradient-to-r from-sage/0 via-sage/5 to-sage/0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <h1 className="font-serif text-4xl text-dark mb-4">Articolo non trovato</h1>
          <p className="text-muted-foreground mb-8">
            L'articolo che stai cercando non esiste o non è più disponibile.
          </p>
          <Link href="/blog">
            <Button className="bg-terracotta hover:bg-terracotta/90 text-white" data-testid="button-blog-list">
              Torna al Blog
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/90 backdrop-blur-lg z-50 border-b border-sage/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <Link href="/">
              <h1 className="text-blue-gray font-playfair font-bold text-2xl cursor-pointer transition-colors duration-300 hover:text-sage">
                iMaGe <span className="text-sage">Studio</span>
              </h1>
            </Link>
            <div className="flex gap-2">
              <Link href="/blog">
                <Button variant="ghost" className="relative font-medium text-blue-gray hover:text-sage px-4 py-2 rounded-xl transition-all duration-300 group">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  <span className="relative z-10">Tutti gli Articoli</span>
                  <span className="absolute inset-0 bg-gradient-to-r from-sage/0 via-sage/5 to-sage/0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
                </Button>
              </Link>
              <Link href="/">
                <Button variant="ghost" className="relative font-medium text-blue-gray hover:text-sage px-4 py-2 rounded-xl transition-all duration-300 group">
                  <span className="relative z-10">Home</span>
                  <span className="absolute inset-0 bg-gradient-to-r from-sage/0 via-sage/5 to-sage/0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Article Content */}
      <article className="max-w-4xl mx-auto px-4 py-12 pt-24">
        {post.coverImage && (
          <div className="mb-12 rounded-lg overflow-hidden shadow-xl">
            <img 
              src={post.coverImage} 
              alt={post.title}
              className="w-full h-auto object-cover"
              data-testid="img-cover"
            />
          </div>
        )}

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            {post.category && (
              <Badge variant="outline" className="text-terracotta border-terracotta" data-testid="badge-category">
                {post.category}
              </Badge>
            )}
            {post.tags?.map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs" data-testid={`badge-tag-${tag}`}>
                {tag}
              </Badge>
            ))}
          </div>

          <h1 className="font-serif text-4xl md:text-5xl text-dark mb-6" data-testid="text-title">
            {post.title}
          </h1>

          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground mb-8">
            <span className="flex items-center gap-2">
              <User className="h-4 w-4" />
              {post.author}
            </span>
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {formatDate(post.publishedAt)}
            </span>
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {estimateReadTime(post.content)}
            </span>
          </div>

          {post.excerpt && (
            <p className="text-xl text-muted-foreground italic border-l-4 border-terracotta pl-6 mb-8" data-testid="text-excerpt">
              {post.excerpt}
            </p>
          )}
        </div>

        <div 
          className="prose prose-lg max-w-none
            prose-headings:font-serif prose-headings:text-dark
            prose-h1:text-4xl prose-h2:text-3xl prose-h3:text-2xl
            prose-p:text-gray-700 prose-p:leading-relaxed
            prose-a:text-terracotta prose-a:no-underline hover:prose-a:underline
            prose-strong:text-dark prose-strong:font-semibold
            prose-blockquote:border-l-4 prose-blockquote:border-terracotta prose-blockquote:pl-6 prose-blockquote:italic
            prose-img:rounded-lg prose-img:shadow-md
            prose-ul:list-disc prose-ol:list-decimal"
          dangerouslySetInnerHTML={{ __html: post.content }}
          data-testid="content-html"
        />

        <div className="mt-16 pt-8 border-t border-gray-200">
          <Link href="/blog">
            <Button variant="outline" className="text-terracotta border-terracotta hover:bg-terracotta/10" data-testid="button-back-list">
              ← Torna agli articoli
            </Button>
          </Link>
        </div>
      </article>
    </div>
  );
}