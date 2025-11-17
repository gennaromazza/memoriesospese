import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, User } from "lucide-react";

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-beige sticky top-0 bg-white/80 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/">
            <Button variant="ghost" className="text-sage hover:text-dark-sage">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Home
            </Button>
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

        {/* Blog posts grid - will be dynamic */}
        <div className="grid md:grid-cols-3 gap-8">
          {/* Placeholder posts */}
          {[1, 2, 3, 4, 5, 6].map(i => (
            <article key={i} className="group cursor-pointer">
              <div className="aspect-video bg-gray-200 rounded-lg mb-4 overflow-hidden">
                <div className="w-full h-full group-hover:scale-105 transition-transform duration-300" />
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                <span className="flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  15 Set 2024
                </span>
                <span className="flex items-center">
                  <User className="h-4 w-4 mr-1" />
                  Gennaro
                </span>
              </div>
              <h3 className="text-xl font-playfair text-blue-gray mb-2 group-hover:text-sage transition">
                Sposarsi in Costiera Amalfitana
              </h3>
              <p className="text-gray-600">
                5 luoghi mozzafiato per il giorno più bello della tua vita...
              </p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
