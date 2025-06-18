import { useState } from 'react';
import InteractionPanel from './InteractionPanel';
import UnifiedAuthDialog from './auth/UnifiedAuthDialog';
import { useAuth, useGalleryAccess } from '@/hooks/useAuth';

interface InteractionWrapperProps {
  itemId: string;
  itemType: 'photo' | 'voice_memo';
  galleryId: string;
  isAdmin?: boolean;
  className?: string;
}

export default function InteractionWrapper({
  itemId,
  itemType,
  galleryId,
  isAdmin = false,
  className = ''
}: InteractionWrapperProps) {
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  
  const { user, userProfile, isAuthenticated } = useAuth();
  const { hasAccess, grantAccess } = useGalleryAccess(galleryId);

  const handleAuthComplete = () => {
    // Auth completed - close dialog and refresh access
    setShowAuthDialog(false);
  };

  const handleInteractionAttempt = () => {
    if (!isAuthenticated || !hasAccess) {
      setShowAuthDialog(true);
      return false;
    }
    return true;
  };

  return (
    <>
      <InteractionPanel
        itemId={itemId}
        itemType={itemType}
        galleryId={galleryId}
        userEmail={user?.email || undefined}
        userName={userProfile?.displayName || undefined}
        isAdmin={isAdmin}
        className={className}
      />
      
      <UnifiedAuthDialog
        isOpen={showAuthDialog}
        onOpenChange={setShowAuthDialog}
        galleryId={galleryId}
        onAuthComplete={handleAuthComplete}
      />
    </>
  );
}