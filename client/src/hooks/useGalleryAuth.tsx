import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser, signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

interface GalleryAuthContextType {
  user: FirebaseUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const GalleryAuthContext = createContext<GalleryAuthContextType | null>(null);

interface GalleryAuthProviderProps {
  children: ReactNode;
  galleryId: string;
}

export function GalleryAuthProvider({ children, galleryId }: GalleryAuthProviderProps) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Update last active timestamp
        try {
          const userRef = doc(db, 'gallery_users', firebaseUser.uid);
          await setDoc(userRef, {
            lastActive: serverTimestamp(),
            galleryId
          }, { merge: true });
        } catch (error) {
          console.error('Error updating user activity:', error);
        }
      }
      
      setUser(firebaseUser);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [galleryId]);

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const refreshUserData = async () => {
    if (user) {
      await user.reload();
      setUser({ ...user });
    }
  };

  const value: GalleryAuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout,
    refreshUserData
  };

  return (
    <GalleryAuthContext.Provider value={value}>
      {children}
    </GalleryAuthContext.Provider>
  );
}

export function useGalleryAuth() {
  const context = useContext(GalleryAuthContext);
  if (!context) {
    throw new Error('useGalleryAuth must be used within a GalleryAuthProvider');
  }
  return context;
}