import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Calendar } from "lucide-react";

export default function LasciatiTrasportarePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-[#F5EFE6]">
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

      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-6xl font-playfair text-blue-gray mb-4">
            Lasciati Trasportare
          </h1>
          <p className="text-2xl text-gray-600 mb-2">
            di Gennaro Mazzacane
          </p>
          <p className="text-lg text-gray-500">
            La guida completa per organizzare il tuo matrimonio perfetto
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 mb-16">
          {/* Book Preview */}
          <div>
            <div className="aspect-[3/4] bg-gradient-to-br from-sage to-dark-sage rounded-2xl shadow-2xl flex items-center justify-center text-white p-12">
              <div className="text-center">
                <h2 className="text-4xl font-playfair mb-4">LASCIATI</h2>
                <h2 className="text-4xl font-playfair mb-8">TRASPORTARE</h2>
                <p className="text-xl">di Gennaro Mazzacane</p>
              </div>
            </div>
          </div>

          {/* Book Info */}
          <div>
            <h2 className="text-3xl font-playfair text-blue-gray mb-6">
              Un Viaggio Emozionante
            </h2>
            <p className="text-lg text-gray-600 mb-6">
              "Lasciati Trasportare" è un viaggio emozionante attraverso il mondo dei matrimoni 
              e della fotografia, un'esperienza avvincente e coinvolgente.
            </p>
            <p className="text-lg text-gray-600 mb-8">
              Come un viaggiatore curioso che si addentra in nuove terre, questo libro ti invita 
              a esplorare i confini del matrimonio, del racconto e dell'immortalare emozioni.
            </p>

            <div className="bg-white rounded-lg p-6 shadow-lg mb-8">
              <h3 className="font-semibold text-xl mb-4">Cosa troverai:</h3>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <span className="text-sage mr-2">✓</span>
                  <span>Chi sono e perché ho scritto questo libro</span>
                </li>
                <li className="flex items-start">
                  <span className="text-sage mr-2">✓</span>
                  <span>Perché specializzarsi nei matrimoni</span>
                </li>
                <li className="flex items-start">
                  <span className="text-sage mr-2">✓</span>
                  <span>Questione di prospettive e autenticità</span>
                </li>
                <li className="flex items-start">
                  <span className="text-sage mr-2">✓</span>
                  <span>Consigli pratici per il tuo matrimonio</span>
                </li>
                <li className="flex items-start">
                  <span className="text-sage mr-2">✓</span>
                  <span>Gestione problemi durante l'evento</span>
                </li>
                <li className="flex items-start">
                  <span className="text-sage mr-2">✓</span>
                  <span>L'importanza della fotografia stampata</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="bg-sage hover:bg-dark-sage text-white flex-1">
                <Download className="mr-2 h-5 w-5" />
                Scarica GRATIS (PDF)
              </Button>
              <Link href="/prenota">
                <Button size="lg" variant="outline" className="border-sage text-sage hover:bg-sage/10 flex-1">
                  <Calendar className="mr-2 h-5 w-5" />
                  Prenota Consulenza
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Embedded PDF Reader - placeholder */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h3 className="text-2xl font-playfair text-center mb-6">Anteprima Libro</h3>
          <div className="aspect-[16/9] bg-gray-100 rounded-lg flex items-center justify-center">
            <p className="text-gray-400">PDF Viewer sarà implementato qui</p>
          </div>
        </div>
      </div>
    </div>
  );
}
