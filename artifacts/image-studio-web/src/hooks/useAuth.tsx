import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User } from 'firebase/auth';
import authService, { UserProfile } from '@/services/authService';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, displayName: string, role?: 'admin' | 'guest') => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  hasGalleryAccess: (galleryId: string) => Promise<boolean>;
  grantGalleryAccess: (galleryId: string) => Promise<boolean>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChange(async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Fetch user profile from Firestore
        const profile = await authService.getUserProfile(firebaseUser.uid);
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
      
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    const result = await authService.login({ email, password });
    setIsLoading(false);
    
    if (result.success && result.user) {
      const profile = await authService.getUserProfile(result.user.uid);
      setUserProfile(profile);
    }
    
    return result;
  };

  const register = async (email: string, password: string, displayName: string, role: 'admin' | 'guest' = 'guest') => {
    setIsLoading(true);
    const result = await authService.register({ email, password, displayName, role });
    setIsLoading(false);
    
    if (result.success && result.user) {
      const profile = await authService.getUserProfile(result.user.uid);
      setUserProfile(profile);
    }
    
    return result;
  };

  const logout = async () => {
    setIsLoading(true);
    await authService.logout();
    setUser(null);
    setUserProfile(null);
    setIsLoading(false);
  };

  const resetPassword = async (email: string) => {
    return await authService.resetPassword(email);
  };

  const hasGalleryAccess = async (galleryId: string): Promise<boolean> => {
    if (!user) return false;
    return await authService.hasGalleryAccess(galleryId);
  };

  const grantGalleryAccess = async (galleryId: string): Promise<boolean> => {
    if (!user) return false;
    const result = await authService.grantGalleryAccess(galleryId);
    
    if (result) {
      // Refresh user profile to get updated gallery access
      await refreshUserProfile();
    }
    
    return result;
  };

  const refreshUserProfile = async () => {
    if (user) {
      const profile = await authService.getUserProfile(user.uid);
      setUserProfile(profile);
    }
  };

  const value: AuthContextType = {
    user,
    userProfile,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    resetPassword,
    hasGalleryAccess,
    grantGalleryAccess,
    refreshUserProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Hook to check if user is admin
export function useIsAdmin(): boolean {
  const { userProfile } = useAuth();
  return userProfile?.role === 'admin';
}

// Hook to check gallery access
export function useGalleryAccess(galleryId: string): {
  hasAccess: boolean;
  isLoading: boolean;
  grantAccess: () => Promise<boolean>;
} {
  const { user, userProfile, grantGalleryAccess } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAccess = async () => {
      if (!user || !userProfile) {
        setHasAccess(false);
        setIsLoading(false);
        return;
      }

      const access = userProfile.galleryAccess?.includes(galleryId) || false;
      setHasAccess(access);
      setIsLoading(false);
    };

    checkAccess();
  }, [user, userProfile, galleryId]);

  const grantAccess = async (): Promise<boolean> => {
    const result = await grantGalleryAccess(galleryId);
    if (result) {
      setHasAccess(true);
    }
    return result;
  };

  return {
    hasAccess,
    isLoading,
    grantAccess
  };
}