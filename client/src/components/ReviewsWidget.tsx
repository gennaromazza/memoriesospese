
import { useEffect } from 'react';

interface ReviewsWidgetProps {
  className?: string;
}

export default function ReviewsWidget({ className = '' }: ReviewsWidgetProps) {
  useEffect(() => {
    // Initialize Matrimonio.com widget
    const initMatrimonioWidget = () => {
      if (typeof (window as any).wpShowReviews === 'function') {
        const widgetElement = document.getElementById('wp-widget-reviews');
        if (widgetElement) {
          (window as any).wpShowReviews(149790, "white");
        }
      }
    };

    // Retry initialization with delay
    const timer = setTimeout(initMatrimonioWidget, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section id="recensioni" className={`py-20 bg-white relative overflow-hidden ${className}`}>
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

          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-6">
            Scopri cosa dicono di noi i nostri clienti soddisfatti
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://share.google/SW1hp2vnc9Csiwfkc"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-sage hover:bg-dark-sage text-white font-medium rounded-lg shadow-md transition-all hover:shadow-lg hover:scale-105"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
              </svg>
              <span>Google Reviews</span>
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
              <span>Facebook</span>
            </a>

            <a
              href="https://www.matrimonio.com/fotografo-matrimonio/image-studio-fotografico--e149790/opinioni"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white hover:bg-gray-50 text-blue-gray border-2 border-sage font-medium rounded-lg shadow-md transition-all hover:shadow-lg hover:scale-105"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
              </svg>
              <span>Matrimonio.com</span>
            </a>
          </div>
        </div>

        {/* Reviews Widgets Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Google Reviews - Elfsight Widget */}
          <div className="bg-white rounded-xl shadow-lg border border-sage/10 p-6">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-sage/10">
              <h3 className="text-xl font-semibold text-blue-gray flex items-center gap-2">
                <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                </svg>
                Google
              </h3>
            </div>
            <div className="elfsight-app-b8c7e9e5-0c42-4b24-9a35-3e9c01e58ac0" data-elfsight-app-lazy></div>
          </div>

          {/* Facebook Reviews Plugin */}
          <div className="bg-white rounded-xl shadow-lg border border-sage/10 p-6">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-sage/10">
              <h3 className="text-xl font-semibold text-blue-gray flex items-center gap-2">
                <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                Facebook
              </h3>
            </div>
            <div className="fb-page" 
              data-href="https://www.facebook.com/gennaromazzacanefotografo"
              data-tabs="reviews"
              data-width="340"
              data-height="400"
              data-small-header="false"
              data-adapt-container-width="true"
              data-hide-cover="false"
              data-show-facepile="false">
            </div>
          </div>

          {/* Matrimonio.com Widget */}
          <div className="bg-white rounded-xl shadow-lg border border-sage/10 p-6">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-sage/10">
              <h3 className="text-xl font-semibold text-blue-gray flex items-center gap-2">
                <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                </svg>
                Matrimonio.com
              </h3>
            </div>
            <div id="wp-widget-reviews" className="min-h-[350px]">
              <div id="wp-widget-preview" className="text-center py-8">
                <p className="text-gray-600 mb-4">
                  Caricamento recensioni in corso...
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500 italic">
            La soddisfazione dei nostri clienti è la nostra priorità. Leggi le loro storie!
          </p>
        </div>
      </div>
    </section>
  );
}
