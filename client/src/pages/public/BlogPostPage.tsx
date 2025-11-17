import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, User } from "lucide-react";

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-beige sticky top-0 bg-white/80 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/blog">
            <Button variant="ghost" className="text-sage hover:text-dark-sage">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Blog
            </Button>
          </Link>
        </div>
      </nav>

      <article className="max-w-4xl mx-auto px-4 py-16">
        {/* Featured image */}
        <div className="aspect-video bg-gray-200 rounded-2xl mb-8" />

        {/* Meta */}
        <div className="flex items-center gap-4 text-gray-500 mb-6">
          <span className="flex items-center">
            <Calendar className="h-4 w-4 mr-2" />
            15 Settembre 2024
          </span>
          <span className="flex items-center">
            <User className="h-4 w-4 mr-2" />
            Gennaro Mazzacane
          </span>
        </div>

        {/* Title */}
        <h1 className="text-5xl font-playfair text-blue-gray mb-6">
          {slug?.replace(/-/g, ' ')}
        </h1>

        {/* Content */}
        <div className="prose prose-lg max-w-none">
          <p className="text-xl text-gray-600 mb-8">
            Contenuto dell'articolo sarà caricato dinamicamente qui...
          </p>
        </div>
      </article>
    </div>
  );
}
