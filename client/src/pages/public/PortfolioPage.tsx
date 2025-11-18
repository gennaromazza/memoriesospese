import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PortfolioPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Simple Nav */}
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
          <h1 className="text-5xl font-playfair text-blue-gray mb-4">Portfolio</h1>
          <p className="text-xl text-gray-600">
            Esplora i miei lavori divisi per categoria
          </p>
        </div>

        {/* Portfolio categories grid - will be dynamic */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {/* Placeholder categories */}
          <div className="group cursor-pointer">
            <div className="aspect-square bg-gray-200 rounded-lg mb-4 overflow-hidden">
              <div className="w-full h-full group-hover:scale-105 transition-transform duration-300" />
            </div>
            <h3 className="text-2xl font-playfair text-center">Matrimoni</h3>
            <p className="text-center text-gray-500">120 foto</p>
          </div>
        </div>
      </div>
    </div>
  );
}
