import { useState, useEffect } from 'react';
import InteractionPanel from './InteractionPanel';
import UserAuthDialog from './UserAuthDialog';
import { useUserAuth } from '@/hooks/useUserAuth';

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
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  
  const userAuth = useUserAuth(galleryId);

  useEffect(() => {
    setCurrentUserEmail(userAuth.userEmail);
    setCurrentUserName(userAuth.userName);
  }, [userAuth]);

  const handleAuthComplete = (email: string, name: string) => {
    setCurrentUserEmail(email);
    setCurrentUserName(name);
  };

  const handleInteractionAttempt = () => {
    if (!currentUserEmail || !currentUserName) {
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
        userEmail={currentUserEmail || undefined}
        userName={currentUserName || undefined}
        isAdmin={isAdmin}
        className={className}
      />
      
      <UserAuthDialog
        isOpen={showAuthDialog}
        onOpenChange={setShowAuthDialog}
        galleryId={galleryId}
        onAuthComplete={handleAuthComplete}
      />
    </>
  );
}