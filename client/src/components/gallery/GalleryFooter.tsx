import React from "react";
import {
  FloralCorner,
  FloralDivider,
  BackgroundDecoration,
} from "@/components/WeddingIllustrations";
import { WeddingImage } from "@/components/WeddingImages";

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
    <footer className="relative overflow-hidden bg-sage/10 border-t border-sage/20 py-12 mt-10">
      {/* Decorazioni floreali */}
      <FloralCorner
        position="bottom-left"
        className="absolute bottom-0 left-0 w-36 h-36 opacity-10 scale-95 pointer-events-none"
      />
      <FloralCorner
        position="bottom-right"
        className="absolute bottom-0 right-0 w-28 h-28 opacity-15 scale-110 pointer-events-none"
      />
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <BackgroundDecoration />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-xs mx-auto h-10 opacity-20 mb-8">
          <FloralDivider />
        </div>

        {/* Blocco principale */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Testo e immagine */}
          <div className="text-center md:text-left flex md:flex-row flex-col items-center gap-6">
            <div className="md:w-32 w-24 h-auto flex-shrink-0 order-1 md:order-none mb-4 md:mb-0">
              <WeddingImage
                type="flower-bouquet"
                className="w-full h-auto opacity-70"
              />
            </div>
            <div>
              <h3 className="text-xl font-playfair text-blue-gray font-medium mb-2">
                Ti sono piaciute queste fotografie?
              </h3>
              <p className="text-gray-600 max-w-lg leading-relaxed">
                Ogni scatto custodisce un ricordo. Seguici su Instagram e
                continua a vivere con noi le emozioni di chi ha reso unico il
                proprio giorno.
              </p>
            </div>
          </div>

          {/* CTA principale */}
          <div className="flex flex-col items-center space-y-3">
            <a
              href={
                studioSettings.socialLinks.instagram
                  ? studioSettings.socialLinks.instagram.startsWith("http")
                    ? studioSettings.socialLinks.instagram
                    : `https://instagram.com/${studioSettings.socialLinks.instagram}`
                  : "#"
              }
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 px-6 py-3 
                         bg-sage hover:bg-dark-sage text-white rounded-md 
                         transition-colors shadow-md hover:shadow-lg"
            >
              <svg
                className="w-5 h-5 mr-2"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M7.5 2h9a5.5 5.5 0 0 1 5.5 5.5v9A5.5 5.5 0 0 1 16.5 22h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2z" />
                <circle cx="12" cy="12" r="3.2" />
                <circle cx="17" cy="7" r="0.9" />
              </svg>
              <span className="font-medium">
                Seguici su Instagram
              </span>
            </a>

            {/* Altri social opzionali */}
            <div className="flex space-x-4 mt-1">
              {studioSettings.socialLinks.facebook && (
                <a
                  href={
                    studioSettings.socialLinks.facebook.startsWith("http")
                      ? studioSettings.socialLinks.facebook
                      : `https://facebook.com/${studioSettings.socialLinks.facebook}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="text-sage hover:text-dark-sage transition"
                >
                  <svg
                    width="20"
                    height="20"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M22 12a10 10 0 1 0-11.5 9.9v-7h-2v-2.9h2V9.5c0-2 1.2-3.2 3-3.2.9 0 1.8.1 1.8.1v2h-1c-1 0-1.3.6-1.3 1.2v1.5h2.4L15 14.9h-1.9v7A10 10 0 0 0 22 12z" />
                  </svg>
                </a>
              )}
              {studioSettings.socialLinks.youtube && (
                <a
                  href={
                    studioSettings.socialLinks.youtube.startsWith("http")
                      ? studioSettings.socialLinks.youtube
                      : `https://youtube.com/${studioSettings.socialLinks.youtube}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="text-sage hover:text-dark-sage transition"
                >
                  <svg
                    width="20"
                    height="20"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M10 15l5.19-3L10 9v6z" />
                    <path d="M21.8 8s-.2-1.4-.8-2c-.8-.8-1.7-.8-2.1-.9C15.9 5 12 5 12 5s-3.9 0-6.9.1c-.4 0-1.3.1-2.1.9-.6.6-.8 2-.8 2S2 9.6 2 11.2v1.6C2 14.4 2.2 16 2.2 16s.2 1.4.8 2c.8.8 1.9.8 2.4.9 1.7.2 6.6.2 6.6.2s3.9 0 6.9-.1c.4 0 1.3-.1 2.1-.9.6-.6.8-2 .8-2s.2-1.6.2-3.2v-1.6C22 9.6 21.8 8 21.8 8z" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Divider e credits */}
        <div className="mt-12 pt-6 border-t border-sage/20 text-center text-gray-600 text-sm">
          <div className="w-20 h-20 mx-auto mb-4">
            <WeddingImage
              type="flower-bouquet"
              className="w-full h-auto opacity-20"
            />
          </div>
          <p>
            © {new Date().getFullYear()} {studioSettings.name}. Tutti i diritti
            riservati.
          </p>
          <p className="mt-2">
            {studioSettings.address} • Tel: {studioSettings.phone} • Email:{" "}
            {studioSettings.email}
          </p>
        </div>
      </div>
    </footer>
  );
}
