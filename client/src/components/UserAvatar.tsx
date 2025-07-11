/**
 * Componente Avatar utente con immagine profilo
 * Mostra l'immagine profilo dell'utente o iniziali con colore sage
 */

import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProfileImageService } from '../lib/profileImageService';

interface UserAvatarProps {
  userEmail?: string;
  userName?: string;
  userProfileImageUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function UserAvatar({
  userEmail,
  userName,
  userProfileImageUrl,
  size = 'md',
  className = ''
}: UserAvatarProps) {
  const displayName = userName || userEmail || 'Utente';
  const initials = displayName
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Determina dimensioni in base al size
  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-12 h-12 text-lg'
  };

  const imageUrl = ProfileImageService.getProfileImageUrl(userProfileImageUrl, displayName);

  return (
    <Avatar className={`${sizeClasses[size]} ${className}`}>
      <AvatarImage 
        src={imageUrl} 
        alt={displayName}
        className="object-cover"
      />
      <AvatarFallback 
        className="bg-sage text-white font-medium"
        style={{
          backgroundColor: userProfileImageUrl ? '#8FA68E' : ProfileImageService.getPlaceholderImageUrl(displayName).includes('background=') 
            ? '#8FA68E' 
            : '#8FA68E'
        }}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}