import React from 'react';
import { PhotoData } from '@/hooks/use-gallery-data';
import { User, Camera } from 'lucide-react';
import InteractionWrapper from './InteractionWrapper';

interface PhotoCardProps {
  photo: PhotoData;
  index: number;
  onClick: (index: number) => void;
  galleryId: string;
  isAdmin?: boolean;
}

export default function PhotoCard({ photo, index, onClick, galleryId, isAdmin = false }: PhotoCardProps) {
  // Determina il tipo di uploader dalla photo data
  const uploaderRole = (photo as any).uploaderRole || 'photographer';
  const uploaderName = (photo as any).uploaderName || 'Fotografo';

  const getBadgeStyle = () => {
    if (uploaderRole === 'guest') {
      return 'bg-rose-100 text-rose-700 border-rose-200';
    }
    return 'bg-blue-100 text-blue-700 border-blue-200';
  };

  const getBadgeIcon = () => {
    if (uploaderRole === 'guest') {
      return <User className="h-3 w-3" />;
    }
    return <Camera className="h-3 w-3" />;
  };

  const getBadgeText = () => {
    if (uploaderRole === 'guest') {
      return uploaderName;
    }
    return 'Fotografo';
  };

  return (
    <div 
      className={`relative group cursor-pointer overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-all duration-200 ${
        uploaderRole === 'guest' ? 'ring-1 ring-rose-200' : 'ring-1 ring-blue-200'
      }`}
      onClick={() => onClick(index)}
    >
      {/* Immagine */}
      <div className="aspect-square overflow-hidden bg-gray-100">
        <img
          src={photo.url}
          alt={photo.name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
        />
      </div>

      {/* Overlay con badge uploader */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="absolute bottom-2 left-2 right-2">
          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getBadgeStyle()}`}>
            {getBadgeIcon()}
            <span>{getBadgeText()}</span>
          </div>
        </div>
      </div>

      {/* Badge sempre visibile per le foto degli ospiti */}
      {uploaderRole === 'guest' && (
        <div className="absolute top-2 right-2">
          <div className="bg-white/90 backdrop-blur-sm rounded-full p-1 shadow-sm">
            <User className="h-3 w-3 text-rose-600" />
          </div>
        </div>
      )}

      {/* Interaction panel - like e commenti */}
      <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div 
          className="bg-white/95 backdrop-blur-sm rounded-lg p-2 shadow-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <InteractionWrapper
            itemId={photo.id}
            itemType="photo"
            galleryId={galleryId}
            isAdmin={isAdmin}
            className="scale-90"
          />
        </div>
      </div>
    </div>
  );
}