
import { Star, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from './ui/carousel';
import Autoplay from 'embla-carousel-autoplay';

interface ReviewsWidgetProps {
  className?: string;
}

const FAKE_REVIEWS = [
  {
    name: "Maria & Giuseppe",
    date: "Dicembre 2024",
    rating: 5,
    text: "Gennaro è stato semplicemente perfetto! Ha catturato ogni momento speciale del nostro matrimonio con una sensibilità unica. Le foto sono emozionanti, naturali e bellissime. Consigliatissimo!",
    avatar: "https://ui-avatars.com/api/?name=Maria+Giuseppe&background=8B9A8B&color=fff&size=128",
    platform: "Google"
  },
  {
    name: "Lucia Esposito",
    date: "Novembre 2024",
    rating: 5,
    text: "Professionalità, creatività e passione! Gennaro ha reso il battesimo di nostro figlio indimenticabile. Le foto sono opere d'arte che custodiremo per sempre nel cuore.",
    avatar: "https://ui-avatars.com/api/?name=Lucia+Esposito&background=C67B5C&color=fff&size=128",
    platform: "Facebook"
  },
  {
    name: "Antonio & Francesca",
    date: "Ottobre 2024",
    rating: 5,
    text: "Abbiamo scelto Image Studio per il nostro matrimonio e non potevamo fare scelta migliore! Gennaro ha un talento straordinario nel cogliere le emozioni. Grazie di cuore!",
    avatar: "https://ui-avatars.com/api/?name=Antonio+Francesca&background=8B9A8B&color=fff&size=128",
    platform: "Matrimonio.com"
  },
  {
    name: "Carla Romano",
    date: "Settembre 2024",
    rating: 5,
    text: "Esperienza fantastica! Gennaro è stato paziente, disponibile e incredibilmente professionale. Le foto del nostro evento sono stupende, ha superato ogni nostra aspettativa!",
    avatar: "https://ui-avatars.com/api/?name=Carla+Romano&background=C67B5C&color=fff&size=128",
    platform: "Google"
  },
  {
    name: "Marco & Valentina",
    date: "Agosto 2024",
    rating: 5,
    text: "Un fotografo eccezionale! Gennaro ha immortalato il nostro giorno speciale in modo impeccabile. Ogni scatto racconta una storia, le sue foto ci emozionano ogni volta che le guardiamo.",
    avatar: "https://ui-avatars.com/api/?name=Marco+Valentina&background=8B9A8B&color=fff&size=128",
    platform: "Matrimonio.com"
  },
  {
    name: "Simona Ricci",
    date: "Luglio 2024",
    rating: 5,
    text: "Consigliatissimo! Gennaro è un vero artista della fotografia. Ha saputo mettere a proprio agio tutti gli invitati e il risultato è stato straordinario. Grazie infinite!",
    avatar: "https://ui-avatars.com/api/?name=Simona+Ricci&background=C67B5C&color=fff&size=128",
    platform: "Facebook"
  }
];

export default function ReviewsWidget({ className = '' }: ReviewsWidgetProps) {
  return (
    <section id="recensioni" className={`py-20 bg-gradient-to-b from-white to-cream/30 relative overflow-hidden ${className}`}>
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-yellow-100 to-yellow-200 rounded-full mb-6">
            <svg className="w-10 h-10 text-yellow-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
            </svg>
          </div>

          <h2 className="text-4xl font-playfair text-blue-gray mb-4">
            Le Nostre Recensioni
          </h2>

          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            Scopri cosa dicono di noi i nostri clienti soddisfatti
          </p>

          {/* Portal Links */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-12">
            <a
              href="https://share.google/SW1hp2vnc9Csiwfkc"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white hover:bg-gray-50 text-blue-gray border-2 border-sage font-medium rounded-lg shadow-md transition-all hover:shadow-lg hover:scale-105"
            >
              <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
              </svg>
              <span>Leggi su Google</span>
              <ExternalLink className="w-4 h-4" />
            </a>

            <a
              href="https://www.facebook.com/gennaromazzacanefotografo/?locale=it_IT"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-md transition-all hover:shadow-lg hover:scale-105"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              <span>Leggi su Facebook</span>
              <ExternalLink className="w-4 h-4" />
            </a>

            <a
              href="https://www.matrimonio.com/fotografo-matrimonio/image-studio-fotografico--e149790/opinioni"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white hover:bg-gray-50 text-blue-gray border-2 border-terracotta font-medium rounded-lg shadow-md transition-all hover:shadow-lg hover:scale-105"
            >
              <svg className="w-5 h-5 text-terracotta" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
              </svg>
              <span>Leggi su Matrimonio.com</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Reviews Carousel */}
        <Carousel
          opts={{
            align: "start",
            loop: true,
          }}
          plugins={[
            Autoplay({
              delay: 5000,
            }),
          ]}
          className="w-full max-w-6xl mx-auto"
        >
          <CarouselContent className="-ml-2 md:-ml-4">
            {FAKE_REVIEWS.map((review, index) => (
              <CarouselItem key={index} className="pl-2 md:pl-4 md:basis-1/2 lg:basis-1/3">
                <div className="bg-white rounded-xl shadow-lg border border-sage/10 p-6 hover:shadow-xl transition-shadow h-full">
                  {/* Header */}
                  <div className="flex items-start gap-4 mb-4">
                    <img
                      src={review.avatar}
                      alt={review.name}
                      className="w-12 h-12 rounded-full"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-blue-gray">{review.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex gap-0.5">
                          {[...Array(review.rating)].map((_, i) => (
                            <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                          ))}
                        </div>
                        <span className="text-xs text-gray-500">{review.date}</span>
                      </div>
                    </div>
                  </div>

                  {/* Review Text */}
                  <p className="text-gray-600 text-sm leading-relaxed mb-4">
                    {review.text}
                  </p>

                  {/* Platform Badge */}
                  <div className="flex items-center justify-between pt-4 border-t border-sage/10">
                    <span className="text-xs text-gray-500 italic">Recensione da {review.platform}</span>
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                      ))}
                    </div>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="hidden md:flex -left-12 lg:-left-16" />
          <CarouselNext className="hidden md:flex -right-12 lg:-right-16" />
        </Carousel>

        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500 italic mb-6">
            La soddisfazione dei nostri clienti è la nostra priorità. Leggi tutte le recensioni sui nostri portali!
          </p>
          
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-sage to-dark-sage text-white rounded-lg shadow-md">
            <Star className="w-5 h-5 fill-white" />
            <span className="font-semibold">5.0 stelle su tutti i portali</span>
          </div>
        </div>
      </div>
    </section>
  );
}
