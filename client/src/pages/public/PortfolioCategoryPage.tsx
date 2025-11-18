import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PortfolioCategoryPage() {
  const { categoria } = useParams<{ categoria: string }>();

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-beige sticky top-0 bg-white/80 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/portfolio">
            <Button variant="ghost" className="text-sage hover:text-dark-sage">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Portfolio
            </Button>
          </Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-playfair text-blue-gray mb-4 capitalize">
            {categoria?.replace('-', ' ')}
          </h1>
          <p className="text-xl text-gray-600">
            Galleria fotografica - Masonry grid sarà qui
          </p>
        </div>

        {/* Masonry grid placeholder */}
        <div className="columns-2 md:columns-3 gap-4 space-y-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
            <div key={i} className="break-inside-avoid">
              <div className={`bg-gray-200 rounded-lg ${i % 3 === 0 ? 'aspect-[3/4]' : 'aspect-square'}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
