import { useState, useEffect } from "react";
import { Link, useRoute } from "wouter";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, Calendar, User, Share2, Facebook, Twitter, Linkedin, Clock } from "lucide-react";
import { BlogPost, BlogPostStatus } from "@shared/schema";
import StudioLogo from "@/components/StudioLogo";
import { useSEO } from "@/hooks/useSEO";

export default function BlogPostPage() {
  const [, params] = useRoute("/blog/:slug");
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [relatedPosts, setRelatedPosts] = useState<BlogPost[]>([]);

  useSEO({
    title: post ? `${post.title} | Blog Image Studio` : "Blog | Image Studio",
    description: post ? (post.excerpt || post.title) : "Blog Image Studio",
    canonical: post ? `/blog/${post.slug}` : "/blog",
    ogType: "article",
    ogImage: post?.coverImage || undefined,
  });

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
        const currentPost = {
          id: doc.id,
          ...doc.data()
        } as BlogPost;
        setPost(currentPost);

        // Carica articoli correlati (stessa categoria o tag)
        const relatedQuery = query(
          postsRef,
          where('status', '==', BlogPostStatus.PUBLISHED),
          where('id', '!=', currentPost.id)
        );
        const relatedSnapshot = await getDocs(relatedQuery);
        const allPosts = relatedSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as BlogPost));
        
        // Filtra per categoria o tag simili
        const related = allPosts
          .filter(p => 
            p.category === currentPost.category || 
            p.tags?.some(tag => currentPost.tags?.includes(tag))
          )
          .slice(0, 3);
        
        setRelatedPosts(related);
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

  const shareOnSocial = (platform: string) => {
    if (!post) return;
    const url = window.location.href;
    const text = post.title;
    
    const urls = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
    };
    
    window.open(urls[platform as keyof typeof urls], '_blank', 'width=600,height=400');
  };

  useEffect(() => {
    if (post) {
      const articleSchema = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": post.title,
        "description": post.metaDescription || post.excerpt || '',
        "image": post.coverImage || '',
        "datePublished": post.publishedAt?.seconds ? new Date(post.publishedAt.seconds * 1000).toISOString() : new Date().toISOString(),
        "dateModified": post.publishedAt?.seconds ? new Date(post.publishedAt.seconds * 1000).toISOString() : new Date().toISOString(),
        "author": {
          "@type": "Person",
          "name": post.author || "Gennaro Mazzacane"
        },
        "publisher": {
          "@type": "Organization",
          "name": "Image Studio",
          "logo": {
            "@type": "ImageObject",
            "url": "https://imagestudiofotografico.replit.app/favicon.png"
          }
        },
        "mainEntityOfPage": {
          "@type": "WebPage",
          "@id": window.location.href
        },
        "keywords": post.tags?.join(', ') || '',
        "articleSection": post.category || 'Fotografia'
      };

      let articleSchemaTag = document.querySelector('script[data-article-schema]');
      if (!articleSchemaTag) {
        articleSchemaTag = document.createElement('script');
        articleSchemaTag.setAttribute('type', 'application/ld+json');
        articleSchemaTag.setAttribute('data-article-schema', 'true');
        document.head.appendChild(articleSchemaTag);
      }
      articleSchemaTag.textContent = JSON.stringify(articleSchema);
    }

    return () => {
      const articleSchemaTag = document.querySelector('script[data-article-schema]');
      if (articleSchemaTag) {
        articleSchemaTag.remove();
      }
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
              <StudioLogo 
                imgClassName="h-12 w-auto" 
                textClassName="text-blue-gray font-playfair font-bold text-2xl"
              />
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
            <StudioLogo 
              imgClassName="h-12 w-auto" 
              textClassName="text-blue-gray font-playfair font-bold text-2xl"
            />
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
          className="blog-content prose prose-lg max-w-none
            prose-headings:font-playfair prose-headings:text-blue-gray
            prose-h1:text-4xl prose-h1:mb-6 prose-h1:mt-8
            prose-h2:text-3xl prose-h2:mb-4 prose-h2:mt-6
            prose-h3:text-2xl prose-h3:mb-3 prose-h3:mt-5
            prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-4
            prose-a:text-sage prose-a:font-medium prose-a:no-underline hover:prose-a:underline hover:prose-a:text-dark-sage
            prose-strong:text-blue-gray prose-strong:font-semibold
            prose-em:text-gray-600 prose-em:italic
            prose-blockquote:border-l-4 prose-blockquote:border-terracotta prose-blockquote:pl-6 prose-blockquote:py-2 prose-blockquote:italic prose-blockquote:text-gray-600
            prose-code:bg-beige prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono
            prose-pre:bg-blue-gray prose-pre:text-white prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto
            prose-img:rounded-lg prose-img:shadow-lg prose-img:w-full prose-img:h-auto prose-img:my-6
            prose-figure:my-6
            prose-figcaption:text-center prose-figcaption:text-sm prose-figcaption:text-gray-500 prose-figcaption:mt-2
            prose-ul:list-disc prose-ul:ml-6 prose-ul:mb-4
            prose-ol:list-decimal prose-ol:ml-6 prose-ol:mb-4
            prose-li:mb-2
            prose-table:w-full prose-table:border-collapse prose-table:my-6
            prose-th:bg-beige prose-th:p-3 prose-th:text-left prose-th:font-semibold prose-th:border prose-th:border-gray-300
            prose-td:p-3 prose-td:border prose-td:border-gray-300
            prose-hr:border-sage/30 prose-hr:my-8"
          dangerouslySetInnerHTML={{ __html: post.content }}
          data-testid="content-html"
        />

        {/* Condivisione Social */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <h3 className="text-xl font-semibold mb-4">Condividi questo articolo</h3>
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => shareOnSocial('facebook')}
              className="flex items-center gap-2"
            >
              <Facebook className="h-4 w-4" />
              Facebook
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => shareOnSocial('twitter')}
              className="flex items-center gap-2"
            >
              <Twitter className="h-4 w-4" />
              Twitter
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => shareOnSocial('linkedin')}
              className="flex items-center gap-2"
            >
              <Linkedin className="h-4 w-4" />
              LinkedIn
            </Button>
          </div>
        </div>

        {/* Articoli Correlati */}
        {relatedPosts.length > 0 && (
          <div className="mt-12 pt-8 border-t border-gray-200">
            <h3 className="text-2xl font-semibold mb-6">Articoli Correlati</h3>
            <div className="grid md:grid-cols-3 gap-6">
              {relatedPosts.map(relatedPost => (
                <Link key={relatedPost.id} href={`/blog/${relatedPost.slug}`}>
                  <div className="group cursor-pointer">
                    {relatedPost.coverImage && (
                      <img
                        src={relatedPost.coverImage}
                        alt={relatedPost.title}
                        className="w-full h-48 object-cover rounded-lg mb-3 group-hover:opacity-90 transition"
                      />
                    )}
                    <h4 className="font-semibold text-lg group-hover:text-sage transition">
                      {relatedPost.title}
                    </h4>
                    <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                      {relatedPost.excerpt}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

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