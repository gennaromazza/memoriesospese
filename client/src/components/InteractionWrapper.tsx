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

  const handleAuthComplete = async () => {
    // Auth completed - close dialog and refresh access
    setShowAuthDialog(false);
    // Force a refresh of gallery access after auth
    await grantAccess();
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
        userName={userProfile?.displayName || user?.email?.split('@')[0] || undefined}
        isAdmin={isAdmin}
        className={className}
        onAuthRequired={handleInteractionAttempt}
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