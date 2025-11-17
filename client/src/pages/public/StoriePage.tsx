import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen } from "lucide-react";

export default function StoriePage() {
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

      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-playfair text-blue-gray mb-4">
            La Mia Storia
          </h1>
          <p className="text-2xl text-[#C67B5C] mb-8">
            È tutta questione di <span className="font-semibold">Image</span>
          </p>
        </div>

        <div className="prose prose-lg max-w-none">
          <p className="text-xl leading-relaxed text-gray-700 mb-6">
            Il mio nome è <strong>Gennaro Mazzacane</strong> e la mia passione per la fotografia 
            inizia a soli 10 anni.
          </p>
          
          <p className="text-lg leading-relaxed text-gray-600 mb-6">
            Mia madre comprò una confezione di merendine della "Kinder Brioss" in cui c'era sempre 
            una sorpresa. La sorpresa che mi toccò fu una vera macchina fotografica, funzionante! 
            Bastava inserirci un rullino e potevo divertirmi a scattare foto.
          </p>

          <p className="text-lg leading-relaxed text-gray-600 mb-6">
            All'epoca, né io né i miei genitori sapevamo come caricare il rullino, sembrava 
            un'operazione complessa che solo un professionista poteva fare. La soluzione più semplice 
            fu quindi rivolgersi ad un fotografo professionista, che gentilmente ci mostrò come fare. 
            Nel frattempo, rimasi affascinato dal suo studio, pieno di foto, attrezzature e anche una 
            camera oscura dove avveniva la magia!
          </p>

          <div className="bg-sage/10 rounded-lg p-8 my-12 border-l-4 border-sage">
            <p className="text-lg italic text-gray-700">
              "Non ti ho mai visto così affascinato da qualcosa, spero finalmente di aver trovato 
              la giusta passione per te"
            </p>
            <p className="text-sm text-gray-500 mt-2">- Mia madre</p>
          </div>

          <h2 className="text-3xl font-playfair text-blue-gray mt-12 mb-6">
            Perché Matrimonio?
          </h2>

          <p className="text-lg leading-relaxed text-gray-600 mb-6">
            Ho scelto di specializzarmi nel settore dei matrimoni perché è quello che secondo me 
            è il più completo, quello che abbraccia diversi stili di fotografia, quello che mi 
            permette di conoscere tante persone e poi perché nel Sud c'è una vera e propria cultura.
          </p>

          <p className="text-lg leading-relaxed text-gray-600 mb-6">
            Ma soprattutto mi è sempre piaciuta l'idea di <strong>"raccontare"</strong>.
          </p>

          <div className="bg-[#F5EFE6] rounded-lg p-8 my-12 text-center">
            <p className="text-2xl font-playfair text-blue-gray mb-4">
              Sfogliare l'album e rivivere con voi sposi quelle emozioni è una gioia che sfugge 
              a ogni spiegazione.
            </p>
          </div>

          <h2 className="text-3xl font-playfair text-blue-gray mt-12 mb-6">
            Il Momento Viene Prima di Tutto
          </h2>

          <p className="text-lg leading-relaxed text-gray-600 mb-6">
            Non mi piacciono le classificazioni, gli stereotipi, li trovo limitanti dal punto di 
            vista creativo. Non so classificare la mia tipologia di fotografia, né tanto meno so 
            dirti se faccio reportage o foto in posa.
          </p>

          <p className="text-lg leading-relaxed text-gray-600 mb-6">
            <strong>Faccio quello che ritengo giusto.</strong>
          </p>

          <p className="text-lg leading-relaxed text-gray-600 mb-6">
            Per quanto possa essere indispensabile la tecnica, se ti capita di fare un piccolo 
            errore di messa a fuoco nel momento in cui la sposa scappa dal papà perché è preso 
            da una crisi di pianto?
          </p>

          <p className="text-2xl font-bold text-sage text-center my-8">
            Il momento viene prima di tutto.
          </p>
        </div>

        <div className="mt-16 text-center">
          <Link href="/lasciati-trasportare">
            <Button size="lg" className="bg-sage hover:bg-dark-sage text-white">
              <BookOpen className="mr-2 h-5 w-5" />
              Leggi il Libro Completo
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
