import { Link } from "wouter";
import { ArrowLeft, Download, BookOpen, Heart } from "lucide-react";

export default function BookPage() {
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

      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <BookOpen className="h-16 w-16 mx-auto mb-4 text-sage" />
          <h1 className="text-5xl font-playfair text-blue-gray mb-4">
            Lasciati Trasportare
          </h1>
          <p className="text-xl text-gray-600">
            Il mio manifesto fotografico - Scarica gratuitamente il libro completo
          </p>
        </div>

        <div className="bg-gradient-to-br from-sage/10 to-beige/20 rounded-2xl p-8 mb-12">
          <div className="prose prose-lg max-w-none">
            <h2 className="text-3xl font-playfair text-blue-gray mb-4">
              Un viaggio nella fotografia emozionale
            </h2>
            <p className="text-lg text-gray-700">
              "Lasciati Trasportare" è più di un libro sulla fotografia di matrimonio.
              È un manifesto sulla capacità di catturare l'essenza umana, le emozioni 
              autentiche, i momenti irripetibili che rendono ogni storia unica.
            </p>
            <p className="text-lg text-gray-700 mt-4">
              In queste pagine condivido la mia filosofia: il momento viene prima di tutto.
              La tecnica è importante, ma ciò che conta davvero è la capacità di essere 
              presente, di cogliere l'attimo, di raccontare una storia che vive per sempre.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div className="bg-white border-2 border-beige rounded-lg p-6">
            <Heart className="h-8 w-8 text-terracotta mb-4" />
            <h3 className="text-xl font-playfair text-blue-gray mb-2">
              Per gli Sposi
            </h3>
            <p className="text-gray-600">
              Scopri come preparare al meglio il tuo matrimonio dal punto di vista 
              fotografico. Consigli pratici, suggerimenti per la timeline, come 
              scegliere le location e molto altro.
            </p>
          </div>
          <div className="bg-white border-2 border-beige rounded-lg p-6">
            <BookOpen className="h-8 w-8 text-sage mb-4" />
            <h3 className="text-xl font-playfair text-blue-gray mb-2">
              Per i Fotografi
            </h3>
            <p className="text-gray-600">
              Un viaggio nel mio approccio alla fotografia di matrimonio. Come 
              gestisco la giornata, come interagisco con gli sposi, come creo 
              immagini che raccontano storie autentiche.
            </p>
          </div>
        </div>

        <div className="bg-blue-gray text-white rounded-2xl p-12 text-center">
          <h2 className="text-3xl font-playfair mb-4">
            Scarica gratuitamente il libro
          </h2>
          <p className="text-lg mb-8 opacity-90">
            Riceverai il PDF completo direttamente nella tua email
          </p>
          <Link 
            href="/consultations"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-white text-blue-gray hover:bg-gray-100 h-12 px-8 text-lg"
            data-testid="button-download-book"
          >
            <Download className="mr-2 h-5 w-5" />
            Richiedi il Libro Gratuito
          </Link>
          <p className="text-sm mt-4 opacity-75">
            Compila il form di contatto e riceverai il link per il download
          </p>
        </div>

        <div className="mt-12 bg-beige/30 rounded-lg p-6 text-center">
          <p className="text-gray-700 italic">
            "Lasciati trasportare dalle emozioni, dalla storia, dai momenti che 
            rendono ogni matrimonio unico. È questo il segreto di una fotografia 
            che dura per sempre."
          </p>
          <p className="text-sm text-gray-600 mt-2">- Gennaro Mazzacane</p>
        </div>
      </div>
    </div>
  );
}
