import { useState, useEffect, useRef } from "react";
import { Link, useRoute } from "wouter";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Calendar, User, Share2, Facebook, Twitter, Linkedin, Clock } from "lucide-react";
import { BlogPost, BlogPostStatus } from "@shared/schema";
import StudioLogo from "@/components/StudioLogo";
import { useSEO } from "@/hooks/useSEO";

const FALLBACK_AUTHOR = "Gennaro Mazzacane";

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

const estimateReadTime = (content: string): string => {
  if (!content) return '0 min';
  const plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = plainText.split(' ').filter(Boolean).length;
  const minutes = Math.ceil(words / 200);
  return `${minutes} min`;
};

export default function BlogPostPage() {
  const [, params] = useRoute("/blog/:slug");
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [relatedPosts, setRelatedPosts] = useState<BlogPost[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useSEO({
    title: post ? `${post.title} | Blog Image Studio` : "Blog | Image Studio",
    description: post ? (post.excerpt || post.title) : "Blog Image Studio",
    canonical: post
      ? `${window.location.origin}/blog/${post.slug}`
      : `${window.location.origin}/blog`,
    ogType: "article",
    ogImage: post?.coverImage || undefined,
  });

  useEffect(() => {
    if (!params?.slug) return;
    let cancelled = false;

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const run = async () => {
      setLoading(true);
      setNotFound(false);
      setPost(null);
      setRelatedPosts([]);
      try {
        const postsRef = collection(db, 'blogPosts');
        const q = query(
          postsRef,
          where('slug', '==', params.slug),
          where('status', '==', BlogPostStatus.PUBLISHED)
        );
        const snapshot = await getDocs(q);
        if (cancelled) return;

        if (snapshot.empty) {
          setNotFound(true);
          return;
        }

        const docSnap = snapshot.docs[0];
        let currentPost: BlogPost = { id: docSnap.id, ...docSnap.data() } as BlogPost;

        if (currentPost.contentUrl && !currentPost.content) {
          try {
            const res = await fetch(currentPost.contentUrl, { signal });
            if (!cancelled) {
              const content = await res.text();
              currentPost = { ...currentPost, content };
            }
          } catch (e: any) {
            if (e?.name !== 'AbortError') {
              console.error('Errore caricamento contenuto da Storage:', e);
            }
          }
        }

        if (cancelled) return;
        setPost(currentPost);

        // Carica articoli correlati: filtro client-side perché "id" non è un campo Firestore
        const relatedQ = query(postsRef, where('status', '==', BlogPostStatus.PUBLISHED));
        const relatedSnap = await getDocs(relatedQ);
        if (cancelled) return;

        const allPosts = relatedSnap.docs
          .filter(d => d.id !== currentPost.id)
          .map(d => ({ id: d.id, ...d.data() } as BlogPost));

        const related = allPosts
          .filter(p =>
            (currentPost.category && p.category === currentPost.category) ||
            p.tags?.some(tag => currentPost.tags?.includes(tag))
          )
          .slice(0, 3);

        setRelatedPosts(related);
      } catch (error) {
        if (cancelled) return;
        console.error('Errore caricamento articolo:', error);
        setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [params?.slug]);

  useEffect(() => {
    if (!post) return;

    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": post.title,
      "description": post.metaDescription || post.excerpt || '',
      "image": post.coverImage || '',
      "datePublished": post.publishedAt?.seconds
        ? new Date(post.publishedAt.seconds * 1000).toISOString()
        : new Date().toISOString(),
      "dateModified": post.updatedAt?.seconds
        ? new Date(post.updatedAt.seconds * 1000).toISOString()
        : post.publishedAt?.seconds
          ? new Date(post.publishedAt.seconds * 1000).toISOString()
          : new Date().toISOString(),
      "author": {
        "@type": "Person",
        "name": post.author || FALLBACK_AUTHOR
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
        "@id": `${window.location.origin}/blog/${post.slug}`
      },
      "keywords": post.tags?.join(', ') || '',
      "articleSection": post.category || 'Fotografia'
    };

    let tag = document.querySelector('script[data-article-schema]');
    if (!tag) {
      tag = document.createElement('script');
      tag.setAttribute('type', 'application/ld+json');
      tag.setAttribute('data-article-schema', 'true');
      document.head.appendChild(tag);
    }
    tag.textContent = JSON.stringify(articleSchema);

    return () => {
      document.querySelector('script[data-article-schema]')?.remove();
    };
  }, [post]);

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
        <nav className="fixed top-0 w-full bg-white/90 backdrop-blur-lg z-50 border-b border-sage/10 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16 sm:h-20">
              <StudioLogo imgClassName="h-9 sm:h-12 w-auto" textClassName="text-blue-gray font-playfair font-bold text-lg sm:text-2xl" />
              <div className="flex gap-1 sm:gap-2">
                <Link href="/blog">
                  <Button variant="ghost" size="sm" className="font-medium text-blue-gray hover:text-sage px-2 sm:px-4 py-2 rounded-xl transition-all duration-300">
                    <ArrowLeft className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Tutti gli Articoli</span>
                  </Button>
                </Link>
                <Link href="/">
                  <Button variant="ghost" size="sm" className="font-medium text-blue-gray hover:text-sage px-2 sm:px-4 py-2 rounded-xl transition-all duration-300">
                    Home
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <h1 className="font-serif text-4xl text-dark mb-4">Articolo non trovato</h1>
          <p className="text-muted-foreground mb-8">L'articolo che stai cercando non esiste o non è più disponibile.</p>
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
    <div className="min-h-screen bg-white overflow-x-hidden">
      <nav className="fixed top-0 w-full bg-white/90 backdrop-blur-lg z-50 border-b border-sage/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 sm:h-20">
            <StudioLogo imgClassName="h-9 sm:h-12 w-auto" textClassName="text-blue-gray font-playfair font-bold text-lg sm:text-2xl" />
            <div className="flex gap-1 sm:gap-2">
              <Link href="/blog">
                <Button variant="ghost" size="sm" className="font-medium text-blue-gray hover:text-sage px-2 sm:px-4 py-2 rounded-xl transition-all duration-300">
                  <ArrowLeft className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Tutti gli Articoli</span>
                </Button>
              </Link>
              <Link href="/">
                <Button variant="ghost" size="sm" className="font-medium text-blue-gray hover:text-sage px-2 sm:px-4 py-2 rounded-xl transition-all duration-300">
                  Home
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <article className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-24 pb-16 min-w-0 box-border">
        {post.coverImage && (
          <div className="mb-8 sm:mb-12 rounded-xl overflow-hidden shadow-lg">
            <img
              src={post.coverImage}
              alt={post.title}
              className="w-full object-cover"
              style={{ maxHeight: '480px', objectFit: 'cover' }}
              loading="eager"
              decoding="async"
              data-testid="img-cover"
            />
          </div>
        )}

        <div className="mb-6 sm:mb-8 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {post.category && (
              <Badge variant="outline" className="text-terracotta border-terracotta text-xs" data-testid="badge-category">
                {post.category}
              </Badge>
            )}
            {post.tags?.map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs" data-testid={`badge-tag-${tag}`}>
                {tag}
              </Badge>
            ))}
          </div>

          <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl lg:text-5xl text-dark mb-4 sm:mb-6 leading-tight break-words" data-testid="text-title">
            {post.title}
          </h1>

          <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs sm:text-sm text-muted-foreground mb-6 sm:mb-8">
            <span className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="truncate max-w-[120px] sm:max-w-none">{post.author || FALLBACK_AUTHOR}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              {formatDate(post.publishedAt)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              {estimateReadTime(post.content)}
            </span>
          </div>

          {post.excerpt && (
            <p className="text-base sm:text-xl text-muted-foreground italic border-l-4 border-terracotta pl-4 sm:pl-6 mb-6 sm:mb-8 break-words" data-testid="text-excerpt">
              {post.excerpt}
            </p>
          )}
        </div>

        <div
          className="blog-content prose prose-base sm:prose-lg max-w-none
            prose-headings:font-playfair prose-headings:text-blue-gray prose-headings:break-words
            prose-h1:text-2xl sm:prose-h1:text-4xl prose-h1:mb-4 prose-h1:mt-6
            prose-h2:text-xl sm:prose-h2:text-3xl prose-h2:mb-3 prose-h2:mt-5
            prose-h3:text-lg sm:prose-h3:text-2xl prose-h3:mb-3 prose-h3:mt-4
            prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-4 prose-p:break-words
            prose-a:text-sage prose-a:font-medium prose-a:no-underline hover:prose-a:underline hover:prose-a:text-dark-sage prose-a:break-all
            prose-strong:text-blue-gray prose-strong:font-semibold
            prose-em:text-gray-600 prose-em:italic
            prose-blockquote:border-l-4 prose-blockquote:border-terracotta prose-blockquote:pl-4 sm:prose-blockquote:pl-6 prose-blockquote:py-2 prose-blockquote:italic prose-blockquote:text-gray-600
            prose-code:bg-beige prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs sm:prose-code:text-sm prose-code:font-mono prose-code:break-all
            prose-pre:bg-blue-gray prose-pre:text-white prose-pre:p-3 sm:prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto prose-pre:text-sm
            prose-img:rounded-lg prose-img:shadow-md prose-img:w-full prose-img:h-auto prose-img:my-4 sm:prose-img:my-6
            prose-figure:my-4 sm:prose-figure:my-6
            prose-figcaption:text-center prose-figcaption:text-xs sm:prose-figcaption:text-sm prose-figcaption:text-gray-500 prose-figcaption:mt-2
            prose-ul:list-disc prose-ul:ml-4 sm:prose-ul:ml-6 prose-ul:mb-4
            prose-ol:list-decimal prose-ol:ml-4 sm:prose-ol:ml-6 prose-ol:mb-4
            prose-li:mb-1 sm:prose-li:mb-2
            prose-table:border-collapse prose-table:my-4 sm:prose-table:my-6
            prose-th:bg-beige prose-th:p-2 sm:prose-th:p-3 prose-th:text-left prose-th:font-semibold prose-th:border prose-th:border-gray-300 prose-th:text-sm
            prose-td:p-2 sm:prose-td:p-3 prose-td:border prose-td:border-gray-300 prose-td:text-sm
            prose-hr:border-sage/30 prose-hr:my-6 sm:prose-hr:my-8"
          dangerouslySetInnerHTML={{ __html: post.content }}
          data-testid="content-html"
        />

        {/* Condivisione Social */}
        <div className="mt-10 sm:mt-12 pt-6 sm:pt-8 border-t border-gray-200">
          <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4 flex items-center gap-2">
            <Share2 className="h-5 w-5 text-sage" />
            Condividi questo articolo
          </h3>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Button variant="outline" size="sm" onClick={() => shareOnSocial('facebook')} className="flex items-center gap-2 text-xs sm:text-sm">
              <Facebook className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Facebook
            </Button>
            <Button variant="outline" size="sm" onClick={() => shareOnSocial('twitter')} className="flex items-center gap-2 text-xs sm:text-sm">
              <Twitter className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              X / Twitter
            </Button>
            <Button variant="outline" size="sm" onClick={() => shareOnSocial('linkedin')} className="flex items-center gap-2 text-xs sm:text-sm">
              <Linkedin className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              LinkedIn
            </Button>
          </div>
        </div>

        {/* Articoli Correlati */}
        {relatedPosts.length > 0 && (
          <div className="mt-10 sm:mt-12 pt-6 sm:pt-8 border-t border-gray-200">
            <h3 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6">Articoli Correlati</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              {relatedPosts.map(relatedPost => (
                <Link key={relatedPost.id} href={`/blog/${relatedPost.slug}`}>
                  <div className="group cursor-pointer">
                    {relatedPost.coverImage && (
                      <img
                        src={relatedPost.coverImage}
                        alt={relatedPost.title}
                        className="w-full h-40 sm:h-48 object-cover rounded-lg mb-3 group-hover:opacity-90 transition"
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    <h4 className="font-semibold text-base sm:text-lg group-hover:text-sage transition break-words">
                      {relatedPost.title}
                    </h4>
                    <p className="text-xs sm:text-sm text-gray-600 mt-2 line-clamp-2">
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
