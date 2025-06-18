import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Plus } from 'lucide-react';
import { useGalleryAuth } from '@/hooks/useGalleryAuth';
import GalleryAuthSystem from './GalleryAuthSystem';
import GuestUpload from './GuestUpload';
import { User as FirebaseUser } from 'firebase/auth';

interface GuestUploadWithAuthProps {
  galleryId: string;
  galleryName: string;
  onPhotosUploaded?: (count: number) => void;
}

export default function GuestUploadWithAuth({ 
  galleryId, 
  galleryName, 
  onPhotosUploaded 
}: GuestUploadWithAuthProps) {
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const { user, isAuthenticated } = useGalleryAuth();

  const handleAuthSuccess = (firebaseUser: FirebaseUser) => {
    setShowAuthDialog(false);
  };

  if (isAuthenticated && user) {
    // User is authenticated, show the upload component
    return (
      <GuestUpload 
        galleryId={galleryId}
        galleryName={galleryName}
        onPhotosUploaded={onPhotosUploaded}
      />
    );
  }

  // User is not authenticated, show auth button
  return (
    <>
      <Button 
        onClick={() => setShowAuthDialog(true)}
        className="bg-sage-600 hover:bg-sage-700 text-white shadow-lg"
      >
        <Upload className="h-4 w-4 mr-2" />
        Carica le tue foto
      </Button>

      <GalleryAuthSystem
        isOpen={showAuthDialog}
        onClose={() => setShowAuthDialog(false)}
        galleryId={galleryId}
        galleryName={galleryName}
        onAuthSuccess={handleAuthSuccess}
      />
    </>
  );
}