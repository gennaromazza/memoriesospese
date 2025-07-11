import React from 'react';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import ProfileImageWelcome from './ProfileImageWelcome';

export default function ProfileImageWelcomeProvider() {
  const { showProfileWelcome, setShowProfileWelcome } = useFirebaseAuth();

  const handleComplete = () => {
    setShowProfileWelcome(false);
  };

  return (
    <ProfileImageWelcome
      isOpen={showProfileWelcome}
      onOpenChange={setShowProfileWelcome}
      onComplete={handleComplete}
    />
  );
}