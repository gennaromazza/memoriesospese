import { useParams, Link } from "wouter";
import { ArrowLeft, Calendar, User, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import DOMPurify from 'isomorphic-dompurify';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  featuredImage?: string;
  publishedAt: any;
  author: string;
  metaDescription?: string;
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();

  const { data: post, isLoading } = useQuery({
    queryKey: ['blog-post', slug],
    queryFn: async () => {
      if (!slug) return null;
      
      const postsRef = collection(db, 'blogPosts');
      const q = query(
        postsRef,
        where('slug', '==', slug),
        where('status', '==', 'published'),
        limit(1)
      );
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) return null;
      
      return {
        id: snapshot.docs[0].id,
        ...snapshot.docs[0].data()
      } as BlogPost;
    },
    enabled: !!slug
  });

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, 'd MMMM yyyy', { locale: it });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sage" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-white">
        <nav className="border-b border-beige sticky top-0 bg-white/80 backdrop-blur-md z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <Link 
              href="/blog"
              className="inline-flex items-center text-sage hover:text-dark-sage transition"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Blog
            </Link>
          </div>
        </nav>
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <h1 className="text-3xl font-playfair text-gray-600 mb-4">
            Articolo non trovato
          </h1>
          <p className="text-gray-500 mb-8">
            L'articolo che stai cercando non esiste o non è più disponibile
          </p>
          <Link 
            href="/blog"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-sage text-white hover:bg-dark-sage h-10 px-4 py-2"
          >
            Torna al Blog
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-beige sticky top-0 bg-white/80 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link 
            href="/blog"
            className="inline-flex items-center text-sage hover:text-dark-sage transition"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Blog
          </Link>
        </div>
      </nav>

      <article className="max-w-4xl mx-auto px-4 py-16">
        {/* Featured image */}
        {post.featuredImage && (
          <div className="aspect-video bg-gray-200 rounded-2xl mb-8 overflow-hidden">
            <img 
              src={post.featuredImage}
              alt={post.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center gap-4 text-gray-500 mb-6">
          <span className="flex items-center">
            <Calendar className="h-4 w-4 mr-2" />
            {formatDate(post.publishedAt)}
          </span>
          {post.author && (
            <span className="flex items-center">
              <User className="h-4 w-4 mr-2" />
              {post.author}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-5xl font-playfair text-blue-gray mb-6">
          {post.title}
        </h1>

        {/* Excerpt */}
        {post.excerpt && (
          <p className="text-xl text-gray-600 mb-8 italic border-l-4 border-sage pl-6">
            {post.excerpt}
          </p>
        )}

        {/* Content - Sanitized HTML */}
        <div 
          className="prose prose-lg max-w-none prose-headings:font-playfair prose-headings:text-blue-gray prose-a:text-sage prose-a:no-underline hover:prose-a:underline"
          dangerouslySetInnerHTML={{ 
            __html: DOMPurify.sanitize(post.content, {
              ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'pre', 'code', 'span', 'div'],
              ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class'],
              FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur']
            })
          }}
        />
      </article>
    </div>
  );
}
