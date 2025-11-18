import { Link } from "wouter";
import { ArrowLeft, Calendar, User, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format } from "date-fns";
import { it } from "date-fns/locale/it/index.js";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  featuredImage?: string;
  publishedAt: any;
  author: string;
  status: 'published' | 'draft' | 'archived';
}

export default function BlogPage() {
  const { data: posts, isLoading } = useQuery({
    queryKey: ['blog-posts'],
    queryFn: async () => {
      const postsRef = collection(db, 'blogPosts');
      const q = query(
        postsRef, 
        where('status', '==', 'published'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      
      const posts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BlogPost[];
      
      // Sort client-side to avoid Firestore composite index requirement
      return posts.sort((a, b) => {
        // Handle Firestore Timestamp objects
        let aDate: Date;
        let bDate: Date;
        
        if (a.publishedAt?.toDate) {
          aDate = a.publishedAt.toDate();
        } else if (a.publishedAt) {
          aDate = new Date(a.publishedAt);
        } else {
          aDate = new Date(0);
        }
        
        if (b.publishedAt?.toDate) {
          bDate = b.publishedAt.toDate();
        } else if (b.publishedAt) {
          bDate = new Date(b.publishedAt);
        } else {
          bDate = new Date(0);
        }
        
        return bDate.getTime() - aDate.getTime();
      });
    }
  });

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, 'd MMMM yyyy', { locale: it });
  };

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-beige sticky top-0 bg-white/80 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link 
            href="/"
            className="inline-flex items-center text-sage hover:text-dark-sage transition"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Home
          </Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-playfair text-blue-gray mb-4">Blog</h1>
          <p className="text-xl text-gray-600">
            Consigli, storie e ispirazioni per il tuo matrimonio perfetto
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-sage" />
          </div>
        ) : posts && posts.length > 0 ? (
          <div className="grid md:grid-cols-3 gap-8">
            {posts.map(post => (
              <Link 
                key={post.id}
                href={`/blog/${post.slug}`}
              >
                <article className="group cursor-pointer h-full flex flex-col">
                  <div className="aspect-video bg-gray-200 rounded-lg mb-4 overflow-hidden">
                    {post.featuredImage ? (
                      <img 
                        src={post.featuredImage}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-sage/20 to-beige/20">
                        <Calendar className="h-16 w-16 text-sage/40" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                    <span className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      {formatDate(post.publishedAt)}
                    </span>
                    {post.author && (
                      <span className="flex items-center">
                        <User className="h-4 w-4 mr-1" />
                        {post.author}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-playfair text-blue-gray mb-2 group-hover:text-sage transition">
                    {post.title}
                  </h3>
                  {post.excerpt && (
                    <p className="text-gray-600 line-clamp-3">
                      {post.excerpt}
                    </p>
                  )}
                </article>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <Calendar className="h-16 w-16 mx-auto mb-4 text-gray-300" />
            <h3 className="text-xl font-playfair text-gray-600 mb-2">
              Nessun articolo pubblicato
            </h3>
            <p className="text-gray-500">
              Torna presto per leggere i nostri consigli sul matrimonio perfetto
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
