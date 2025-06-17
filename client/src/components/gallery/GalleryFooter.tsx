import React from "react";
import { FloralCorner, FloralDivider, BackgroundDecoration } from '@/components/WeddingIllustrations';
import { WeddingImage } from '@/components/WeddingImages';

interface GalleryFooterProps {
  studioSettings: {
    name: string;
    address: string;
    phone: string;
    email: string;
    socialLinks: {
      instagram?: string;
      facebook?: string;
      youtube?: string;
    };
  };
}

export default function GalleryFooter({ studioSettings }: GalleryFooterProps) {
  return (
    <div className="bg-blue-gray/5 border-t border-blue-gray/10 py-12 mt-10 relative overflow-hidden">
      {/* Decorazioni */}
      <FloralCorner position="bottom-left" className="absolute bottom-0 left-0 w-32 h-32 opacity-10 pointer-events-none" />
      <FloralCorner position="bottom-right" className="absolute bottom-0 right-0 w-32 h-32 opacity-10 pointer-events-none" />
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <BackgroundDecoration />
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="w-full max-w-xs mx-auto h-10 opacity-20 mb-8">
          <FloralDivider />
        </div>
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left flex md:flex-row flex-col items-center gap-6">
            <div className="md:w-32 w-24 h-auto flex-shrink-0 order-1 md:order-none mb-4 md:mb-0">
              <WeddingImage type="flower-bouquet" className="w-full h-auto opacity-70" />
            </div>
            <div>
              <h3 className="text-xl font-playfair text-blue-gray font-medium mb-2">Ti sono piaciute queste foto?</h3>
              <p className="text-gray-600 max-w-lg">
                Segui il nostro profilo Instagram per vedere altri momenti speciali come quelli del matrimonio e restare aggiornato sui nostri servizi fotografici.
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <a 
              href={studioSettings.socialLinks.instagram ? 
                (studioSettings.socialLinks.instagram.startsWith('http') ? 
                  studioSettings.socialLinks.instagram : 
                  `https://instagram.com/${studioSettings.socialLinks.instagram}`) 
                : '#'} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="group relative flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md hover:from-purple-600 hover:to-pink-600 transition-all shadow-sm overflow-hidden"
            >
              <span className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity">
                <BackgroundDecoration />
              </span>
              <svg className="w-5 h-5 mr-2 relative z-10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              <span className="relative z-10">Seguici su Instagram</span>
            </a>
          </div>
        </div>
        
        <div className="mt-12 pt-6 border-t border-gray-200 text-center text-gray-500 text-sm">
          <div className="w-20 h-20 mx-auto mb-4">
            <WeddingImage type="flower-bouquet" className="w-full h-auto opacity-20" />
          </div>
          <p>© {new Date().getFullYear()} {studioSettings.name}. Tutti i diritti riservati.</p>
          <p className="mt-2">
            <span>{studioSettings.address} | Tel: {studioSettings.phone} | Email: {studioSettings.email}</span>
          </p>
        </div>
      </div>
    </div>
  );
}