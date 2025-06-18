import { createContext, ReactNode, useContext, useState, useEffect } from 'react';
import { GalleryGuest } from '@shared/schema';

interface GalleryGuestAuthContextType {
  guest: GalleryGuest | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string) => Promise<{ success: boolean; message?: string }>;
  register: (data: {
    email: string;
    firstName: string;
    lastName: string;
    profileImageUrl?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const GalleryGuestAuthContext = createContext<GalleryGuestAuthContextType | null>(null);

interface GalleryGuestAuthProviderProps {
  children: ReactNode;
  galleryId: string;
}

export function GalleryGuestAuthProvider({ children, galleryId }: GalleryGuestAuthProviderProps) {
  const [guest, setGuest] = useState<GalleryGuest | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Controlla autenticazione al mount
  useEffect(() => {
    checkAuth();
  }, [galleryId]);

  const checkAuth = async () => {
    try {
      setIsLoading(true);
      
      const response = await fetch(`/api/gallery/${galleryId}/guest/check-session`, {
        method: 'GET',
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.isAuthenticated && data.guest) {
          setGuest(data.guest);
          setIsAuthenticated(true);
        } else {
          setGuest(null);
          setIsAuthenticated(false);
        }
      } else {
        setGuest(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Errore verifica autenticazione ospite:', error);
      setGuest(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await fetch(`/api/gallery/${galleryId}/guest/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      
      if (data.success && data.guest) {
        setGuest(data.guest);
        setIsAuthenticated(true);
        return { success: true };
      } else {
        return { 
          success: false, 
          message: data.message || 'Errore durante il login'
        };
      }
    } catch (error) {
      console.error('Errore login ospite:', error);
      return { 
        success: false, 
        message: 'Errore di connessione'
      };
    }
  };

  const register = async (userData: {
    email: string;
    firstName: string;
    lastName: string;
    profileImageUrl?: string;
  }): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await fetch(`/api/gallery/${galleryId}/guest/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(userData)
      });
      
      const data = await response.json();
      
      if (data.success && data.guest) {
        setGuest(data.guest);
        setIsAuthenticated(true);
        return { success: true };
      } else {
        return { 
          success: false, 
          message: data.message || 'Errore durante la registrazione'
        };
      }
    } catch (error) {
      console.error('Errore registrazione ospite:', error);
      return { 
        success: false, 
        message: 'Errore di connessione'
      };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await fetch(`/api/gallery/${galleryId}/guest/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Errore logout ospite:', error);
    } finally {
      setGuest(null);
      setIsAuthenticated(false);
    }
  };

  const value: GalleryGuestAuthContextType = {
    guest,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    checkAuth
  };

  return (
    <GalleryGuestAuthContext.Provider value={value}>
      {children}
    </GalleryGuestAuthContext.Provider>
  );
}

export function useGalleryGuestAuth() {
  const context = useContext(GalleryGuestAuthContext);
  if (!context) {
    throw new Error('useGalleryGuestAuth deve essere usato all\'interno di GalleryGuestAuthProvider');
  }
  return context;
}

// Hook per verificare se l'utente è admin (sistema separato)
export function useAdminAuth() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAdminAuth();
  }, []);

  const checkAdminAuth = async () => {
    try {
      const response = await fetch('/api/admin/check-session', {
        method: 'GET',
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setIsAdmin(data.isAdmin === true);
        setAdminUser(data.admin || null);
      } else {
        setIsAdmin(false);
        setAdminUser(null);
      }
    } catch (error) {
      console.error('Errore verifica admin:', error);
      setIsAdmin(false);
      setAdminUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isAdmin,
    adminUser,
    isLoading,
    checkAdminAuth
  };
}