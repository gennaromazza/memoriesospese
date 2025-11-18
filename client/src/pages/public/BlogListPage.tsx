import { useState, useEffect } from "react";
import { Link } from "wouter";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Calendar, Clock } from "lucide-react";
import { BlogPost, BlogPostStatus } from "@shared/schema";

export default function BlogListPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-terracotta" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <nav className="border-b border-terracotta/20 sticky top-0 bg-white/80 backdrop-blur-md z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <Link href="/">
              <Button variant="ghost" className="text-terracotta hover:text-terracotta/80" data-testid="button-back-home">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Home
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="font-serif text-5xl md:text-6xl text-dark mb-4">
            Blog
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Storie, riflessioni e consigli dal mondo della fotografia
          </p>
        </div>

        {posts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Nessun articolo pubblicato</p>
          </div>
        ) : (
          <div className="space-y-8">
            {posts.map((post) => (
              <Card key={post.id} className="overflow-hidden hover:shadow-lg transition-shadow" data-testid={`card-post-${post.id}`}>
                {post.coverImage && (
                  <div className="aspect-[21/9] overflow-hidden bg-cream">
                    <img 
                      src={post.coverImage} 
                      alt={post.title}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                    {post.category && (
                      <Badge variant="outline" className="text-terracotta border-terracotta">
                        {post.category}
                      </Badge>
                    )}
                    {post.tags?.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <Link href={`/blog/${post.slug}`}>
                    <CardTitle className="text-3xl font-serif hover:text-terracotta transition-colors cursor-pointer" data-testid={`title-${post.id}`}>
                      {post.title}
                    </CardTitle>
                  </Link>
                  <CardDescription className="flex items-center gap-4 text-sm mt-2">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {formatDate(post.publishedAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {estimateReadTime(post.content)}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    {post.excerpt}
                  </p>
                  <Link href={`/blog/${post.slug}`}>
                    <Button variant="link" className="text-terracotta hover:text-terracotta/80 p-0" data-testid={`button-read-${post.id}`}>
                      Leggi articolo →
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
