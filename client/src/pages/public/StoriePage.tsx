import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import Navigation from "@/components/Navigation";
import gennaroWithCamera from "@assets/DSCF7392_1_1763485862385.jpg";
import gennaroArtistic from "@assets/DSCF7358_1_1763485862385.jpg";
import { useSEO } from "@/hooks/useSEO";

export default function StoriePage() {
  useSEO({
    title: "La Nostra Storia | Gennaro Mazzacane Fotografo | Image Studio",
    description: "Scopri la storia di Image Studio e del fotografo Gennaro Mazzacane. 10+ anni di passione per la fotografia matrimoniale in Campania.",
    canonical: "/storie",
    keywords: "gennaro mazzacane fotografo, storia image studio, fotografo aversa",
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-[#F5EFE6]">
      <Navigation />

      <div className="max-w-4xl mx-auto px-4 pt-24 sm:pt-28 md:pt-32 pb-12">
        <div className="text-center mb-12 animate-fade-in">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-playfair text-blue-gray mb-4 leading-tight">
            Gennaro e Image Studio
          </h1>
          <p className="text-2xl text-[#C67B5C] mb-8">
            Una storia iniziata con una piccola macchina fotografica
          </p>
        </div>

        {/* Hero Image */}
        <div className="mb-12 animate-fade-in">
          <div className="relative rounded-2xl overflow-hidden shadow-2xl max-w-3xl mx-auto">
            <img
              src={gennaroWithCamera}
              alt="Gennaro Mazzacane con la sua fotocamera Fujifilm"
              className="w-full h-auto object-contain"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 text-white">
              <p className="text-lg sm:text-xl italic font-light">
                "Il momento viene prima di tutto"
              </p>
            </div>
          </div>
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

          <div className="grid md:grid-cols-2 gap-8 items-center mb-8">
            <div>
              <p className="text-lg leading-relaxed text-gray-600 mb-6">
                Ho scelto di specializzarmi nel settore dei matrimoni perché è quello che secondo me 
                è il più completo, quello che abbraccia diversi stili di fotografia, quello che mi 
                permette di conoscere tante persone e poi perché nel Sud c'è una vera e propria cultura.
              </p>

              <p className="text-lg leading-relaxed text-gray-600 mb-6">
                Ma soprattutto mi è sempre piaciuta l'idea di <strong>"raccontare"</strong>.
              </p>
            </div>
            <div className="relative rounded-xl overflow-hidden shadow-xl">
              <img
                src={gennaroArtistic}
                alt="Gennaro Mazzacane al lavoro"
                className="w-full h-auto object-contain"
              />
            </div>
          </div>

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

        <div className="mt-12 rounded-2xl border border-sage/15 bg-white/70 px-5 py-7 text-center sm:px-8">
          <p className="mx-auto mb-4 max-w-2xl text-base leading-relaxed text-gray-600 sm:text-lg">
            La filosofia dello studio continua in <em>Lasciati Trasportare</em>, il libro dedicato alle emozioni, al matrimonio e al valore della fotografia.
          </p>
          <Link href="/lasciati-trasportare">
            <Button size="lg" className="h-auto max-w-full whitespace-normal bg-sage px-5 py-3 text-center leading-snug text-white hover:bg-dark-sage">
              <BookOpen className="mr-2 h-5 w-5" />
              Scopri il libro Lasciati Trasportare
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
