import React from 'react';

const base = import.meta.env.BASE_URL || '/';
const coupleHeartBalloon = `${base}images/couple-heart-balloon.png`;
const coupleWeddingCake = `${base}images/couple-wedding-cake.png`;
const coupleStanding = `${base}images/couple-standing.png`;
const coupleFlowerBouquet = `${base}images/couple-flower-bouquet.png`;

export type WeddingImageType = 'heart-balloon' | 'wedding-cake' | 'standing' | 'flower-bouquet';

interface WeddingImageProps {
  type: WeddingImageType;
  className?: string;
  alt?: string;
}

export const WeddingImage: React.FC<WeddingImageProps> = ({ type, className = 'w-full h-auto', alt = 'Coppia di sposi' }) => {
  const getImage = () => {
    switch (type) {
      case 'heart-balloon':
        return coupleHeartBalloon;
      case 'wedding-cake':
        return coupleWeddingCake;
      case 'standing':
        return coupleStanding;
      case 'flower-bouquet':
        return coupleFlowerBouquet;
      default:
        return coupleStanding;
    }
  };

  return (
    <img 
      src={getImage()} 
      alt={alt} 
      className={className} 
      style={{ objectFit: 'contain' }}
      loading="lazy"
      decoding="async"
    />
  );
};

// Componente decorativo che contiene un'immagine con una cornice floreale
export const DecorativeImage: React.FC<WeddingImageProps> = (props) => {
  return (
    <div className="relative inline-block">
      <WeddingImage {...props} />
      <div className="absolute inset-0 pointer-events-none border-8 border-transparent rounded-full" 
        style={{ 
          background: 'linear-gradient(to right, rgba(210, 180, 140, 0.2), rgba(210, 180, 140, 0.1))',
          boxShadow: '0 0 20px rgba(210, 180, 140, 0.3)'
        }}
      />
    </div>
  );
};