import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Heart, MessageCircle } from 'lucide-react';
import InteractionPanel from './InteractionPanel';
import UnifiedAuthDialog from '@/components/auth/UnifiedAuthDialog';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { cn } from '@/lib/utils';
// import { useGalleryAccess } from '@/hooks/useAuth'; // Rimosso per Firebase-only

interface InteractionWrapperProps {
  itemId: string;
  itemType: 'photo' | 'voice_memo';
  galleryId: string;
  isAdmin: boolean;
  className?: string;
  variant?: 'default' | 'floating' | 'inline';
  onClick?: (e: React.MouseEvent) => void;
}

export default function InteractionWrapper({
  itemId,
  itemType,
  galleryId,
  isAdmin,
  className = "",
  variant = "default",
  onClick
}: InteractionWrapperProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const { isAuthenticated, user, userProfile } = useFirebaseAuth();
  // Firebase-only: simplified access control
  const hasAccess = true; // In Firebase-only mode, access is handled by Firebase Auth

  // Get authentication data from centralized system
  const userEmail = user?.email || localStorage.getItem('userEmail') || '';
  const userName = userProfile?.displayName || user?.displayName || localStorage.getItem('userName') || (userEmail ? userEmail.split('@')[0] : '');

  // Combined authentication check - prioritize Firebase auth, fallback to localStorage
  const hasFirebaseAuth = isAuthenticated && user && userEmail;
  const hasLocalAuth = !isAuthenticated && userEmail && userName;
  const hasAuth = hasFirebaseAuth || hasLocalAuth;

  const handleInteractionClick = () => {
    if (!hasAuth || !hasAccess) {
      setShowAuthDialog(true);
      return;
    }
    setShowPanel(true);
  };

  // Per la variante inline, rimuovi le icone duplicate
  if (variant === 'inline') {
    return (
      <>
        <div 
          className={cn("flex gap-2 text-sm text-gray-600", className)}
          onClick={onClick}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleInteractionClick();
            }}
            className="hover:text-red-600 transition-colors"
          >
            <Heart className="h-4 w-4 inline mr-1" />
            0
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleInteractionClick();
            }}
            className="hover:text-blue-600 transition-colors"
          >
            <MessageCircle className="h-4 w-4 inline mr-1" />
            1
          </button>
        </div>

        <InteractionPanel
          isOpen={showPanel}
          onClose={() => setShowPanel(false)}
          itemId={itemId}
          itemType={itemType}
          galleryId={galleryId}
          isAdmin={isAdmin}
          userEmail={userEmail}
          userName={userName}
        />

        <UnifiedAuthDialog
          isOpen={showAuthDialog}
          onOpenChange={setShowAuthDialog}
          galleryId={galleryId}
          onAuthComplete={async () => {
            setShowAuthDialog(false);
            setShowPanel(true);
            // await grantAccess(); // Removed for Firebase-only
          }}
          defaultTab="register"
        />
      </>
    );
  }

  return (
    <>
      <div 
        className={cn(
          "flex gap-1",
          variant === 'floating' && "bg-white/90 backdrop-blur-sm rounded-full p-1 shadow-lg"
        )}
        onClick={onClick}
      >
        <Button
          onClick={(e) => {
            e.stopPropagation();
            handleInteractionClick();
          }}
          variant="ghost"
          size="sm"
          className={cn(
            "hover:bg-red-50 hover:text-red-600 transition-colors",
            variant === 'floating' && "h-8 w-8 rounded-full p-0"
          )}
        >
          <Heart className="h-4 w-4" />
        </Button>

        <Button
          onClick={(e) => {
            e.stopPropagation();
            handleInteractionClick();
          }}
          variant="ghost"
          size="sm"
          className={cn(
            "hover:bg-blue-50 hover:text-blue-600 transition-colors",
            variant === 'floating' && "h-8 w-8 rounded-full p-0"
          )}
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
      </div>

      <InteractionPanel
        isOpen={showPanel}
        onClose={() => setShowPanel(false)}
        itemId={itemId}
        itemType={itemType}
        galleryId={galleryId}
        isAdmin={isAdmin}
        userEmail={userEmail}
        userName={userName}
      />

      <UnifiedAuthDialog
        isOpen={showAuthDialog}
        onOpenChange={setShowAuthDialog}
        galleryId={galleryId}
        onAuthComplete={() => {
          setShowAuthDialog(false);
          // After auth, open the interaction panel
          setShowPanel(true);
        }}
        defaultTab="register"
      />
    </>
  );
}