import React from 'react';
import { useFirebaseAuth } from '../context/FirebaseAuthContext';
import ProfileImageWelcome from './ProfileImageWelcome';

export default function ProfileImageWelcomeProvider() {
  let showProfileWelcome = false;
  let setShowProfileWelcome = () => {};

  try {
    const authContext = useFirebaseAuth();
    showProfileWelcome = authContext.showProfileWelcome;
    setShowProfileWelcome = authContext.setShowProfileWelcome;
  } catch (error) {
    // Context non ancora disponibile, usa valori di default
    console.log('FirebaseAuth context non ancora disponibile in ProfileImageWelcomeProvider');
    return null;
  }

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